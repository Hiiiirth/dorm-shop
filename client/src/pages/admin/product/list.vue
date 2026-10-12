<template>
  <view class="page-root plist">
    <NavBar title="商品管理" :back="true" border />

    <!-- ================================================ 搜索 + 排序 -->
    <view class="toolbar">
      <view class="searchbox">
        <AppIcon name="search" :size="15" color="#9AA2AF" />
        <input
          class="searchbox__input"
          type="text"
          v-model="keyword"
          placeholder="商品名 / 副标题"
          placeholder-class="searchbox__ph"
          confirm-type="search"
          @input="onSearchInput"
          @confirm="applySearch"
        />
        <view v-if="keyword" class="searchbox__clear" @tap="clearSearch">
          <AppIcon name="close" :size="12" color="#9AA2AF" />
        </view>
      </view>
    </view>

    <!-- ================================================ 分类筛选（横向滚动） -->
    <scroll-view class="cats" scroll-x :show-scrollbar="false">
      <view class="cats__inner">
        <view
          class="cat"
          :class="{ 'cat--on': categoryId === 0 }"
          @tap="switchCategory(0)"
        >
          <text class="cat__text">全部</text>
          <text v-if="countAll > 0" class="cat__count">{{ countAll }}</text>
        </view>
        <view
          v-for="c in categoryOptions"
          :key="c.id"
          class="cat"
          :class="{ 'cat--on': categoryId === c.id }"
          @tap="switchCategory(c.id)"
        >
          <text class="cat__text">{{ c.name }}</text>
          <text v-if="c.productCount > 0" class="cat__count">{{ c.productCount }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- ================================================ 已生效的筛选条件 -->
    <view v-if="hasFilter" class="chips">
      <view class="chip" @tap="clearFilters">
        <text class="chip__text">{{ filterSummary }}</text>
        <AppIcon name="close" :size="11" color="#c7450a" />
      </view>
    </view>

    <view class="page-body plist__body">
      <!-- 首屏骨架 -->
      <view v-if="pager.isFirstLoading.value" class="sklist">
        <view v-for="i in 4" :key="`sk${i}`" class="surface skcard">
          <view class="sk sk--thumb" />
          <view class="sk sk--line" style="width: 60%" />
        </view>
      </view>

      <EmptyState
        v-else-if="pager.firstError.value"
        variant="error"
        desc="商品列表没拿到"
        action-text="重新加载"
        @action="pager.retry()"
      />

      <EmptyState
        v-else-if="!isAdmin"
        variant="empty"
        icon="switch-role"
        title="需要切换到店长身份"
        desc="这个页面是店长工作台，切换身份后才能看到"
        action-text="去切换身份"
        @action="goSwitchRole"
      />

      <EmptyState
        v-else-if="pager.isEmpty.value"
        :variant="hasFilter ? 'search' : 'empty'"
        :title="hasFilter ? '没有符合条件的商品' : '还没有商品'"
        :desc="hasFilter ? '换个关键词或分类再看看' : '点右下角的加号添加第一个商品'"
        :action-text="hasFilter ? '清除筛选' : ''"
        @action="hasFilter ? clearFilters() : null"
      />

      <template v-else>
        <!-- ============================================ 商品行 -->
        <view
          v-for="p in pager.list.value"
          :key="p.id"
          class="surface prow"
          hover-class="prow--hover"
          :hover-stay-time="80"
          @tap="goEdit(p.id)"
        >
          <!--
            ⚠️ 不要加 `v-if="p.coverImage"`：
            种子数据 / 刚建的新商品 cover_image 全是空串，加了 v-if 就等于
            「没图就不显示缩略图」，列表左边空一块，看起来像加载失败。
            ProductImage 自己就处理了无图（退回首字字标 + 稳定配色），跟顾客端一致。
          -->
          <view class="prow__thumb">
            <ProductImage
              :src="p.coverImage"
              :name="p.name"
              size="52px"
              mono-size="18px"
            />
          </view>

          <view class="prow__main">
            <view class="prow__titlerow">
              <text class="prow__name">{{ p.name }}</text>
              <!-- 停用的用灰色标签，和「上架中」区分开 -->
              <text class="st" :class="p.status === 1 ? 'st--on' : 'st--off'">
                {{ p.status === 1 ? '上架中' : '已下架' }}
              </text>
            </view>

            <text v-if="p.subtitle" class="prow__sub">{{ p.subtitle }}</text>

            <view class="prow__metarow">
              <PriceText :value="p.price" size="sm" tone="action" />
              <text v-if="p.originalPrice" class="prow__origin">
                <PriceText :value="p.originalPrice" size="xs" tone="muted" />
              </text>
              <text class="prow__stock" :class="{ 'prow__stock--low': isLowStock(p) }">
                库存 {{ p.stock }} {{ p.unit }}
              </text>
            </view>

            <text class="prow__cat">{{ categoryNameOf(p.categoryId) }} · 已售 {{ p.salesCount }}</text>
          </view>

          <!-- 操作区：上下架开关 + 更多 -->
          <view class="prow__ops" @tap.stop>
            <!--
              上下架用「开关」而不是按钮：
              这是最高频的操作（补货、临时下架），开关比点两次「上/下架」按钮快。
              开关本体是 checkbox，所以放在整行的点击区里会误触发进详情 ——
              外面那层 @tap.stop 就是干这个的。
            -->
            <view class="switchrow" @tap="toggleShelf(p)">
              <view class="switch" :class="{ 'switch--on': p.status === 1 }">
                <view class="switch__knob" />
              </view>
            </view>

            <view class="prow__more" hover-class="prow__more--hover" @tap="openSheet(p)">
              <AppIcon name="more" :size="16" color="#68707e" />
            </view>
          </view>
        </view>

        <LoadMore
          :state="pager.state.value"
          :empty="pager.isEmpty.value"
          @retry="pager.retry()"
        />
      </template>

      <view class="plist__pad" />
    </view>

    <!-- ================================================ 浮动「新增」按钮 -->
    <view class="fab" hover-class="fab--hover" @tap="createProduct">
      <AppIcon name="plus" :size="20" color="#ffffff" />
    </view>

    <!-- ================================================ 更多操作 -->
    <ConfirmSheet
      v-model="sheet.show"
      title="这个商品"
      :desc="sheet.product ? `${sheet.product.name}（库存 ${sheet.product.stock}）` : ''"
      confirm-text="删除"
      danger
      :loading="actingId === sheet.product?.id && actingAction === 'remove'"
      @confirm="doRemove"
      @cancel="closeSheet"
    >
      <view class="spane">
        <view class="spane__row" @tap="doToggleShelf">
          <AppIcon :name="sheet.product?.status === 1 ? 'default-off' : 'default-on'" :size="15" color="#3c4658" />
          <text class="spane__text">
            {{ sheet.product?.status === 1 ? '下架（顾客端看不到）' : '上架' }}
          </text>
        </view>
        <view class="spane__row" @tap="doEdit">
          <AppIcon name="edit" :size="15" color="#3c4658" />
          <text class="spane__text">编辑信息</text>
        </view>
        <text class="spane__tip">删除是软删除，且会同时从所有人的购物车里移除</text>
      </view>
    </ConfirmSheet>
  </view>
</template>

<script setup>
/**
 * 商品列表（二级页，不挂底部 tab）
 *
 * 后端契约（实测确认，别猜）：
 *   GET /admin/products → { list: ProductListVo[], page, pageSize, total, hasMore }
 *   ProductListVo = { id, categoryId, name, subtitle, coverImage,
 *                     price(分), originalPrice(分|null), unit,
 *                     stock, salesCount, status(1上架 0下架) }
 *   GET /admin/products/category-options → { id, name, parentId, productCount }[]
 *   DELETE /admin/products/:id → 有在办订单时 40007（提示改用「下架」）
 *
 * 两个设计决定：
 *
 * 1) **上下架用开关，不用按钮。** 这是店长最高频的操作（补货、临时下架），
 *    开关一次点中；用按钮得点「···」再点一下。代价是必须给开关加 `@tap.stop`，
 *    否则会连带触发整行进详情。
 *
 * 2) **删除藏在「···」里，而且要二次确认。** 删除会连带清掉所有人的购物车，
 *    属于不可逆操作；而上下架可逆、可随手改，所以给它们更高的入口权重。
 */
import { computed, ref, watch } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import NavBar from '../../../components/NavBar.vue';
import AppIcon from '../../../components/AppIcon.vue';
import EmptyState from '../../../components/EmptyState.vue';
import LoadMore from '../../../components/LoadMore.vue';
import ConfirmSheet from '../../../components/ConfirmSheet.vue';
import ProductImage from '../../../components/ProductImage.vue';
import PriceText from '../../../components/PriceText.vue';
import { adminApi } from '../../../api/admin';
import { useAdminGuard, goSwitchRole } from '../../../composables/useAdminGuard';
import { usePagedList } from '../../../composables/usePagedList';
import { toErrorMessage } from '../../../utils/money';

/** 身份守卫：不是店长时一个请求都不发 */
const isAdmin = useAdminGuard();

const keyword = ref('');
const categoryId = ref(0);
/** 缓存分类选项，兼作「每个分类有几个商品」的计数来源 */
const categoryOptions = ref([]);
const countAll = ref(0);

const actingId = ref(0);
const actingAction = ref('');

const pager = usePagedList((page, pageSize) =>
  adminApi.productList({
    categoryId: categoryId.value || undefined,
    keyword: keyword.value || undefined,
    page,
    pageSize,
  }),
);

const hasFilter = computed(() => keyword.value.trim() !== '' || categoryId.value !== 0);

const filterSummary = computed(() => {
  const parts = [];
  if (keyword.value.trim()) parts.push(`「${keyword.value.trim()}」`);
  if (categoryId.value !== 0) {
    const hit = categoryOptions.value.find((c) => c.id === categoryId.value);
    if (hit) parts.push(hit.name);
  }
  return parts.join(' · ');
});

// ===========================================================================
// 数据
// ===========================================================================

async function loadOptions() {
  try {
    const res = await adminApi.categoryOptions();
    categoryOptions.value = Array.isArray(res) ? res : [];
    // 「全部」的计数 = 所有分类商品数之和。
    // ⚠️ 不能写死成某个数字：库里商品会被增删，写死必然误报。
    countAll.value = categoryOptions.value.reduce((sum, c) => sum + (Number(c.productCount) || 0), 0);
  } catch {
    // 分类选项挂了不该让整个列表挂掉，退化成「只有全部」这一项
    categoryOptions.value = [];
    countAll.value = 0;
  }
}

async function load() {
  if (!isAdmin.value) return;
  await Promise.all([pager.load(true), loadOptions()]);
}

async function applyFilters() {
  if (!isAdmin.value) {
    pager.clear();
    return;
  }
  await pager.load(true);
}

function switchCategory(id) {
  if (categoryId.value === id) return;
  categoryId.value = id;
  applyFilters();
}

/**
 * 边打边搜（防抖 400ms），和顾客端 `pages/product/list.vue`、
 * 管理端 `admin/user/list.vue` 同一套手感。回车 @confirm 保留 —— 能立刻结束等待。
 */
let searchTimer = null;
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(), 400);
}

