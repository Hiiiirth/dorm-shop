<template>
  <view class="tag" :class="[`tag--${preset.variant}`, { 'tag--sm': size === 'sm' }]">
    <!--
      class="tag__icon" 会**透传**到 AppIcon 的根节点上，
      所以下面各变体里的 `.tag__icon { color: ... }` 在 **H5 端**照样生效（配合 currentColor）。

      但**小程序端 AppIcon 走 `<image>`，颜色烤进 base64 字符串，不吃 CSS color**，
      所以光靠下面那些 `.tag--xxx .tag__icon { color }` 会让小程序端 5 个状态图标**全变深灰** ——
      状态色整个丢掉。因此必须把颜色显式传进去，见 `iconColor` computed。
      两套（CSS + prop）都留着：H5 走 CSS 更灵活，小程序走 prop，两端结果一致。
    -->
    <AppIcon
      class="tag__icon"
      :name="preset.icon"
      :size="iconSize"
      :stroke-width="2.5"
      :color="iconColor"
    />
    <text class="tag__text">{{ label }}</text>
  </view>
</template>

<script setup>
/**
 * 订单状态标签
 *
 * 设计约束：**状态不能只靠颜色**。
 * 所以这里是三重复冗余：① 底色（soft）② 图标 ③ 中文文字。
 * 色盲用户、灰度截图、打印出来都能区分 —— 只靠颜色的话这三种场景全废。
 *
 * 变体含义：
 *   warning 琥珀底（待接单）  action 浅橙底（配送中）
 *   solid   实底白字（配送中，最有推进感）  success 绿底（已送达）  muted 灰底（已取消）
 */
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { ORDER_STATUS_TEXT, ORDER_STATUS_VARIANT } from '../utils/constants';
import { COLOR } from '../utils/colors';

const props = defineProps({
  /** 订单状态，取 OrderStatus 之一 */
  status: { type: String, required: true },
  /** 覆盖默认文案（一般不用） */
  text: { type: String, default: '' },
  /** sm = 更紧凑，用于列表行内 */
  size: { type: String, default: 'md' },
});

const preset = computed(
  () => ORDER_STATUS_VARIANT[props.status] || { variant: 'muted', icon: 'empty' },
);

/**
 * 图标色（小程序端专用通道）
 *
 * 按 `variant` 映射，跟下面 CSS 里的 `.tag--xxx .tag__icon { color }` **必须一致** ——
 * 不一致会出现「H5 是绿图标、小程序是橙图标」的分裂。
 * solid 变体是实底，图标要跟文字一样用白。
 */
const VARIANT_ICON_COLOR = {
  warning: COLOR.warning,
  action: COLOR.action,
  solid: COLOR.textInverse,
  success: COLOR.success,
  muted: COLOR.textMuted,
};

const iconColor = computed(
  () => VARIANT_ICON_COLOR[preset.value.variant] || COLOR.textMuted,
);

/** 标签本身只有 20px（sm 18px）高，图标得比文字大一档才看得清，但不能撑破高度 */
const iconSize = computed(() => (props.size === 'sm' ? 12 : 13));

const label = computed(() => props.text || ORDER_STATUS_TEXT[props.status] || props.status);
</script>

<style lang="scss" scoped>
.tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 $space-2;
  height: 40rpx;
  border-radius: $radius-xs;
  font-size: $font-size-xs;
  font-weight: $font-weight-medium;
  white-space: nowrap;
}

.tag--sm {
  height: 36rpx;
  padding: 0 6px;
}

.tag__icon {
  flex: none;
}

/* ---------------------------------------------------------------
   文字一律用 $color-text-primary（深色），颜色只交给底和图标。
   原因：状态色当小字压在浅底上普遍到不了 4.5:1（实测 warning 只有 3.63），
   而深色文字是 15:1+，稳得多。
   --------------------------------------------------------------- */
.tag--warning {
  background-color: $color-warning-soft;
  color: $color-text-primary;

  .tag__icon {
    color: $color-warning;
  }
}

.tag--action {
  background-color: $color-action-soft;
  color: $color-text-primary;

  .tag__icon {
    color: $color-action;
  }
}

.tag--success {
  background-color: $color-success-soft;
  color: $color-text-primary;

  .tag__icon {
    color: $color-success;
  }
}

.tag--muted {
  background-color: $color-surface-sunken;
  color: $color-text-muted;

  .tag__icon {
    color: $color-text-muted;
  }
}

/* 实底：白字压 $color-action，实测 4.90:1 */
.tag--solid {
  background-color: $color-action;
  color: $color-text-inverse;

  .tag__icon {
    color: $color-text-inverse;
  }
}
</style>
