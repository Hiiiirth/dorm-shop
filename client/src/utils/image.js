/**
 * 图片压缩与选图 —— 双端（H5 / 微信小程序）
 * ===========================================================================
 *
 * 目标：把用户选的图压到「最长边 ≤ MAX_EDGE、JPEG 质量 0.8」，
 *      再转成 **base64 data URL** 交给接口直接落库。
 *
 * ── 为什么必须压缩 ───────────────────────────────────────────────────────
 * 手机相册原图动辄 3~8MB（4000×3000）。原始 base64 会到 10MB 级：
 *   · 超过 Express 的 2mb body 上限，请求直接被拒
 *   · 超过 MySQL max_allowed_packet 的风险
 *   · 宿舍 WiFi 上传要等到天荒地老
 * 压到 800px / 0.8 后典型 60~120KB，base64 约 80~160KB —— 完全可控。
 *
 * ── 为什么 H5 和小程序要写两条路径 ───────────────────────────────────────
 * 两端的 canvas API **不兼容**，没有统一抽象：
 *
 *   H5：`uni.chooseImage` 返回的是 blob: URL，可以直接喂给
 *       `new Image()` → 画到 `<canvas>` → `toDataURL()`。
 *       注意 H5 的 canvas 是标准 DOM canvas，用 getContext('2d')。
 *
 *   小程序：`uni.chooseImage` 返回临时文件路径（wxfile://...），
 *       **不能**直接给 `<image src>` 之外的地方用。
 *       流程是 `uni.createCanvasContext()` → `drawImage(tempPath)` →
 *       `uni.canvasToTempFilePath()` 拿到临时文件 → 再
 *       `uni.getFileSystemManager().readFile({encoding:'base64'})` 读成 base64。
 *       注意小程序的 `canvasToTempFilePath` 是**异步回调**，且必须等
 *       `draw()` 之后的回调里才能调，否则画布是空的（经典坑）。
 *
 * ── 为什么用 canvas 而不是小程序 drawImage 的 API ────────────────────────
 * 小程序没有「直接压缩」的 API。唯一路径就是画到 canvas 再导出。
 *
 * ── 交付形态 ─────────────────────────────────────────────────────────────
 * 统一返回 `{ dataUrl, size, width, height }`：
 *   · dataUrl 形如 `data:image/jpeg;base64,/9j/4AAQ...`，可直接作为
 *     `<image src>` 渲染，也可直接 PUT 给后端
 *   · size 是原始文件字节数（用于体量提示 / 调试）
 */

/** 最长边上限（px）。800 在手机上是 2× 图，商品缩略图与头像都够清晰 */
export const MAX_EDGE = 800;
/** JPEG 质量 */
export const JPEG_QUALITY = 0.8;
/**
 * 原始文件体积上限（MB）
 * 超过这个值直接拒绝，而不是「先读进内存再压」——
 * 一张 50MB 的图读进内存就可能把小程序撑崩。
 */
export const MAX_INPUT_MB = 20;

/**
 * 压缩画布的元素 id（默认值）
 *
 * ⚠️ **不能放在 `#ifdef MP-WEIXIN` 里面**：虽然只有小程序端真正用到它，
 *    但 H5 端的 `ImageUpload.vue` 也要 import 它当 prop 默认值。
 *    放条件编译块里的话，H5 构建时这个 import 拿到的是 `undefined`，
 *    轻则 prop 默认值失效，重则打包报「未导出」。
 *    两边共用同一个字符串常量是安全的。
 */
export const COMPRESS_CANVAS_ID = 'compress-canvas';

/** 选图时的统一参数：只选一张、优先相册、允许拍照 */
const CHOOSE_OPTIONS = {
  count: 1,
  sizeType: ['compressed', 'original'],
  sourceType: ['album', 'camera'],
};

// ===========================================================================
// 公共：尺寸计算
// ===========================================================================

/**
 * 按「最长边不超过 maxEdge」等比缩放
 * 不放大：本来就比 maxEdge 小的图保持原尺寸（放大只会糊）
 */
export function fitSize(width, height, maxEdge = MAX_EDGE) {
  if (!width || !height) return { width: maxEdge, height: maxEdge };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** 估算 data URL 对应的原始字节数（base64 → bytes） */
export function dataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/** data URL 转「XX KB」文案，用于给用户看体量 */
export function dataUrlSizeText(dataUrl) {
  const bytes = dataUrlBytes(dataUrl);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ===========================================================================
// H5 路径
// ===========================================================================

// #ifdef H5
/**
 * H5：blob/file URL → canvas → toDataURL
 *
 * ⚠️ canvas 的 `toDataURL('image/jpeg', q)` 对**带透明通道的 PNG** 会
 *    把透明区域涂成**黑色**（JPEG 不支持 alpha）。所以画之前先铺一层白底 ——
 *    否则用户传一张透明 PNG 头像，会得到一张黑底图。
 */
function compressH5(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const { width, height } = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // 白底兜底（透明 PNG → 不变成黑块）
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        if (!dataUrl || !dataUrl.startsWith('data:image/jpeg')) {
          reject(new Error('图片压缩失败，请换一张试试'));
          return;
        }
        resolve({ dataUrl, width, height });
      } catch (err) {
        reject(new Error(`图片处理失败：${err?.message || '未知错误'}`));
      }
    };
    img.onerror = () => reject(new Error('这张图片读不出来，请换一张试试'));
    img.src = src;
  });
}
// #endif

