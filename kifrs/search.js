"use strict";

/**
 * KIFRS RAG 검색 — 클라이언트 사이드 검색 엔진
 *
 * 빌드 도구나 서버 없이 브라우저에서 동작한다.
 *  1) corpus.json 을 불러와 각 기준서를 하나의 "문서"로 본다.
 *  2) 한국어/영문/숫자에 맞춘 토크나이저로 색인을 만든다.
 *  3) BM25 랭킹으로 질의와 가장 관련 높은 기준서를 정렬한다.
 *  4) 일치 토큰을 스니펫에 하이라이트해 보여준다.
 *
 * "RAG"의 retrieval(검색) 단계를 순수 정적 환경에서 구현한 것이다.
 * 생성(LLM) 단계는 검색된 근거를 LLM 프롬프트에 그대로 붙이면 된다.
 */

const KIFRS = (() => {
  // --- 토크나이저 -----------------------------------------------------------
  // 한국어는 형태소 분석기 없이도 쓸 수 있도록 음절 유니그램 + 바이그램을,
  // 영문/숫자는 단어 단위 토큰을 만든다. 검색어와 문서가 같은 규칙을 쓴다.
  const HANGUL = /[가-힣]/;

  function tokenize(text) {
    if (!text) return [];
    const lowered = String(text).toLowerCase();
    const tokens = [];
    // 영문/숫자 토큰 (예: ias16, 1116, fvoci)
    const wordRe = /[a-z0-9]+/g;
    let m;
    while ((m = wordRe.exec(lowered)) !== null) tokens.push(m[0]);
    // 한글 음절 추출 후 유니그램 + 바이그램
    const syllables = lowered.match(/[가-힣]+/g) || [];
    for (const run of syllables) {
      for (let i = 0; i < run.length; i++) {
        tokens.push(run[i]); // 유니그램
        if (i + 1 < run.length) tokens.push(run[i] + run[i + 1]); // 바이그램
      }
    }
    return tokens;
  }

  // --- 색인 -----------------------------------------------------------------
  const K1 = 1.5; // BM25 term frequency 포화 계수
  const B = 0.75; // BM25 길이 정규화 계수

  let docs = [];      // { ref, fields..., tokens, len, tf }
  let df = new Map();  // token -> document frequency
  let avgLen = 0;
  let ready = false;

  function buildDocText(s) {
    // 검색 대상 필드를 하나로 합친다. 제목/요약/키워드/번호 가중치를 위해
    // 제목·키워드는 반복 삽입해 비중을 높인다.
    return [
      s.no, s.no, s.ifrs,
      s.title, s.title, s.title,
      s.category,
      (s.keywords || []).join(" "), (s.keywords || []).join(" "),
      s.summary
    ].join(" ");
  }

  function index(standards) {
    docs = [];
    df = new Map();
    let totalLen = 0;

    for (const s of standards) {
      const tokens = tokenize(buildDocText(s));
      const tf = new Map();
      for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
      for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
      totalLen += tokens.length;
      docs.push({ ref: s, len: tokens.length, tf });
    }
    avgLen = docs.length ? totalLen / docs.length : 0;
    ready = true;
  }

  // --- 검색 -----------------------------------------------------------------
  function idf(token) {
    const n = docs.length;
    const dfi = df.get(token) || 0;
    // BM25+ 형태로 음수 방지
    return Math.log(1 + (n - dfi + 0.5) / (dfi + 0.5));
  }

  function search(query, limit = 10) {
    if (!ready) return [];
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];
    const uniqueQ = [...new Set(qTokens)];

    const scored = [];
    for (const doc of docs) {
      let score = 0;
      let matched = 0;
      for (const t of uniqueQ) {
        const f = doc.tf.get(t) || 0;
        if (f === 0) continue;
        matched++;
        const denom = f + K1 * (1 - B + B * (doc.len / (avgLen || 1)));
        score += idf(t) * ((f * (K1 + 1)) / denom);
      }
      if (score > 0) scored.push({ doc, score, matched });
    }

    // 일치 토큰 수가 많을수록 우선, 그다음 BM25 점수
    scored.sort((a, b) => b.matched - a.matched || b.score - a.score);
    return scored.slice(0, limit).map((x) => ({
      standard: x.doc.ref,
      score: x.score,
      matched: x.matched
    }));
  }

  // 질의 토큰과 겹치는 부분을 <mark> 로 감싼다 (요약/제목 표시용).
  function highlight(text, query) {
    if (!text) return "";
    const qSet = new Set(tokenize(query).filter((t) => t.length >= 1));
    // 한글 바이그램/단어가 들어간 연속 구간을 강조하기 위해 어절 단위로 검사
    const escape = (s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const parts = String(text).split(/(\s+)/);
    return parts
      .map((part) => {
        if (/^\s+$/.test(part)) return part;
        const lower = part.toLowerCase();
        const hit =
          qSet.has(lower) ||
          [...qSet].some((q) => q.length >= 2 && lower.includes(q));
        const safe = escape(part);
        return hit ? `<mark>${safe}</mark>` : safe;
      })
      .join("");
  }

  async function load(url = "corpus.json") {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`corpus 로드 실패: HTTP ${res.status}`);
    const data = await res.json();
    index(data.standards || []);
    return data;
  }

  return { load, index, search, highlight, tokenize, get count() { return docs.length; } };
})();

// --- UI 연결 ----------------------------------------------------------------
(() => {
  const $ = (sel) => document.querySelector(sel);
  const input = $("#q");
  const results = $("#results");
  const status = $("#status");
  const meta = $("#corpus-meta");
  let meta_data = null;

  function render(query) {
    const q = query.trim();
    if (!q) {
      results.innerHTML = "";
      status.textContent = `${KIFRS.count}개 기준서가 색인되어 있습니다. 검색어를 입력하세요.`;
      return;
    }
    const hits = KIFRS.search(q, 12);
    if (hits.length === 0) {
      results.innerHTML = "";
      status.textContent = `"${q}" 와 일치하는 기준서를 찾지 못했습니다.`;
      return;
    }
    status.textContent = `"${q}" — ${hits.length}건`;
    results.innerHTML = hits
      .map(({ standard: s, score, matched }) => {
        const title = KIFRS.highlight(s.title, q);
        const summary = KIFRS.highlight(s.summary, q);
        const kws = (s.keywords || [])
          .map((k) => `<span class="kw">${KIFRS.highlight(k, q)}</span>`)
          .join("");
        return `
          <li class="result">
            <div class="result-head">
              <span class="badge">제${s.no}호</span>
              <span class="ifrs">${s.ifrs}</span>
              <span class="cat">${s.category}</span>
              <span class="score" title="BM25 점수 / 일치 토큰">${score.toFixed(2)} · ${matched}match</span>
            </div>
            <h3>${title}</h3>
            <p>${summary}</p>
            <div class="kws">${kws}</div>
          </li>`;
      })
      .join("");
  }

  KIFRS.load()
    .then((data) => {
      meta_data = data;
      if (meta) {
        meta.textContent = `데이터: ${data.source} · 버전 ${data.version} · ${KIFRS.count}개 기준서`;
      }
      render(input.value);
      input.focus();
    })
    .catch((err) => {
      status.textContent = `색인을 불러오지 못했습니다. ${err.message} (file:// 로 직접 열면 fetch가 막힐 수 있습니다. 정적 서버로 띄우세요.)`;
    });

  let t;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => render(input.value), 80);
  });

  // 예시 칩 클릭
  document.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-q]");
    if (!chip) return;
    input.value = chip.getAttribute("data-q");
    render(input.value);
    input.focus();
  });
})();
