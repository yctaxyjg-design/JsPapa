// Main viewer orchestration. Handles file intake (drag-drop, file picker,
// URL query, chrome.storage.session handoff from the popup), detects whether
// the bytes are HWPX (ZIP) or HWP (CFB), dispatches to the appropriate
// parser, and renders the result in the stage.

(function () {
  "use strict";

  const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
  const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

  const el = {
    dropZone: document.getElementById("drop-zone"),
    dropCard: document.querySelector(".drop-card"),
    document: document.getElementById("document"),
    raw: document.getElementById("raw"),
    error: document.getElementById("error"),
    errorMessage: document.getElementById("error-message"),
    loader: document.getElementById("loader"),
    fileName: document.getElementById("file-name"),
    fileMeta: document.getElementById("file-meta"),
    openInput: document.getElementById("open-input"),
    zoomIn: document.getElementById("zoom-in"),
    zoomOut: document.getElementById("zoom-out"),
    zoomLabel: document.getElementById("zoom-label"),
    toggleRaw: document.getElementById("toggle-raw"),
  };

  let state = {
    zoom: 1,
    plain: "",
    rawVisible: false,
  };

  function matches(bytes, magic) {
    if (bytes.length < magic.length) return false;
    for (let i = 0; i < magic.length; i++) {
      if (bytes[i] !== magic[i]) return false;
    }
    return true;
  }

  function showOnly(node) {
    for (const key of ["dropZone", "document", "raw", "error", "loader"]) {
      el[key].hidden = el[key] !== node;
    }
  }

  function setFileMeta(name, size, extraParts) {
    el.fileName.textContent = name || "문서 없음";
    const parts = [];
    if (size != null) parts.push(formatBytes(size));
    if (Array.isArray(extraParts)) parts.push(...extraParts);
    el.fileMeta.textContent = parts.join(" · ");
  }

  function formatBytes(n) {
    if (!Number.isFinite(n)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let v = n;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) {
      v /= 1024;
      u += 1;
    }
    return `${v.toFixed(v >= 10 || u === 0 ? 0 : 1)} ${units[u]}`;
  }

  function applyZoom() {
    el.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    for (const page of el.document.querySelectorAll(".page")) {
      page.style.transform = `scale(${state.zoom})`;
      page.style.marginBottom = `${(state.zoom - 1) * 297 * 3.78}px`;
    }
  }

  function showError(err) {
    console.error("[JsPapa]", err);
    el.errorMessage.textContent =
      (err && err.message) || String(err || "Unknown error");
    showOnly(el.error);
  }

  async function handleFile(file) {
    if (!file) return;
    showOnly(el.loader);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      await handleBytes(bytes, file.name, file.size);
    } catch (err) {
      showError(err);
    }
  }

  async function handleBytes(bytes, name, size) {
    showOnly(el.loader);
    let result;
    const metaExtras = [];

    try {
      if (matches(bytes, ZIP_MAGIC)) {
        const zip = await JsPapaZip.open(bytes);
        const isHwpx = await JsPapaHwpx.detect(zip);
        if (!isHwpx) {
          throw new Error(
            "ZIP 파일이지만 HWPX (mimetype=application/hwp+zip) 문서가 아닙니다.",
          );
        }
        result = await JsPapaHwpx.parse(zip);
        metaExtras.push(`HWPX`);
        metaExtras.push(`섹션 ${result.stats.sections}개`);
        metaExtras.push(`단락 ${result.stats.paragraphs}개`);
        if (result.stats.images)
          metaExtras.push(`이미지 ${result.stats.images}개`);
      } else if (matches(bytes, CFB_MAGIC)) {
        const cfb = JsPapaCfb.open(bytes);
        if (!JsPapaHwp.detect(bytes)) {
          throw new Error(
            "OLE/CFB 파일이지만 HWP 5.x 문서가 아닙니다 (FileHeader 확인 실패).",
          );
        }
        result = await JsPapaHwp.parse(cfb);
        metaExtras.push(`HWP ${result.stats.version}`);
        metaExtras.push(`섹션 ${result.stats.sections}개`);
        metaExtras.push(`단락 ${result.stats.paragraphs}개`);
        metaExtras.push(
          result.stats.compressed ? "압축됨" : "비압축",
        );
      } else {
        const head = Array.from(bytes.slice(0, 8))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");
        throw new Error(
          `HWP도, HWPX도 아닌 파일 같습니다. 앞 8바이트: ${head}`,
        );
      }
    } catch (err) {
      setFileMeta(name, size, []);
      showError(err);
      return;
    }

    state.plain = result.plain;
    el.document.innerHTML = result.html;
    el.raw.textContent = result.plain || "(추출된 텍스트가 없습니다)";
    setFileMeta(name, size, metaExtras);
    state.rawVisible = false;
    el.toggleRaw.textContent = "원문";
    showOnly(el.document);
    applyZoom();
  }

  async function loadFromUrl(url) {
    setFileMeta(url, null, ["다운로드 중…"]);
    showOnly(el.loader);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const buffer = await resp.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const name = decodeURIComponent(url.split("/").pop() || "document");
      await handleBytes(bytes, name, bytes.byteLength);
    } catch (err) {
      showError(err);
    }
  }

  async function loadFromSession() {
    if (!chrome.storage || !chrome.storage.session) {
      throw new Error(
        "chrome.storage.session 이 없어 파일을 불러올 수 없습니다.",
      );
    }
    const { pendingDoc } = await chrome.storage.session.get("pendingDoc");
    if (!pendingDoc) {
      setFileMeta(null, null, []);
      showOnly(el.dropZone);
      return;
    }
    await chrome.storage.session.remove("pendingDoc");
    const bytes = new Uint8Array(pendingDoc.data);
    await handleBytes(bytes, pendingDoc.name, pendingDoc.size);
  }

  // --- Event wiring ---

  el.openInput.addEventListener("change", () => {
    const f = el.openInput.files && el.openInput.files[0];
    if (f) handleFile(f);
    el.openInput.value = "";
  });

  el.zoomIn.addEventListener("click", () => {
    state.zoom = Math.min(3, state.zoom + 0.1);
    applyZoom();
  });
  el.zoomOut.addEventListener("click", () => {
    state.zoom = Math.max(0.4, state.zoom - 0.1);
    applyZoom();
  });

  el.toggleRaw.addEventListener("click", () => {
    if (state.rawVisible) {
      state.rawVisible = false;
      el.toggleRaw.textContent = "원문";
      showOnly(el.document);
      applyZoom();
    } else {
      state.rawVisible = true;
      el.toggleRaw.textContent = "문서";
      showOnly(el.raw);
    }
  });

  function addDropHandlers(target) {
    target.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (el.dropCard) el.dropCard.classList.add("dragging");
    });
    target.addEventListener("dragleave", () => {
      if (el.dropCard) el.dropCard.classList.remove("dragging");
    });
    target.addEventListener("drop", (e) => {
      e.preventDefault();
      if (el.dropCard) el.dropCard.classList.remove("dragging");
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }

  addDropHandlers(document.body);

  // --- Bootstrap ---

  (async function boot() {
    const params = new URLSearchParams(location.search);
    if (params.get("source") === "storage") {
      try {
        await loadFromSession();
      } catch (err) {
        showError(err);
      }
      return;
    }
    const url = params.get("url");
    if (url) {
      await loadFromUrl(url);
      return;
    }
    showOnly(el.dropZone);
  })();
})();
