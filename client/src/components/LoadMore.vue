<template>
  <view v-if="visible" class="more">
    <template v-if="state === 'loading'">
      <AppIcon name="loading" :size="16" spin color="#68707E" />
      <text class="more__text">正在加载…</text>
    </template>

    <template v-else-if="state === 'error'">
      <AppIcon name="alert" :size="16" color="#D93A3F" />
      <text class="more__text more__text--err">加载失败，点此重试</text>
    </template>

    <template v-else-if="state === 'end'">
      <view class="more__line" />
      <text class="more__text">{{ endText }}</text>
      <view class="more__line" />
    </template>

    <template v-else>
      <text class="more__text">上拉加载更多</text>
    </template>
  </view>
</template>

<script setup>
/**
 * 触底加载状态条
 *
 * 四种状态分开渲染，而不是统一一句「加载中」——
 * 「加载失败」必须是**可点重试**的，否则用户只能退出重进。
 *
 * 注意 `state === 'end'` 用了左右两条细线夹文字，
 * 比单单一句话更像「到底了」这个语义的收尾感。
 */
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps({
  /** idle | loading | error | end */
  state: { type: String, default: 'idle' },
  /** 列表为空时整条不渲染（空态由 EmptyState 负责） */
  empty: { type: Boolean, default: false },
  endText: { type: String, default: '已经到底啦' },
});

defineEmits(['retry']);

const visible = computed(() => !props.empty);
</script>

<style lang="scss" scoped>
.more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-2;
  padding: $space-5 $space-4;
}

.more__text {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.more__text--err {
  color: $color-danger;
}

.more__line {
  width: 60rpx;
  height: 1px;
  background-color: $color-border-subtle;
}
</style>
