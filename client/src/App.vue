<script setup>
/**
 * 应用根组件
 *
 * 启动流程（很关键）：
 *   storage 里有 token -> GET /users/me 校验 -> 恢复登录态 / 否则静默清空
 * 绝不能在这里重新调登录接口 —— mock 登录每次都建新账号（见 store/user.js 注释）。
 */
import { onLaunch, onShow } from '@dcloudio/uni-app';
import { useUserStore } from './store/user';

const userStore = useUserStore();

onLaunch(() => {
  userStore.restore();
});

onShow(() => {
  // 从后台切回来时，如果还没恢复完（比如首次启动网络慢），不重复拉取
});
</script>

<style lang="scss">
/**
 * 全局基础样式
 * ⚠️ 这里只放「全局规则」。设计 token（变量）在 src/uni.scss，已自动全局注入。
 */

/* 页面根节点：uni-app 里用 `page` 选择器（H5 会映射到 uni-page-body） */
page {
  background-color: $color-bg-app;
  color: $color-text-primary;
  font-size: $font-size-sm;
  line-height: $line-height-normal;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/**
 * 盒模型统一。
 * 刻意**不用通配符 `*`** —— 部分小程序宿主对 `*` 选择器支持不稳定，
 * 逐个列出实际会用的元素更保险。
 */
view,
text,
image,
scroll-view,
button,
input,
textarea,
navigator {
  box-sizing: border-box;
}

/* 干掉原生 button 的默认边框/背景，我们全部自绘 */
button {
  padding: 0;
  margin: 0;
  background-color: transparent;
  border: none;
  line-height: inherit;
  font-size: inherit;
  color: inherit;

  &::after {
    border: none;
  }
}

/* ---------------------------------------------------------------- 布局容器 */

/* 标准页面外壳：顶部留给自绘 NavBar，底部留给自绘 TabBar */
.page-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: $color-bg-app;
}

/* 页面内容区，左右统一留白 */
.page-body {
  flex: 1;
  padding: 0 $page-padding-x;
}

/**
 * 给固定底栏「让位」。
 * 固定底栏有两件事必须同时做：① 自己躲开安全区 ② 让可滚动内容预留出它的高度，
 * 少任何一件都会出现「最后一行被盖住」。
 */
