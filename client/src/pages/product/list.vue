<template>
  <view class="page-root plist">
    <!-- 搜索框直接做进导航条：这一页的核心动作就是「搜」，不该藏起来 -->
    <NavBar :back="true" border>
      <template #default>
        <view class="sbox">
          <AppIcon name="search" :size="15" color="#68707E" />
          <input
            class="sbox__input"
            v-model="keywordInput"
            type="text"
            :focus="autoFocus"
            confirm-type="search"
            placeholder="搜索商品名或描述"
            placeholder-class="sbox__ph"
            @confirm="applyKeyword"
            @input="onInput"
          />
          <view v-if="keywordInput" class="sbox__clear" @tap="clearKeyword">
            <AppIcon name="close" :size="14" color="#68707E" />
          </view>
        </view>
      </template>
    </NavBar>

    <!-- ============================================================ 排序条 -->
    <view class="sortbar">
      <view
        v-for="opt in sortTabs"
        :key="opt.value"
        class="sortbar__item"
        :class="{ 'sortbar__item--on': isSortActive(opt.value) }"
        @tap="tapSort(opt.value)"
      >
        <text class="sortbar__text">{{ opt.label }}</text>

        <!--
          价格这一项用 morphicons：升序 ↔ 降序时图形**原地形变**，
          而不是「消失再出现」。这也是全项目唯一一处「同一位置换了图标」的场景，
          正是 morphicons 的用法。H5 之外会自动退回静态图标（AppIcon 内部处理）。
        -->
        <!-- ⚠️ `color` 显式给：小程序端 `<image>` 不吃 CSS color，
             不给的话「综合/销量/最新」选中时不会变橙（下面 `.sortbar__item--on .sortbar__icon` 只在 H5 生效）。-->
        <AppIcon
          v-if="opt.icon"
          class="sortbar__icon"
          :name="opt.icon"
          :morph-to="opt.value === 'price' ? priceIconTarget : ''"
          morphable
          :size="14"
          :stroke-width="2.2"
          :color="isSortActive(opt.value) ? COLOR.action : COLOR.textMuted"
        />
      </view>
    </view>

    <view class="page-body plist__body">
      <!-- 首屏骨架 -->
      <view v-if="pager.isFirstLoading.value" class="sklist">
        <view v-for="i in 4" :key="`s${i}`" class="surface skrow">
          <view class="sk sk--thumb" />
          <view class="skrow__body">
            <view class="sk sk--line" style="width: 70%" />
            <view class="sk sk--line" style="width: 40%" />
          </view>
        </view>
      </view>

      <EmptyState
        v-else-if="pager.firstError.value"
        variant="error"
        desc="商品列表没拿到"
        action-text="重新加载"
        @action="reload"
      />

      <EmptyState
        v-else-if="pager.isEmpty.value"
        :variant="activeKeyword ? 'search' : 'empty'"
        :title="activeKeyword ? `没有找到「${activeKeyword}」` : '这个分类还没有商品'"
        :desc="
          activeKeyword
            ? '换个关键词试试，比如「可乐」「抽纸」「泡面」'
            : '先去别的分类逛逛，或者直接搜商品名'
        "
        action-text="随便逛逛"
        @action="goHome"
      />

      <template v-else>
        <!-- 结果条：告诉了用户「你在看什么」，也是返回全部的唯一入口 -->
        <view v-if="activeKeyword || categoryId" class="resultbar">
          <text class="resultbar__text">
            {{ activeKeyword ? `「${activeKeyword}」` : categoryLabel }}
            共 {{ pager.total.value }} 件
          </text>
          <view class="resultbar__reset" @tap="resetFilters">
            <AppIcon name="close" :size="12" color="#68707E" />
            <text class="resultbar__reset-text">清除筛选</text>
          </view>
        </view>

        <view class="sklist">
          <ProductCard
            v-for="p in pager.list.value"
            :key="p.id"
            :product="p"
            mode="list"
            @tap="goDetail(p.id)"
            @add="quickAdd(p)"
          />
        </view>

        <LoadMore
          :state="pager.state.value"
          :empty="pager.isEmpty.value"
          @retry="pager.retry"
        />
      </template>
    </view>

    <AppTabBar :items="tabs" active="home" />
  </view>