async function applySearch() {
  // 回车 / 防抖到期都会走到这里，清掉挂起的定时器避免重复请求
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  await applyFilters();
}

async function clearSearch() {
  keyword.value = '';
  await applySearch();
}

function clearFilters() {
  keyword.value = '';
  categoryId.value = 0;
  applySearch();
}

// ===========================================================================
// 行内展示辅助
// ===========================================================================

function categoryNameOf(id) {
  const hit = categoryOptions.value.find((c) => c.id === id);
  return hit ? hit.name : '未分类';
}

/** 库存 ≤5 标红：店长扫一眼就知道该补货了 */
function isLowStock(p) {
  return p.status === 1 && Number(p.stock) <= 5;
}

// ===========================================================================
// 操作
// ===========================================================================

async function toggleShelf(p) {
  if (!isAdmin.value || actingId.value) return;
  const next = p.status === 1 ? 0 : 1;
  actingId.value = p.id;
  actingAction.value = 'shelf';
  try {
    const detail = await adminApi.updateProduct(p.id, { status: next });
    replaceProduct(detail);
    uni.showToast({ title: next === 1 ? '已上架' : '已下架', icon: 'none' });
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '操作失败'), icon: 'none' });
  } finally {
    actingId.value = 0;
    actingAction.value = '';
  }
}

