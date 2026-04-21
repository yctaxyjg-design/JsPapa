// HWP 5.x parser (text-extraction tier).
// HWP binary format reference: "한글 문서 파일 형식 5.0 / 한/글 HWP 5.0".
//
// The container is a CFB (see cfb.js). Per spec the interesting streams are:
//   FileHeader        — 256-byte header with flags (compressed, encrypted).
//   DocInfo           — document-wide settings, styles, etc.
//   BodyText/Section# — per-section body streams holding paragraph records.
//
// Body streams are DEFLATE-compressed (raw, no zlib wrapper) when the
// "compressed" flag is set in FileHeader. Each decompressed stream is a
// sequence of records with a 4-byte variable header:
//   u32 header = (level << 20) | (size << 10) | tag
//   If size == 0xFFF, an additional u32 giving the real size follows.
// Record tag HWPTAG_PARA_TEXT (0x43 = HWPTAG_BEGIN 0x10 + 51) stores a
// UTF-16LE buffer; control characters 1-9, 11-12, 14-23 are 8 u16 wide.
// Tag HWPTAG_PARA_HEADER (0x42) marks a new paragraph boundary.
//
// We extract legible text, convert to HTML paragraphs, and surface a raw
// text view. Layout (columns, tables, fonts) of .hwp binaries is out of
// scope here — users who need faithful rendering should save as HWPX.

(function (global) {
  "use strict";

  const HWPTAG_BEGIN = 0x10;
  const HWPTAG_PARA_HEADER = HWPTAG_BEGIN + 50; // 0x42
  const HWPTAG_PARA_TEXT = HWPTAG_BEGIN + 51; // 0x43

  const FILE_HEADER_SIG = "HWP Document File";

  function detect(bytes) {
    if (!global.JsPapaCfb || !global.JsPapaCfb.detect(bytes)) return false;
    try {
      const cfb = global.JsPapaCfb.open(bytes);
      if (!cfb.has("FileHeader")) return false;
      const header = cfb.read("FileHeader");
      let sig = "";
      for (let i = 0; i < FILE_HEADER_SIG.length && i < header.length; i++) {
        sig += String.fromCharCode(header[i]);
      }
      return sig === FILE_HEADER_SIG;
    } catch (_err) {
      return false;
    }
  }

  function parseFileHeader(bytes) {
    // Bytes 32-35: properties bitfield.
    //   bit 0: compressed
    //   bit 1: encrypted
    //   bit 2: distribution
    const props = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(32, true);
    return {
      versionBytes: [bytes[36], bytes[37], bytes[38], bytes[39]],
      version: `${bytes[39]}.${bytes[38]}.${bytes[37]}.${bytes[36]}`,
      compressed: (props & 0x01) !== 0,
      encrypted: (props & 0x02) !== 0,
      distribution: (props & 0x04) !== 0,
    };
  }

  async function inflateRaw(compressed) {
    const stream = new Blob([compressed])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    const chunks = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  function* iterRecords(bytes) {
    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    let cursor = 0;
    const len = bytes.length;
    while (cursor + 4 <= len) {
      const header = view.getUint32(cursor, true);
      const tag = header & 0x3ff;
      const level = (header >>> 10) & 0x3ff;
      let size = (header >>> 20) & 0xfff;
      let bodyOffset = cursor + 4;
      if (size === 0xfff) {
        size = view.getUint32(cursor + 4, true);
        bodyOffset = cursor + 8;
      }
      if (bodyOffset + size > len) break;
      yield {
        tag,
        level,
        size,
        data: bytes.subarray(bodyOffset, bodyOffset + size),
      };
      cursor = bodyOffset + size;
    }
  }

  // HWP control-char categorization. Keys are u16 code values 0-31.
  // Returns the number of u16 units consumed by the control, including self.
  function controlWidth(code) {
    // Char control (single u16)
    if (code === 0 || code === 10 || code === 13) return 1;
    // Inline (8 u16) and extended (8 u16) — both take 16 bytes total.
    if (
      (code >= 1 && code <= 9) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 23)
    ) {
      return 8;
    }
    return 1;
  }

  function decodeParaText(bytes) {
    // bytes is a UTF-16LE stream that may contain control "characters".
    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    const unitCount = bytes.length >> 1;
    let out = "";
    let i = 0;
    while (i < unitCount) {
      const code = view.getUint16(i * 2, true);
      if (code < 32) {
        if (code === 10) {
          out += "\n";
        } else if (code === 13) {
          out += "\n";
        } else if (code === 9) {
          out += "\t";
        }
        i += controlWidth(code);
        continue;
      }
      out += String.fromCharCode(code);
      i += 1;
    }
    return out;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  async function parseSection(streamBytes, compressed) {
    const raw = compressed ? await inflateRaw(streamBytes) : streamBytes;
    const paragraphs = [];
    let current = null;
    let paragraphCount = 0;
    for (const rec of iterRecords(raw)) {
      if (rec.tag === HWPTAG_PARA_HEADER) {
        if (current != null) paragraphs.push(current);
        current = "";
        paragraphCount += 1;
      } else if (rec.tag === HWPTAG_PARA_TEXT) {
        const text = decodeParaText(rec.data);
        if (current == null) current = "";
        current += text;
      }
    }
    if (current != null) paragraphs.push(current);
    return { paragraphs, paragraphCount };
  }

  async function parse(cfb) {
    if (!cfb.has("FileHeader")) {
      throw new Error("HWP: FileHeader stream missing");
    }
    const header = parseFileHeader(cfb.read("FileHeader"));
    if (header.encrypted) {
      throw new Error(
        "HWP: 암호로 보호된 문서는 현재 지원하지 않습니다.",
      );
    }
    if (header.distribution) {
      throw new Error(
        "HWP: 배포용(DRM) 문서는 현재 지원하지 않습니다.",
      );
    }

    // Find BodyText section streams.
    const sectionPaths = cfb
      .list()
      .filter((p) => /^BodyText\/Section\d+$/.test(p))
      .sort((a, b) => {
        const na = Number(a.match(/Section(\d+)/)[1]);
        const nb = Number(b.match(/Section(\d+)/)[1]);
        return na - nb;
      });

    if (sectionPaths.length === 0) {
      throw new Error("HWP: 본문(BodyText/Section*) 스트림을 찾을 수 없습니다.");
    }

    let html = "";
    let plain = "";
    let paragraphCount = 0;

    for (const path of sectionPaths) {
      const bytes = cfb.read(path);
      const section = await parseSection(bytes, header.compressed);
      paragraphCount += section.paragraphCount;

      const pageParts = [];
      pageParts.push(
        `<article class="page" data-section="${escapeHtml(path)}">`,
      );
      for (const para of section.paragraphs) {
        const body = escapeHtml(para).replaceAll("\n", "<br/>");
        pageParts.push(`<p>${body || "&nbsp;"}</p>`);
        plain += para + "\n";
      }
      pageParts.push("</article>");
      html += pageParts.join("");
    }

    return {
      kind: "hwp",
      html,
      plain: plain.trim(),
      stats: {
        sections: sectionPaths.length,
        paragraphs: paragraphCount,
        version: header.version,
        compressed: header.compressed,
      },
    };
  }

  global.JsPapaHwp = { detect, parse, parseFileHeader };
})(typeof window !== "undefined" ? window : globalThis);
