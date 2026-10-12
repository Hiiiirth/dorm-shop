<template>
  <text class="price" :class="[`price--${size}`, `price--${tone}`]">
    <text v-if="symbol" class="price__symbol">¥</text>
    <text class="price__int">{{ parts.int }}</text>
    <text class="price__dec">.{{ parts.dec }}</text>
    <text v-if="showOriginal" class="price__origin">¥{{ originalText }}</text>
  </text>
</template>

<script setup>
/**
 * 金额展示
 *
 * 入参一律是**分**（接口约定），组件内部换算成元，页面不需要自己除 100。
 * 整数部分和小数部分拆成两个 text，是为了让小数位视觉上小一号 —— 电商里
 * 价格的可读性主要靠这个节奏。
 *
 * 划线价的处理：`original` **小于等于** `value` 时**不显示**。
 * 种子数据里有好几个「原价 == 现价」的商品（比如农夫山泉 2.00/2.00），
 * 无条件渲染就会出现「¥2.00 ¥2.00」这种一眼假的价格 —— 那比不写还糟。
 */
import { computed } from 'vue';

const props = defineProps({
  /** 金额，单位「分」 */
  value: { type: [Number, String], default: 0 },
  /** sm / md / lg / xxl */
  size: { type: String, default: 'md' },
  /** default=主文字色  action=品牌橙  danger=红  muted=灰 */
  tone: { type: String, default: 'action' },
  /** 是否显示 ¥ */
  symbol: { type: Boolean, default: true },
  /** 划线原价，单位「分」；不传或没比现价高就不显示 */
  original: { type: [Number, String], default: null },
});

const parts = computed(() => {
  const n = Number(props.value);
  const yuan = Number.isFinite(n) ? n / 100 : 0;
  const text = yuan.toFixed(2);
  const [int, dec] = text.split('.');
  return { int, dec };
});

const originalText = computed(() => {
  const n = Number(props.original);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : '';
});

/** 只有「原价确实更高」才算促销，否则划线价是误导 */
const showOriginal = computed(() => {
  const o = Number(props.original);
  const v = Number(props.value);
  return Number.isFinite(o) && Number.isFinite(v) && o > v;
});
</script>

<style lang="scss" scoped>
.price {
  display: inline-flex;
  align-items: baseline;
  font-weight: $font-weight-semibold;
  /* 数字用等宽，列表里各行的价格能对齐 */
  font-variant-numeric: tabular-nums;
}

.price__symbol {
  font-size: 0.7em;
  margin-right: 1px;
}

.price__dec {
  font-size: 0.78em;
}

.price__origin {
  margin-left: $space-2;
  font-size: 0.62em;
  font-weight: $font-weight-regular;
  color: $color-text-muted;
  text-decoration: line-through;
}

/* ---------------------------------------------------------------- 尺寸 */
.price--sm {
  font-size: $font-size-md;
}

.price--md {
  font-size: $font-size-lg;
}

.price--lg {
  font-size: $font-size-xl;
}

.price--xxl {
  font-size: $font-size-xxl;
}

/* ---------------------------------------------------------------- 色调 */
.price--default {
  color: $color-text-primary;
}

.price--action {
  color: $color-action;
}

.price--danger {
  color: $color-danger;
}

.price--muted {
  color: $color-text-muted;
}
</style>
