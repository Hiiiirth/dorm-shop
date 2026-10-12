/**
 * 纯 JS 的最小 JPEG 生成器 —— 零外部依赖，不 spawn 子进程
 *
 * ── 为什么不调 Python PIL ──────────────────────────────────────────────
 * 本项目在沙箱里 **`spawnSync` 会被拦成 `EBUSY`**（和 `npm install` 时
 * esbuild 的 postinstall 撞的是同一堵墙）。表现是「try/catch 一包，
 * 静默返回 null，脚本报 SKIP 但看不出哪里错了」—— 非常难查。
 * 所以这里干脆手写，彻底不依赖外部进程。
 *
 * ── 这是个「真」JPEG 吗 ────────────────────────────────────────────────
 * 是。它输出的是**基线 JPEG（SOF0）**，含完整的：
 *   SOI → APP0(JFIF) → DQT(量化表) → SOF0(帧头) → DHT(两张哈夫曼表)
 *   → SOS → 熵编码数据 → EOI
 * DCT 系数是我们直接给的（不真的做 DCT），所以：
 *   · 浏览器 / `<image>` 能正常解码显示
 *   · 前缀是标准的 `/9j/4AAQSkZJRg...`
 *   · 尺寸真实（header 里的宽高决定渲染尺寸）
 * 这就够了 —— 我们要验证的是「base64 能落库 + 能读回 + 能渲染」，
 * 不是验证图片内容好不好看。
 *
 * ── 体量怎么控制 ──────────────────────────────────────────────────────
 * JPEG 大小主要由**熵编码数据**决定。这里的做法是：每个 MCU 塞一个
 * 「直流系数 + 一个非零交流系数」的最小块，再用 `padTo` 参数
 * 追加无操作填充字节（0xFF00 是合法的「字节填充」，解码器会忽略），
 * 从而把文件撑到指定大小附近 —— 用来模拟「压缩后 100KB 的图」。
 */

// --- 标准 Annex K 量化表（亮度 / 色度），quality=0.8 时用基准值即可 ---
const LUMA_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];
const CHROMA_QUANT = [
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
];

/**
 * 标准 Huffman 表（Annex K 的 DC/AC 亮度与色度）
 * 每项 = [码长数量, 符号值...]
 */
const HUFF_DC_LUMA_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const HUFF_DC_LUMA_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const HUFF_DC_CHROMA_BITS = HUFF_DC_LUMA_BITS;
const HUFF_DC_CHROMA_VALS = HUFF_DC_LUMA_VALS;
const HUFF_AC_LUMA_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const HUFF_AC_LUMA_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
const HUFF_AC_CHROMA_BITS = HUFF_AC_LUMA_BITS;
const HUFF_AC_CHROMA_VALS = HUFF_AC_LUMA_VALS;

// ---------------------------------------------------------------- 位写入器
class BitWriter {
  constructor() {
    this.buf = [];
    this.bitBuf = 0;
    this.bitCount = 0;
  }
  writeBits(code, length) {
    for (let i = length - 1; i >= 0; i--) {
      this.bitBuf = (this.bitBuf << 1) | ((code >> i) & 1);
      this.bitCount += 1;
      if (this.bitCount === 8) {
        const byte = this.bitBuf & 0xff;
        this.buf.push(byte);
        // 0xFF 后面必须跟 0x00（字节填充），否则会被当成标记
        if (byte === 0xff) this.buf.push(0x00);
        this.bitBuf = 0;
        this.bitCount = 0;
      }
    }
  }
  flush() {
    while (this.bitCount > 0) {
      // 补 1（JPEG 规范要求用 1 填充到字节边界）
      this.writeBits(1, 1);
    }
  }
}

function buildHuffTable(bits, vals) {
  const table = new Map();
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let j = 0; j < bits[len - 1]; j++) {
      table.set(vals[k], { code, len });
      code += 1;
      k += 1;
    }
    code <<= 1;
  }
  return table;
}

const DC_LUMA = buildHuffTable(HUFF_DC_LUMA_BITS, HUFF_DC_LUMA_VALS);
const AC_LUMA = buildHuffTable(HUFF_AC_LUMA_BITS, HUFF_AC_LUMA_VALS);
const DC_CHROMA = buildHuffTable(HUFF_DC_CHROMA_BITS, HUFF_DC_CHROMA_VALS);
const AC_CHROMA = buildHuffTable(HUFF_AC_CHROMA_BITS, HUFF_AC_CHROMA_VALS);

// ---------------------------------------------------------------- 段构造
function seg(marker, payload) {
  const out = [0xff, marker];
  const len = payload.length + 2;
  out.push((len >> 8) & 0xff, len & 0xff);
  return out.concat(payload);
}

/** 量化表：Pq=0(8bit) Tq=0/1 */
function dqt(id, table) {
  const payload = [id]; // 0x00 → 精度 0、表号 0；0x01 → 色度
  for (const v of table) payload.push(v);
  return seg(0xdb, payload);
}

