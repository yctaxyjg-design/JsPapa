// 옵시디언 볼트 정리기 — 화면 연결부. 파싱·분석은 vault.js(Vault)에 있다.
(function () {
  "use strict";

  var V = window.Vault;
  var MD_RE = /\.(md|markdown|txt)$/i;

  var state = { vault: null, activeTag: null, filter: "all", query: "" };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    pickDir: $("pick-dir"),
    pickFiles: $("pick-files"),
    pickWebkit: $("pick-webkit"),
    pickWebkitLabel: $("pick-webkit-label"),
    status: $("load-status"),
    dashCard: $("dashboard-card"),
    statGrid: $("stat-grid"),
    tagsCard: $("tags-card"),
    tagsEmpty: $("tags-empty"),
    tagCloud: $("tag-cloud"),
    notesCard: $("notes-card"),
    search: $("search"),
    noteList: $("note-list"),
    reportCard: $("report-card"),
    reportOut: $("report-out"),
    copyReport: $("copy-report"),
    downloadReport: $("download-report"),
    backdrop: $("preview-backdrop"),
    previewTitle: $("preview-title"),
    previewMeta: $("preview-meta"),
    previewBody: $("preview-body"),
    previewClose: $("preview-close")
  };

  // ── 기능 감지: 폴더 열기 지원 여부 ─────────────────────────────
  if (typeof window.showDirectoryPicker === "function") {
    els.pickDir.hidden = false;
    els.pickDir.addEventListener("click", openDirectory);
  } else if ("webkitdirectory" in document.createElement("input")) {
    els.pickWebkitLabel.hidden = false;
  }
  els.pickFiles.addEventListener("change", function (e) { loadFromFileList(e.target.files); });
  els.pickWebkit.addEventListener("change", function (e) { loadFromFileList(e.target.files); });

  // ── 볼트 읽기 ────────────────────────────────────────────────
  function setStatus(msg) { els.status.textContent = msg; }

  async function openDirectory() {
    var handle;
    try {
      handle = await window.showDirectoryPicker();
    } catch (e) {
      return; // 사용자가 취소
    }
    setStatus("읽는 중…");
    var raw = [];
    try {
      await readDir(handle, "", raw);
    } catch (e) {
      setStatus("폴더를 읽지 못했어요: " + e.message);
      return;
    }
    finish(raw);
  }

  async function readDir(handle, prefix, out) {
    for await (var entry of handle.values()) {
      if (entry.name.startsWith(".")) continue; // .obsidian 등 숨김 폴더 제외
      if (entry.kind === "file") {
        if (!MD_RE.test(entry.name)) continue;
        var file = await entry.getFile();
        var text = await file.text();
        out.push({ path: prefix + entry.name, content: text, mtime: file.lastModified });
      } else if (entry.kind === "directory") {
        await readDir(entry, prefix + entry.name + "/", out);
      }
    }
  }

  async function loadFromFileList(fileList) {
    var files = Array.prototype.filter.call(fileList, function (f) { return MD_RE.test(f.name); });
    if (!files.length) { setStatus("마크다운(.md) 파일이 없어요."); return; }
    setStatus("읽는 중…");
    var raw = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var text = await f.text();
      var path = f.webkitRelativePath || f.name;
      raw.push({ path: path, content: text, mtime: f.lastModified });
    }
    finish(raw);
  }

  function finish(raw) {
    if (!raw.length) { setStatus("마크다운(.md) 파일을 찾지 못했어요."); return; }
    state.vault = V.analyze(raw);
    state.activeTag = null;
    state.filter = "all";
    state.query = "";
    if (els.search) els.search.value = "";
    setStatus("✓ 노트 " + state.vault.stats.noteCount + "개를 읽었어요.");
    renderAll();
  }

  // ── 렌더 ────────────────────────────────────────────────────
  function renderAll() {
    renderStats();
    renderTags();
    renderNotes();
    renderReport();
    els.dashCard.hidden = false;
    els.tagsCard.hidden = false;
    els.notesCard.hidden = false;
    els.reportCard.hidden = false;
  }

  function statTile(num, label, warn) {
    var d = document.createElement("div");
    d.className = "stat";
    var n = document.createElement("div");
    n.className = "num" + (warn && num > 0 ? " warn" : "");
    n.textContent = typeof num === "number" ? num.toLocaleString("en-US") : num;
    var l = document.createElement("div");
    l.className = "label";
    l.textContent = label;
    d.appendChild(n); d.appendChild(l);
    return d;
  }

  function renderStats() {
    var s = state.vault.stats;
    els.statGrid.innerHTML = "";
    els.statGrid.appendChild(statTile(s.noteCount, "노트"));
    els.statGrid.appendChild(statTile(s.totalChars, "총 글자"));
    els.statGrid.appendChild(statTile(s.avgChars, "노트당 평균 글자"));
    els.statGrid.appendChild(statTile(s.tagCount, "태그 종류"));
    els.statGrid.appendChild(statTile(s.orphanCount, "고아 노트", true));
    els.statGrid.appendChild(statTile(s.brokenCount, "깨진 링크", true));
  }

  function renderTags() {
    els.tagCloud.innerHTML = "";
    var tags = state.vault.tags;
    els.tagsEmpty.hidden = tags.length > 0;
    tags.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tag";
      b.setAttribute("aria-pressed", state.activeTag === t.tag ? "true" : "false");
      var name = document.createElement("span");
      name.textContent = "#" + t.tag;
      var cnt = document.createElement("span");
      cnt.className = "cnt";
      cnt.textContent = t.count;
      b.appendChild(name); b.appendChild(cnt);
      b.addEventListener("click", function () {
        state.activeTag = state.activeTag === t.tag ? null : t.tag;
        renderTags();
        renderNotes();
      });
      els.tagCloud.appendChild(b);
    });
  }

  function visibleNotes() {
    var q = state.query.trim().toLowerCase();
    return state.vault.notes.filter(function (n) {
      if (state.filter === "orphan" && !n.isOrphan) return false;
      if (state.filter === "broken" && n.broken.length === 0) return false;
      if (state.activeTag && n.tags.indexOf(state.activeTag) === -1) return false;
      if (q && n.name.toLowerCase().indexOf(q) === -1 &&
        n.content.toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) { return b.mtime - a.mtime || a.name.localeCompare(b.name); });
  }

  function badge(text, cls) {
    var s = document.createElement("span");
    s.className = "badge" + (cls ? " " + cls : "");
    s.textContent = text;
    return s;
  }

  function renderNotes() {
    var list = visibleNotes();
    els.noteList.innerHTML = "";
    if (!list.length) {
      var li = document.createElement("li");
      li.className = "empty";
      li.textContent = "조건에 맞는 노트가 없어요.";
      els.noteList.appendChild(li);
      return;
    }
    list.forEach(function (n) {
      var li = document.createElement("li");
      li.tabIndex = 0;
      li.setAttribute("role", "button");

      var title = document.createElement("div");
      title.className = "n-title";
      title.textContent = n.name;
      li.appendChild(title);

      if (n.path !== n.name && n.path !== n.name + ".md") {
        var path = document.createElement("div");
        path.className = "n-path";
        path.textContent = n.path;
        li.appendChild(path);
      }

      var badges = document.createElement("div");
      badges.className = "n-badges";
      badges.appendChild(badge(n.chars.toLocaleString("en-US") + "자"));
      if (n.backlinks.length) badges.appendChild(badge("← 백링크 " + n.backlinks.length));
      if (n.resolvedOut.length) badges.appendChild(badge("→ 링크 " + n.resolvedOut.length));
      if (n.tags.length) badges.appendChild(badge("#" + n.tags.length));
      if (n.isOrphan) badges.appendChild(badge("고아", "orphan"));
      if (n.broken.length) badges.appendChild(badge("깨진 링크 " + n.broken.length, "broken"));
      li.appendChild(badges);

      var open = function () { openPreview(n); };
      li.addEventListener("click", open);
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
      els.noteList.appendChild(li);
    });
  }

  function renderReport() {
    var date = "";
    try { date = new Date().toLocaleString("ko-KR"); } catch (e) { /* 무시 */ }
    els.reportOut.value = V.generateReport(state.vault, { date: date });
  }

  // 검색·필터 이벤트
  els.search.addEventListener("input", function () {
    state.query = els.search.value;
    renderNotes();
  });
  Array.prototype.forEach.call(document.querySelectorAll(".chip[data-filter]"), function (chip) {
    chip.addEventListener("click", function () {
      state.filter = chip.getAttribute("data-filter");
      Array.prototype.forEach.call(document.querySelectorAll(".chip[data-filter]"), function (c) {
        c.setAttribute("aria-pressed", c === chip ? "true" : "false");
      });
      renderNotes();
    });
  });

  // ── 리포트 복사/내려받기 ─────────────────────────────────────
  els.copyReport.addEventListener("click", function () {
    var text = els.reportOut.value;
    var done = function () { flash(els.copyReport, "✓ 복사됨"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
    } else { legacyCopy(text); done(); }
  });

  function legacyCopy(text) {
    els.reportOut.focus();
    els.reportOut.select();
    try { document.execCommand("copy"); } catch (e) { /* 무시 */ }
  }

  function flash(btn, msg) {
    var old = btn.textContent;
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = old; }, 1400);
  }

  els.downloadReport.addEventListener("click", function () {
    var blob = new Blob([els.reportOut.value], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "정리-리포트.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  // ── 미리보기 모달 ───────────────────────────────────────────
  function openPreview(n) {
    els.previewTitle.textContent = n.name;
    els.previewMeta.innerHTML = "";
    var meta = [];
    if (n.mtime) {
      try { meta.push("수정: " + new Date(n.mtime).toLocaleDateString("ko-KR")); } catch (e) {}
    }
    meta.push(n.chars.toLocaleString("en-US") + "자");
    if (n.tags.length) meta.push("태그 " + n.tags.map(function (t) { return "#" + t; }).join(" "));
    if (n.backlinks.length) meta.push("백링크 " + n.backlinks.length);
    if (n.broken.length) meta.push("깨진 링크 " + n.broken.length);
    els.previewMeta.textContent = meta.join(" · ");

    els.previewBody.innerHTML = renderMarkdown(n.content);
    els.backdrop.hidden = false;
    els.previewClose.focus();
  }

  function closePreview() { els.backdrop.hidden = true; }
  els.previewClose.addEventListener("click", closePreview);
  els.backdrop.addEventListener("click", function (e) {
    if (e.target === els.backdrop) closePreview();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.backdrop.hidden) closePreview();
  });

  // 아주 가벼운 마크다운 렌더 — 반드시 이스케이프 먼저.
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[\[([^\[\]\n]+?)\]\]/g, function (_, t) {
        return '<span class="wl">' + t.split("|").pop() + "</span>";
      })
      .replace(/(^|[\s(>])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu,
        '$1<span class="tag-inline">#$2</span>');
  }
  function renderMarkdown(md) {
    var split = V.splitFrontmatter(md);
    var lines = split.body.split(/\r?\n/);
    var html = [], inList = false, inFence = false;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (/^```|^~~~/.test(raw.trim())) {
        if (inFence) { html.push("</code></pre>"); inFence = false; }
        else { if (inList) { html.push("</ul>"); inList = false; } html.push("<pre><code>"); inFence = true; }
        continue;
      }
      if (inFence) { html.push(escapeHtml(raw) + "\n"); continue; }
      var line = escapeHtml(raw);
      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      var item = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (h) {
        if (inList) { html.push("</ul>"); inList = false; }
        var lvl = Math.min(h[1].length, 6);
        html.push("<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">");
      } else if (item) {
        if (!inList) { html.push("<ul>"); inList = true; }
        html.push("<li>" + inline(item[1]) + "</li>");
      } else if (line.trim() === "") {
        if (inList) { html.push("</ul>"); inList = false; }
      } else {
        if (inList) { html.push("</ul>"); inList = false; }
        html.push("<p>" + inline(line) + "</p>");
      }
    }
    if (inList) html.push("</ul>");
    if (inFence) html.push("</code></pre>");
    return html.join("\n");
  }
})();
