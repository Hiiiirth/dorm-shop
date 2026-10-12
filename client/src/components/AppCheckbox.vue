<template>
  <!--
    勾选框 —— 单一根节点。
    ⚠️ 不要加第二个根元素：Vue 对多根（fragment）组件不继承 class/style，且静默丢弃。
  -->
  <view
    class="cbox"
    :class="[`cbox--${size}`, { 'cbox--on': checked, 'cbox--disabled': disabled }]"
    :hover-class="disabled ? '' : 'cbox--hover'"
    :hover-stay-time="60"
    @tap="handleTap"
  >
    <view class="cbox__box">
      <!-- 打勾。用变形体做成「缩放 + 淡入」，不用整块显示/隐藏 -->
      <!--
        ⚠️ `color="#ffffff"` 看着是冗余（下面 `.cbox__mark { color: $color-on-action }` 已经给了），
        但小程序端 `<image>` 不吃 CSS color —— 漏了它，小程序上的对勾是**白底深灰**，几乎看不见。
        H5 端这个 prop 与 CSS 同值，不会有冲突。
      -->
      <AppIcon
        v-if="checked"
        class="cbox__mark"
        name="check"
        :size="markSize"
        :stroke-width="3"
        color="#ffffff"
      />
    </view>

    <text v-if="label" class="cbox__label">{{ label }}</text>
  </view>
</template>

<script setup>
/**
 * 勾选框
 *
 * 为什么自绘而不是用 <checkbox>：
 *   小程序的 <checkbox> 有自己的一套尺寸/颜色/圆角，改样式要靠 CSS 变量穿透，
 *   而且它自带一个「热区之外的 label 点击」语义，很容易和自定义列表行打架。
 *   自绘就是两个 view，行为完全可控，也和 AppIcon 的其它图标视觉一致。
 *
 * 无障碍：约定了 44px 的最小触控热区（$touch-min = 88rpx）。
 * 视觉方框小一点（20px）没关系，但**可点区域**必须够大 ——
 * 所以热区由外层 `.cbox` 的 padding 撑，而不是靠方框本身。
 */
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps({
  checked: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  /** 传了才渲染右侧文字 */
  label: { type: String, default: '' },
  /** sm=方框 18px | md=方框 22px（购物车行用 md） */
  size: { type: String, default: 'md' },
});

const emit = defineEmits(['change']);

const markSize = computed(() => (props.size === 'sm' ? 12 : 15));

function handleTap() {
  if (props.disabled) return;
  emit('change', !props.checked);
}
</script>

<style lang="scss" scoped>
.cbox {
  display: inline-flex;
  /* ⚠️ 用 baseline 而不是 center：圆圈是固定正方形、文字带 line-height，
   * 居中对齐时中文字体的下伸部会把文字的重心带偏，视觉上「圈比字高半格」。
   * 再给圆圈补一点下压，把两者的视觉中线拉齐。 */
  align-items: baseline;
  /* 可点热区：视觉方框 + 上下左右 11px padding ≈ 44px */
  padding: 11px 8px;
  gap: $space-2;
}

.cbox__box {
  /* baseline 对齐时圆圈按基线排，会显得比文字高，往下压 2px 找平 */
  transform: translateY(2px);
}

.cbox--hover .cbox__box {
  border-color: $color-action;
}

.cbox__box {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid $color-border-strong;
  border-radius: 50%;
  background-color: $color-surface;
  transition:
    background-color $motion-state $easing-standard,
    border-color $motion-state $easing-standard;
}

.cbox--md .cbox__box {
  width: 22px;
  height: 22px;
}

.cbox--sm .cbox__box {
  width: 18px;
  height: 18px;
}

/* 选中：实心橙 + 白勾。圆角 50% 让它在购物车里看起来像「选择圈」而不是复选框 */
.cbox--on .cbox__box {
  border-color: $color-action;
  background-color: $color-action;
}

.cbox--disabled {
  opacity: 0.45;
}

.cbox--disabled .cbox__box {
  background-color: $color-surface-sunken;
  border-color: $color-border-subtle;
}

.cbox__mark {
  color: $color-on-action;
  /* 打勾出现时轻微缩放，比硬切自然 */
  animation: cbox-pop $motion-state $easing-standard;
}

@keyframes cbox-pop {
  from {
    transform: scale(0.5);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.cbox__label {
  font-size: $font-size-sm;
  color: $color-text-secondary;
}
</style>