/** 帧头：基线、8bit、H=1 V=1，3 分量（Y/Cb/Cr） */
function sof0(width, height) {
  const payload = [
    8, // 精度 8bit
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    3, // 分量数
    // Y: id=1, 采样 1x1, 量化表 0
    1, 0x11, 0,
    // Cb: id=2, 采样 1x1, 量化表 1
    2, 0x11, 1,
    // Cr: id=3, 采样 1x1, 量化表 1
    3, 0x11, 1,
  ];
  return seg(0xc0, payload);
}

function dht(cls, id, bits, vals) {
  const payload = [((cls & 0x0f) << 4) | (id & 0x0f)];
  for (const b of bits) payload.push(b);
  for (const v of vals) payload.push(v);
  return seg(0xc4, payload);
}

function sos() {
  const payload = [
    3, // 分量数
    1, 0x00, // Y 用 DC0/AC0
    2, 0x11, // Cb 用 DC1/AC1
    3, 0x11, // Cr 用 DC1/AC1
    0, 63, 0, // 谱选
  ];
  return seg(0xda, payload);
}

const APP0_JFIF = seg(0xe0, [
  0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
  0x01, 0x01, // 版本 1.1
  0x00, // 单位：无
  0x00, 0x01, 0x00, 0x01, // 密度 1x1
  0x00, 0x00, // 缩略图 0x0
]);

/**
 * 生成一张最小但合法的基线 JPEG
 *
 * @param {object} o
 * @param {number} o.width  宽（像素）
 * @param {number} o.height 高（像素）
 * @param {number} o.mcus   要写多少个 MCU（越多熵数据越长，文件越大）
 * @param {number} o.paddingBytes 追在 EOI 前的填充字节（0xFF00 合法空填充）
 * @returns {Buffer}
 */
function makeJpegBuffer({ width = 600, height = 600, mcus = 4, paddingBytes = 0 } = {}) {
  const out = [];
  out.push(0xff, 0xd8); // SOI
  APP0_JFIF.forEach((b) => out.push(b));
  dqt(0x00, LUMA_QUANT).forEach((b) => out.push(b));
  dqt(0x01, CHROMA_QUANT).forEach((b) => out.push(b));
  sof0(width, height).forEach((b) => out.push(b));
  dht(0x00, 0x00, HUFF_DC_LUMA_BITS, HUFF_DC_LUMA_VALS).forEach((b) => out.push(b));
  dht(0x10, 0x00, HUFF_AC_LUMA_BITS, HUFF_AC_LUMA_VALS).forEach((b) => out.push(b));
  dht(0x00, 0x01, HUFF_DC_CHROMA_BITS, HUFF_DC_CHROMA_VALS).forEach((b) => out.push(b));
  dht(0x10, 0x01, HUFF_AC_CHROMA_BITS, HUFF_AC_CHROMA_VALS).forEach((b) => out.push(b));
  sos().forEach((b) => out.push(b));

  // ---- 熵编码数据 ----
  // 每个 MCU 写 3 个块（Y/Cb/Cr）。每个块：DC=0（差分为 0）、AC 立即 EOB。
  const bw = new BitWriter();
  for (let m = 0; m < mcus; m++) {
    for (let blk = 0; blk < 3; blk++) {
      const dcTable = blk === 0 ? DC_LUMA : DC_CHROMA;
      const acTable = blk === 0 ? AC_LUMA : AC_CHROMA;
      const dc = dcTable.get(0); // 类别 0
      bw.writeBits(dc.code, dc.len);
      const eob = acTable.get(0x00); // EOB
      bw.writeBits(eob.code, eob.len);
    }
  }
  bw.flush();
  bw.buf.forEach((b) => out.push(b));

  // ---- 填充（模拟「压缩后的真实大图」）----
  for (let i = 0; i < paddingBytes; i++) {
    out.push(0xff, 0x00);
  }

  out.push(0xff, 0xd9); // EOI
  return Buffer.from(out);
}

/** 生成 data URL，并可用 targetJpegBytes 指定目标 JPEG 体量 */
function makeJpegDataUrl({ size = 600, targetJpegBytes = 0 } = {}) {
  // 先不带填充测一次基准长度，再算需要补多少
  const base = makeJpegBuffer({ width: size, height: size, mcus: Math.max(4, Math.floor(size / 8)) });
  let paddingBytes = 0;
  if (targetJpegBytes > base.length) {
    // 每个 padding 占 2 字节（0xFF 0x00）
    paddingBytes = Math.ceil((targetJpegBytes - base.length) / 2);
  }
  const buf = makeJpegBuffer({
    width: size,
    height: size,
    mcus: Math.max(4, Math.floor(size / 8)),
    paddingBytes,
  });
  return {
    url: `data:image/jpeg;base64,${buf.toString('base64')}`,
    bytes: buf.length,
  };
}

module.exports = { makeJpegBuffer, makeJpegDataUrl };
