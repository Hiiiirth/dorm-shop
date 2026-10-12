<template>
  <button
    class="btn"
    :class="[`btn--${type}`, `btn--${size}`, { 'btn--block': block, 'btn--loading': loading }]"
    :disabled="disabled || loading"
    :hover-class="disabled || loading ? '' : `btn--hover-${type}`"
    :hover-stay-time="80"
    @tap="handleTap"
  >
    <AppIcon v-if="loading" name="loading" :size="15" spin :color="iconColor" />
    <!--
      图标可选。morphable 常开：按钮图标是整个项目里最值得做形变的地方
      （加购 plus→check、提交 →check），而且带图标的按钮本来就少，开销可忽略。
      morph-to 由调用方按当前状态给，见 AppIcon.vue 顶部的语义说明。

      ⚠️ `color` 必须显式给：H5 端能靠 CSS `color` + currentColor 跟随变体，
      小程序端 `<image>` 不吃 CSS color，不给就是深灰 ——
      primary 的白图标会变成「橙底深灰」，加载中的转圈也是深灰，都看不清。
      映射表见 `iconColor`，与下面 CSS 的 `.btn--xxx { color }` 一一对应。
    -->
    <AppIcon
      v-else-if="icon"
      :name="icon"
      :morph-to="morphTo"
      morphable
      :size="iconSize"
      :stroke-width="2.4"
      :color="iconColor"
    />

    <text class="btn__text"><slot>{{ text }}</slot></text>
  </button>
</template>

<script setup>
/**
 * 按钮
 *
 * 尺寸说明：最小的一档也是 **88rpx（44px）**，因为 44px 是公认的最小触控热区。
 * 想「看起来更小」请减少左右内边距，不要压低高度 —— 压低高度会让手指点不准。
 *
 * 状态覆盖：默认 / 按压 / 禁用 / 加载中。
 *
 * 加载中的转圈用 AppIcon 的 spin，而不是自己画一个 border 动画 ——
 * 一是线条粗细能跟其他图标对齐，二是少一份要维护的 CSS。
 */
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { COLOR } from '../utils/colors';

const props = defineProps({
  /** primary=主操作  secondary=浅色次级  text=纯文字  danger=危险操作 */
  type: { type: String, default: 'primary' },
  /** sm=88rpx  md=96rpx  lg=104rpx */
  size: { type: String, default: 'md' },
  text: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  /** 撑满可用宽度 */
  block: { type: Boolean, default: false },
  /** 图标语义名（见 utils/icons.js），不传则只有文字 */
  icon: { type: String, default: '' },
  /** 仅 H5：让图标形变到这个语义名，用于表达状态流转 */
  morphTo: { type: String, default: '' },
});

const emit = defineEmits(['tap']);

/**
 * 变体 → 图标色
 *
 * 必须和下面 CSS 里的 `.btn--xxx { color }` **保持一致**：
 * H5 走 CSS，小程序走这个 prop，两边不能分叉。
 * 规律很简单 —— 按钮底色深浅决定了图标该用文字色还是反色：
 *   primary / danger  深底 → 白图标
 *   secondary / text  浅底 → 品牌橙
 */
const TYPE_ICON_COLOR = {
  primary: COLOR.textInverse,
  secondary: COLOR.action,
  text: COLOR.action,
  danger: COLOR.textInverse,
};

const iconColor = computed(() => TYPE_ICON_COLOR[props.type] || COLOR.textInverse);

/** 图标比文字略大一点，视觉上才不显小 */
const iconSize = computed(() => (props.size === 'lg' ? 17 : props.size === 'md' ? 16 : 15));

function handleTap(e) {
  // loading 时拦住重复提交 —— 下单/接单这类接口尤其需要
  if (props.disabled || props.loading) return;
  emit('tap', e);
}
</script>

<style lang="scss" scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  border-radius: $radius-sm;
  font-weight: $font-weight-semibold;
  /* 只动 transform / background-color，绝不用 transition: all */
  transition:
    background-color $motion-press $easing-standard,
    opacity $motion-press $easing-standard,
    transform $motion-press $easing-standard;
}

.btn--block {
  display: flex;
  width: 100%;
}

/* ---------------------------------------------------------------- 尺寸 */
.btn--sm {
  height: $touch-min; /* 88rpx = 44px */
  padding: 0 $space-4;
  font-size: $font-size-sm;
}

.btn--md {
  height: $touch-primary; /* 96rpx = 48px */
  padding: 0 $space-5;
  font-size: $font-size-md;
}

.btn--lg {
  height: 104rpx;
  padding: 0 $space-6;
  font-size: $font-size-md;
}

/* ---------------------------------------------------------------- primary
   ⚠️ 底色是 $color-action(#C7450A) 而不是品牌鲜艳橙(#FF6A2B)：
      白字压 #FF6A2B 只有 2.86:1，压 #C7450A 是 4.90:1。
      换色必须重新验算对比度。 */
.btn--primary {
  background-color: $color-action;
  color: $color-on-action;
}

.btn--hover-primary {
  background-color: $color-action-pressed;
  transform: scale(0.98);
}

/* ---------------------------------------------------------------- secondary */
.btn--secondary {
  background-color: $color-action-soft;
  color: $color-action;
}

.btn--hover-secondary {
  background-color: $color-action-soft-border;
  transform: scale(0.98);
}

/* ---------------------------------------------------------------- text */
.btn--text {
  background-color: transparent;
  color: $color-action;
  font-weight: $font-weight-medium;
}

.btn--hover-text {
  background-color: $color-action-soft;
}

/* ---------------------------------------------------------------- danger */
.btn--danger {
  background-color: $color-danger;
  color: $color-text-inverse;
}

.btn--hover-danger {
  background-color: #bd3136;
  transform: scale(0.98);
}

/* ---------------------------------------------------------------- 禁用 / 加载 */
.btn[disabled],
.btn--loading {
  background-color: $color-action-disabled-bg;
  color: $color-action-disabled-text;
  /* 禁用态必须看起来就点不动 */
  transform: none;
}

.btn__text {
  line-height: 1.2;
}
</style>
