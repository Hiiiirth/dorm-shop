<template>
  <!--
    单一根节点 —— 这一点是**硬要求**，不要改回「多分支各占一个根元素」。

    原因：Vue 对「多根节点（fragment）组件」**不会**自动继承 class/style。
    传进来的 class 会被静默丢掉，生产构建里连一条警告都不会有 ——
    实测 `<AppIcon class="sortbar__icon">` 的 class 凭空消失，图标拿不到自己的颜色。
    （踩坑记录：H5 上 ① 和 ② 两个分支会同时存在 → 组件变成 fragment → class 丢失。）

    所以改成：外层 view 恒存在，专职承载 class / style / 尺寸 / 形变关联；
    平台差异只影响它**内部**放什么。三个平台的 DOM 形状也因此统一了。

    注意各分支仍用自带条件的 v-if，而不是 v-else 串起来 ——
    条件编译是**编译期**删代码，跨平台用 v-else 会让小程序分支剩下半截 v-else。
  -->
  <view class="app-icon" :class="{ 'app-icon--spin': spin }" :style="boxStyle">
    <!-- ① H5 且开了 morphable：交给 morphicons 管理这个 svg 的生命周期 -->
    <!-- #ifdef H5 -->
    <morph-icon
      v-if="morphable"
      :icon="displayIcon"
      :size="numSize"
      :stroke-width="strokeWidth"
      :color="paintColor"
      :spring="spring"
    />
    <!-- #endif -->

    <!-- ② H5 / App：静态 inline SVG，颜色跟随 CSS `color` -->
    <!-- #ifdef H5 || APP-PLUS -->
    <view v-if="!morphable" class="app-icon__svg" v-html="svgHtml" />
    <!-- #endif -->

    <!-- ③ 小程序：inline SVG 渲染不了，改成 data-URI 交给 <image> -->
    <!-- #ifndef H5 || APP-PLUS -->
    <image class="app-icon__img" :src="dataUri" mode="aspectFit" />
    <!-- #endif -->
  </view>
</template>

<script setup>
/**
 * 统一图标组件 —— 全项目**唯一**允许出现图标的地方
 *
 * 为什么要这一层：小程序渲染不了 inline SVG，H5 又不想为了兼容退化成贴图。
 * 把平台差异收在这一个文件里，页面就只写 `<AppIcon name="cart" />`。
 *
 * 用法：
 *   <AppIcon name="cart" />                              // 20px，跟随父级 color
 *   <AppIcon name="hot" :size="14" color="#D93A3F" />
 *   <AppIcon name="loading" spin />                      // 转圈
 *   <AppIcon name="plus" morph-to="check" morphable />   // H5：原地形变
 *   <AppIcon class="tag__icon" name="clock" />           // class 能透传到根节点上
 *
 * ⚠️ 不要给这个组件加第二个根元素。
 *    Vue 对多根（fragment）组件不继承 class/style，且**静默丢弃**。
 *    需要新增平台分支时，加在外层那个 view 的**内部**。
 *
 * ── morphable / morph-to 的语义（重要，容易用错）─────────────────────────
 *   `morph-to` 是「**当前要显示成什么**」，不是「即将变成什么」。
 *   也就是说 `<AppIcon name="plus" morph-to="check" morphable>` 一开始渲染的就是
 *   check，不是 plus。
 *
 *   要做出「plus 变成 check」的效果，正确姿势是让 morph-to 这个**表达式随状态变**：
 *       <AppIcon name="plus" :morph-to="ok ? 'check' : ''" morphable />
 *   morphicons 靠「同一个组件实例的 icon prop 变了」来触发动画，
 *   所以 MorphIcon 必须**从挂载起就存在** —— 这正是 morphable 单独存在的理由：
 *   如果只在 morph-to 非空时才渲染 MorphIcon，组件是新建的，只会「直接出现」而不会「形变」。
 *
 *   `morphable` 是显式开关而不是自动判断，因为 MorphIcon 会跑 requestAnimationFrame，
 *   页面上几十个静态图标全开没有意义。只给真正会变的那一两个开。
 */
