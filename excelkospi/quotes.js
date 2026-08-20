/* 시세 데이터 계층
 *
 * 소스 우선순위
 *   1) 코인  : 업비트 공개 시세 API (키 없이 브라우저에서 바로 호출)
 *   2) 주식·지수 : 공공데이터포털 금융위원회 시세 API (사용자가 발급한 인증키 필요, 전 영업일 종가)
 *   3) 실패하거나 키가 없으면 → 데모(모의) 시세로 자동 전환
 *
 * 어떤 소스든 실패는 조용히 넘기고 데모로 떨어뜨린다. 사내망처럼 막힌 곳에서도
 * 화면이 깨지지 않게 하는 게 목적이다.
 */
const Quotes = (() => {
  'use strict';

  const UPBIT = 'https://api.upbit.com/v1/ticker?markets=';
  const DATA_GO = 'https://apis.data.go.kr/1160100/service';
  const TIMEOUT = 7000;

  /* 데모용 기준가 — 실제 시세가 아니라 화면 확인용 모의값 */
  const BASE = {
    '005930': ['삼성전자', 71200, 14000000],
    '000660': ['SK하이닉스', 178500, 3200000],
    '373220': ['LG에너지솔루션', 402000, 320000],
    '207940': ['삼성바이오로직스', 812000, 61000],
    '005380': ['현대차', 243000, 890000],
    '000270': ['기아', 108900, 1300000],
    '035420': ['NAVER', 197800, 620000],
    '035720': ['카카오', 41250, 2100000],
    '105560': ['KB금융', 78400, 1500000],
    '068270': ['셀트리온', 176300, 540000],
    '051910': ['LG화학', 356000, 380000],
    '006400': ['삼성SDI', 289500, 410000],
    '012330': ['현대모비스', 251000, 260000],
    '028260': ['삼성물산', 152400, 330000],
    '055550': ['신한지주', 52900, 1800000],
    '086790': ['하나금융지주', 63800, 1400000],
    '032830': ['삼성생명', 89100, 420000],
    '096770': ['SK이노베이션', 112500, 700000],
    '003670': ['포스코퓨처엠', 268000, 480000],
    '247540': ['에코프로비엠', 194600, 1100000],
    '091990': ['셀트리온헬스케어', 71300, 830000],
    '066570': ['LG전자', 96800, 620000],
    '015760': ['한국전력', 21450, 3600000],
    '017670': ['SK텔레콤', 53700, 540000],
    '033780': ['KT&G', 92600, 380000],
    'IDX:코스피': ['코스피', 2712.34, 0],
    'IDX:코스닥': ['코스닥', 862.11, 0],
    'KRW-BTC': ['비트코인', 94500000, 4200],
    'KRW-ETH': ['이더리움', 5180000, 32000],
    'KRW-XRP': ['리플', 3120, 82000000],
    'KRW-SOL': ['솔라나', 268000, 640000],
    'KRW-DOGE': ['도지코인', 412, 210000000]
  };

  /* 데모 시세는 기준가에서 랜덤워크로 살살 움직인다 */
  const sim = new Map();

  function seed(code) {
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
    return h;
  }

  function tickDemo(code) {
    const base = BASE[code];
    const basePrice = base ? base[1] : 10000;
    const baseVol = base ? base[2] : 100000;
    let s = sim.get(code);
    if (!s) {
      const r = ((seed(code) % 1000) / 1000 - 0.5) * 0.04;   // ±2% 시작 오차
      s = { prev: basePrice, price: round(basePrice * (1 + r), code), vol: baseVol };
      sim.set(code, s);
    }
    const step = (Math.random() - 0.5) * 0.006;               // 틱마다 ±0.3%
    s.price = round(Math.max(s.price * (1 + step), 1), code);
    s.vol = Math.round(s.vol * (0.98 + Math.random() * 0.05));
    return {
      code,
      name: base ? base[0] : code,
      price: s.price,
      prev: s.prev,
      diff: s.price - s.prev,
      rate: ((s.price - s.prev) / s.prev) * 100,
      volume: s.vol,
      high: Math.max(s.price, s.prev) * 1.004,
      low: Math.min(s.price, s.prev) * 0.996,
      live: false,
      asOf: ''
    };
  }

  /* 호가 단위 흉내 — 코인은 소수, 주식은 정수 */
  function round(v, code) {
    if (code.startsWith('KRW-')) return v >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
    if (code.startsWith('IDX:')) return Math.round(v * 100) / 100;
    return Math.round(v);
  }

  async function getJSON(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── 업비트 (코인) ─────────────────────────── */
  async function fetchUpbit(codes) {
    const out = new Map();
    if (!codes.length) return out;
    const data = await getJSON(UPBIT + encodeURIComponent(codes.join(',')));
    for (const t of data) {
      const base = BASE[t.market];
      out.set(t.market, {
        code: t.market,
        name: base ? base[0] : t.market.replace('KRW-', ''),
        price: t.trade_price,
        prev: t.prev_closing_price,
        diff: t.signed_change_price,
        rate: t.signed_change_rate * 100,
        volume: Math.round(t.acc_trade_volume_24h),
        high: t.high_price,
        low: t.low_price,
        live: true,
        asOf: '실시간'
      });
    }
    return out;
  }

  /* ── 공공데이터포털 (주식·지수) ─────────────── */
  function apiBase(cfg) {
    return cfg.proxy ? cfg.proxy.replace(/\/+$/, '') + '/1160100/service' : DATA_GO;
  }

  /* 응답에서 조건에 맞는 가장 최근 영업일 행을 고른다.
   * (LIKE 검색이라 다른 종목이 섞여 올 수 있어 keep 으로 한 번 거른다) */
  function pickLatest(body, keep, strict) {
    const items = body && body.items && body.items.item;
    if (!items) return null;
    let list = Array.isArray(items) ? items : [items];
    if (keep) {
      const filtered = list.filter(keep);
      if (filtered.length) list = filtered;
      else if (strict) return null;   // 엉뚱한 종목이 오면 차라리 데모로 떨어뜨린다
    }
    if (!list.length) return null;
    return list.slice().sort((a, b) => String(b.basDt).localeCompare(String(a.basDt)))[0];
  }

  /* 오래된 시세가 딸려오지 않게 최근 N일로 조회 범위를 좁힌다 */
  function beginBasDt(days) {
    const d = new Date(Date.now() - days * 86400000);
    const p = (n) => String(n).padStart(2, '0');
    return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate());
  }

  function fmtDate(d) {
    const s = String(d || '');
    return s.length === 8 ? s.slice(4, 6) + '/' + s.slice(6, 8) + ' 종가' : '종가';
  }

  async function fetchStock(code, cfg) {
    const url = apiBase(cfg) + '/GetStockSecuritiesInfoService/getStockPriceInfo'
      + '?serviceKey=' + encodeURIComponent(cfg.serviceKey)
      + '&resultType=json&numOfRows=20&pageNo=1'
      + '&beginBasDt=' + beginBasDt(20)
      + '&likeSrtnCd=' + encodeURIComponent(code);
    const json = await getJSON(url);
    const it = pickLatest(json.response && json.response.body, (x) => String(x.srtnCd) === code, true);
    if (!it) throw new Error('no data');
    const price = Number(it.clpr);
    const diff = Number(it.vs);
    return {
      code,
      name: it.itmsNm || (BASE[code] ? BASE[code][0] : code),
      price,
      prev: price - diff,
      diff,
      rate: Number(it.fltRt),
      volume: Number(it.trqu),
      high: Number(it.hipr),
      low: Number(it.lopr),
      live: true,
      asOf: fmtDate(it.basDt)
    };
  }

  async function fetchIndex(code, cfg) {
    const name = code.slice(4);
    const url = apiBase(cfg) + '/GetMarketIndexInfoService/getStockMarketIndex'
      + '?serviceKey=' + encodeURIComponent(cfg.serviceKey)
      + '&resultType=json&numOfRows=20&pageNo=1'
      + '&beginBasDt=' + beginBasDt(20)
      + '&idxNm=' + encodeURIComponent(name);
    const json = await getJSON(url);
    const it = pickLatest(json.response && json.response.body, (x) => String(x.idxNm).trim() === name);
    if (!it) throw new Error('no data');
    const price = Number(it.clpr);
    const diff = Number(it.vs);
    return {
      code,
      name,
      price,
      prev: price - diff,
      diff,
      rate: Number(it.fltRt),
      volume: Number(it.trqu) || 0,
      high: Number(it.hipr),
      low: Number(it.lopr),
      live: true,
      asOf: fmtDate(it.basDt)
    };
  }

  /* ── 통합 조회 ──────────────────────────────── */
  /** codes: 종목코드 배열. 반환: { map: Map<code, quote>, live: n, total: n } */
  async function fetchAll(codes, cfg) {
    cfg = cfg || {};
    const map = new Map();
    const coins = codes.filter((c) => c.startsWith('KRW-'));
    const rest = codes.filter((c) => !c.startsWith('KRW-'));

    const jobs = [];
    if (coins.length) {
      jobs.push(fetchUpbit(coins).then((m) => m.forEach((v, k) => map.set(k, v))).catch(() => {}));
    }
    if (cfg.serviceKey) {
      for (const code of rest) {
        const p = code.startsWith('IDX:') ? fetchIndex(code, cfg) : fetchStock(code, cfg);
        jobs.push(p.then((q) => map.set(code, q)).catch(() => {}));
      }
    }
    await Promise.all(jobs);

    let live = 0;
    for (const code of codes) {
      if (map.has(code)) live++;
      else map.set(code, tickDemo(code));
    }
    return { map, live, total: codes.length };
  }

  function known(code) { return BASE[code] ? BASE[code][0] : ''; }

  function suggestions() {
    return Object.keys(BASE)
      .filter((c) => !c.startsWith('IDX:'))
      .map((c) => ({ code: c, name: BASE[c][0] }));
  }

  /* 첫 화면이 빈 표로 깜빡이지 않게, 네트워크 응답 전에 쓸 모의 시세 */
  function demo(codes) {
    return new Map(codes.map((c) => [c, tickDemo(c)]));
  }

  return { fetchAll, demo, known, suggestions, BASE };
})();
