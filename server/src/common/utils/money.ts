/**
 * 金额换算
 *
 * 约定：数据库存「元」（DECIMAL 读出来是 string），接口对外一律传「分」整数。
 * 前端只在展示时除以 100，所有计算都用分，避免浮点误差。
 */

/** 元 -> 分。'3.00' -> 300，null -> 0 */
export function yuanToFen(yuan: string | number | null | undefined): number {
  if (yuan === null || yuan === undefined || yuan === '') return 0;
  const value = typeof yuan === 'number' ? yuan : Number(yuan);
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

/** 分 -> 元字符串。300 -> '3.00' */
export function fenToYuan(fen: number): string {
  return (fen / 100).toFixed(2);
}
