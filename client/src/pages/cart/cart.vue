<template>
  <view class="page-root cart">
    <NavBar title="购物车" :back="false" border />

    <!-- ============================================================ 首屏骨架 -->
    <view v-if="showSkeleton" class="page-body">
      <view v-for="i in 3" :key="i" class="surface skrow">
        <view class="sk sk--box" />
        <view class="skrow__lines">
          <view class="sk sk--line" style="width: 70%" />
          <view class="sk sk--line" style="width: 40%; margin-top: 10px" />
        </view>
      </view>
    </view>

    <!-- ============================================================== 拉取失败 -->
    <EmptyState
      v-else-if="loadFailed"
      variant="error"
      title="购物车没加载出来"
      desc="可能是网络问题，也可能是登录状态过期了。点下面重新试一次。"
      action-text="重新加载"
      @action="reload"
    />

    <!-- ================================================================ 空车 -->
    <EmptyState
      v-else-if="cartStore.isEmpty"
      variant="empty"
      icon="cart"
      title="购物车还是空的"
      desc="去首页或分类里挑点东西吧，宿舍楼下随叫随到。"
      action-text="去逛逛"
      @action="goShopping"
    />

    <!-- ============================================================== 购物车 -->
    <view v-else class="page-body cart__body">
      <!-- 失效条目提示条：只在有失效条目时出现，告诉用户「为什么它们不能结算」 -->
      <view v-if="unavailableItems.length" class="bar bar--warn">
        <AppIcon name="alert" :size="14" color="#B86E00" />
        <text class="bar__text">
          有 {{ unavailableItems.length }} 件商品已下架或缺货，不能一起结算。可以先删掉它们。
        </text>
        <view class="bar__action" @tap="removeUnavailable">
          <text class="bar__action-text">清理</text>
        </view>
      </view>

      <!-- 顶部：全选 + 条目数 + 清空。吸顶，滚动时也能点到 -->
      <view class="toolbar">
        <AppCheckbox
          size="sm"
          :checked="cartStore.allSelected"
          :label="`全选（${availableCount} 种）`"
          @change="onToggleAll"
        />
        <view class="toolbar__right">
          <text class="toolbar__count">共 {{ cartStore.totalQuantity }} 件</text>
          <view class="toolbar__clear" hover-class="toolbar__clear--hover" @tap="confirmClear">
            <AppIcon name="delete" :size="14" color="#68707E" />
            <text class="toolbar__clear-text">清空</text>
          </view>
        </view>
      </view>

      <!-- ------------------------------------------------------------ 条目列表 -->
      <view class="citems">
        <view
          v-for="item in cartStore.items"
          :key="item.id"
          class="surface citem"
          :class="{ 'citem--off': !item.available }"
        >
          <!-- 勾选。失效条目禁用勾选（后端也不会把它们算进合计） -->
          <AppCheckbox
            class="citem__cbox"
            :checked="Number(item.selected) === 1"
            :disabled="!item.available"
            @change="() => cartStore.toggleSelected(item)"
          />

          <ProductImage
            class="citem__img"
            :src="item.coverImage"
            :name="item.name"
            size="160rpx"
            radius="sm"
          />

          <view class="citem__main">
            <!-- 名称 + 单位。min-width:0 是必需的：flex 子项默认不收缩，
                 长商品名会把整行撑宽（这是 flex 里最常见的溢出原因） -->
            <view class="citem__head">
              <text class="citem__name">{{ item.name }}</text>
              <text class="citem__unit">{{ item.unit }}</text>
            </view>

            <!-- 失效原因。**不隐藏条目**，而是明确说清楚为什么不能买 -->
            <view v-if="!item.available" class="citem__reason">
              <AppIcon name="alert" :size="12" color="#B86E00" />
              <text class="citem__reason-text">{{ item.unavailableReason || '暂时不能购买' }}</text>
            </view>

            <view class="citem__foot">
              <PriceText
                class="citem__price"
                :value="item.price"
                size="sm"
                :tone="item.available ? 'action' : 'muted'"
                :original="item.originalPrice"
              />

              <!-- 数量步进器。上限取 min(库存, 99)，和后端 MAX_CART_QUANTITY 对齐 -->
              <view class="stepper">
                <view
                  class="stepper__btn"
                  :class="{ 'stepper__btn--off': !canDecrease(item) }"
                  :hover-class="canDecrease(item) ? 'stepper__btn--hover' : ''"
                  :hover-stay-time="60"
                  @tap="onStep(item, -1)"
                >
                  <AppIcon name="minus" :size="14" color="currentColor" />
                </view>

                <text class="stepper__val">{{ item.quantity }}</text>

                <view
                  class="stepper__btn"
                  :class="{ 'stepper__btn--off': !canIncrease(item) }"
                  :hover-class="canIncrease(item) ? 'stepper__btn--hover' : ''"
                  :hover-stay-time="60"
                  @tap="onStep(item, 1)"
                >
                  <AppIcon name="plus" :size="14" color="currentColor" />
                </view>
              </view>
            </view>

            <!-- 小计。失效条目不给小计（它没被计入合计，给了会误导） -->
            <text v-if="item.available" class="citem__subtotal">
              小计 {{ formatYuan(item.price * item.quantity) }}
            </text>
          </view>
        </view>
      </view>

      <!-- 给固定结算栏让位。不能只靠 .has-fixed-bottom：
           这里的底栏还带着「已优惠 0 元」那一行，比 tabbar 高 -->
      <view class="cart__pad" />
    </view>

    <!-- ========================================================== 底部结算栏 -->
    <view v-if="!cartStore.isEmpty && !showSkeleton && !loadFailed" class="checkout">
      <view class="checkout__inner">
        <AppCheckbox
          class="checkout__cbox"
          size="sm"
          :checked="cartStore.allSelected"
          label="全选"
          @change="onToggleAll"
        />

        <view class="checkout__sum">
          <view class="checkout__amount">
            <text class="checkout__amount-label">合计</text>
            <PriceText :value="cartStore.totalAmount" size="lg" />
          </view>
          <text class="checkout__hint">
            {{ amountHint }}
          </text>
        </view>

        <AppButton
          class="checkout__btn"
          type="primary"
          size="md"
          :text="checkoutText"
          :disabled="!cartStore.canCheckout"
          @tap="goCheckout"
        />
      </view>
      <view class="safe-area-bottom" />
    </view>

    <AppTabBar :items="tabs" active="cart" />
  </view>
