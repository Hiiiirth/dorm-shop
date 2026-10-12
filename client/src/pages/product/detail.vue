<template>
  <view class="page-root pdetail">
    <NavBar title="商品详情" :back="true" border />

    <!-- ============================================================ 加载中 -->
    <view v-if="loading && !product" class="page-body">
      <view class="sk sk--hero" />
      <view class="surface block">
        <view class="sk sk--line" style="width: 40%; height: 24px" />
        <view class="sk sk--line" style="width: 75%; margin-top: 12px" />
        <view class="sk sk--line" style="width: 55%; margin-top: 8px" />
      </view>
    </view>

    <!-- ============================================================ 加载失败 -->
    <EmptyState
      v-else-if="loadError"
      variant="error"
      :desc="loadError.code === 40001 ? '这个商品可能已经被删除了' : '商品详情没拿到'"
      action-text="重新加载"
      @action="loadDetail"
    />

    <!-- ============================================================== 详情 -->
    <view v-else-if="product" class="page-body pdetail__body">
      <!-- 主图。没图时 ProductImage 会渲染字标，所以这里不会出现碎图 -->
      <view class="hero">
        <ProductImage
          :src="mainImage"
          :name="product.name"
          size="100%"
          mono-size="240rpx"
          radius="none"
        />
        <view v-if="offShelf" class="hero__mask">
          <view class="hero__mask-badge">
            <AppIcon name="alert" :size="14" color="#ffffff" />
            <text class="hero__mask-text">已下架</text>
          </view>
        </view>
      </view>

      <!-- 缩略图条：只在真的有多张图时才有意义（种子数据里 images 是 null） -->
      <scroll-view v-if="imageList.length > 1" class="thumbs" scroll-x show-scrollbar="false">
        <view class="thumbs__inner">
          <view
            v-for="(img, i) in imageList"
            :key="img"
            class="thumbs__item"
            :class="{ 'thumbs__item--on': i === activeImage }"
            @tap="activeImage = i"
          >
            <ProductImage :src="img" :name="product.name" size="120rpx" mono-size="40rpx" radius="sm" />
          </view>
        </view>
      </scroll-view>

      <!-- -------------------------------------------------------- 价格 / 名称 -->
      <view class="surface block">
        <view class="price-row">
          <PriceText :value="product.price" size="xxl" :original="product.originalPrice" />

          <view v-if="stock.level !== 'ok'" class="stock-chip" :class="`stock-chip--${stock.level}`">
            <text class="stock-chip__text">{{ stock.text }}</text>
          </view>
        </view>

        <text class="pd-name">{{ product.name }}</text>
        <text v-if="product.subtitle" class="pd-sub">{{ product.subtitle }}</text>

        <view class="facts">
          <view class="fact">
            <AppIcon name="bag" :size="14" color="#68707E" />
            <text class="fact__text">单位 {{ product.unit }}</text>
          </view>
          <view class="fact">
            <AppIcon name="hot" :size="14" color="#68707E" />
            <text class="fact__text">{{ formatSales(product.salesCount) }}</text>
          </view>
          <view class="fact">
            <AppIcon name="inbox" :size="14" color="#68707E" />
            <text class="fact__text">库存 {{ product.stock }} {{ product.unit }}</text>
          </view>
        </view>
      </view>

      <!-- -------------------------------------------------------------- 数量 -->
      <view class="surface block">
        <view class="qty-row">
          <text class="qty-row__label">购买数量</text>

          <view class="stepper">
            <view
              class="stepper__btn"
              :class="{ 'stepper__btn--off': quantity <= 1 }"
              :hover-class="quantity <= 1 ? '' : 'stepper__btn--hover'"
              :hover-stay-time="60"
              @tap="step(-1)"
            >
              <AppIcon name="minus" :size="15" color="currentColor" />
            </view>

            <text class="stepper__val">{{ quantity }}</text>

            <view
              class="stepper__btn"
              :class="{ 'stepper__btn--off': quantity >= maxQuantity }"
              :hover-class="quantity >= maxQuantity ? '' : 'stepper__btn--hover'"
              :hover-stay-time="60"
              @tap="step(1)"
            >
              <AppIcon name="plus" :size="15" color="currentColor" />
            </view>
          </view>
        </view>

        <text class="qty-row__hint">{{ maxHint }}</text>
      </view>

      <!-- -------------------------------------------------------------- 描述 -->
      <view class="surface block">
        <view class="block__head">
          <AppIcon name="remark" :size="15" color="#C7450A" />
          <text class="block__title">商品详情</text>
        </view>
        <text v-if="product.description" class="desc">{{ product.description }}</text>
        <text v-else class="desc desc--empty">
          店主还没填详细介绍。有什么想确认的（口味、规格、保质期），下单时在门牌号备注里写一句就行。
        </text>
      </view>

      <!-- --------------------------------------------------------- 配送说明 -->
      <view class="surface block">
        <view class="notice">
          <AppIcon name="truck" :size="16" color="#0E8A43" />
          <view class="notice__body">
            <text class="notice__title">送到宿舍门口 · 当面结算</text>
            <text class="notice__desc">
              下单时备注门牌号，接单后会送到你宿舍门口，货到付款。线上不收款。
            </text>
          </view>
        </view>
      </view>

      <view class="pdetail__pad" />
    </view>

    <!-- ============================================================ 底部操作栏 -->
    <view v-if="product" class="actionbar">
      <view class="actionbar__inner">
        <view class="actionbar__cart" @tap="goCart">
          <AppIcon name="cart" :size="20" color="currentColor" />
          <text class="actionbar__cart-text">购物车</text>
          <view v-if="cartStore.badge > 0" class="actionbar__badge">
            <text class="actionbar__badge-text">
              {{ cartStore.badge > 99 ? '99+' : cartStore.badge }}
            </text>
          </view>
        </view>

        <AppButton
          class="actionbar__btn"
          type="secondary"
          size="md"
          block
          :text="addText"
          :icon="addIcon"
          :loading="adding"
          :disabled="!canBuy"
          @tap="addToCart"
        />

        <AppButton
          class="actionbar__btn actionbar__btn--primary"
          type="primary"
          size="md"
          block
          text="立即购买"
          :disabled="!canBuy"
          @tap="buyNow"
        />
      </view>
      <view class="safe-area-bottom" />
    </view>
  </view>
