<template>
  <view class="page-root home">
    <!-- ============================================================ 头部 -->
    <!--
      橙色渐变头。颜色用 $color-action → $color-action-pressed 这一对**已有 token**，
      因为白字压在这两个色上实测是 4.90:1 / 6.29:1，都过 WCAG AA。
      （品牌鲜艳橙 #FF6A2B 白字只有 2.86:1，只能做装饰，不能当底写字。）
    -->
    <view class="hero">
      <view class="hero__status" :style="{ height: statusBarHeight + 'px' }" />

      <view class="hero__top">
        <view class="hero__brand">
          <AppIcon name="store" :size="20" color="rgba(255,255,255,0.9)" />
          <text class="hero__name">宿舍小超市</text>
        </view>
        <view class="hero__tag icon-line">
          <AppIcon name="truck" :size="12" color="#ffffff" />
          <text class="hero__tag-text">送到宿舍门口</text>
        </view>
      </view>

      <view class="hero__search" hover-class="hero__search--hover" :hover-stay-time="60" @tap="goSearch">
        <AppIcon name="search" :size="16" color="#68707E" />
        <text class="hero__search-ph">搜索饮料、零食、日用品…</text>
      </view>
    </view>

    <!-- ============================================================ 主体 -->
    <view class="page-body home__body">
      <!-- 首屏骨架 -->
      <template v-if="showSkeleton">
        <view class="surface block">
          <view class="sk-row" v-for="i in 4" :key="`c${i}`">
            <view class="sk sk--circle" />
            <view class="sk sk--line" style="width: 60%" />
          </view>
        </view>
        <view class="surface block">
          <view class="sk sk--line" style="width: 30%; height: 18px" />
          <view class="sk sk--line" style="width: 100%; height: 64px; margin-top: 12px" />
          <view class="sk sk--line" style="width: 100%; height: 64px; margin-top: 12px" />
        </view>
      </template>

      <!-- 整页失败 -->
      <EmptyState
        v-else-if="loadError"
        variant="error"
        desc="首屏数据没拿到，检查一下后端服务是不是在跑"
        action-text="重新加载"
        @action="loadHome"
      />

      <template v-else>
        <!-- ---------------------------------------------------- 分类宫格 -->
        <view class="surface block">
          <view class="block__head">
            <text class="block__title">商品分类</text>
            <view class="block__more icon-line" @tap="goCategory()">
              <text class="block__more-text">全部分类</text>
              <AppIcon name="forward" :size="13" color="#68707E" />
            </view>
          </view>

          <view class="cats">
            <view
              v-for="cat in categories"
              :key="cat.id"
              class="cats__item"
              hover-class="cats__item--hover"
              :hover-stay-time="60"
              @tap="goCategory(cat.id)"
            >
              <view class="cats__icon">
                <AppIcon :name="iconForCategory(cat)" :size="24" color="#C7450A" :stroke-width="1.9" />
              </view>
              <text class="cats__name ellipsis">{{ cat.name }}</text>
            </view>
          </view>
        </view>

        <!-- ---------------------------------------------------- 热销榜 -->
        <view class="surface block">
          <view class="block__head">
            <view class="block__title-wrap">
              <AppIcon name="hot" :size="16" color="#D93A3F" />
              <text class="block__title">热销榜</text>
            </view>
            <text class="block__sub">同学们都在买</text>
          </view>

          <EmptyState
            v-if="!hotProducts.length"
            variant="empty"
            title="还没有卖出过商品"
            desc="等第一单送达后这里就会出现排行"
          />

          <view v-else class="rank">
            <view
              v-for="(p, i) in hotProducts"
              :key="p.id"
              class="rank__row"
              hover-class="rank__row--hover"
              :hover-stay-time="60"
              @tap="goDetail(p.id)"
            >
              <text class="rank__no" :class="`rank__no--${i + 1}`">{{ i + 1 }}</text>
              <ProductImage
                :src="p.coverImage"
                :name="p.name"
                size="112rpx"
                mono-size="40rpx"
                radius="sm"
              />
              <view class="rank__info">
                <text class="rank__name ellipsis">{{ p.name }}</text>
                <text class="rank__sales">{{ formatSales(p.salesCount) }} · {{ p.unit }}</text>
              </view>
              <PriceText :value="p.price" size="sm" />
            </view>
          </view>
        </view>

        <!-- ---------------------------------------------------- 新品尝鲜 -->
        <view class="surface block">
          <view class="block__head">
            <view class="block__title-wrap">
              <AppIcon name="new" :size="16" color="#C7450A" />
              <text class="block__title">新品尝鲜</text>
            </view>
            <view class="block__more" @tap="goSearch">
              <text class="block__more-text">更多</text>
              <AppIcon name="forward" :size="13" color="#68707E" />
            </view>
          </view>

          <EmptyState
            v-if="!newProducts.length"
            variant="empty"
            title="还没有上架商品"
            desc="店主上新后会显示在这里"
          />

          <view v-else class="grid">
            <view v-for="p in newProducts" :key="p.id" class="grid__cell">
              <ProductCard
                class="grid__card"
                :product="p"
                mode="grid"
                @tap="goDetail(p.id)"
                @add="quickAdd(p)"
              />
            </view>
          </view>
        </view>

        <view class="footnote">
          <text class="footnote__text">线上下单 · 线下送到宿舍 · 当面结算</text>
        </view>
      </template>
    </view>

    <AppTabBar :items="tabs" active="home" />
  </view>
