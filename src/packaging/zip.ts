/**
 * Minimal store-only ZIP writer (compression method 0) — enough to assemble an LMS package
 * (SCORM / cmi5 / Common Cartridge bundles are ZIP files). Dependency-free and deterministic
 * (fixed timestamps), so the same inputs produce byte-identical archives.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  path: string;
  content: Buffer;
}

/** Build a ZIP archive with every entry stored uncompressed. */
export function zipStore(entries: ZipEntry[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.path.replace(/\\/g, "/"), "utf8");
    const data = e.content;
    const crc = crc32(data);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); // local file header signature
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(0, 8); // method: 0 = store
    lfh.writeUInt16LE(0, 10); // mod time (fixed)
    lfh.writeUInt16LE(0x21, 12); // mod date (fixed: 1980-01-01)
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(data.length, 18); // compressed size
    lfh.writeUInt32LE(data.length, 22); // uncompressed size
    lfh.writeUInt16LE(name.length, 26);
    lfh.writeUInt16LE(0, 28); // extra length
    local.push(lfh, name, data);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); // central directory header signature
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(0, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x21, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(data.length, 20);
    cdh.writeUInt32LE(data.length, 24);
    cdh.writeUInt16LE(name.length, 28);
    cdh.writeUInt16LE(0, 30); // extra
    cdh.writeUInt16LE(0, 32); // comment
    cdh.writeUInt16LE(0, 34); // disk number start
    cdh.writeUInt16LE(0, 36); // internal attrs
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(offset, 42); // local header offset
    central.push(cdh, name);

    offset += lfh.length + name.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central dir start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...local, centralBuf, eocd]);
}

/** Read back a store-only ZIP (the inverse of {@link zipStore}) — for verification/tests. */
export function unzipStore(buf: Buffer): ZipEntry[] {
  const out: ZipEntry[] = [];
  let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const path = buf.toString("utf8", i + 30, i + 30 + nameLen);
    const dataStart = i + 30 + nameLen + extraLen;
    out.push({ path, content: Buffer.from(buf.subarray(dataStart, dataStart + compSize)) });
    i = dataStart + compSize;
  }
  return out;
}