</template>

<script setup>
/**
 * 商品详情页
 *
 * 三件值得说明的事：
 *
 * 1) **加购按钮的图标形变**
 *    点「加入购物车」时图标从 plus 变成 check（morphicons，H5 生效），
 *    2 秒后自动变回来。这比「弹个 toast 然后什么都不变」更能让人确认操作生效了。
 *    按钮文案也同步变成「已加入」。
 *
 * 2) **下架 / 售罄不做跳转拦截**
 *    后端的 detail 接口对已下架商品**不报错**，而是带着 status=0 返回，
 *    所以这一页要自己把「已下架」渲染清楚（蒙层 + 禁用按钮），
 *    而不是白屏或者假装能买。
 *
 * 3) **数量上限取「库存」和 99 的较小值**
 *    99 是后端的 MAX_CART_QUANTITY。超过库存后端会返回库存不足，
 *    但前端**先挡住**，别让用户点了才被拒。
 */
import { computed, ref, watch } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppButton from '../../components/AppButton.vue';
import EmptyState from '../../components/EmptyState.vue';
import PriceText from '../../components/PriceText.vue';
import ProductImage from '../../components/ProductImage.vue';
import { catalogApi } from '../../api/catalog';
import { useCartStore } from '../../store/cart';
import { useUserStore } from '../../store/user';
import { formatSales, formatStock } from '../../utils/format';

const MAX_CART_QUANTITY = 99;

const userStore = useUserStore();
const cartStore = useCartStore();

const product = ref(null);
const loading = ref(false);
const loadError = ref(null);
/** 要查的商品 id，onLoad 里从 query 取 */
const detailId = ref(0);

const quantity = ref(1);
const activeImage = ref(0);

/** 加购进行中 —— 挡住重复点击 */
const adding = ref(false);
/** 加购成功后的短暂状态：按钮变「已加入 + 对勾」，2 秒后复位 */
const justAdded = ref(false);
let resetTimer = null;

const imageList = computed(() => {
  const imgs = (product.value?.images || []).filter(Boolean);
  if (imgs.length) return imgs;
  return product.value?.coverImage ? [product.value.coverImage] : [];
});

const mainImage = computed(() => imageList.value[activeImage.value] || product.value?.coverImage || '');

const offShelf = computed(() => product.value?.status === 0);
const soldOut = computed(() => Number(product.value?.stock) <= 0);
const canBuy = computed(() => !!product.value && !offShelf.value && !soldOut.value);

const stock = computed(() => formatStock(product.value?.stock));

const maxQuantity = computed(() => {
  const s = Number(product.value?.stock) || 0;
  return Math.max(1, Math.min(s, MAX_CART_QUANTITY));
});

const maxHint = computed(() => {
  if (offShelf.value) return '该商品已下架，暂时不能购买';
  if (soldOut.value) return '已经卖光了，等店主补货';
  if (maxQuantity.value < Number(product.value?.stock)) {
    return `单次最多买 ${maxQuantity.value} 件，更多可以分次下单`;
  }
  return `最多 ${maxQuantity.value} ${product.value?.unit || '件'}，够宿舍囤一周`;
});

