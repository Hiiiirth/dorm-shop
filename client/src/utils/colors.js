/**
 * 色值 token —— **JS 版**，与 `uni.scss` 一一对应
 * ============================================================
 * 为什么不直接把 hex 散落在各页面？
 *
 * 小程序端 `<image>` **不吃 CSS `color`**（H5 端 `AppIcon` 用 `stroke="currentColor"` 跟随父级），
 * 所以凡是要在小程序端着色的图标，**必须把颜色当参数显式传进去**。
 * 而 scss 变量在 `<script>` 里用不了（`:style="{ color: $color-action }"` 编译不过），
 * 就只能有一份 JS 能查的色值。
 *
 * ⚠️ **改 `uni.scss` 的颜色时，这里要同步改**，否则两端不一致
 *    （典型症状：H5 是橙色的图标，小程序端是深灰的）。
 *
 * 之所以不在所有地方硬编码 hex（比如已经写了几十处的 `color="#68707E"`）：
 * 那些是历史遗留，本表是往正确方向收敛的落点。新代码一律从这里取。
 */
export const COLOR = {
  /** 主操作色，白字 4.90:1 —— 全项目承载按钮/链接的颜色 */
  action: '#c7450a',
  /** 压在 action / brand-vivid 上的文字（白） */
  onAction: '#ffffff',

  // ---- 文字 ----
  /** 正文 15.61:1 */
  textPrimary: '#1a1d23',
  textSecondary: '#3c4658',
  /** 次要文字，app 背景上 4.62:1 */
  textMuted: '#68707e',
  /** 禁用态（可不满足 4.5） */
  textDisabled: '#9aa2af',
  /** 压在深色底上的文字 */
  textInverse: '#ffffff',

  // ---- 状态色 ----
  /** 4.01:1 */
  success: '#0e8a43',
  /** 3.63:1 */
  warning: '#b86e00',
  /** 3.97:1 */
  danger: '#d93a3f',

  // ---- 底色 ----
  surface: '#ffffff',
  surfaceSunken: '#f2f3f6',
  bgApp: '#f5f6f8',
};

/**
 * 订单/商品状态 → 图标色
 *
 * 给 `OrderStatusTag` / `StatusTimeline` / 订单详情 hero 用。
 * 用**固定三档**而不是每个状态一个色：
 * 设计的原则是「状态不能只靠颜色」（见 `OrderStatusTag.vue` 的注释），
 * 图标色只是第三重冗余里的辅助，不该让人误以为颜色能区分全部 4 个状态。
 * 对应关系：
 *   待接单（PENDING）   → warning（等着处理）
 *   配送中（DELIVERING）→ action（在路上）
 *   已送达（DELIVERED） → success
 *   已取消（CANCELLED） → muted（不再有动作）
 */
export const STATUS_ICON_COLOR = {
  PENDING: COLOR.warning,
  DELIVERING: COLOR.action,
  DELIVERED: COLOR.success,
  CANCELLED: COLOR.textMuted,
};