</template>

<script setup>
/**
 * 商品列表 / 搜索页
 *
 * 一个页面同时承担三种进入方式，靠 query 区分：
 *   ?categoryId=1   从分类/首页进来，看某个分类
 *   ?keyword=可乐    带词进来，直接搜
 *   ?focus=1         从搜索入口进来，自动聚焦输入框
 *
 * 排序条故意做成 4 项而不是把「价格↑」「价格↓」拆成两项 ——
 * 5 个 chip 在 375 宽的屏上会挤成两行，而且升/降序本来就是同一个维度的两个方向。
 *
 * 搜索是**防抖实时搜**（400ms），不是「按回车才搜」。理由：宿舍小超市的商品
 * 数量在几十条量级，实时搜的体验收益大于请求成本；回车也照样支持。
 */
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppTabBar from '../../components/AppTabBar.vue';
import EmptyState from '../../components/EmptyState.vue';
import LoadMore from '../../components/LoadMore.vue';
import ProductCard from '../../components/ProductCard.vue';
import { catalogApi } from '../../api/catalog';
import { usePagedList } from '../../composables/usePagedList';
import { useCartStore } from '../../store/cart';
import { useUserStore } from '../../store/user';
import { tabsOfRole } from '../../utils/tabs';
import { COLOR } from '../../utils/colors';

const userStore = useUserStore();
const cartStore = useCartStore();

const keywordInput = ref('');
/** 真正提交给后端的词 —— 与输入框分开，防抖期间列表不会来回闪 */
const activeKeyword = ref('');
const categoryId = ref(0);
const categoryLabel = ref('');
const sortBy = ref('default');
const autoFocus = ref(false);

const tabs = computed(() =>
  tabsOfRole(userStore.currentRole || 'CUSTOMER').map((t) =>
    t.key === 'cart' ? { ...t, badge: cartStore.badge } : t,
  ),
);

/** 排序条：价格只占一格，点一下在升/降之间切 */
const sortTabs = [
  { value: 'default', label: '综合' },
  { value: 'sales', label: '销量' },
  { value: 'price', label: '价格', icon: 'sort-asc' },
  { value: 'newest', label: '最新' },
];

/**
 * 价格这一格的图标：升序 ↔ 降序时原地形变
 *
 * 注意方向 —— 图标表达的是**当前**排序方向，不是「点一下会变成什么」。
 * 没按价格排序时也显示升序图标（中性的「可按价格排」暗示），
 * 所以第一次点会从「中性态」变成升序，第二次点才真正发生 asc↔desc 的形变。
 */
const priceIconTarget = computed(() => (sortBy.value === 'price_desc' ? 'sort-desc' : 'sort-asc'));

function isSortActive(value) {
  if (value === 'price') return sortBy.value === 'price_asc' || sortBy.value === 'price_desc';
  return sortBy.value === value;
}

function tapSort(value) {
  if (value === 'price') {
    // 第一次点价格默认升序（便宜的先看，符合宿舍场景）
    sortBy.value = sortBy.value === 'price_asc' ? 'price_desc' : 'price_asc';
  } else if (sortBy.value === value) {
    return;
  } else {
    sortBy.value = value;
  }
  reload();
}

const pager = usePagedList((page, pageSize) =>
  catalogApi.products({
    categoryId: categoryId.value || undefined,
    keyword: activeKeyword.value || undefined,
    sortBy: sortBy.value,
    page,
    pageSize,
  }),
);

let debounceTimer = null;

function onInput() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    applyKeyword();
  }, 400);
}

function applyKeyword() {
  const next = keywordInput.value.trim();
  if (next === activeKeyword.value) return;
  activeKeyword.value = next;
  reload();
}

function clearKeyword() {
  keywordInput.value = '';
  applyKeyword();
}

function resetFilters() {
  keywordInput.value = '';
  activeKeyword.value = '';
  categoryId.value = 0;
  categoryLabel.value = '';
  sortBy.value = 'default';
  reload();
}