</template>

<script setup>
/**
 * 顾客首页
 *
 * 一次 GET /home 拿齐 categories + hotProducts + newProducts，不发三次请求。
 * 所以这一页**没有分页**：首页只展示「入口 + 榜单 + 新品」，看全部去分类页/列表页。
 *
 * 三个细节：
 *   1) 未登录也能看（/home 是 @Public），所以这一页不弹登录、不拦人
 *   2) 首屏用骨架屏而不是「加载中…」，因为版式是已知的，占位能避免内容跳一下
 *   3) 购物车角标在 onShow 刷新 —— 从商详页加购回来，角标要立刻对
 */
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import AppIcon from '../../components/AppIcon.vue';
import AppTabBar from '../../components/AppTabBar.vue';
import EmptyState from '../../components/EmptyState.vue';
import PriceText from '../../components/PriceText.vue';
import ProductCard from '../../components/ProductCard.vue';
import ProductImage from '../../components/ProductImage.vue';
import { catalogApi } from '../../api/catalog';
import { useCartStore } from '../../store/cart';
import { useUserStore } from '../../store/user';
import { getStatusBarHeight } from '../../utils/system';
import { formatSales } from '../../utils/format';
import { iconForCategory } from '../../utils/icons';
import { tabsOfRole } from '../../utils/tabs';

const userStore = useUserStore();
const cartStore = useCartStore();

const statusBarHeight = getStatusBarHeight();

const loading = ref(false);
const ready = ref(false);
const loadError = ref(null);

const categories = ref([]);
const hotProducts = ref([]);
const newProducts = ref([]);

const tabs = computed(() =>
  tabsOfRole(userStore.currentRole || 'CUSTOMER').map((t) =>
    t.key === 'cart' ? { ...t, badge: cartStore.badge } : t,
  ),
);

/** 只有「第一次还没拿到数据」才显示骨架；下拉刷新时保持旧内容，避免整页闪一下 */
const showSkeleton = computed(() => !ready.value && loading.value);

async function loadHome() {
  loading.value = true;
  try {
    const data = await catalogApi.home();
    categories.value = data?.categories || [];
    // 热销榜只展示前三 —— 榜单长了就不像榜单了
    hotProducts.value = (data?.hotProducts || []).slice(0, 3);
    // 新品取前 4，正好两行网格
    newProducts.value = (data?.newProducts || []).slice(0, 4);
    ready.value = true;
    loadError.value = null;
  } catch (err) {
    // 仅有旧数据时不整页报错，静默保留内容（下拉刷新失败不该把页面清空）
    if (!ready.value) loadError.value = err;
  } finally {
    loading.value = false;
  }
}

async function quickAdd(product) {
  if (!userStore.isLogin) {
    uni.showToast({ title: '登录后才能加购物车', icon: 'none' });
    setTimeout(() => uni.navigateTo({ url: '/pages/login/login' }), 600);
    return;
  }
  try {
    const count = await cartStore.add(product.id, 1);
    uni.showToast({ title: `已加入购物车（${count} 种）`, icon: 'none' });
  } catch {
    // 库存不足等业务错误已经在 request 层 toast 过
  }
}

function goSearch() {
  uni.navigateTo({ url: '/pages/product/list?focus=1' });
}