const addText = computed(() => {
  if (offShelf.value) return '已下架';
  if (soldOut.value) return '已售罄';
  return justAdded.value ? '已加入' : '加入购物车';
});

/**
 * 按钮图标：常态是 plus，加购成功后靠 morph-to 变成 check。
 * 注意 morph-to 给的是「当前要显示成什么」，所以只在这 2 秒内传 'check'，
 * 之后传空串回到 plus —— 这一来一回**两次都会形变**，不是硬切。
 */
const addIcon = computed(() => (justAdded.value ? 'check' : 'plus'));

function step(delta) {
  const next = quantity.value + delta;
  if (next < 1 || next > maxQuantity.value) return;
  quantity.value = next;
}

async function loadDetail() {
  const id = detailId.value;
  if (!id) {
    loadError.value = { code: 10001, message: '缺少商品 id' };
    return;
  }
  loading.value = true;
  try {
    product.value = await catalogApi.product(id);
    loadError.value = null;
  } catch (err) {
    loadError.value = err;
  } finally {
    loading.value = false;
  }
}

async function addToCart() {
  if (!canBuy.value || adding.value) return;

  if (!userStore.isLogin) {
    uni.showToast({ title: '登录后才能加购物车', icon: 'none' });
    setTimeout(() => uni.navigateTo({ url: '/pages/login/login' }), 600);
    return;
  }

  adding.value = true;
  try {
    await cartStore.add(product.value.id, quantity.value);
    justAdded.value = true;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      justAdded.value = false;
    }, 2000);
    uni.showToast({ title: `已加入 ${quantity.value} ${product.value.unit}`, icon: 'none' });
  } catch {
    // 库存不足等业务失败已经在 request 层 toast 过，这里只需要复位状态
  } finally {
    adding.value = false;
  }
}

/**
 * 「立即购买」= 跳过购物车，直接带着 items 去确认订单页。
 * 入参用的是和购物车结算**同一个** OrderSourceDto，
 * 只是这一路走 `items[]`（直购）而不是 `cartIds[]`（购物车结算）。
 */
function buyNow() {
  if (!canBuy.value) return;

  if (!userStore.isLogin) {
    uni.showToast({ title: '登录后才能下单', icon: 'none' });
    setTimeout(() => uni.navigateTo({ url: '/pages/login/login' }), 600);
    return;
  }

  uni.navigateTo({
    url: `/pages/order/confirm?productId=${product.value.id}&quantity=${quantity.value}`,
  });
}

/**
 * 购物车入口。
 * cart 是**自绘 tab 的根页面**，只能用 reLaunch 切过去
 * （navigateTo 会让页面栈无限增长，见 utils/tabs.js 顶部注释）。
 */
function goCart() {
  if (!userStore.isLogin) {
    uni.showToast({ title: '登录后才能看购物车', icon: 'none' });
    setTimeout(() => uni.navigateTo({ url: '/pages/login/login' }), 600);
    return;
  }
  uni.reLaunch({ url: '/pages/cart/cart' });
}

onLoad((options) => {
  detailId.value = Number(options?.id) || 0;
  loadDetail();
});

// 切换商品（比如从推荐位再点进来）时，数量回到 1
watch(detailId, () => {
  quantity.value = 1;
  activeImage.value = 0;
});
</script>

<style lang="scss" scoped>
.pdetail {
  background-color: $color-bg-app;
}

.pdetail__body {
  padding: 0 0 0;
}

.pdetail__pad {
  /* 给固定的底部操作栏让位。
     数值来源：按钮 48px + 上下 padding 各 8px = 64px，再多留 12px 呼吸。
     不加这一段的话，最后一张卡片会被操作栏盖住 —— 这是固定底栏最常见的坑。 */
  height: calc(76px + constant(safe-area-inset-bottom));
  height: calc(76px + env(safe-area-inset-bottom));
}

/* ==================================================================== 主图 */
.hero {
  position: relative;
  width: 100%;
  background-color: $color-surface;
  overflow: hidden;
  /* 高度由 ProductImage 自己的 1:1 撑出来，这里不要再写 aspect-ratio，
     两处都写会打架（其中一个赢，另一个变成死代码） */
}

.hero__mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(26, 29, 35, 0.44);
}

.hero__mask-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: $radius-pill;
  background-color: rgba(26, 29, 35, 0.72);
}

.hero__mask-text {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-inverse;
}

.thumbs {
  background-color: $color-surface;
  white-space: nowrap;
  padding: $space-3 $space-4;
}

