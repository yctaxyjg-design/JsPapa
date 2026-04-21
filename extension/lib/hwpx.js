// HWPX (OWPML) parser and HTML renderer.
// HWPX is a ZIP archive of OWPML XML documents:
//   Contents/content.hpf   — package manifest (OPF-like)
//   Contents/header.xml    — styles, fonts, bullet/numbering definitions
//   Contents/section*.xml  — body contents, one file per section
//   BinData/*              — embedded images / binaries
//
// Spec references: KS X 6101 (OWPML) and the rhwp / libhwp-rs source.
// We intentionally implement only the subset of OWPML that is common in
// modern documents (paragraphs, runs, character properties, tables, images).

(function (global) {
  "use strict";

  const MIME_BY_EXT = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    webp: "image/webp",
    tif: "image/tiff",
    tiff: "image/tiff",
  };

  const HWPX_MIME = "application/hwp+zip";

  async function detect(zip) {
    if (!zip.has("mimetype")) return false;
    const mime = (await zip.readText("mimetype")).trim();
    return mime === HWPX_MIME || mime.startsWith("application/hwp");
  }

  function localName(node) {
    const n = node.nodeName;
    const idx = n.indexOf(":");
    return idx >= 0 ? n.slice(idx + 1) : n;
  }

  function childrenByName(node, name) {
    const out = [];
    if (!node || !node.childNodes) return out;
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && localName(child) === name) out.push(child);
    }
    return out;
  }

  function firstByName(node, name) {
    if (!node || !node.childNodes) return null;
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && localName(child) === name) return child;
    }
    return null;
  }

  function attr(node, name) {
    if (!node || !node.getAttribute) return null;
    return node.getAttribute(name);
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const err = doc.getElementsByTagName("parsererror")[0];
    if (err) {
      throw new Error("XML parse error: " + err.textContent.split("\n")[0]);
    }
    return doc;
  }

  // Twips-like units in HWPX: 1 hwp unit = 1/7200 inch = 1/100 pt.
  function hwpPtToPx(value) {
    if (value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    // 100 = 1pt, 1pt ≈ 1.333px at 96dpi
    return (n / 100) * (96 / 72);
  }

  function collectCharProps(headerDoc) {
    // Map id -> css dictionary derived from <hh:charPr>.
    const map = new Map();
    if (!headerDoc) return map;
    const charPrList =
      headerDoc.getElementsByTagNameNS("*", "charPr") ||
      headerDoc.getElementsByTagName("charPr");
    for (const cp of charPrList) {
      const id = attr(cp, "id");
      if (id == null) continue;
      const css = {};
      const heightAttr = attr(cp, "height");
      if (heightAttr) {
        // height is in 1/100 pt
        css["font-size"] = (Number(heightAttr) / 100).toFixed(2) + "pt";
      }
      const textColor = attr(cp, "textColor");
      if (textColor && textColor !== "#000000") css.color = textColor;

      const bold = firstByName(cp, "bold");
      if (bold) css["font-weight"] = "bold";
      const italic = firstByName(cp, "italic");
      if (italic) css["font-style"] = "italic";
      const underline = firstByName(cp, "underline");
      if (underline) css["text-decoration"] = "underline";
      const strike = firstByName(cp, "strikeout");
      if (strike) {
        css["text-decoration"] = css["text-decoration"]
          ? css["text-decoration"] + " line-through"
          : "line-through";
      }

      map.set(id, css);
    }
    return map;
  }

  function collectParaProps(headerDoc) {
    const map = new Map();
    if (!headerDoc) return map;
    const paraPrList = headerDoc.getElementsByTagNameNS("*", "paraPr");
    for (const pp of paraPrList) {
      const id = attr(pp, "id");
      if (id == null) continue;
      const css = {};
      const align = firstByName(pp, "align");
      if (align) {
        const h = attr(align, "horizontal");
        if (h && h !== "LEFT") {
          css["text-align"] = String(h).toLowerCase();
        }
      }
      const margin = firstByName(pp, "margin");
      if (margin) {
        const left = firstByName(margin, "left");
        if (left) {
          const val = attr(left, "value");
          if (val) css["margin-left"] = (Number(val) / 200).toFixed(1) + "pt";
        }
      }
      map.set(id, css);
    }
    return map;
  }

  function cssObjToString(obj) {
    return Object.entries(obj)
      .map(([k, v]) => `${k}:${v}`)
      .join(";");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  async function preloadImages(zip) {
    // Return a map "BinData/xxx.png" -> object-url-safe dataURL.
    const cache = new Map();
    for (const name of zip.list()) {
      if (!name.startsWith("BinData/")) continue;
      const ext = name.split(".").pop().toLowerCase();
      const mime = MIME_BY_EXT[ext];
      if (!mime) continue;
      const bytes = await zip.read(name);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      cache.set(name, `data:${mime};base64,${btoa(binary)}`);
      // Also register by the bare id (without BinData/ prefix)
      cache.set(name.slice("BinData/".length), cache.get(name));
    }
    return cache;
  }

  function buildBinItemMap(manifestDoc) {
    // content.hpf declares <opf:item> entries. We map id -> href so that
    // references like binItemIDRef can be resolved to a file in BinData/.
    const map = new Map();
    if (!manifestDoc) return map;
    const items = manifestDoc.getElementsByTagNameNS("*", "item");
    for (const item of items) {
      const id = attr(item, "id");
      const href = attr(item, "href");
      if (id && href) map.set(id, href);
    }
    return map;
  }

  function renderRun(run, ctx) {
    // A <hp:run> is the inline-content container in a paragraph. It may
    // contain <hp:t> (text), <hp:ctrl>, <hp:pic>, <hp:tbl>, etc.
    const charPrIDRef = attr(run, "charPrIDRef");
    const css = ctx.charProps.get(charPrIDRef) || {};
    let inner = "";
    for (const child of run.childNodes) {
      if (child.nodeType !== 1) continue;
      const tag = localName(child);
      if (tag === "t") {
        inner += escapeHtml(child.textContent || "").replaceAll(
          "\n",
          "<br/>",
        );
      } else if (tag === "tab") {
        inner += '<span class="tab">&#9;</span>';
      } else if (tag === "lineBreak") {
        inner += "<br/>";
      } else if (tag === "pic") {
        inner += renderPic(child, ctx);
      } else if (tag === "tbl") {
        inner += renderTable(child, ctx);
      } else if (tag === "ctrl") {
        // control chunks (headers/footers/hyperlinks); skip for now.
      } else if (tag === "markpenBegin" || tag === "markpenEnd") {
        // skip
      } else {
        // Best-effort: recurse into unknown elements.
        const deeper = [];
        for (const nested of child.childNodes) {
          if (nested.nodeType === 1 && localName(nested) === "t") {
            deeper.push(escapeHtml(nested.textContent || ""));
          }
        }
        if (deeper.length) inner += deeper.join("");
      }
    }
    if (!inner) return "";
    const style = cssObjToString(css);
    if (!style) return `<span>${inner}</span>`;
    return `<span style="${style}">${inner}</span>`;
  }

  function renderPic(pic, ctx) {
    // Find <hp:img binaryItemIDRef="..." /> or similar.
    const img = pic.getElementsByTagNameNS("*", "img")[0];
    if (!img) return "";
    const ref =
      attr(img, "binaryItemIDRef") ||
      attr(img, "href") ||
      attr(img, "BinItem");
    if (!ref) return "";
    const href = ctx.binItems.get(ref) || ref;
    // Try both with and without BinData/ prefix.
    const src =
      ctx.images.get(href) ||
      ctx.images.get("BinData/" + href) ||
      ctx.images.get(href.replace(/^BinData\//, ""));
    if (!src) return "";
    return `<img src="${src}" alt="" />`;
  }

  function renderTable(tbl, ctx) {
    const rows = tbl.getElementsByTagNameNS("*", "tr");
    const out = [];
    out.push("<table>");
    for (const tr of rows) {
      out.push("<tr>");
      const cells = childrenByName(tr, "tc");
      for (const tc of cells) {
        const colSpan = attr(tc, "colSpan");
        const rowSpan = attr(tc, "rowSpan");
        let attrs = "";
        if (colSpan && colSpan !== "1") attrs += ` colspan="${colSpan}"`;
        if (rowSpan && rowSpan !== "1") attrs += ` rowspan="${rowSpan}"`;
        out.push(`<td${attrs}>`);
        // A cell holds <hp:subList> -> paragraphs
        const subList = firstByName(tc, "subList");
        if (subList) {
          const paras = childrenByName(subList, "p");
          for (const p of paras) out.push(renderParagraph(p, ctx));
        }
        out.push("</td>");
      }
      out.push("</tr>");
    }
    out.push("</table>");
    return out.join("");
  }

  function renderParagraph(p, ctx) {
    const paraPrIDRef = attr(p, "paraPrIDRef");
    const css = ctx.paraProps.get(paraPrIDRef) || {};
    const runs = childrenByName(p, "run");
    let inner = "";
    for (const run of runs) inner += renderRun(run, ctx);
    if (!inner) inner = "&nbsp;";
    const style = cssObjToString(css);
    if (style) return `<p style="${style}">${inner}</p>`;
    return `<p>${inner}</p>`;
  }

  async function parse(zip) {
    // Locate manifest to find sections in declared order.
    let manifestDoc = null;
    const manifestCandidates = [
      "Contents/content.hpf",
      "META-INF/container.xml",
    ];
    for (const cand of manifestCandidates) {
      if (zip.has(cand)) {
        manifestDoc = parseXml(await zip.readText(cand));
        break;
      }
    }

    const binItems = buildBinItemMap(manifestDoc);

    const headerDoc = zip.has("Contents/header.xml")
      ? parseXml(await zip.readText("Contents/header.xml"))
      : null;

    const charProps = collectCharProps(headerDoc);
    const paraProps = collectParaProps(headerDoc);
    const images = await preloadImages(zip);

    // Find sections: either from manifest item list, or by enumerating files.
    const sections = [];
    const sectionNames = zip
      .list()
      .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
      .sort((a, b) => {
        const na = Number(a.match(/section(\d+)/i)[1]);
        const nb = Number(b.match(/section(\d+)/i)[1]);
        return na - nb;
      });

    const ctx = { charProps, paraProps, binItems, images };

    let html = "";
    let plain = "";
    let paraCount = 0;

    for (const name of sectionNames) {
      const doc = parseXml(await zip.readText(name));
      const paragraphs = doc.getElementsByTagNameNS("*", "p");
      const page = [];
      page.push(`<article class="page" data-section="${escapeHtml(name)}">`);
      for (const p of paragraphs) {
        // Skip paragraphs nested inside tables — those get rendered inside
        // the parent tc/subList to avoid duplicate output.
        let parent = p.parentNode;
        let nested = false;
        while (parent && parent.nodeType === 1) {
          const tag = localName(parent);
          if (tag === "tc" || tag === "subList" || tag === "tbl") {
            nested = true;
            break;
          }
          parent = parent.parentNode;
        }
        if (nested) continue;
        page.push(renderParagraph(p, ctx));
        paraCount += 1;
        plain += (p.textContent || "").trim() + "\n";
      }
      page.push("</article>");
      html += page.join("");
      sections.push(name);
    }

    return {
      kind: "hwpx",
      html,
      plain: plain.trim(),
      stats: {
        sections: sections.length,
        paragraphs: paraCount,
        images: [...images.keys()].filter((k) => k.startsWith("BinData/"))
          .length,
      },
    };
  }

  global.JsPapaHwpx = { detect, parse };
})(typeof window !== "undefined" ? window : globalThis);
