/**
 * 金额工具
 *
 * 项目硬性约定：**接口对外一律传「分」整数**，DB 存「元」DECIMAL(10,2)。
 * 前端只在「展示」和「输入」两个边界做换算，中间计算全程用分，避免浮点误差。
 */
import { ErrorCode } from './constants';

/**
 * 分 -> 元的字符串（固定两位小数）
 * @param {number} fen
 * @param {{ withSymbol?: boolean }} opts
 */
export function formatYuan(fen, opts = {}) {
  const withSymbol = opts.withSymbol !== false;
  const n = Number(fen);
  const value = Number.isFinite(n) ? n / 100 : 0;
  const text = value.toFixed(2);
  return withSymbol ? `¥${text}` : text;
}

/** 分 -> 元（number，用于纯计算场景） */
export function fenToYuanNumber(fen) {
  const n = Number(fen);
  return Number.isFinite(n) ? Math.round(n) / 100 : 0;
}

/**
 * 分 -> 元（**固定两位小数的字符串**，用于输入框回填）
 *
 * 为什么不能直接 String(fenToYuanNumber(fen))：
 *   400 分会变成 "4"、450 分变成 "4.5"，而输入框的 placeholder 写的是 "0.00"。
 *   店长看到「4」会怀疑是不是少了两位、要不要手动补成 4.00。
 *   固定两位才和 placeholder、和商品列表里的 ¥4.00 对得上。
 *
 * @param {number} fen
 * @param {string} fallback 分不合法时的回填值
 */
export function fenToYuanText(fen, fallback = '') {
  if (fen === null || fen === undefined) return fallback;
  const n = Number(fen);
  if (!Number.isFinite(n)) return fallback;
  return (n / 100).toFixed(2);
}

/**
 * 元 -> 分（整数）
 * 用 Math.round 兜住 0.1+0.2 这类浮点误差，例如 3.15 -> 315 而不是 314。
 */
export function yuanToFen(yuan) {
  const n = Number(yuan);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** 把「元」字符串拆成整数分，非法输入返回 null（用于表单校验） */
export function parseYuanToFen(text) {
  if (text === '' || text === null || text === undefined) return null;
  const trimmed = String(text).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return yuanToFen(trimmed);
}

/** 订单里常见：金额 + 件数 的摘要文案 */
export function summarizeOrderAmount(totalAmountFen, totalQuantity) {
  const money = formatYuan(totalAmountFen);
  return totalQuantity > 0 ? `${money} · 共 ${totalQuantity} 件` : money;
}

/** 把 BizError / 任意异常转成可展示的中文提示 */
export function toErrorMessage(err, fallback = '操作失败') {
  if (!err) return fallback;
  if (err.name === 'BizError' && err.message) return err.message;
  if (err.code === ErrorCode.SERVICE_UNAVAILABLE) return '网络连接失败，请检查网络';
  return err.message || fallback;
}
