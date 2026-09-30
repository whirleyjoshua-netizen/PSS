import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A real 8-bit RGBA PNG, transparent except for one opaque pixel: what a canvas pad produces, and what any decoder opens. */
export function pngBytes(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height); // each row: filter byte 0, then pixels
  if (rows.length > 4) rows[4] = 255; // row 0, pixel 0, alpha
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

export const pngDataUrl = (bytes: Buffer): string => `data:image/png;base64,${bytes.toString("base64")}`;

/** A valid header (so it passes validation, which never decodes) over image data no decoder can inflate. */
export function corruptPng(width: number, height: number): Buffer {
  const png = pngBytes(width, height);
  const idat = png.indexOf("IDAT", 0, "latin1");
  png.fill(0x41, idat + 4, idat + 12); // the zlib header and the first deflate bytes
  return png;
}