</template>

<script setup>
/**
 * 购物车
 *
 * ── 三个容易做错的地方 ────────────────────────────────────────────────────
 *
 * 1) **失效条目要置灰保留，不能消失**
 *    后端 `buildVo` 特意把 `available: false` 的条目也返回（带 `unavailableReason`），
 *    就是为了让用户看到「我加过的这个东西现在买不了了」。
 *    如果前端筛掉它们，用户会以为是自己没加成功，然后再去搜一遍加一次 —— 更糟。
 *
 * 2) **数量上限 = min(库存, 99)，且失效条目不能改数量**
 *    `stock: 0` 时 cap 会算成 1，这时候点「−」等于什么都不做（已经是最小）。
 *    所以 `canDecrease` / `canIncrease` 都要先看 `available`。
 *
 * 3) **合计一律用服务端的数字**
 *    本地的 `price × quantity` 只用来显示单条小计。
 *    总计用 `cartStore.totalAmount` —— 它是后端重算过的，还做了「不可用条目不参与」的过滤，
 *    本地再算一遍只会两边不一致。
 *
 * 数据流：所有写操作（改数量 / 勾选 / 删）都打接口，然后用返回值**整份覆盖** snapshot。
 * 所以这里看不到乐观更新 —— 后端每次都把重算好的合计一并返回，没必要本地猜。
 */
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppButton from '../../components/AppButton.vue';
import AppTabBar from '../../components/AppTabBar.vue';
import AppCheckbox from '../../components/AppCheckbox.vue';
import EmptyState from '../../components/EmptyState.vue';
import PriceText from '../../components/PriceText.vue';
import ProductImage from '../../components/ProductImage.vue';
import { useCartStore } from '../../store/cart';
import { useUserStore } from '../../store/user';
import { tabsOfRole } from '../../utils/tabs';
import { formatYuan } from '../../utils/money';
import { MAX_CART_QUANTITY } from '../../utils/constants';