.has-fixed-bottom {
  padding-bottom: calc(#{$tabbar-height} + #{$space-4});
}

/* 底部安全区（iPhone home indicator / 全面屏手势条） */
.safe-area-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

/* 顶部安全区（状态栏）—— 自绘 NavBar 内部会用系统状态栏高度，这个是备用 */
.safe-area-top {
  padding-top: constant(safe-area-inset-top);
  padding-top: env(safe-area-inset-top);
}

/* ---------------------------------------------------------------- 通用面块 */

/* 白色面块（列表 / 表单分组）。刻意不做「卡片套卡片」。 */
.surface {
  background-color: $color-surface;
  border-radius: $radius-md;
  overflow: hidden;
}

.surface + .surface {
  margin-top: $space-3;
}

/* 区块标题 */
.section-title {
  padding: $space-5 0 $space-3;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

/* 细分隔线 */
.divider {
  height: 1px;
  background-color: $color-border-subtle;
}

/* 单行 / 双行截断 */
.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ellipsis-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* ==========================================================================
   「图标 + 文字」同行垂直居中（全局辅助类）
   --------------------------------------------------------------------------
   用法：给并排的那一层加 `.icon-line`：
     <view class="act icon-line"><AppIcon name="edit"/><text>编辑</text></view>

   ── 为什么不能只写 align-items: center ───────────────────────────────────
   `<text>` 默认 `line-height: 18px` 而 `font-size: 12px` —— 文字盒被行高
   撑大了 50%。`align-items: center` 对齐的是**盒子几何中心**，而汉字的实际
   墨迹在这个被撑大的盒子里是**偏上**的（字体把多余空间大多分给了下方）。
   实测：图标盒 11px、文字盒 18px，两个盒子都居中了，但图标视觉上偏下 4.4px。

   所以两件事必须同时做，缺一不可：
     ① 这一行用 `align-items: center`（不再用 baseline）
     ② **把文字的行高收干净**，让「文字盒高度 == 字号」→ 盒子中心 == 视觉中心

   ⚠️ **不要再用 margin-top / translateY 去硬调**（历史遗留的 `baseline` +
      `translateY(0.06em)` 组合已删除）。那是「用魔法打魔法」：行高一旦随
      字号/字体变化，硬编码的补偿量立刻失准，表现为「有的地方对齐、有的地方歪」。

   ⚠️ 必须放全局，不能写在 AppIcon.vue 里 —— 那个组件是 scoped，
      :deep() 编译后带 [data-v-xxx] 前缀，而 .icon-line 加在别的页面元素上，
      选择器匹配不上会**静默失效**。
   ========================================================================== */
.icon-line {
  display: flex;
  align-items: center;
}

/*
 * 收紧这一行里所有文字的行高。
 *
 * `line-height: 1` 让文字盒高度 == 字号，此时盒子的几何中心与汉字的视觉
 * 中心重合（汉字是满方块，没有西文那样的下伸部）。配合父级 align-items:center，
 * 图标与文字就真正共中线了，不需要任何补偿。
 *
 * 用子选择器 + 后代选择器兜住两种写法：
 *   `<text>` 直接被 uni 编译成 `<uni-text>`，两类标签都要覆盖到。
 */
.icon-line > text,
.icon-line > uni-text,
.icon-line text,
.icon-line uni-text {
  line-height: 1;
}

/*
 * 图标自身不做任何位移。留这条是为了**显式声明意图**：对齐靠父级 flex 完成，
 * 这里不允许出现 transform / margin 微调（见上面的说明）。
 */
.icon-line .app-icon {
  align-self: center;
}

/* ==========================================================================
   「引导图标 + 多行文字」提示条（全局辅助类）
   --------------------------------------------------------------------------
   用法：提示条容器加 `.icon-lead`，并把容器 `font-size` 设成**和正文一致**：
     <view class="hint icon-lead">
       <AppIcon name="alert" :size="13" />
       <text class="hint__text">较长的一段说明，手机上会折成两三行…</text>
     </view>

   ── 为什么不直接用 align-items: center ──────────────────────────────────
   多行文字时 `center` 会把图标对到**整段文字**的竖直中线上（第 1.5 行附近），
   一眼就看出图标「陷进文字堆里」。引导图标应该对齐**第一行**文字的中线。
   所以容器用 `align-items: flex-start`。

   ── 为什么不直接用 align-items: flex-start ──────────────────────────────
   这样图标会贴容器内容区**顶边**，而第一行文字盒的顶边之上还有行距
   （`line-height: 1.6` 时上下各留 30%），于是图标比首行墨迹**偏高约 3px**。
   实测：`-2.5px`，表现为「图标顶着上沿、跟首行文字错半个字」。

   ── 解法：把图标盒撑到「首行行高」，图标在其中居中 ───────────────────────
   给容器设 `font-size`（= 正文行字号），图标盒 `height` 用 `1.6em` ——
   这个 em 相对的是**容器的字号**，正好等于第一行的 line-height。
   不需要任何写死的像素、不需要 margin / transform 补偿，字号一变自动跟随。
   ========================================================================== */
.icon-lead {
  display: flex;
  align-items: flex-start;
}

/*
 * 图标外面必须套一层这个壳。
 * 原因：`AppIcon` 的尺寸是**内联 style**（`width:13px;height:13px`）写死的，
 * 类选择器盖不过内联，所以不能直接改图标自己的高度，只能包一层控制行高。
 *
 * 高度 = 第一行的行高 = `1.5em`（1.5 = 全局 `$line-height-normal`，
 * em 相对**本壳继承的 font-size**，而容器上已显式设成正文的 `$font-size-xs`）。
 * 图标在壳内居中 → 中心 == 第一行文字的中线。
 *
 * ⚠️ 刻意写成字面量 `1.5em` 而不是 `calc(var(--x) * 1em)`：
 *    微信小程序对 `calc()` 套 CSS 变量的组合支持不稳（低版本基础库会整条失效），
 *    这个值只有一处、且和正文行高是一对一的语义，直接写死更可靠。
 *    改正文行高时记得同步这里。
 */
.icon-lead__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  height: 1.5em;
}
</style>
