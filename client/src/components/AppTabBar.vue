<template>
  <view class="tabbar">
    <!-- 等高空占位：固定底栏必须让可滚动内容预留出它的高度，否则最后一行被盖住 -->
    <view v-if="!inline" class="tabbar__spacer" :style="{ height: totalHeight + 'px' }" />

    <view class="tabbar__wrap" :class="{ 'tabbar__wrap--inline': inline }">
      <view class="tabbar__bar">
        <view
          v-for="item in items"
          :key="item.key"
          class="tabbar__item"
          :class="{ 'tabbar__item--active': item.key === active }"
          :hover-class="item.key === active ? '' : 'tabbar__item--hover'"
          :hover-stay-time="80"
          @tap="handleTap(item)"
        >
          <!-- 选中指示条：让「选中」不只靠颜色，多一重形状线索 -->
          <view class="tabbar__indicator" />

          <view class="tabbar__icon-box">
            <!--
              ⚠️ `color` 必须显式给，不能只靠 CSS 的 `.tabbar__item--active { color }`：
              H5 端 `AppIcon` 内部用 `stroke="currentColor"` 会跟随父级 color，
              但**小程序端走 `<image>` + base64，颜色是烤进 SVG 字符串里的**，
              不吃 CSS color —— 不给就一律深灰，**选中态的橙色整个消失**。
              两端都要对，就得在数据这一层把颜色算出来传下去。
            -->
            <AppIcon
              :name="item.icon"
              :size="22"
              :color="item.key === active ? COLOR.action : COLOR.textMuted"
            />
            <view v-if="item.badge > 0" class="tabbar__badge">
              <text class="tabbar__badge-text">{{ item.badge > 99 ? '99+' : item.badge }}</text>
            </view>
          </view>

          <text class="tabbar__label">{{ item.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 自绘底部 tab
 *
 * 为什么自绘见 utils/tabs.js 顶部注释。这里只强调两点：
 *   1) 切换用 reLaunch（各工作台是并列的根页面，用 navigateTo 会让页面栈无限增长）
 *   2) 固定底栏「躲开安全区」和「内容预留高度」必须同时做
 */
import { computed, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { COLOR } from '../utils/colors';

const props = defineProps({
  /** [{ key, label, icon, path, badge? }] —— 由 utils/tabs.js 按身份给 */
  items: { type: Array, default: () => [] },
  /** 当前选中项 key */
  active: { type: String, default: '' },
  /** 切换方式：reLaunch（默认，清栈） | redirectTo | navigateTo */
  mode: { type: String, default: 'reLaunch' },
  /** 内联模式：不固定底部、不占位。仅用于设计预览页并排展示，业务页面不要传 */
  inline: { type: Boolean, default: false },
  /**
   * 是否响应点击。设计预览页会并排展示「顾客 / 店长」两套 tab，
   * 但店长工作台的页面大多数还没建，点了会 reLaunch 到不存在的路径。
   * 预览页传 false 关掉跳转，只保留视觉。
   */
  interactive: { type: Boolean, default: true },
});

const emit = defineEmits(['change']);

/**
 * 底栏高度
 *
 * ⚠️ 必须用 `uni.upx2px(100)` 而不是写死 `50`：
 * `$tabbar-height: 100rpx` 会**随屏宽缩放**（iPhone 15 Pro Max 430pt 宽时 100rpx ≈ 57px），
 * 而其他页面预留底栏高度用的正是 `calc(100rpx + env(...))` 里的 rpx。
 * 写死 50px 的话，宽屏机型上 tab 栏比页面预留的位置矮 7px ——
 * 购物车的结算栏会跟 tab 栏之间**裂开一条白缝**，`mine` 列表底部多留一块空白。
 * 这个 bug 只在 Plus / Pro Max / 平板上出现，本机390pt 预览永远看不到。
 */
const BAR_HEIGHT = uni.upx2px(100);

// 底部安全区在 H5/小程序都拿不到统一 API，直接用 env() 量一次做占位高度
const safeBottom = ref(0);
try {
  const info = uni.getSystemInfoSync();
  // safeArea.bottom 距离屏幕底部的差值就是 home indicator 高度
  const screenHeight = Number(info.screenHeight) || 0;
  const safeBottomPx = info.safeArea ? Number(info.safeArea.bottom) || 0 : 0;
  safeBottom.value = screenHeight && safeBottomPx ? Math.max(0, screenHeight - safeBottomPx) : 0;
} catch {
  safeBottom.value = 0;
}

const totalHeight = computed(() => BAR_HEIGHT + safeBottom.value);

function handleTap(item) {
  if (item.key === props.active) return;
  if (!props.interactive) return;

  const url = item.path;
  if (!url) return;

  if (props.mode === 'navigateTo') {
    uni.navigateTo({ url });
  } else if (props.mode === 'redirectTo') {
    uni.redirectTo({ url });
  } else {
    uni.reLaunch({ url });
  }

  emit('change', item);
}
</script>

<style lang="scss" scoped>
.tabbar {
  position: relative;
}

.tabbar__spacer {
  width: 100%;
}

.tabbar__wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: $z-tabbar;
  background-color: $color-surface;
  border-top: 1px solid $color-border-subtle;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

.tabbar__wrap--inline {
  position: static;
  border-radius: $radius-md;
  border: 1px solid $color-border-subtle;
  overflow: hidden;
}

.tabbar__bar {
  display: flex;
  align-items: stretch;
  /**
   * 用 rpx 而不是写死 `50px`，与 JS 侧 `uni.upx2px(100)` 保持同一个来源。
   * 两者必须一致：JS 算出来的是**占位高度**（给页面内容留的），
   * CSS 决定的是**实际渲染高度**（用户看到的），不一致就会在宽屏上裂开一条缝。
   */
  height: 100rpx;
}

.tabbar__item {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  /* 44px 最小触控区，这里 50px 足够 */
}

.tabbar__item--hover {
  background-color: $color-surface-2;
}

.tabbar__indicator {
  position: absolute;
  top: 0;
  left: 50%;
  width: 40rpx;
  height: 4rpx;
  border-radius: 0 0 $radius-xs $radius-xs;
  background-color: transparent;
  transform: translateX(-50%);
  transition: background-color $motion-state $easing-standard;
}

.tabbar__item--active .tabbar__indicator {
  background-color: $color-brand-vivid;
}

.tabbar__icon-box {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 未选中时压暗，选中时恢复 —— 灰度下也能看出选中。
     颜色交给 AppIcon 的 currentColor，所以这里改 color 就够。 */
  color: $color-text-muted;
  opacity: 0.75;
  transition: color $motion-state $easing-standard, opacity $motion-state $easing-standard;
}

.tabbar__item--active .tabbar__icon-box {
  color: $color-action;
  opacity: 1;
}

.tabbar__label {
  font-size: $font-size-xs;
  line-height: 1.2;
  color: $color-text-muted;
  transition: color $motion-state $easing-standard;
}

.tabbar__item--active .tabbar__label {
  color: $color-action;
  font-weight: $font-weight-semibold;
}

.tabbar__badge {
  position: absolute;
  top: -6rpx;
  right: -18rpx;
  min-width: 30rpx;
  height: 30rpx;
  padding: 0 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-pill;
  background-color: $color-danger;
}

.tabbar__badge-text {
  font-size: 20rpx;
  line-height: 1;
  color: $color-text-inverse;
}
</style>