/** 后端 PUT 返回的是完整详情，直接替换列表里的那一行 */
function replaceProduct(detail) {
  const idx = pager.list.value.findIndex((it) => it.id === detail.id);
  if (idx >= 0) {
    const next = pager.list.value.slice();
    next[idx] = { ...next[idx], ...detail };
    pager.list.value = next;
  }
  // 分类计数会跟着变（上下架不改数量，但删除会）→ 刷新一次
  loadOptions();
}

// ---------------------------------------------------------------- 更多面板
const sheet = ref({ show: false, product: null });

function openSheet(p) {
  sheet.value = { show: true, product: p };
}

function closeSheet() {
  sheet.value = { ...sheet.value, show: false };
}

async function doToggleShelf() {
  const p = sheet.value.product;
  if (!p) return;
  closeSheet();
  await toggleShelf(p);
}

function doEdit() {
  const p = sheet.value.product;
  if (!p) return;
  closeSheet();
  goEdit(p.id);
}

async function doRemove() {
  const p = sheet.value.product;
  if (!p) return;
  actingId.value = p.id;
  actingAction.value = 'remove';
  try {
    await adminApi.removeProduct(p.id);
    uni.showToast({ title: '已删除', icon: 'none' });
    closeSheet();
    await pager.load(true);
    loadOptions();
  } catch (err) {
    // 40007（有在办订单）这类提示**原样展示**，店长需要知道到底缺什么
    uni.showToast({ title: toErrorMessage(err, '删除失败'), icon: 'none', duration: 2500 });
  } finally {
    actingId.value = 0;
    actingAction.value = '';
  }
}

