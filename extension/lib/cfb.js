// Minimal Compound File Binary (CFB / OLE2) reader.
// HWP 5.x files are CFB containers; we need to enumerate storages/streams
// and read stream bytes so the HWP parser can walk them.
//
// Exposed as global `JsPapaCfb`.

(function (global) {
  "use strict";

  const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const FREESECT = 0xffffffff;
  const ENDOFCHAIN = 0xfffffffe;
  const FATSECT = 0xfffffffd;
  const DIFSECT = 0xfffffffc;

  const DIR_ENTRY_SIZE = 128;

  function checkSignature(bytes) {
    for (let i = 0; i < CFB_SIGNATURE.length; i++) {
      if (bytes[i] !== CFB_SIGNATURE[i]) return false;
    }
    return true;
  }

  class Cfb {
    constructor(bytes) {
      this.bytes = bytes;
      this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this._parseHeader();
      this._loadFat();
      this._loadMiniFat();
      this._loadDirectory();
    }

    _parseHeader() {
      const v = this.view;
      if (!checkSignature(this.bytes)) {
        throw new Error("CFB: bad signature");
      }
      this.sectorShift = v.getUint16(0x1e, true);
      this.miniSectorShift = v.getUint16(0x20, true);
      this.sectorSize = 1 << this.sectorShift;
      this.miniSectorSize = 1 << this.miniSectorShift;
      this.numDirSectors = v.getUint32(0x28, true);
      this.numFatSectors = v.getUint32(0x2c, true);
      this.firstDirSector = v.getUint32(0x30, true);
      this.miniStreamCutoff = v.getUint32(0x38, true);
      this.firstMiniFatSector = v.getUint32(0x3c, true);
      this.numMiniFatSectors = v.getUint32(0x40, true);
      this.firstDifatSector = v.getUint32(0x44, true);
      this.numDifatSectors = v.getUint32(0x48, true);
      this.difat = [];
      for (let i = 0; i < 109; i++) {
        this.difat.push(v.getUint32(0x4c + i * 4, true));
      }
      // Follow extension DIFAT sectors if any.
      let next = this.firstDifatSector;
      let guard = 0;
      while (
        next !== ENDOFCHAIN &&
        next !== FREESECT &&
        guard < this.numDifatSectors + 10
      ) {
        const start = (next + 1) * this.sectorSize;
        const entries = (this.sectorSize / 4) - 1;
        for (let i = 0; i < entries; i++) {
          this.difat.push(v.getUint32(start + i * 4, true));
        }
        next = v.getUint32(start + entries * 4, true);
        guard += 1;
      }
    }

    _sectorOffset(sector) {
      return (sector + 1) * this.sectorSize;
    }

    _readSector(sector) {
      const off = this._sectorOffset(sector);
      return this.bytes.subarray(off, off + this.sectorSize);
    }

    _loadFat() {
      const entriesPerSector = this.sectorSize / 4;
      const fat = new Uint32Array(this.numFatSectors * entriesPerSector);
      let cursor = 0;
      for (let i = 0; i < this.numFatSectors; i++) {
        const sec = this.difat[i];
        if (sec === FREESECT || sec === ENDOFCHAIN) break;
        const off = this._sectorOffset(sec);
        for (let j = 0; j < entriesPerSector; j++) {
          fat[cursor++] = this.view.getUint32(off + j * 4, true);
        }
      }
      this.fat = fat;
    }

    _loadMiniFat() {
      if (this.numMiniFatSectors === 0) {
        this.miniFat = new Uint32Array(0);
        return;
      }
      const entriesPerSector = this.sectorSize / 4;
      const chain = this._chain(this.firstMiniFatSector);
      const miniFat = new Uint32Array(chain.length * entriesPerSector);
      let cursor = 0;
      for (const sec of chain) {
        const off = this._sectorOffset(sec);
        for (let j = 0; j < entriesPerSector; j++) {
          miniFat[cursor++] = this.view.getUint32(off + j * 4, true);
        }
      }
      this.miniFat = miniFat;
    }

    _chain(startSector) {
      const out = [];
      let cur = startSector;
      const seen = new Set();
      while (
        cur !== ENDOFCHAIN &&
        cur !== FREESECT &&
        cur < this.fat.length &&
        !seen.has(cur)
      ) {
        seen.add(cur);
        out.push(cur);
        cur = this.fat[cur];
      }
      return out;
    }

    _miniChain(startSector) {
      const out = [];
      let cur = startSector;
      const seen = new Set();
      while (
        cur !== ENDOFCHAIN &&
        cur !== FREESECT &&
        cur < this.miniFat.length &&
        !seen.has(cur)
      ) {
        seen.add(cur);
        out.push(cur);
        cur = this.miniFat[cur];
      }
      return out;
    }

    _loadDirectory() {
      const chain = this._chain(this.firstDirSector);
      const entries = [];
      for (const sec of chain) {
        const base = this._sectorOffset(sec);
        const perSector = this.sectorSize / DIR_ENTRY_SIZE;
        for (let i = 0; i < perSector; i++) {
          const off = base + i * DIR_ENTRY_SIZE;
          entries.push(this._parseDirEntry(off));
        }
      }
      this.dirEntries = entries;
      this.root = entries[0];
      // Build path map: "Storage/Stream" -> entry.
      this.pathIndex = new Map();
      if (this.root && this.root.type === 5) {
        this._walk(this.root.childID, "");
      }
    }

    _walk(id, prefix) {
      if (id === FREESECT) return;
      const entry = this.dirEntries[id];
      if (!entry) return;
      this._walk(entry.leftSibling, prefix);
      const path = prefix ? prefix + "/" + entry.name : entry.name;
      if (entry.type === 2) {
        this.pathIndex.set(path, entry);
      } else if (entry.type === 1) {
        this.pathIndex.set(path + "/", entry);
        this._walk(entry.childID, path);
      }
      this._walk(entry.rightSibling, prefix);
    }

    _parseDirEntry(off) {
      const v = this.view;
      const nameLen = v.getUint16(off + 64, true);
      let name = "";
      if (nameLen >= 2) {
        const chars = (nameLen - 2) / 2;
        for (let i = 0; i < chars; i++) {
          name += String.fromCharCode(v.getUint16(off + i * 2, true));
        }
      }
      return {
        name,
        type: v.getUint8(off + 66),
        color: v.getUint8(off + 67),
        leftSibling: v.getUint32(off + 68, true),
        rightSibling: v.getUint32(off + 72, true),
        childID: v.getUint32(off + 76, true),
        startSector: v.getUint32(off + 116, true),
        streamSizeLow: v.getUint32(off + 120, true),
        streamSizeHigh: v.getUint32(off + 124, true),
        get streamSize() {
          return this.streamSizeHigh * 0x100000000 + this.streamSizeLow;
        },
      };
    }

    _readMiniStream(startSector, size) {
      if (!this.root || this.root.startSector === FREESECT) {
        return new Uint8Array(0);
      }
      const miniCutoff = this.miniStreamCutoff;
      // Mini stream lives in the root entry's stream; resolved via regular FAT.
      const rootChain = this._chain(this.root.startSector);
      const rootStream = new Uint8Array(rootChain.length * this.sectorSize);
      for (let i = 0; i < rootChain.length; i++) {
        rootStream.set(this._readSector(rootChain[i]), i * this.sectorSize);
      }

      const miniChain = this._miniChain(startSector);
      const out = new Uint8Array(size);
      let written = 0;
      for (const s of miniChain) {
        const off = s * this.miniSectorSize;
        const take = Math.min(this.miniSectorSize, size - written);
        if (take <= 0) break;
        out.set(rootStream.subarray(off, off + take), written);
        written += take;
      }
      return out;
    }

    read(path) {
      const entry = this.pathIndex.get(path);
      if (!entry) throw new Error("CFB: stream not found: " + path);
      const size = entry.streamSize;
      if (size === 0) return new Uint8Array(0);
      if (size < this.miniStreamCutoff) {
        return this._readMiniStream(entry.startSector, size);
      }
      const chain = this._chain(entry.startSector);
      const out = new Uint8Array(size);
      let written = 0;
      for (const s of chain) {
        const take = Math.min(this.sectorSize, size - written);
        if (take <= 0) break;
        out.set(
          this._readSector(s).subarray(0, take),
          written,
        );
        written += take;
      }
      return out;
    }

    list() {
      return [...this.pathIndex.keys()];
    }

    has(path) {
      return this.pathIndex.has(path);
    }
  }

  function detect(bytes) {
    return bytes && bytes.length >= 8 && checkSignature(bytes);
  }

  function open(bytes) {
    return new Cfb(bytes);
  }

  global.JsPapaCfb = { open, detect };
})(typeof window !== "undefined" ? window : globalThis);
