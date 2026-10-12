/**
 * 出参日期序列化
 *
 * 架构硬性约定：「时间：统一毫秒时间戳」。
 *
 * 但 TypeORM 实体上的 `Date` 字段被 VO mapper 原样透传后，交给 `JSON.stringify`
 * 会被转成 ISO 8601 字符串（`"2026-10-07T16:14:40.000Z"`），与约定不符；
 * 而且小程序端 `new Date(iso)` 在各端解析行为不完全一致，毫秒数最稳。
 *
 * 所以在响应拦截器出口统一把 `Date` 转成毫秒数，业务代码不用关心这件事。
 *
 * 递归策略刻意保守：
 * - `Date` → `getTime()`
 * - 数组 → 逐项递归
 * - **仅递归「纯对象」**（原型是 `Object.prototype` 或 `null`）。
 *   项目里所有 VO 都是 `interface` + 对象字面量，天然满足；
 *   这样能避开 Buffer / TypedArray / Map / Set / Stream 等被误拆成下标键的坑
 * - 其它值（含 class 实例、Buffer）原样透传，交给 `JSON.stringify` 自己处理
 */
export function serializeDates<T>(input: T): T {
  return walk(input, new WeakSet<object>()) as T;
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (Array.isArray(value)) {
    // 环引用保护：命中就原样透传，最终行为与改动前一致（JSON.stringify 会自己抛）
    if (seen.has(value)) return value;
    seen.add(value);
    const out = value.map((item) => walk(item, seen));
    seen.delete(value);
    return out;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (seen.has(value)) return value;
  seen.add(value);

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    out[key] = walk(source[key], seen);
  }

  seen.delete(value);
  return out;
}

/** 仅「纯对象」会被递归拆解，其余（class 实例 / Buffer / Map / Set …）原样返回 */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}
