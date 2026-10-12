<template>
  <!--
    正方形外框用「height:0 + padding-bottom:100%」而不是 aspect-ratio。
    原因：商品图一定 1:1，而 aspect-ratio 在部分小程序的 WebView 上支持不全；
    padding-bottom 百分比是相对**宽度**算的，这是所有平台都稳的古老技巧。

    ⚠️ 这一对属性必须写在内层 .pimg__sq 上，不能写在外层 .pimg 上。
    padding 百分比是相对「包含块的宽度」算的 —— 外层 .pimg 的包含块是它所在的
    那一行（可能是 326px 宽的 flex 行），于是 112rpx 的缩略图会被撑成 326px 高。
    放到内层后，内层的包含块就是 .pimg 自己（它有固定宽度），100% 才真正等于自身宽。
    踩坑记录：这个 bug 在 size="100%" 的网格里看不出来（父宽 == 自身宽），
    只有「固定尺寸缩略图 + 宽容器」的组合会暴露。
  -->
  <view class="pimg" :class="`pimg--${radius}`" :style="`width:${size};`">
    <view class="pimg__sq">
      <view class="pimg__box">
        <!-- 有图：铺满裁切 -->
        <image
          v-if="src && !failed"
          class="pimg__img"
          :src="src"
          mode="aspectFill"
          @error="failed = true"
        />

        <!-- 没图（或图挂了）：字标占位 -->
        <view v-else class="pimg__mono">
          <text class="pimg__char" :style="{ color: tint[1], fontSize: monoSize }">{{ mono }}</text>

          <!-- 只有「图加载失败」才加这个小角标。
               纯「没配图」不加 —— 别把「暂无图片」渲染成「出错了」 -->
          <view v-if="failed" class="pimg__broken">
            <AppIcon name="image-error" :size="11" color="#ffffff" />
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 商品图（永远正方形）
 *
 * ── 为什么必须有个占位实现 ─────────────────────────────────────────────
 * 种子数据里 `cover_image` **全是空字符串**。宿舍小超市的真实情况也是：
 * 学生用手机拍的照片不会立刻入库，MVP 阶段大部分商品是没图的。
 * 所以「无图」必须是**一等状态**，而不是等图挂了再想办法 ——
 * 直接 `src=""` 会渲染成碎图图标，整个网格看上去像坏了。
 *
 * ── 为什么用「字标」而不是灰色图标 ─────────────────────────────────────
 * 字标（取商品名第一个字）+ 由名字哈希决定的稳定配色，
 * 在 2 列网格里能被直接认出来；而且**同一个商品每次进来颜色都一样**，不会闪。
 *
 * ── monoSize 为什么要调用方传 ─────────────────────────────────────────
 * 字标字号得跟着容器走。CSS 里没有「相对容器宽度」的单位
 * （cqw 在小程序端不支持），而 size 可能是 '100%' 这种算不出数值的字符串，
 * 所以干脆让调用方按自己那一档手写，ProductCard 里就是按 grid/list 两档给的。
 */
import { computed, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import { monogramOf, monogramTint } from '../utils/format';

const props = defineProps({
  src: { type: String, default: '' },
  /** 商品名，用来生成字标 */
  name: { type: String, default: '' },
  /** **宽度**，高度自动按 1:1。如 '160rpx' / '100%' */
  size: { type: String, default: '100%' },
  /** 圆角档位：sm 列表缩略图 / md 网格卡 / none 详情主图 */
  radius: { type: String, default: 'sm' },
  /** 字标字号，必须显式传，见上方注释 */
  monoSize: { type: String, default: '48rpx' },
});

/** 图片加载失败也要退回字标 —— 后台配的图可能失效 */
const failed = ref(false);
watch(
  () => props.src,
  () => {
    failed.value = false;
  },
);

const mono = computed(() => monogramOf(props.name));
const tint = computed(() => monogramTint(props.name));
</script>

<style lang="scss" scoped>
.pimg {
  position: relative;
  /* 只负责「多宽」和「裁圆角」。高度交给内层的 padding 技巧撑 */
  overflow: hidden;
  flex: none;
  /* 有图时用中性底，避免透明 PNG 露白；没图时就是字标的底 */
  background-color: $color-surface-2;
}

/*
 * 正方形就是这一句。
 * padding 百分比相对**包含块宽度**算，而 .pimg__sq 的包含块正是有固定宽的 .pimg，
 * 所以 100% == 自身宽度 —— 这才是真正想要的效果。
 */
.pimg__sq {
  position: relative;
  height: 0;
  padding-bottom: 100%;
}

.pimg--sm {
  border-radius: $radius-sm;
}

.pimg--md {
  border-radius: $radius-md;
}

.pimg--none {
  border-radius: 0;
}

/* 绝对定位铺满那个正方形 */
.pimg__box {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.pimg__img {
  display: block;
  width: 100%;
  height: 100%;
}

.pimg__mono {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pimg__char {
  line-height: 1;
  font-weight: $font-weight-semibold;
}

.pimg__broken {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30rpx;
  height: 30rpx;
  border-top-left-radius: $radius-xs;
  background-color: rgba(0, 0, 0, 0.42);
}
</style>