function reload() {
  pager.clear();
  pager.load(true).catch(() => {});
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
    /* request 层已提示 */
  }
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/product/detail?id=${id}` });
}

function goHome() {
  uni.reLaunch({ url: '/pages/home/home' });
}

onLoad(async (options) => {
  const kw = decodeURIComponent(options?.keyword || '');
  if (kw) keywordInput.value = kw;
  activeKeyword.value = kw;

  categoryId.value = Number(options?.categoryId) || 0;
  categoryLabel.value = options?.title ? decodeURIComponent(options.title) : '';

  autoFocus.value = options?.focus === '1';

  await pager.load(true);
});

onShow(() => {
  cartStore.refresh();
});

/**
 * 触底加载下一页
 *
 * ⚠️ 这个钩子**以前漏了**，而页面底部照样渲染了 `<LoadMore>`、分页器也照样按 10 条一页
 * 在跑 —— 于是搜「可乐」这类热门词时，第一页 10 条之后就**永远看不到第二页**，
 * 而底部那行「上拉加载更多」是骗人的（用户上拉什么都不会发生）。
 * 「组件在、逻辑没接线」是这类 bug 最难发现的一种：代码看起来齐了，行为却是残的。
 * 所以每个用 usePagedList 的列表页都要确认这行存在。
 */
onReachBottom(() => {
  pager.loadMore();
});

onPullDownRefresh(async () => {
  await pager.load(true);
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.plist {
  background-color: $color-bg-app;
}

/* ============================================================== 导航条搜索框 */
.sbox {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 $space-3;
  border-radius: $radius-pill;
  background-color: $color-surface-2;
}

.sbox__input {
  flex: 1;
  min-width: 0;
  height: 34px;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.sbox__ph {
  color: $color-text-muted;
  font-size: $font-size-sm;
}

/* 清空：热区靠 padding 撑到 ~30px，在小尺寸输入框里够用 */
.sbox__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: $radius-pill;
  background-color: $color-surface-sunken;
}

/* ================================================================ 排序条 */
.sortbar {
  display: flex;
  align-items: center;
  height: 44px;
  background-color: $color-surface;
  border-bottom: 1px solid $color-border-subtle;
}

.sortbar__item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 44px;
}

.sortbar__text {
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.sortbar__icon {
  color: $color-text-muted;
}

.sortbar__item--on .sortbar__text {
  color: $color-action;
  font-weight: $font-weight-semibold;
}

.sortbar__item--on .sortbar__icon {
  color: $color-action;
}

/* ================================================================ 列表 */
.plist__body {
  padding: $space-3 $space-4 0;
}

.resultbar {
  display: flex;
  align-items: center;
  padding: 0 2px $space-2;
}

.resultbar__text {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.resultbar__reset {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 3px;
}

.resultbar__reset-text {
  font-size: $font-size-xs;
  color: $color-action;
}

.sklist {
  display: flex;
  flex-direction: column;
  gap: $space-2;
}

/* 抵消全局 `.surface + .surface{ margin-top }`，否则骨架行的间距会翻倍 */
.skrow + .skrow {
  margin-top: 0;
}

.skrow {
  display: flex;
  gap: $space-3;
  padding: $space-3;
}

/*
 * 真实列表**不要**再给 ProductCard 套 .skrow / .skrow--card。
 *
 * 踩坑记录：曾经写过 `.skrow--card { display: block }` 想「重置骨架行样式」，
 * 结果页面级样式把组件自己的 `.pcard--list { display: flex }` 覆盖掉了
 * （两者特异性相同，靠源码顺序决胜），列表卡直接退化成 block —— 图和文字竖排，
 * 缩略图旁边留一大片空白。修法不是加 !important，而是**不要在页面里重定义
 * 组件的布局**：卡片自顾自的 display / padding / 圆角都由组件负责，
 * 页面只管「它们之间的间距」（.sklist 的 gap 就干这个）。
 */

.skrow__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.sk {
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 37%, #eef0f4 63%);
  background-size: 400% 100%;
  border-radius: $radius-xs;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk--thumb {
  width: 80px;
  height: 80px;
  flex: none;
  border-radius: $radius-sm;
}

.sk--line {
  height: 13px;
}

@keyframes sk-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