import { computed } from 'vue';
import { getIcon } from '../utils/icons';

// morphicons 只 import 在 H5 里 —— 它依赖真实 DOM + requestAnimationFrame，
// 小程序端没有，硬编进去会连累小程序构建。
// #ifdef H5
import { MorphIcon } from 'morphicons/vue';
// #endif

const props = defineProps({
  /** 语义名，见 utils/icons.js 的 ICONS */
  name: { type: String, required: true },
  /** 数字 = px；也接受 '40rpx' 这种字符串（布局用 rpx、图标本身用 px） */
  size: { type: [Number, String], default: 20 },
  /** 不传则跟随 CSS `color`（currentColor），能自动吃到父级/状态色 */
  color: { type: String, default: '' },
  strokeWidth: { type: Number, default: 2 },
  /** 转圈动画，配合 name="loading" 用 */
  spin: { type: Boolean, default: false },
  /** 仅 H5：当前要显示成的目标语义名；为空则显示 name */
  morphTo: { type: String, default: '' },
  /** 仅 H5：是否交给 morphicons 托管（要形变就开） */
  morphable: { type: Boolean, default: false },
  /** morphicons 弹簧手感：smooth | snappy | bouncy */
  spring: { type: String, default: 'snappy' },
});

const numSize = computed(() =>
  typeof props.size === 'number' ? props.size : parseInt(props.size, 10) || 20,
);

const boxStyle = computed(() => {
  const s = typeof props.size === 'number' ? `${props.size}px` : props.size;
  return `width:${s};height:${s};${props.color ? `color:${props.color};` : ''}`;
});

const paintColor = computed(() => props.color || 'currentColor');

/** 真正要画的图形：morph-to 优先，回落到 name */
const displayName = computed(() => props.morphTo || props.name);
const displayIcon = computed(() => getIcon(displayName.value) || getIcon(props.name));

/**
 * 拼 inline SVG 字符串
 *
 * viewBox 固定 0 0 24 24（Lucide 规范），宽高给 100% 交给外层控制 ——
 * 改尺寸不用重新生成字符串，只靠 CSS 就够。
 * stroke 用 currentColor，颜色跟着外层 view 的 color 走，
 * 按状态换色（危险/成功）时不用传 prop。
 */
const svgHtml = computed(() => {
  const node = displayIcon.value;
  if (!node) return '';
  const body = node.map(([tag, attrs]) => `<${tag} ${attrText(attrs)} />`).join('');
  // style="display:block" 直接烤进标签 —— v-html 注入的节点不带 scoped 的
  // data-v 属性，靠 CSS 选它要么用 :deep()、要么容易静默失效；写在这里最稳。
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" ' +
    'style="display:block" ' +
    `fill="none" stroke="currentColor" stroke-width="${props.strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
});

/** 小程序路径用：把同一段 SVG 编成 data-URI（颜色必须**烤进字符串**，图片不受 CSS color 影响） */
const dataUri = computed(() => {
  const node = displayIcon.value;
  if (!node) return '';
  const stroke = props.color || '#1A1D23';
  const body = node.map(([tag, attrs]) => `<${tag} ${attrText(attrs)} />`).join('');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
    `fill="none" stroke="${stroke}" stroke-width="${props.strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
});

/** 把 Lucide 的属性对象拍平：cx/cy/r/d 都是数字或字符串，直接拼即可 */
function attrText(attrs) {
  return Object.keys(attrs)
    .map((k) => `${k}="${attrs[k]}"`)
    .join(' ');
}