// ---------------------------------------------------------------- 导航
function goEdit(id) {
  uni.navigateTo({ url: `/pages/admin/product/edit?id=${id}&_r=${Date.now()}` });
}

function createProduct() {
  uni.navigateTo({ url: `/pages/admin/product/edit?_r=${Date.now()}` });
}

// ===========================================================================
// 生命周期
// ===========================================================================

onLoad(load);

/** 身份从顾客切成店长时补一次加载（restore 是异步的，onLoad 那刻可能还没填好） */
watch(isAdmin, (now, was) => {
  if (now && !was) load();
});

onPullDownRefresh(async () => {
  if (!isAdmin.value) {
    uni.stopPullDownRefresh();
    return;
  }
  await load();
  uni.stopPullDownRefresh();
});

onReachBottom(() => {
  if (!isAdmin.value) return;
  pager.loadMore();
});
</script>

<style lang="scss" scoped>
.plist {
  background-color: $color-bg-app;
}

/* ==================================================================== 搜索框 */
.toolbar {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2 $space-4;
  background-color: $color-surface;
}

.searchbox {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border-radius: $radius-pill;
  background-color: $color-bg-app;
}

.searchbox__input {
  flex: 1;
  min-width: 0;
  height: 34px;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.searchbox__ph {
  color: $color-text-muted;
}

.searchbox__clear {
  flex: none;
  display: flex;
  align-items: center;
}

/* ============================================================== 分类横滑条 */
.cats {
  background-color: $color-surface;
  padding-bottom: 2px;
}

/*
  inline-flex + nowrap 是必须的：
  分类多的时候要能横向超出屏幕，而不是把「饮料冲调」竖排挤成三行。
  `.cat` 上的 flex:none 保证不被压缩。
*/
.cats__inner {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  padding: 0 $space-4 $space-2;
  min-width: 100%;
  box-sizing: border-box;
}

.cat {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 12px;
  border-radius: $radius-pill;
  background-color: $color-bg-app;
}

.cat--on {
  background-color: rgba(199, 69, 10, 0.1);
}

.cat__text {
  font-size: $font-size-xs;
  color: $color-text-secondary;
  white-space: nowrap;
}

.cat--on .cat__text {
  color: $color-action;
  font-weight: 600;
}

.cat__count {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.cat--on .cat__count {
  color: $color-action;
}

/* ================================================================ 筛选 chips */
.chips {
  display: flex;
  padding: $space-2 $space-4 0;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border-radius: $radius-pill;
  background-color: rgba(199, 69, 10, 0.1);
}

.chip__text {
  font-size: $font-size-xs;
  color: $color-action;
}

/* ==================================================================== 列表体 */
.plist__body {
  padding: $space-3 $space-4 0;
}

.sklist {
  display: flex;
  flex-direction: column;
  gap: $space-2;
}

.skcard {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3;
}

.sk {
  border-radius: $radius-sm;
  background-color: $color-bg-app;
}

.sk--thumb {
  width: 52px;
  height: 52px;
  flex: none;
}

.sk--line {
  height: 12px;
}

/* ================================================================ 商品行 */
.prow {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3;
  margin-bottom: $space-2;
}

.prow__thumb {
  flex: none;
  width: 52px;
  height: 52px;
}

.prow__main {
  flex: 1;
  min-width: 0;
}

.prow__titlerow {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prow__name {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  font-weight: 600;
  color: $color-text-primary;
  /* 单行省略，别把卡片撑高 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st {
  flex: none;
  padding: 1px 6px;
  border-radius: $radius-xs;
  font-size: $font-size-xs;
}

.st--on {
  color: $color-success;
  background-color: $color-success-soft;
}

.st--off {
  color: $color-text-muted;
  background-color: $color-bg-app;
}

.prow__sub {
  display: block;
  margin-top: 2px;
  font-size: $font-size-xs;
  color: $color-text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prow__metarow {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 4px;
}

.prow__origin {
  text-decoration: line-through;
}

.prow__stock {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.prow__stock--low {
  color: $color-danger;
}

.prow__cat {
  display: block;
  margin-top: 3px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* ================================================================== 操作区 */
.prow__ops {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-2;
}

.switchrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  /* 44px 是最小可点热区，别为了排版缩小 */
  height: 30px;
}

/* 纯 CSS 开关：用 ::before/::after 画轨道和滑块，避免再引一个原生 switch 组件 */
.switch {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: $radius-pill;
  background-color: $color-border-strong;
  transition: background-color 0.2s;
}

.switch--on {
  background-color: $color-action;
}

.switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: #ffffff;
  transition: transform 0.2s;
}

.switch--on .switch__knob {
  transform: translateX(16px);
}

.prow__more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 26px;
  border-radius: $radius-sm;
}

.prow__more--hover {
  background-color: $color-bg-app;
}

/* ================================================================== 浮动按钮 */
.plist__pad {
  /* 给 FAB 腾出空间，别让它盖住最后一行 */
  height: 76px;
}

.fab {
  position: fixed;
  right: 16px;
  bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: $color-action;
  box-shadow: 0 4px 12px rgba(199, 69, 10, 0.32);
  z-index: 20;
}

.fab--hover {
  opacity: 0.88;
}

/* ============================================================== 更多面板内容 */
.spane {
  margin-bottom: $space-2;
}

.spane__row {
  display: flex;
  align-items: center;
  gap: $space-2;
  height: 42px;
  border-bottom: 1px solid $color-border-subtle;
}

.spane__text {
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.spane__tip {
  display: block;
  margin-top: $space-2;
  font-size: $font-size-xs;
  color: $color-text-muted;
}
</style>