const userStore = useUserStore();
const cartStore = useCartStore();

/** 第一次进页面（还没拿到任何数据）才显示骨架，改数量时不闪 */
const firstLoad = ref(true);

const showSkeleton = computed(() => firstLoad.value && cartStore.loading && !cartStore.snapshot);

/** 从没成功拿到过数据、且有错误 —— 才算是「加载失败」。有旧数据时静默刷新 */
const loadFailed = computed(() => !cartStore.snapshot && !!cartStore.error);

const tabs = computed(() =>
  tabsOfRole(userStore.currentRole || 'CUSTOMER').map((t) =>
    t.key === 'cart' ? { ...t, badge: cartStore.badge } : t,
  ),
);

const unavailableItems = computed(() => cartStore.unavailableItems);
const availableCount = computed(() => cartStore.availableItems.length);

const amountHint = computed(() => {
  if (cartStore.totalQuantity === 0) return '还没勾选商品';
  return `已选 ${cartStore.selectedItemCount} 种 · 共 ${cartStore.totalQuantity} 件`;
});

const checkoutText = computed(() =>
  cartStore.canCheckout ? `结算(${cartStore.totalQuantity})` : '结算',
);

// ---------------------------------------------------------------------------
// 数量
// ---------------------------------------------------------------------------
function capOf(item) {
  return Math.max(1, Math.min(Number(item.stock) || 0, MAX_CART_QUANTITY));
}

/**
 * 「−」永远可点（只要条目还能买）——
 * 数量 1 时点它就是**删除**，所以不能再要求 `quantity > 1`，
 * 否则按钮变灰、用户以为坏了。与分类页 CartBar 的交互保持一致。
 */
function canDecrease(item) {
  return !!item.available;
}

function canIncrease(item) {
  return item.available && Number(item.quantity) < capOf(item);
}

/**
 * 单步加减。
 * ⚠️ `delta < 0 && quantity === 1` → 走**删除**（带二次确认），
 *    不是「不能再少」。这是用户明确要求的交互：没有独立删除按钮，
 *    数量减到 1 再点「−」即删除该商品。
 */
async function onStep(item, delta) {
  if (delta < 0) {
    if (!item.available) return;
    if (Number(item.quantity) <= 1) {
      confirmRemove(item);
      return;
    }
  }
  if (delta > 0 && !canIncrease(item)) {
    const cap = capOf(item);
    uni.showToast({
      title: cap >= MAX_CART_QUANTITY ? `单品最多 ${MAX_CART_QUANTITY} 件` : `库存只剩 ${item.stock} ${item.unit}`,
      icon: 'none',
    });
    return;
  }
  try {
    await cartStore.stepQuantity(item, delta);
  } catch {
    /* request 层已 toast */
  }
}

// ---------------------------------------------------------------------------
// 勾选
// ---------------------------------------------------------------------------
async function onToggleAll(next) {
  try {
    await cartStore.setAllSelected(next);
  } catch {
    /* request 层已 toast，store 内已重新拉取校正 */
  }
}

// ---------------------------------------------------------------------------
// 删除
// ---------------------------------------------------------------------------
function confirmRemove(item) {
  uni.showModal({
    title: '删掉这件商品？',
    content: item.name,
    confirmText: '删除',
    confirmColor: '#D93A3F',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await cartStore.removeItem(item.id);
        uni.showToast({ title: '已删除', icon: 'none' });
      } catch {
        /* request 层已 toast */
      }
    },
  });
}

