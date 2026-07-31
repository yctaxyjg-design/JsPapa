// 옵시디언 볼트 파싱·분석 — 순수 로직(DOM 없음). 브라우저와 Node 양쪽에서 로드된다.
// math-play/recognizer.js 처럼 외부 의존성이 전혀 없다.
(function (root) {
  "use strict";

  // 코드 블록(```) 과 인라인 코드(`...`)를 지운다. 그 안의 #·[[는 태그/링크가 아니므로.
  function stripCode(md) {
    return md
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/~~~[\s\S]*?~~~/g, " ")
      .replace(/`[^`\n]*`/g, " ");
  }

  // 맨 앞 --- ... --- 프론트매터를 떼어 본문과 나눈다.
  function splitFrontmatter(md) {
    var m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
    if (!m) return { frontmatter: "", body: md };
    return { frontmatter: m[1], body: md.slice(m[0].length) };
  }

  // 프론트매터 텍스트에서 tags 값을 뽑는다. (여러 표기 지원)
  function frontmatterTags(fm) {
    if (!fm) return [];
    var lines = fm.split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = /^\s*(tags?)\s*:\s*(.*)$/i.exec(line);
      if (!m) continue;
      var rest = m[2].trim();
      if (rest === "" || rest === "[]") {
        // 다음 줄들이 "- 태그" 형식인지 본다.
        for (var j = i + 1; j < lines.length; j++) {
          var li = /^\s*-\s+(.+?)\s*$/.exec(lines[j]);
          if (!li) break;
          out.push(stripQuotes(li[1]));
        }
      } else if (rest[0] === "[") {
        // [a, b, c]
        rest.replace(/[[\]]/g, "").split(",").forEach(function (t) {
          t = stripQuotes(t.trim());
          if (t) out.push(t);
        });
      } else {
        // a, b  또는  단일값
        rest.split(",").forEach(function (t) {
          t = stripQuotes(t.trim());
          if (t) out.push(t);
        });
      }
      break;
    }
    return out.map(function (t) { return t.replace(/^#/, ""); });
  }

  function stripQuotes(s) {
    return s.replace(/^['"]|['"]$/g, "").trim();
  }

  // 본문 인라인 태그(#태그). 숫자만인 것은 태그가 아니다(옵시디언 규칙).
  var TAG_RE = /(^|[\s(>])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
  function inlineTags(body) {
    var text = stripCode(body);
    var out = [], m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text)) !== null) out.push(m[2]);
    return out;
  }

  // 위키링크 [[대상]] · [[대상|별칭]] · [[대상#헤딩]] 과 로컬 .md 마크다운 링크.
  var WIKI_RE = /\[\[([^\[\]\n]+?)\]\]/g;
  var MDLINK_RE = /\[[^\]]*\]\(([^)\s]+?\.(?:md|markdown))(?:#[^)]*)?\)/g;
  function rawLinks(body) {
    var text = stripCode(body);
    var out = [], m;
    WIKI_RE.lastIndex = 0;
    while ((m = WIKI_RE.exec(text)) !== null) {
      var inner = m[1].split("|")[0];
      out.push(inner);
    }
    MDLINK_RE.lastIndex = 0;
    while ((m = MDLINK_RE.exec(text)) !== null) {
      if (/^https?:/i.test(m[1])) continue;
      out.push(m[1]);
    }
    return out;
  }

  // 링크 대상을 비교용 키로 정규화: 헤딩/블록/별칭/경로/확장자 제거 후 소문자.
  function normalizeTarget(t) {
    t = String(t).trim();
    try { t = decodeURIComponent(t); } catch (e) { /* 그대로 */ }
    t = t.split("|")[0];
    t = t.split("#")[0].split("^")[0];
    t = t.replace(/\\/g, "/");
    var slash = t.lastIndexOf("/");
    if (slash >= 0) t = t.slice(slash + 1);
    t = t.replace(/\.(md|markdown)$/i, "");
    return t.trim().toLowerCase();
  }

  function baseName(path) {
    var p = String(path).replace(/\\/g, "/");
    var slash = p.lastIndexOf("/");
    if (slash >= 0) p = p.slice(slash + 1);
    return p.replace(/\.(md|markdown|txt)$/i, "");
  }

  // 공백 제외 글자 수(한글 기준으로 대략적인 분량).
  function charCount(body) {
    return body.replace(/\s+/g, "").length;
  }

  function uniq(arr) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < arr.length; i++) {
      var k = arr[i];
      if (!seen[k]) { seen[k] = 1; out.push(k); }
    }
    return out;
  }

  // 노트 하나 파싱. input: { path, content, mtime }
  function parseNote(input) {
    var content = input.content || "";
    var split = splitFrontmatter(content);
    var tags = uniq(frontmatterTags(split.frontmatter).concat(inlineTags(split.body)));
    var links = uniq(rawLinks(split.body).map(function (l) { return l.trim(); }));
    return {
      path: input.path,
      name: baseName(input.path),
      mtime: input.mtime || 0,
      content: content,
      tags: tags,
      links: links,
      linkKeys: uniq(links.map(normalizeTarget)).filter(Boolean),
      chars: charCount(split.body)
    };
  }

  // 볼트 전체 분석. input: 노트 원본 배열. return: 노트 + 관계 + 통계.
  function analyze(rawNotes) {
    var notes = rawNotes.map(parseNote);

    // 이름 인덱스(정규화된 basename → 노트). 중복 이름은 첫 노트를 채택.
    var index = Object.create(null);
    notes.forEach(function (n) {
      var key = n.name.toLowerCase();
      if (!(key in index)) index[key] = n;
    });

    // 백링크·깨진 링크 계산.
    notes.forEach(function (n) {
      n.backlinks = [];
      n.broken = [];
      n.resolvedOut = [];
    });
    var byPath = Object.create(null);
    notes.forEach(function (n) { byPath[n.path] = n; });

    notes.forEach(function (n) {
      n.linkKeys.forEach(function (key) {
        var target = index[key];
        if (target && target.path !== n.path) {
          n.resolvedOut.push(target.path);
          target.backlinks.push(n.path);
        } else if (!target) {
          n.broken.push(key);
        }
      });
      n.resolvedOut = uniq(n.resolvedOut);
      n.broken = uniq(n.broken);
    });
    notes.forEach(function (n) { n.backlinks = uniq(n.backlinks); });

    // 고아 노트: 들어오는 링크 0 && 나가는 링크(작성된 것 전부) 0.
    notes.forEach(function (n) {
      n.isOrphan = n.backlinks.length === 0 && n.links.length === 0;
    });

    // 태그 집계.
    var tagCounts = Object.create(null);
    notes.forEach(function (n) {
      n.tags.forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    });
    var tags = Object.keys(tagCounts)
      .map(function (t) { return { tag: t, count: tagCounts[t] }; })
      .sort(function (a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });

    // 깨진 링크 목록(from → target).
    var brokenLinks = [];
    notes.forEach(function (n) {
      n.broken.forEach(function (key) { brokenLinks.push({ from: n.name, target: key }); });
    });

    var totalChars = notes.reduce(function (s, n) { return s + n.chars; }, 0);
    var orphans = notes.filter(function (n) { return n.isOrphan; });

    return {
      notes: notes,
      tags: tags,
      brokenLinks: brokenLinks,
      stats: {
        noteCount: notes.length,
        totalChars: totalChars,
        avgChars: notes.length ? Math.round(totalChars / notes.length) : 0,
        tagCount: tags.length,
        orphanCount: orphans.length,
        brokenCount: brokenLinks.length
      }
    };
  }

  // 정리 리포트(마크다운) 생성. opts.date 는 문자열(선택).
  function generateReport(vault, opts) {
    opts = opts || {};
    var s = vault.stats;
    var L = [];
    L.push("# 📊 볼트 정리 리포트");
    L.push("");
    if (opts.date) L.push("> 생성: " + opts.date);
    L.push("> 노트 " + s.noteCount + "개 · 태그 " + s.tagCount + "종 · 고아 " +
      s.orphanCount + "개 · 깨진 링크 " + s.brokenCount + "개");
    L.push("");

    L.push("## 통계");
    L.push("");
    L.push("| 항목 | 값 |");
    L.push("| --- | --- |");
    L.push("| 노트 수 | " + s.noteCount + " |");
    L.push("| 총 글자 수 | " + s.totalChars.toLocaleString("en-US") + " |");
    L.push("| 노트당 평균 글자 | " + s.avgChars.toLocaleString("en-US") + " |");
    L.push("| 태그 종류 | " + s.tagCount + " |");
    L.push("| 고아 노트 | " + s.orphanCount + " |");
    L.push("| 깨진 링크 | " + s.brokenCount + " |");
    L.push("");

    if (vault.tags.length) {
      L.push("## 태그 (많이 쓴 순)");
      L.push("");
      vault.tags.forEach(function (t) {
        L.push("- `#" + t.tag + "` × " + t.count);
      });
      L.push("");
    }

    if (s.orphanCount) {
      L.push("## 🕸️ 고아 노트 (연결이 하나도 없음)");
      L.push("");
      L.push("링크로 이어 두면 나중에 다시 찾기 쉬워요.");
      L.push("");
      vault.notes.filter(function (n) { return n.isOrphan; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); })
        .forEach(function (n) { L.push("- [[" + n.name + "]]"); });
      L.push("");
    }

    if (s.brokenCount) {
      L.push("## 🔗 깨진 링크 (대상 노트를 못 찾음)");
      L.push("");
      L.push("| 어디서 | 가리키는 대상 |");
      L.push("| --- | --- |");
      vault.brokenLinks
        .slice()
        .sort(function (a, b) { return a.from.localeCompare(b.from); })
        .forEach(function (b) { L.push("| [[" + b.from + "]] | `" + b.target + "` |"); });
      L.push("");
    }

    L.push("---");
    L.push("*옵시디언 볼트 정리기로 생성 — 브라우저 안에서만 처리되었습니다.*");
    return L.join("\n");
  }

  var api = {
    stripCode: stripCode,
    splitFrontmatter: splitFrontmatter,
    frontmatterTags: frontmatterTags,
    inlineTags: inlineTags,
    rawLinks: rawLinks,
    normalizeTarget: normalizeTarget,
    baseName: baseName,
    charCount: charCount,
    parseNote: parseNote,
    analyze: analyze,
    generateReport: generateReport
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Vault = api;
})(typeof window !== "undefined" ? window : this);
