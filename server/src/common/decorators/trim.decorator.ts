import { Transform } from 'class-transformer';

/**
 * 去掉字符串首尾空白。
 *
 * 为什么要这个：`@IsNotEmpty()` 只判 `'' | null | undefined`，
 * 于是 `"   "` 这种纯空白能通过校验，结果库里多出一个看不见名字的分类/商品，
 * 前端列表里表现为「空白卡片」，非常难排查。
 *
 * 配合 `@IsNotEmpty()` 的用法：先 trim 拿到 `''`，再被 `@IsNotEmpty()` 拦成 10001。
 * 顺带把 `"  可乐 "` 存成 `"可乐"`，避免同一个名字因为空格差异被当成两个。
 */
export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
