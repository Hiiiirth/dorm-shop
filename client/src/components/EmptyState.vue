<template>
  <view class="empty">
    <view class="empty__art" :class="`empty__art--${variant}`">
      <!--
        ⚠️ `color` 显式给（小程序端 `<image>` 不吃 CSS color）：
        不给的话 error 的红图标 / offline 的琥珀图标在小程序端全变灰，
        「出错」和「断网」这两档的颜色提示就整个丢了 —— 而这两档恰恰是**最需要颜色区分**的。
        映射见 `artIconColor`，与下面 `.empty__art--xxx { color }` 一一对应。
      -->
      <AppIcon :name="icon" :size="34" :color="artIconColor" />
    </view>

    <text class="empty__title">{{ title }}</text>
    <text v-if="desc" class="empty__desc">{{ desc }}</text>

    <view v-if="actionText" class="empty__action">
      <AppButton type="secondary" size="sm" :text="actionText" @tap="$emit('action')" />
    </view>
  </view>
</template>

<script setup>
/**
 * 空状态 / 错误状态 / 网络异常
 *
 * 三个变体，不要用一个「暂无数据」糊弄所有情况 ——
 * 「购物车是空的」和「加载失败，点此重试」对用户是完全不同的指令。
 *
 * 只在**确实有下一步动作**时才显示按钮（拿不到列表就别给「刷新」当摆设）。
 */
import { computed } from 'vue';
import AppButton from './AppButton.vue';
import AppIcon from './AppIcon.vue';
import { COLOR } from '../utils/colors';

const props = defineProps({
  /** empty=没数据 | error=加载失败 | offline=网络异常 | search=搜不到 */
  variant: { type: String, default: 'empty' },
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
  /** 传了才渲染按钮 */
  actionText: { type: String, default: '' },
  /** 覆盖默认图标（语义名，见 utils/icons.js） */
  icon: { type: String, default: '' },
});

defineEmits(['action']);

const DEFAULTS = {
  empty: { icon: 'empty', title: '这里还是空的' },
  error: { icon: 'alert', title: '加载失败了' },
  offline: { icon: 'offline', title: '网络好像断开了' },
  search: { icon: 'search-empty', title: '没有找到相关内容' },
};

const preset = computed(() => DEFAULTS[props.variant] || DEFAULTS.empty);
const icon = computed(() => props.icon || preset.value.icon);
const title = computed(() => props.title || preset.value.title);

/**
 * 变体 → 图标色（小程序端通道）
 * 必须与下面 `.empty__art--xxx { color }` 一致。
 * 规律：error/offline 用状态色（这两档最需要颜色区分），empty/search 中性灰（不该一惊一乍）。
 */
const VARIANT_ICON_COLOR = {
  empty: COLOR.textDisabled,
  error: COLOR.danger,
  offline: COLOR.warning,
  search: COLOR.textDisabled,
};

const artIconColor = computed(
  () => VARIANT_ICON_COLOR[props.variant] || COLOR.textDisabled,
);
</script>

<style lang="scss" scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: $space-8 $space-6;
}

.empty__art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 160rpx;
  height: 160rpx;
  border-radius: $radius-pill;
  background-color: $color-surface-2;
  color: $color-text-disabled;
  margin-bottom: $space-4;
}

/* 出错和断网是要用户「做点什么」的，给一点颜色上的提示；
   单纯空列表保持中性灰，不要一惊一乍 */
.empty__art--error {
  background-color: $color-danger-soft;
  color: $color-danger;
}

.empty__art--offline {
  background-color: $color-warning-soft;
  color: $color-warning;
}

.empty__title {
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
  text-align: center;
}

.empty__desc {
  margin-top: $space-2;
  max-width: 480rpx;
  font-size: $font-size-sm;
  line-height: $line-height-normal;
  color: $color-text-muted;
  text-align: center;
}

.empty__action {
  margin-top: $space-5;
}
</style>
