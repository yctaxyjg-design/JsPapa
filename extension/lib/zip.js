// Minimal ZIP reader built on top of DecompressionStream.
// Supports STORE (0) and DEFLATE (8) compression methods, which covers
// every HWPX file produced by the reference implementation.
//
// Exposed as the global `JsPapaZip` namespace.

(function (global) {
  "use strict";

  const SIG_EOCD = 0x06054b50;
  const SIG_EOCD64_LOC = 0x07064b50;
  const SIG_EOCD64 = 0x06064b50;
  const SIG_CDFH = 0x02014b50;
  const SIG_LFH = 0x04034b50;

  class ByteReader {
    constructor(buffer) {
      this.view = new DataView(
        buffer.buffer || buffer,
        buffer.byteOffset || 0,
        buffer.byteLength,
      );
      this.bytes = new Uint8Array(
        buffer.buffer || buffer,
        buffer.byteOffset || 0,
        buffer.byteLength,
      );
    }

    u16(offset) {
      return this.view.getUint16(offset, true);
    }

    u32(offset) {
      return this.view.getUint32(offset, true);
    }

    u64(offset) {
      const lo = this.view.getUint32(offset, true);
      const hi = this.view.getUint32(offset + 4, true);
      // JS numbers are safe up to 2^53; zip archives rarely exceed that.
      return hi * 0x100000000 + lo;
    }

    slice(offset, length) {
      return this.bytes.subarray(offset, offset + length);
    }
  }

  function findEOCD(reader) {
    const size = reader.bytes.length;
    const maxBack = Math.min(size, 65557); // EOCD + max comment length
    for (let i = size - 22; i >= size - maxBack; i--) {
      if (i < 0) break;
      if (reader.u32(i) === SIG_EOCD) {
        return i;
      }
    }
    throw new Error("ZIP: EOCD signature not found");
  }

  function decodeName(bytes, utf8) {
    if (utf8) {
      return new TextDecoder("utf-8").decode(bytes);
    }
    // Fall back to CP949 for legacy HWPX-like archives produced on Korean Windows.
    try {
      return new TextDecoder("euc-kr").decode(bytes);
    } catch (_err) {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
  }

  async function inflateRaw(compressed) {
    const stream = new Blob([compressed]).stream().pipeThrough(
      new DecompressionStream("deflate-raw"),
    );
    const chunks = [];
    const reader = stream.getReader();
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

  async function open(buffer) {
    const reader = new ByteReader(buffer);
    const eocdOffset = findEOCD(reader);

    let cdOffset = reader.u32(eocdOffset + 16);
    let cdSize = reader.u32(eocdOffset + 12);
    let entryCount = reader.u16(eocdOffset + 10);

    // Zip64 path
    if (cdOffset === 0xffffffff || entryCount === 0xffff) {
      const locOffset = eocdOffset - 20;
      if (locOffset >= 0 && reader.u32(locOffset) === SIG_EOCD64_LOC) {
        const eocd64Offset = reader.u64(locOffset + 8);
        if (reader.u32(eocd64Offset) === SIG_EOCD64) {
          entryCount = reader.u64(eocd64Offset + 32);
          cdSize = reader.u64(eocd64Offset + 40);
          cdOffset = reader.u64(eocd64Offset + 48);
        }
      }
    }

    const entries = [];
    let cursor = cdOffset;
    for (let i = 0; i < entryCount; i++) {
      if (reader.u32(cursor) !== SIG_CDFH) {
        throw new Error("ZIP: bad central directory entry at " + cursor);
      }
      const flags = reader.u16(cursor + 8);
      const method = reader.u16(cursor + 10);
      const crc32 = reader.u32(cursor + 16);
      let compSize = reader.u32(cursor + 20);
      let uncompSize = reader.u32(cursor + 24);
      const nameLen = reader.u16(cursor + 28);
      const extraLen = reader.u16(cursor + 30);
      const commentLen = reader.u16(cursor + 32);
      let localHeaderOffset = reader.u32(cursor + 42);
      const nameBytes = reader.slice(cursor + 46, nameLen);
      const name = decodeName(nameBytes, (flags & 0x800) !== 0);

      // Parse extra field for zip64 values if needed.
      if (
        compSize === 0xffffffff ||
        uncompSize === 0xffffffff ||
        localHeaderOffset === 0xffffffff
      ) {
        let extraCursor = cursor + 46 + nameLen;
        const extraEnd = extraCursor + extraLen;
        while (extraCursor + 4 <= extraEnd) {
          const tag = reader.u16(extraCursor);
          const size = reader.u16(extraCursor + 2);
          if (tag === 0x0001) {
            let p = extraCursor + 4;
            if (uncompSize === 0xffffffff) {
              uncompSize = reader.u64(p);
              p += 8;
            }
            if (compSize === 0xffffffff) {
              compSize = reader.u64(p);
              p += 8;
            }
            if (localHeaderOffset === 0xffffffff) {
              localHeaderOffset = reader.u64(p);
              p += 8;
            }
          }
          extraCursor += 4 + size;
        }
      }

      entries.push({
        name,
        method,
        compSize,
        uncompSize,
        crc32,
        localHeaderOffset,
        flags,
      });
      cursor += 46 + nameLen + extraLen + commentLen;
    }

    return new ZipArchive(reader, entries);
  }

  class ZipArchive {
    constructor(reader, entries) {
      this.reader = reader;
      this.entries = entries;
      this.index = new Map();
      for (const e of entries) this.index.set(e.name, e);
    }

    list() {
      return this.entries.map((e) => e.name);
    }

    has(name) {
      return this.index.has(name);
    }

    async read(name) {
      const entry = this.index.get(name);
      if (!entry) throw new Error("ZIP: entry not found: " + name);
      const reader = this.reader;
      const lfhOffset = entry.localHeaderOffset;
      if (reader.u32(lfhOffset) !== SIG_LFH) {
        throw new Error("ZIP: bad local file header at " + lfhOffset);
      }
      const nameLen = reader.u16(lfhOffset + 26);
      const extraLen = reader.u16(lfhOffset + 28);
      const dataOffset = lfhOffset + 30 + nameLen + extraLen;
      const compressed = reader.slice(dataOffset, entry.compSize);

      if (entry.method === 0) {
        return compressed.slice();
      }
      if (entry.method === 8) {
        return inflateRaw(compressed);
      }
      throw new Error("ZIP: unsupported method " + entry.method);
    }

    async readText(name, encoding) {
      const bytes = await this.read(name);
      return new TextDecoder(encoding || "utf-8").decode(bytes);
    }
  }

  global.JsPapaZip = { open };
})(typeof window !== "undefined" ? window : globalThis);