/**
 * base64 编码
 *
 * 不用 btoa —— 小程序端没有。也不引第三方库：SVG 字符串是纯 ASCII
 * （path 的 d 只有数字和命令字母，颜色是十六进制），逐字符查表就够。
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(input) {
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const c1 = input.charCodeAt(i);
    const c2 = input.charCodeAt(i + 1);
    const c3 = input.charCodeAt(i + 2);
    out += B64[c1 >> 2];
    out += B64[((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4)];
    out += isNaN(c2) ? '=' : B64[((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6)];
    out += isNaN(c3) ? '=' : B64[c3 & 63];
  }
  return out;
}
</script>

<style lang="scss" scoped>
.app-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  /*
   * 外盒自带 `line-height: 1`，把「继承来的行高」挡在盒子外面。
   * 页面从 `page` 继承 `line-height: 1.5`（21px @14px），如果外盒不收，
   * 盒内的行盒会按继承值算出一个虚高的内容区，inline 子元素（历史写法）
   * 就会被基线带偏 —— 收成 1 之后盒高 == 尺寸，几何干净。
   */
  line-height: 1;
  /*
   * 图标本身的盒子：**不做任何垂直位移**。
   *
   * 「图标 + 文字」怎么共中线，交给父级的 `.icon-line`（全局，见 App.vue）：
   *   · 父级 `align-items: center`
   *   · 并把同行文字的行高收成 `line-height: 1`
   * 两件事同时做，盒子中心 == 视觉中心，图标不再偏下。
   *
   * ⚠️ 这里**不要**加 transform / margin-top 去补偿。历史上的
   *    `align-self: flex-end; transform: translateY(0.06em)` 就是硬凑，
   *    行高随字号一变补偿量就失准，表现为「有的地方齐、有的地方歪」。
   */
  vertical-align: middle;
}

/*
 * 「图标 + 文字」同行居中：**用全局的 `.icon-line`**（见 `App.vue`）。
 *
 * ⚠️ 那个类必须放在 `App.vue` 的**全局**样式里，不能写在这里：
 * 本组件是 `scoped`，`:deep()` 编译后带 `[data-v-xxx]` 前缀，
 * 而 `.icon-line` 是加在**别的页面**元素上的，那些元素不带本组件的 data-v，
 * 选择器匹配不上，样式会静默失效（在父组件写了 scoped 也一样）。
 *
 * 用法：`<view class="act icon-line"><AppIcon/><text/></view>`
 */

/*
 * 内层容器：三个平台各自的「真正图形」都铺满外框。
 * 外框负责尺寸和位置，内层只负责撑满 —— 这样 v-html 注入的 svg
 * （它自带 width/height="100%"）和小程序的 <image> 行为完全一致。
 *
 * ⚠️ `display: block` 是**对齐的关键**，别删：
 *  `<svg>` 默认是 inline 元素，会参与父级的行盒（line box）排布，
 *  位置由父级的 `font-size` / `line-height` 算出的**基线**决定，而不是贴外框。
 *  外框从 `page` 继承了 `font-size: 14px; line-height: 1.5`（=21px），
 *  结果 svg 被判到基线以下，**整体比外盒低 5px** —— 这正是「图标看着下沉」的
 *  真正原因（不是 `.icon-line` 没生效：外盒 cy 是准的，svg 在里面跑偏了）。
 *  改成 block 后，svg 脱离行盒、严格贴住 `.app-icon__svg` 的边框盒，
 *  外盒中心 == 图形中心，任何尺寸/字号下都成立，不需要任何补偿数值。
 */
.app-icon__svg,
.app-icon__img {
  display: block;
  width: 100%;
  height: 100%;
}

/*
 * `v-html` 注入的 svg 也一并脱离行盒。
 *
 * ⚠️ 必须用 `:deep()`：v-html 注入的节点**不带本组件的 data-v 属性**，
 *   普通后代选择器编译后会变成 `.app-icon__svg > svg[data-v-xxx]`，
 *   匹配不到 → 静默失效（实测过：写 `> svg` 不起作用，svg 仍是 inline）。
 */
.app-icon__svg :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.app-icon--spin {
  animation: app-icon-spin 1s linear infinite;
}

@keyframes app-icon-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
