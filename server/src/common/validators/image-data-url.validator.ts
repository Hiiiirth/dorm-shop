import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * 图片字段校验：允许「空」或「一张图片」
 *
 * ── 为什么是自定义校验器而不是 @IsString + @MaxLength ─────────────────────
 * v1.3 起商品封面图与用户头像改成 **客户端压缩后的 base64 data URL 直接落库**
 * （`data:image/jpeg;base64,/9j/4AAQ...`），它有两个特点：
 *
 *   1. **很长**：800px/质量0.8 的 JPEG 转 base64 后 80~160KB，
 *      而 class-validator 的 `@MaxLength` 是按**字符**算的，配一个巨大的数字
 *      （比如 2_000_000）既看不出意图，也没法拦住「传了一张 10MB 的 png 绕过压缩」。
 *   2. **格式必须对**：如果前端压缩步骤挂了、或者有人手搓请求塞一段乱码，
 *      存进库的会是一个让 `<image src>` 直接碎掉的垃圾串 ——
 *      这种坏数据在库里是**静默**的，只有用户看到碎图才知道。
 *
 * 所以这里做三件事：**白名单前缀 + 体量上限 + base64 字符集**。
 *
 * ── 为什么空值放行 ───────────────────────────────────────────────────────
 * 「移除图片」这个操作就是传空串。校验器不负责「必填」语义 ——
 * 那是 `@IsNotEmpty()` 的活。这里 `''` / `null` / `undefined` 一律算通过。
 *
 * ── 为什么不用正则去匹配整个 base64 ──────────────────────────────────────
 * `/^[A-Za-z0-9+/]+={0,2}$/` 这种回溯型正则在 100KB 级别的串上会有明显的
 * 灾难性回溯风险（虽然这条正则其实是线性的），更重要的是没必要：
 * 我们只是想拦住「明显不是 base64 的东西」，用**字符抽样**就够了，
 * 而且 O(1)。真正的完整性由「前端压缩成功」和「图片能渲染」保证。
 */

/** 允许的 data URL 前缀（只放行这几种图片 MIME） */
const ALLOWED_PREFIX = /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i;

/**
 * 体量上限（字符数）
 *
 * 换算参考：客户端压到「最长边 800px + 质量 0.8」的 JPEG，
 *   · base64 膨胀系数 4/3 → 原始 JPEG 约 60~120KB → base64 约 80~160KB
 *   · 极端情况（大面积高熵噪点、webp 不压缩）可能到 400KB
 * 这里留 3 倍余量到 **1.5MB**：既能容纳合理的大图，
 * 又能拦住「前端压缩没生效，把原图 5MB 直接塞进来」。
 *
 * ⚠️ 这个值和 Express 的 `json({ limit })` 是**两道独立的闸门**，
 *    必须一起看：body 上限（2mb）先于校验器触发，
 *    所以真传了个 5MB 的串，收到的是 413 / 90001，而不是这里的 10001。
 *    两者都在时可以保证：**能进到校验器的，体量一定在 2mb 以内**。
 */
export const IMAGE_DATA_URL_MAX_CHARS = 1.5 * 1024 * 1024;

/** 抽样校验 base64 字符集：只查头/中/尾三段，避免遍历 100KB 字符串 */
function looksLikeBase64Body(payload: string): boolean {
  if (payload.length === 0) return false;
  const probe = payload.slice(0, 64) + payload.slice(Math.floor(payload.length / 2), Math.floor(payload.length / 2) + 64) + payload.slice(-64);
  return /^[A-Za-z0-9+/=]+$/.test(probe);
}

/** 判断一个值是否是合法的「图片 data URL」（空值视为合法，交给 @IsOptional 管） */
export function isImageDataUrlOrEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;
  if (value.length > IMAGE_DATA_URL_MAX_CHARS) return false;

  // 也允许外链 URL（旧数据、以及未来换成 CDN 时不用改校验）
  if (/^https?:\/\//i.test(value)) return true;

  if (!ALLOWED_PREFIX.test(value)) return false;
  const comma = value.indexOf(',');
  if (comma < 0) return false;
  return looksLikeBase64Body(value.slice(comma + 1));
}

/**
 * 装饰器：字段允许为空，或必须是一张合法的图片 data URL / http(s) 外链
 *
 * ```ts
 * @IsOptional()
 * @IsImageDataUrl({ message: '封面图格式不对' })
 * coverImage?: string;
 * ```
 */
export function IsImageDataUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isImageDataUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isImageDataUrlOrEmpty(value),
        defaultMessage(args: ValidationArguments): string {
          const value = args.value;
          if (typeof value === 'string' && value.length > IMAGE_DATA_URL_MAX_CHARS) {
            return `${args.property} 太大了，请重新选一张（压缩后仍超过 ${Math.round(IMAGE_DATA_URL_MAX_CHARS / 1024)}KB）`;
          }
          return `${args.property} 必须是图片（支持 jpeg/png/webp/gif），请重新选一张`;
        },
      },
    });
  };
}