function goCategory(categoryId) {
  const q = categoryId ? `?categoryId=${categoryId}` : '';
  // 分类是顶层工作台之一，用 switchTab 语义 —— 但入口是 navigateTo，
  // 因为从首页点进分类要保持返回能回到首页
  uni.navigateTo({ url: `/pages/category/category${q}` });
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/product/detail?id=${id}` });
}

onLoad(() => {
  loadHome();
});

onShow(() => {
  // 加购回来角标要立刻对；未登录时 store 内部会直接归零，不会白打接口
  cartStore.refresh();
});

onPullDownRefresh(async () => {
  await loadHome();
  await cartStore.refresh();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.home {
  background-color: $color-bg-app;
}

/* ==================================================================== 头部 */
.hero {
  padding: 0 $space-4 $space-5;
  background: linear-gradient(160deg, $color-action 0%, $color-action-pressed 100%);
  /* 底部两个圆角，让「头」和「身」有层次，而不是硬切一刀 */
  border-bottom-left-radius: $radius-lg;
  border-bottom-right-radius: $radius-lg;
}

.hero__status {
  width: 100%;
}

.hero__top {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2 0 $space-4;
}

.hero__brand {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hero__name {
  font-size: $font-size-xl;
  font-weight: $font-weight-bold;
  color: $color-text-inverse;
  letter-spacing: 0.5px;
}

.hero__tag {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: $radius-pill;
  /* 半透明白底 + 白字：在深橙底上是「更亮」的一层，不用再算对比度 */
  background-color: rgba(255, 255, 255, 0.18);
}

.hero__tag-text {
  font-size: $font-size-xs;
  color: $color-text-inverse;
}

.hero__search {
  display: flex;
  align-items: center;
  gap: $space-2;
  height: 40px;
  padding: 0 $space-4;
  border-radius: $radius-pill;
  background-color: $color-surface;
}

.hero__search--hover {
  background-color: $color-surface-2;
}

.hero__search-ph {
  font-size: $font-size-sm;
  color: $color-text-muted;
}

/* ==================================================================== 主体 */
.home__body {
  padding: $space-3 $space-4 0;
}

.block {
  padding: $space-4;
  margin-bottom: $space-3;
}

/*
  抵消 App.vue 里那条全局的 `.surface + .surface { margin-top: 12px }`。
  不抵消的话两个相邻卡片的间距会变成 12(自己 margin-bottom) + 12(全局) = 24px，
  看着像分组分错了。这里让「下间距」只由 margin-bottom 提供。
  选择器带了 scoped 属性 → 特异性高于全局那条，能压住。
*/
.block + .block {
  margin-top: 0;
}

.block__head {
  display: flex;
  align-items: center;
  gap: $space-2;
  margin-bottom: $space-3;
}

.block__title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.block__title {
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.block__sub {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.block__more {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
}

.block__more-text {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* ------------------------------------------------------------- 分类宫格 */
.cats {
  display: flex;
  flex-wrap: wrap;
}

.cats__item {
  width: 20%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: $space-2 0;
  border-radius: $radius-sm;
}

.cats__item--hover {
  background-color: $color-surface-2;
}

.cats__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: $radius-md;
  background-color: $color-action-soft;
}

.cats__name {
  max-width: 100%;
  font-size: $font-size-xs;
  color: $color-text-secondary;
  text-align: center;
}

/* --------------------------------------------------------------- 热销榜 */
.rank {
  display: flex;
  flex-direction: column;
}

.rank__row {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-2 0;
  border-radius: $radius-sm;
}

.rank__row--hover {
  background-color: $color-surface-2;
}

/* 名次：前三名给实底强调，第 4 名往后就是普通灰字。
   只改底色深浅、不用金/银/铜色 —— 那三种颜色跟我们的语义色系冲突。 */
.rank__no {
  flex: none;
  width: 22px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  border-radius: $radius-xs;
  font-size: 12px;
  font-weight: $font-weight-bold;
  font-style: italic;
  color: $color-text-inverse;
  background-color: $color-text-disabled;
}

.rank__no--1 {
  background-color: $color-action;
}

.rank__no--2 {
  background-color: #c9723a;
}

.rank__no--3 {
  background-color: #d69a6a;
}

.rank__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rank__name {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.rank__sales {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* ------------------------------------------------------------- 新品网格 */
/* 用外层 cell 控宽，而不是给 ProductCard 加 :deep() ——
   :deep 在小程序端的 scoped 样式里行为不一致，包一层最稳。
   cell 是 flex 容器且默认 align-items: stretch，
   所以同一行的卡片会等高，价格自然对齐。 */
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: $space-3;
}

/*
 * 格子只负责「宽度」和「等高」。
 * 这里的 display:flex 是**故意**的：它让 .grid__card 能靠 flex:1 撑满格子高度，
 * 卡片内部的 .pcard__foot{margin-top:auto} 才能把价格压到同一条水平线上。
 * 注意别在这里写 display 以外的布局属性去改卡片内部排布 ——
 * 卡片是竖排还是横排由 ProductCard 的 .pcard--grid 决定（见 list.vue 里的踩坑注释）。
 */
.grid__cell {
  width: calc((100% - #{$space-3}) / 2);
  display: flex;
}

.grid__card {
  flex: 1;
  border: 1px solid $color-border-subtle;
}

/* ================================================================= 骨架屏 */
.sk-row {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-2 0;
}

.sk {
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 37%, #eef0f4 63%);
  background-size: 400% 100%;
  border-radius: $radius-xs;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk--circle {
  width: 28px;
  height: 28px;
  border-radius: $radius-pill;
  flex: none;
}

.sk--line {
  height: 14px;
}

@keyframes sk-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

/* ==================================================================== 脚注 */
.footnote {
  padding: $space-4 0 $space-6;
  text-align: center;
}

.footnote__text {
  font-size: $font-size-xs;
  color: $color-text-muted;
}
</style>