.thumbs__inner {
  display: inline-flex;
  align-items: center;
  gap: $space-2;
}

.thumbs__item {
  border: 2px solid transparent;
  border-radius: $radius-sm;
  padding: 2px;
}

.thumbs__item--on {
  border-color: $color-action;
}

/* ================================================================== 信息块 */
.block {
  margin: $space-3 $space-4 0;
  padding: $space-4;
}

/* detail 的 block 用的是 margin-top，跟全局 `.surface + .surface` 同值不冲突；
   但第一个 block 前面是缩略图（非 surface），所以要显式给首块一个上间距 */
.block:first-of-type {
  margin-top: $space-3;
}

.block__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: $space-3;
}

.block__title {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.price-row {
  display: flex;
  align-items: center;
  gap: $space-3;
}

.stock-chip {
  padding: 3px 10px;
  border-radius: $radius-xs;
}

.stock-chip--low {
  background-color: $color-danger-soft;
}

.stock-chip--out {
  background-color: $color-surface-sunken;
}

.stock-chip__text {
  font-size: $font-size-xs;
  font-weight: $font-weight-medium;
}

.stock-chip--low .stock-chip__text {
  color: $color-danger;
}

.stock-chip--out .stock-chip__text {
  color: $color-text-muted;
}

.pd-name {
  display: block;
  margin-top: $space-3;
  font-size: $font-size-xl;
  font-weight: $font-weight-semibold;
  line-height: 1.32;
  color: $color-text-primary;
}

.pd-sub {
  display: block;
  margin-top: 4px;
  font-size: $font-size-sm;
  color: $color-text-muted;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: $space-2 $space-4;
  margin-top: $space-4;
  padding-top: $space-3;
  border-top: 1px dashed $color-border-subtle;
}

.fact {
  display: flex;
  align-items: center;
  gap: 5px;
}

.fact__text {
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

/* ==================================================================== 数量 */
.qty-row {
  display: flex;
  align-items: center;
}

.qty-row__label {
  font-size: $font-size-md;
  color: $color-text-primary;
}

.qty-row__hint {
  display: block;
  margin-top: $space-3;
  font-size: $font-size-xs;
  line-height: 1.5;
  color: $color-text-muted;
}

.stepper {
  margin-left: auto;
  display: flex;
  align-items: center;
  border: 1px solid $color-border-subtle;
  border-radius: $radius-sm;
  overflow: hidden;
}

/* 36px 视觉尺寸 —— 步进器是「反复点」的控件，比 44px 的常规按钮小一点没问题，
   但也不能小到点不准 */
.stepper__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 32px;
  color: $color-text-primary;
}

.stepper__btn--hover {
  background-color: $color-surface-2;
}

.stepper__btn--off {
  color: $color-text-disabled;
}

.stepper__val {
  min-width: 44px;
  height: 32px;
  line-height: 32px;
  text-align: center;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  border-left: 1px solid $color-border-subtle;
  border-right: 1px solid $color-border-subtle;
  font-variant-numeric: tabular-nums;
}

/* ==================================================================== 描述 */
.desc {
  font-size: $font-size-sm;
  line-height: 1.7;
  color: $color-text-secondary;
}

.desc--empty {
  color: $color-text-muted;
}

.notice {
  display: flex;
  gap: $space-3;
  align-items: flex-start;
}

.notice__body {
  flex: 1;
  min-width: 0;
}

.notice__title {
  display: block;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.notice__desc {
  display: block;
  margin-top: 4px;
  font-size: $font-size-xs;
  line-height: 1.6;
  color: $color-text-muted;
}

/* ============================================================== 底部操作栏 */
.actionbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: $z-sticky;
  background-color: $color-surface;
  border-top: 1px solid $color-border-subtle;
}

.actionbar__inner {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2 $space-4;
}

.actionbar__cart {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 48px;
  gap: 1px;
  color: $color-text-secondary;
}

.actionbar__cart-text {
  font-size: 10px;
  line-height: 1;
}

.actionbar__badge {
  position: absolute;
  top: -2px;
  right: 2px;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-pill;
  background-color: $color-danger;
}

.actionbar__badge-text {
  font-size: 10px;
  line-height: 1;
  color: $color-text-inverse;
}

.actionbar__btn {
  flex: 1;
}

/* =================================================================== 骨架 */
.sk {
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 37%, #eef0f4 63%);
  background-size: 400% 100%;
  border-radius: $radius-xs;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk--hero {
  width: 100%;
  /* 主图区是 1:1，骨架也照 1:1 占位，避免真实内容进来时页面高度跳一下 */
  height: 0;
  padding-bottom: 100%;
  border-radius: 0;
  background-color: $color-surface-2;
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
</style>