// ===========================================================================
// 微信小程序路径
// ===========================================================================

// #ifdef MP-WEIXIN
/**
 * 小程序：临时文件路径 → canvas → canvasToTempFilePath → readFile(base64)
 *
 * ⚠️ 四个必须踩对的地方：
 *   1. 页面里**必须真的存在**这个 `<canvas>` 节点（用 `CompressCanvas` 组件挂上），
 *      否则 `createCanvasContext` 拿到空上下文，导出的是**空白图**且不报错。
 *   2. `ctx.draw()` 是异步的，**必须等它的回调**再调 `canvasToTempFilePath`，
 *      否则导出的是还没画完的画布（同样是静默失败）。
 *   3. `canvasToTempFilePath` 的第二个参数在**新版基础库要求传组件实例**
 *      （`this`）。老版会忽略它，所以传了不亏 —— 但**不传**在新版上会直接失败。
 *      这里通过 `getCurrentInstance()` 拿当前组件的 proxy 传进去。
 *   4. `fileType: 'jpg'` 才受 `quality` 影响；png 会忽略 quality。
 *
 * @param {string} src 临时文件路径
 * @param {object} instance 调用方的组件实例（Vue 的 `getCurrentInstance()`）
 */
function compressMP(src, instance, canvasId = COMPRESS_CANVAS_ID) {
  return new Promise((resolve, reject) => {
    uni.getImageInfo({
      src,
      success: (info) => {
        const { width, height } = fitSize(info.width, info.height);
        const ctx = uni.createCanvasContext(canvasId, instance || undefined);
        // 白底兜底（同 H5，透明 PNG 不变黑）
        ctx.setFillStyle('#ffffff');
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(src, 0, 0, width, height);
        ctx.draw(false, () => {
          uni.canvasToTempFilePath(
            {
              canvasId,
              x: 0,
              y: 0,
              width,
              height,
              destWidth: width,
              destHeight: height,
              fileType: 'jpg',
              quality: JPEG_QUALITY,
              success: (res) => {
                uni.getFileSystemManager().readFile({
                  filePath: res.tempFilePath,
                  encoding: 'base64',
                  success: (f) => {
                    resolve({ dataUrl: `data:image/jpeg;base64,${f.data}`, width, height });
                  },
                  fail: () => reject(new Error('读取压缩后的图片失败')),
                });
              },
              fail: () => reject(new Error('图片压缩失败，请换一张试试')),
            },
            instance || undefined,
          );
        });
      },
      fail: () => reject(new Error('这张图片读不出来，请换一张试试')),
    });
  });
}
// #endif

// ===========================================================================
// 对外主入口
// ===========================================================================

/**
 * 选一张图并压缩
 *
 * @param {{ maxEdge?: number, instance?: object, canvasId?: string }} [options]
 *        instance —— **小程序端必须传**（调用方的 `getCurrentInstance()`），
 *                    新版基础库的 canvasToTempFilePath 要它
 *        canvasId —— 同一页面有多个上传控件时，各自给唯一 id，避免串图
 * @returns {Promise<{ dataUrl: string, size: number, width: number, height: number } | null>}
 *          用户取消选图时 resolve(null)，**不 reject** —— 取消是正常操作，
 *          调用方不该把它当错误弹 toast。
 */
export function pickAndCompressImage(options = {}) {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      ...CHOOSE_OPTIONS,
      success: async (res) => {
        const file = (res.tempFiles || [])[0] || {};
        // tempFiles[].path（新版） / tempFilePaths[0]（老版）都能拿到
        const src = file.path || (res.tempFilePaths || [])[0];
        if (!src) {
          reject(new Error('没拿到图片'));
          return;
        }

        // 体积闸门：太大就直接拒，别把设备内存拖崩
        const sizeBytes = Number(file.size) || 0;
        if (sizeBytes > MAX_INPUT_MB * 1024 * 1024) {
          reject(new Error(`图片超过 ${MAX_INPUT_MB}MB，请先裁剪或用截图`));
          return;
        }

        try {
          let out;
          // #ifdef H5
          out = await compressH5(src);
          // #endif
          // #ifdef MP-WEIXIN
          out = await compressMP(src, options.instance, options.canvasId);
          // #endif
          // #ifndef H5 || MP-WEIXIN
          reject(new Error('当前平台暂不支持选图'));
          return;
          // #endif
          resolve({ ...out, size: dataUrlBytes(out.dataUrl), originSize: sizeBytes });
        } catch (err) {
          reject(err);
        }
      },
      fail: (err) => {
        // 用户取消不计为错误
        const msg = String(err?.errMsg || '');
        if (msg.includes('cancel')) {
          resolve(null);
          return;
        }
        reject(new Error('打开相册失败，请检查权限'));
      },
    });
  });
}

/**
 * 生成「预览用」的缩略 data URL —— 直接复用压缩结果即可
 * （800px 的 data URL 在屏幕上显示毫无压力，不用再单独生成缩略图）
 */
export function previewOf(dataUrl) {
  return dataUrl || '';
}
