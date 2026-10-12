<template>
  <view class="navbar">
    <!-- fixed 时用等高空占位，保证下方内容不被盖住 -->
    <view v-if="fixed" class="navbar__spacer" :style="{ height: totalHeight + 'px' }" />

    <view
      class="navbar__wrap"
      :class="{ 'navbar__wrap--fixed': fixed }"
      :style="{ background: background }"
    >
      <!-- 状态栏占位。自绘导航条最容易漏的就是这一块，漏了内容会顶到刘海下面 -->
      <view class="navbar__status" :style="{ height: statusBarHeight + 'px' }" />

      <view
        class="navbar__bar"
        :class="{ 'navbar__bar--border': border, 'navbar__bar--light': tone === 'light' }"
      >
        <view class="navbar__side navbar__side--left">
          <slot name="left">
            <view
              v-if="showBack"
              class="navbar__back"
              hover-class="navbar__back--active"
              :hover-stay-time="80"
              @tap="handleBack"
            >
              <!--
              ⚠️ `color` 按 `tone` 显式给，不只靠 CSS 的 `.navbar__bar--light { color }`：
              小程序端 `<image>` 不吃 CSS color。首页 / 订单详情是**橙色渐变导航条**，
              不给就是深色返回箭头压橙底 —— 几乎看不清。
            -->
              <AppIcon
                name="back"
                :size="22"
                :stroke-width="2.5"
                :color="tone === 'light' ? '#ffffff' : '#1a1d23'"
              />
            </view>
          </slot>
        </view>

        <view class="navbar__title-box">
          <slot>
            <text class="navbar__title">{{ title }}</text>
          </slot>
        </view>

        <view class="navbar__side navbar__side--right">
          <slot name="right" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 自绘导航条
 *
 * 为什么自绘：pages.json 的 globalStyle 设了 navigationStyle: custom，
 * 因为要按角色切换外观，原生导航条做不到。
 * 代价是**必须自己留出状态栏高度**，否则内容会顶进刘海/状态栏。
 */
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { getStatusBarHeight } from '../utils/system';

const props = defineProps({
  title: { type: String, default: '' },
  /** 是否显示返回箭头；'auto' = 页面栈 > 1 才显示，避免栈底页出现返回箭头点了白屏 */
  back: { type: [Boolean, String], default: 'auto' },
  /** 支持渐变字符串，例如 'linear-gradient(135deg,#C7450A,#A93C08)' */
  background: { type: String, default: '#FFFFFF' },
  /** fixed 固定顶部（自动补占位） */
  fixed: { type: Boolean, default: false },
  /** 底部 1px 分隔线 */
  border: { type: Boolean, default: false },
  /**
   * 前景色。压在深色头部（比如首页的橙色渐变）上时必须传 light，
   * 否则标题和返回箭头会变成深色、糊在背景里。
   */
  tone: { type: String, default: 'dark' },
});

const emit = defineEmits(['back']);

/**
 * 导航条高度
 *
 * ⚠️ 同 AppTabBar：必须用 `uni.upx2px(88)`，不能写死 44。
 * `$navbar-height: 88rpx` 随屏宽缩放，写死 px 的话宽屏机型上
 * 「占位高度（JS 算的）」比「实际渲染高度（CSS 的）」小 6px，
 * 二级页的固定保存栏就会往上偏、压住页面内容。
 */
const BAR_HEIGHT = uni.upx2px(88);

const statusBarHeight = getStatusBarHeight();

const totalHeight = computed(() => statusBarHeight + BAR_HEIGHT);

const showBack = computed(() => {
  if (props.back === 'auto') return getCurrentPages().length > 1;
  return !!props.back;
});

function handleBack() {
  emit('back');
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
  } else {
    // 栈底页（比如从分享链接直接进来）—— 回顾客首页，而不是白屏
    uni.reLaunch({ url: '/pages/home/home' });
  }
}
</script>

<style lang="scss" scoped>
.navbar {
  position: relative;
}

.navbar__spacer {
  width: 100%;
}

.navbar__wrap {
  width: 100%;
}

.navbar__wrap--fixed {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: $z-sticky;
}

.navbar__status {
  width: 100%;
}

.navbar__bar {
  display: flex;
  align-items: center;
  /** 与上面 JS 的 `uni.upx2px(88)` 同一个来源，别改成 px */
  height: 88rpx;
  padding: 0 $space-2;
}

.navbar__bar--border {
  border-bottom: 1px solid $color-border-subtle;
}

.navbar__side {
  display: flex;
  align-items: center;
  /* 左右等宽，标题才能真正居中 */
  min-width: 44px;
}

.navbar__side--right {
  justify-content: flex-end;
}

/* 触控热区 44px（图标本身小一点没关系） */
.navbar__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: $radius-pill;
  color: $color-text-primary;
}

.navbar__back--active {
  background-color: rgba(0, 0, 0, 0.06);
}

.navbar__title-box {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-width: 0;
}

.navbar__title {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 压在深色头部上：白字 + 白图标。按压态也换成白色叠层，
   否则 rgba(0,0,0,.06) 在橙底上完全看不出来 */
.navbar__bar--light {
  .navbar__title,
  .navbar__back {
    color: $color-text-inverse;
  }

  .navbar__back--active {
    background-color: rgba(255, 255, 255, 0.18);
  }
}
</style>