function confirmClear() {
  uni.showModal({
    title: '清空购物车',
    content: '购物车里的商品会全部删掉，这个操作不能撤销。',
    confirmText: '清空',
    confirmColor: '#D93A3F',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await cartStore.clearAll();
        uni.showToast({ title: '已清空', icon: 'none' });
      } catch {
        /* request 层已 toast */
      }
    },
  });
}

/** 一键删除所有失效条目（逐条删，后端没有批量接口） */
function removeUnavailable() {
  const targets = unavailableItems.value;
  if (!targets.length) return;
  uni.showModal({
    title: '清理失效商品',
    content: `会删掉 ${targets.length} 件已下架或库存不足的商品，确定吗？`,
    confirmText: '清理',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        // 串行删：并发删会让后一个响应里的 list 覆盖前一个，导致中间态闪烁
        for (const it of targets) {
          // eslint-disable-next-line no-await-in-loop
          await cartStore.removeItem(it.id);
        }
        uni.showToast({ title: '已清理', icon: 'none' });
      } catch {
        await cartStore.refresh();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// 跳转
// ---------------------------------------------------------------------------
function goShopping() {
  uni.reLaunch({ url: '/pages/home/home' });
}

function goCheckout() {
  if (!cartStore.canCheckout) {
    uni.showToast({ title: '先勾选要买的商品', icon: 'none' });
    return;
  }
  // 用 cartIds 结算：把勾选的条目 id 传给确认页，由它调 preview / create。
  // 走 URL 而不是 store，是为了「离开页面再回来」也不会拿到脏参数 ——
  // 订单确认页是独立的 navigateTo 页面，重启也能自己从 cartIds 复原。
  const ids = cartStore.selectedItems.map((it) => it.id);
  uni.navigateTo({
    url: `/pages/order/confirm?cartIds=${ids.join(',')}`,
  });
}

async function reload() {
  firstLoad.value = true;
  await cartStore.refresh();
  firstLoad.value = false;
}

onShow(async () => {
  // 未登录会直接空车，不打接口（store 内判断）
  await cartStore.refresh();
  firstLoad.value = false;
});
</script>

<style lang="scss" scoped>
.cart {
  background-color: $color-bg-app;
}

.cart__body {
  padding: 0 0 0;
}

/* 固定结算栏 + tabbar 双底栏，占位高度要一起算 */
.cart__pad {
  height: calc(#{$tabbar-height} + 64px + 12px + constant(safe-area-inset-bottom));
  height: calc(#{$tabbar-height} + 64px + 12px + env(safe-area-inset-bottom));
}

/* ==================================================================== 提示条 */
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: $space-3 $space-4 0;
  padding: $space-2 $space-3;
  border-radius: $radius-sm;
}

.bar--warn {
  background-color: $color-warning-soft;
}

.bar__text {
  flex: 1;
  min-width: 0;
  font-size: $font-size-xs;
  line-height: 1.5;
  color: $color-text-secondary;
}

.bar__action {
  flex: none;
  padding: 4px 8px;
}

.bar__action-text {
  font-size: $font-size-xs;
  font-weight: $font-weight-medium;
  color: $color-action;
}

/* ==================================================================== 工具条 */
.toolbar {
  position: sticky;
  top: 0;
  z-index: $z-sticky;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-1 0 $space-1 $space-2;
  background-color: $color-bg-app;
}

.toolbar__right {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding-right: $space-4;
}

.toolbar__count {
  font-size: $font-size-xs;
  color: $color-text-muted;
  font-variant-numeric: tabular-nums;
}

.toolbar__clear {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 6px 8px;
  border-radius: $radius-xs;
}

.toolbar__clear--hover {
  background-color: $color-surface-sunken;
}

.toolbar__clear-text {
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

/* ================================================================ 条目列表 */
.citems {
  padding: 0 $space-4;
}

.citem {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding: $space-3 $space-3 $space-3 0;
  margin-bottom: $space-3;
}

/* 抵消全局 `.surface + .surface { margin-top: 12px }`，间距只由 margin-bottom 提供 */
.citem + .citem {
  margin-top: 0;
}

.citem__cbox {
  flex: none;
  /* 视觉上与图片居中对齐：图片 80px，勾选框热区约 44px */
  margin-top: 18px;
}

.citem__img {
  flex: none;
  margin-right: $space-3;
}

.citem__main {
  flex: 1;
  /* ⚠️ 必需：不加的话长商品名不收缩，会把整行撑到超出屏幕 */
  min-width: 0;
}

.citem__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding-right: 24px;
}

.citem__name {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  line-height: 1.4;
  color: $color-text-primary;
  /* 两行截断：宿舍小超市的商品名大多一两行就够，超过就没必要撑高卡片 */
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.citem__unit {
  flex: none;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.citem__reason {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}

.citem__reason-text {
  font-size: $font-size-xs;
  color: $color-warning;
}

.citem__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-2;
  margin-top: $space-2;
}

.citem__price {
  flex: 1;
  min-width: 0;
}

.citem__subtotal {
  display: block;
  margin-top: 6px;
  font-size: $font-size-xs;
  color: $color-text-muted;
  font-variant-numeric: tabular-nums;
}

/* 失效条目：**降对比度**而不是 `display:none`。文字要还能看清，
   所以只把颜色降一档，不用 opacity 把它糊成一片 */
.citem--off .citem__name {
  color: $color-text-muted;
}

.citem--off .citem__img {
  opacity: 0.55;
}

/* ================================================================== 步进器 */
.stepper {
  flex: none;
  display: flex;
  align-items: center;
  border: 1px solid $color-border-subtle;
  border-radius: $radius-xs;
  overflow: hidden;
}

.stepper__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 26px;
  color: $color-text-primary;
}

.stepper__btn--hover {
  background-color: $color-surface-2;
}

.stepper__btn--off {
  color: $color-text-disabled;
}

.stepper__val {
  min-width: 36px;
  height: 26px;
  line-height: 26px;
  text-align: center;
  font-size: $font-size-sm;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  border-left: 1px solid $color-border-subtle;
  border-right: 1px solid $color-border-subtle;
  font-variant-numeric: tabular-nums;
}

/* ============================================================== 底部结算栏 */
.checkout {
  position: fixed;
  left: 0;
  right: 0;
  /* 叠在 tabbar 之上：tabbar 是 50px（$tabbar-height = 100rpx） */
  bottom: calc(#{$tabbar-height} + constant(safe-area-inset-bottom));
  bottom: calc(#{$tabbar-height} + env(safe-area-inset-bottom));
  z-index: $z-sticky;
  background-color: $color-surface;
  border-top: 1px solid $color-border-subtle;
}

.checkout__inner {
  display: flex;
  align-items: center;
  padding: $space-2 $space-4;
  gap: $space-2;
}

.checkout__cbox {
  flex: none;
}

.checkout__sum {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.checkout__amount {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.checkout__amount-label {
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.checkout__hint {
  font-size: 11px;
  color: $color-text-muted;
}

.checkout__btn {
  flex: none;
  min-width: 104px;
}

/* =================================================================== 骨架 */
.skrow {
  display: flex;
  align-items: flex-start;
  margin: 0 $space-4 $space-3;
  padding: $space-3;
}

.skrow__lines {
  flex: 1;
  min-width: 0;
  padding-top: 4px;
}

.sk {
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 37%, #eef0f4 63%);
  background-size: 400% 100%;
  border-radius: $radius-xs;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk--box {
  flex: none;
  width: 80px;
  height: 80px;
  margin-right: $space-3;
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
