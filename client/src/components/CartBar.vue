<template>
  <!--
    空态占位：**刻意不渲染任何东西**，只留一个撑高度的占位元素。
    理由：分类页的右栏是 scroll-view，横条盖在它上面的话，
    空购物车时留一条 0 高的占位，比留一条空壳横条体验好（不占视觉也不占点击区）。
  -->
  <view v-if="!visible" class="cbar__placeholder" />

  <!-- ==================================================== 吸底横条 -->
  <view v-else class="cbar" :style="barStyle">
    <view class="cbar__handle" @tap="toggleSheet">
      <!-- 购物车图标 + 徽标 -->
      <view class="cbar__icon-wrap">
        <AppIcon name="cart" :size="20" :color="COLOR.textInverse" />
        <view v-if="cartStore.count > 0" class="cbar__badge">
          <text class="cbar__badge-text">{{ badgeText }}</text>
        </view>
      </view>

      <!-- 合计：默认只看**已勾选**的，和购物车页口径一致 -->
      <!-- 合计。橙底上必须显式给白色：PriceText 的 tone 只有
           default/action/danger/muted 四个预置色，最浅的 default 在橙底上也偏暗 -->
      <view class="cbar__info">
        <view class="cbar__amount">
          <PriceText :value="cartStore.totalAmount" size="md" />
        </view>
        <text class="cbar__hint">
          {{ cartStore.selectedItemCount > 0
            ? `已选 ${cartStore.selectedItemCount} 种 / ${cartStore.totalQuantity} 件`
            : `共 ${cartStore.count} 种商品，勾选后结算` }}
        </text>
      </view>

      <view class="cbar__toggle">
        <text class="cbar__toggle-text">{{ sheetOpen ? '收起' : '明细' }}</text>
        <!-- 复用已有的 forward 图标 + CSS 旋转 90° 当上下箭头。
             ⚠️ 不新增 chevron-* 图标：icons.js 是全项目唯一注册表，
             加一个就多一处要维护的地方，而这里旋转一下就够。 -->
        <AppIcon
          name="forward"
          class="cbar__toggle-icon"
          :class="{ 'cbar__toggle-icon--up': sheetOpen }"
          :size="14"
          :color="COLOR.textInverse"
        />
      </view>
    </view>

    <!-- 底部操作行。跟着横条一起变高，不做第二根吸底栏 -->
    <view class="cbar__ops">
      <view class="cbar__ops-inner">
        <AppCheckbox
          size="sm"
          :checked="cartStore.allSelected"
          :label="`全选（${availableCount} 种）`"
          @change="onToggleAll"
        />
        <view class="cbar__spacer" />
        <AppButton
          type="primary"
          size="sm"
          :text="checkoutText"
          :disabled="!cartStore.canCheckout"
          @tap="goCheckout"
        />
      </view>
    </view>
  </view>

  <!-- ================================================ 遮罩 + 上拉浮层 -->
  <!-- v-show 而不是 v-if：收起时保留节点，展开动画不会重新挂载导致闪 -->
  <view v-show="sheetOpen" class="csheet__mask" :style="maskStyle" @tap="closeSheet" />

  <view v-show="sheetOpen" class="csheet" :style="sheetStyle">
    <view class="csheet__head">
      <text class="csheet__title">购物车明细</text>
      <view class="csheet__close" hover-class="csheet__close--hover" @tap="closeSheet">
        <AppIcon name="close" :size="16" :color="COLOR.textSecondary" />
      </view>
    </view>

    <!-- 拉取中：只亮骨架，不显示「购物车是空的」，否则会闪一下假空态 -->
    <view v-if="cartStore.loading && !cartStore.snapshot" class="csheet__sk">
      <view v-for="i in 3" :key="i" class="csheet__sk-row">
        <view class="sk sk--thumb" />
        <view class="csheet__sk-lines">
          <view class="sk sk--line" style="width: 70%" />
          <view class="sk sk--line" style="width: 40%; margin-top: 8px" />
        </view>
      </view>
    </view>

    <view v-else-if="items.length === 0" class="csheet__empty">
      <text class="csheet__empty-text">购物车还是空的</text>
      <text class="csheet__empty-sub">在左边挑分类，点商品卡片右下角的 ＋ 就能加进来</text>
    </view>

    <scroll-view v-else class="csheet__list" scroll-y>
      <view v-for="item in items" :key="item.id" class="csheet__item">
        <view class="csheet__thumb">
          <ProductImage
            v-if="item.coverImage"
            :src="item.coverImage"
            :name="item.name"
            size="44px"
            mono-size="15px"
          />
        </view>

        <view class="csheet__main">
          <text class="csheet__name">{{ item.name }}</text>

          <!-- 失效条目：置灰 + 写明原因，不让它参与勾选 -->
          <view v-if="!item.available" class="csheet__reason">
            <AppIcon name="alert" :size="11" :color="COLOR.warning" />
            <text class="csheet__reason-text">{{ item.unavailableReason || '暂时不能购买' }}</text>
          </view>
          <text v-else class="csheet__meta">{{ formatYuan(item.price) }} / {{ item.unit || '件' }}</text>
        </view>

        <!--
          改数量。**没有独立的删除按钮** —— 数量减到 1 后再点「−」就是删除，
          这是用户明确要求的交互（少一个入口，也少一次「删错了」的机会）。
        -->
        <view class="csheet__right">
          <view class="stepper">
            <view
              class="stepper__btn"
              :class="{ 'stepper__btn--off': !canDecrease(item) }"
              hover-class="stepper__btn--hover"
              :hover-stay-time="60"
              @tap="onStep(item, -1)"
            >
              <AppIcon name="minus" :size="13" :color="COLOR.textPrimary" />
            </view>
            <text class="stepper__val">{{ item.quantity }}</text>
            <view
              class="stepper__btn"
              :class="{ 'stepper__btn--off': !canIncrease(item) }"
              hover-class="stepper__btn--hover"
              :hover-stay-time="60"
              @tap="onStep(item, 1)"
            >
              <AppIcon name="plus" :size="13" :color="COLOR.textPrimary" />
            </view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
/**
 * 分类页底部吸底购物车（需求 6）
 *
 * 为什么把它做成组件而不是写在分类页里：
 * 加购、勾选、改数量、删除这四套逻辑在 `pages/cart/cart.vue` 已经有一份，
 * 两处各写一遍必然漂移（改了一处忘了另一处，就是 bug）。
 * 这里只做**呈现**，所有写操作都调 store —— 购物车页改完，分类页自动跟着变。
 *
 * 布局要点（都是踩过的坑）：
 * · 横条盖住**全宽**（左侧分类栏 + 右侧商品区），因为分类页的两栏都在同一个
 *   flex 容器里，横条做成 `.cat__main` 的兄弟节点盖在上面最省事，
 *   不用去分别给两栏加 padding-bottom。
 * · `padding-bottom` 必须含 `env(safe-area-inset-bottom)`，漏了就是刘海屏压内容。
 * · 浮层用 `v-show` 而非 `v-if`：收起时保留节点，展开不会闪。
 */
import { computed, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import AppButton from './AppButton.vue';
import AppCheckbox from './AppCheckbox.vue';
import PriceText from './PriceText.vue';
import ProductImage from './ProductImage.vue';
import { useCartStore } from '../store/cart';
import { useUserStore } from '../store/user';
import { formatYuan } from '../utils/money';
import { MAX_CART_QUANTITY } from '../utils/constants';
import { COLOR } from '../utils/colors';

const props = defineProps({
  /** 由父页面注入：它已经算好了自己的 tabbar 高度（含安全区） */
  bottomOffset: { type: String, default: '0px' },
});

const cartStore = useCartStore();
const userStore = useUserStore();

const sheetOpen = ref(false);

// ------------------------------------------------------------------- 派生
/** 没登录或一件都没有就不显示横条 —— 空壳横条只会占地方 */
const visible = computed(() => userStore.isLogin && !cartStore.isEmpty);

const items = computed(() => cartStore.snapshot?.list || []);
const availableCount = computed(() => items.value.filter((it) => it.available).length);

/** 徽标最多显示 99+，否则三位数会把气泡撑成椭圆 */
const badgeText = computed(() => {
  const n = cartStore.count;
  return n > 99 ? '99+' : String(n);
});

const checkoutText = computed(() =>
  cartStore.canCheckout ? `去结算(${cartStore.totalQuantity})` : '去结算',
);

/**
 * 吸底横条的定位。
 * ⚠️ `bottom` 必须**显式**给（不能只写在 CSS 里靠默认值）：
 *    `position:fixed` 在不写 top/bottom 时会停在「静态位置」，
 *    而它前面全是 fixed 的兄弟节点 → 会被顶到页面顶部（用户报的「浮层跑到顶端」就是这个）。
 */
const barStyle = computed(() => ({
  bottom: props.bottomOffset,
}));

/** 浮层：贴底升起，底部留出横条 + tabbar 的高度，最多占 62% 屏 */
const sheetStyle = computed(() => ({
  bottom: props.bottomOffset,
  maxHeight: '62vh',
}));

/** 遮罩跟着浮层的顶边上去：浮层多高遮罩就盖到哪，别把整屏都压黑 */
const maskStyle = computed(() => ({
  bottom: props.bottomOffset,
}));

// ------------------------------------------------------------------- 操作
function toggleSheet() {
  sheetOpen.value = !sheetOpen.value;
}

function closeSheet() {
  sheetOpen.value = false;
}

function capOf(item) {
  return Math.max(1, Math.min(Number(item.stock) || 0, MAX_CART_QUANTITY));
}

/**
 * 「−」永远可点（只要条目还能买）——
 * 数量 1 时点它就是**删除**，所以这里不能再要求 `quantity > 1`，
 * 否则按钮变灰、用户以为坏了（旧版就是这个问题）。
 */
function canDecrease(item) {
  return !!item.available;
}

function canIncrease(item) {
  return item.available && Number(item.quantity) < capOf(item);
}

/**
 * 单步加减。
 * ⚠️ `delta < 0 && quantity === 1` 走**删除**分支，不是「不能再少」——
 *    这是用户明确要求的交互：数量减到 1 后再点「−」= 删掉这件商品。
 *    删除走 `confirmRemove`（带二次确认），避免误触直接清掉。
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
      title: cap >= MAX_CART_QUANTITY ? `单品最多 ${MAX_CART_QUANTITY} 件` : `库存只剩 ${item.stock} ${item.unit || '件'}`,
      icon: 'none',
    });
    return;
  }
  try {
    await cartStore.stepQuantity(item, delta);
  } catch {
    /* request 层已 toast，store 内会重拉校正 */
  }
}

async function onToggleAll(next) {
  try {
    await cartStore.setAllSelected(next);
  } catch {
    /* 同上 */
  }
}

/**
 * 删除一条。
 * ⚠️ action 名是 `removeItem`（不是 `remove`）—— store 里根本没有 `remove`，
 *    之前写成 `cartStore.remove(...)` 会抛 TypeError，被下面的 catch 吞掉，
 *    表现成「点了删除没反应、数据也没变」。这就是用户报的「删除功能失效」。
 *    真正落库的是 `DELETE /cart/:id`（`cartApi.remove`）。
 */
function confirmRemove(item) {
  uni.showModal({
    title: '删掉这件商品？',
    content: item.name,
    confirmText: '删除',
    confirmColor: COLOR.danger,
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await cartStore.removeItem(item.id);
      } catch {
        /* request 层已 toast */
      }
    },
  });
}

/**
 * 去结算。
 * ⚠️ 必须把**已勾选条目**的 id 带上（`?cartIds=1,2`）——
 *    确认页是按 cartIds 去 `POST /orders/preview` 拿服务端算好的金额的，
 *    不带参数就会被判成「没有要下单的商品」，报「结算信息没拿到」。
 *    旧版这里直接跳 `/pages/order/confirm`（无参）→ 用户报的结算失败。
 *    口径与 `pages/cart/cart.vue` 的 goCheckout 完全一致：只带**可结算且已勾选**的。
 */
function goCheckout() {
  const ids = cartStore.selectedItems.map((it) => it.id);
  if (!ids.length) {
    uni.showToast({ title: '先勾选要结算的商品', icon: 'none' });
    return;
  }
  closeSheet();
  uni.navigateTo({ url: `/pages/order/confirm?cartIds=${ids.join(',')}` });
}
</script>

<style lang="scss" scoped>
/* ================================================================ 占位 */
.cbar__placeholder {
  height: 0;
}

/* ================================================================ 横条 */
.cbar {
  position: fixed;
  left: 0;
  right: 0;
  /* bottom 由父页面的 bottomOffset 经内联 style 传入（含 tabbar 高度）。
     这里写 0 只是兜底：fixed 元素必须有一个 top/bottom 锚点，
     否则会停在静态位置被顶到页面顶端。 */
  bottom: 0;
  z-index: 400;
  background-color: $color-action;
  /* 横条自己也躲开安全区，否则底部那条会被压 */
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.12);
}

.cbar__handle {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-2 $space-4;
}

.cbar__icon-wrap {
  position: relative;
  flex: none;
}

.cbar__badge {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: $radius-pill;
  background-color: $color-danger;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cbar__badge-text {
  font-size: 10px;
  line-height: 1;
  font-weight: $font-weight-semibold;
  color: $color-text-inverse;
  font-variant-numeric: tabular-nums;
}

.cbar__info {
  flex: 1;
  min-width: 0;
}

/* PriceText 内部用的是自己的色板，橙底上必须在这一层强制翻白 */
.cbar__amount {
  color: $color-text-inverse;
}

.cbar__hint {
  display: block;
  font-size: $font-size-xs;
  color: rgba(255, 255, 255, 0.85);
  /* 单行省略：长商品名会把整条横条撑宽 */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cbar__toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  border-radius: $radius-pill;
  background-color: rgba(255, 255, 255, 0.2);
}

.cbar__toggle-text {
  font-size: $font-size-xs;
  color: $color-text-inverse;
}

/* forward 图标默认朝右，转 90° 变成朝下；展开浮层时反转向朝上 */
.cbar__toggle-icon {
  transform: rotate(90deg);
}

.cbar__toggle-icon--up {
  transform: rotate(-90deg);
}

/* ================================================================ 操作行 */
.cbar__ops {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.cbar__ops-inner {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: 6px $space-4 8px;
}

/* 浮层里 checkbox 的标签是深色字，横条上要翻成白字 */
.cbar__ops :deep(.cbox__label) {
  color: $color-text-inverse;
}

.cbar__spacer {
  flex: 1;
  min-width: 0;
}

/* ================================================================ 遮罩 */
.csheet__mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  /* bottom 由内联 style 控制（要与浮层一起让开横条） */
  z-index: 410;
  background-color: rgba(0, 0, 0, 0.35);
}

/* ================================================================ 浮层 */
.csheet {
  position: fixed;
  left: 0;
  right: 0;
  /* ⚠️ 兜底 bottom:0。真正生效的值由内联 `sheetStyle` 覆盖 ——
     但**绝不能**一个都不写：position:fixed 既不写 top 也不写 bottom 时，
     元素会停在「静态位置」，而它前面的兄弟节点都是 fixed（脱离文档流），
     结果就是浮层被顶到**页面顶端**（用户报的缺陷 1）。 */
  bottom: 0;
  z-index: 420;
  display: flex;
  flex-direction: column;
  background-color: $color-surface;
  border-radius: $radius-lg $radius-lg 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.16);
}

.csheet__head {
  flex: none;
  display: flex;
  align-items: center;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $color-border-subtle;
}

.csheet__title {
  flex: 1;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.csheet__close {
  flex: none;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-pill;
  background-color: $color-surface-sunken;
}

.csheet__close--hover {
  background-color: $color-surface-2;
}

/* min-height:0 是必须的：scroll-view 作为 flex 子项，不写会被内容撑开不滚 */
.csheet__list {
  flex: 1;
  min-height: 0;
  max-height: 46vh;
  padding: 0 $space-4;
}

/* ---------------------------------------------------------------- 骨架 */
.csheet__sk {
  padding: $space-3 $space-4;
}

.csheet__sk-row {
  display: flex;
  gap: $space-3;
  padding: $space-2 0;
}

.csheet__sk-lines {
  flex: 1;
  min-width: 0;
  padding-top: 4px;
}

/* ---------------------------------------------------------------- 空态 */
.csheet__empty {
  padding: $space-6 $space-4;
  text-align: center;
}

.csheet__empty-text {
  display: block;
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.csheet__empty-sub {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin-top: 4px;
}

/* ---------------------------------------------------------------- 条目 */
.csheet__item {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 0;
  border-bottom: 1px solid $color-border-subtle;
}

/* 最后一条不画分隔线，否则紧贴浮层底边像被切断 */
.csheet__item:last-child {
  border-bottom: none;
}

.csheet__thumb {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: $radius-sm;
  overflow: hidden;
  background-color: $color-surface-sunken;
}

.csheet__main {
  flex: 1;
  min-width: 0;
}

.csheet__name {
  display: block;
  font-size: $font-size-sm;
  color: $color-text-primary;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.csheet__meta {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin-top: 2px;
}

.csheet__reason {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 2px;
}

.csheet__reason-text {
  font-size: $font-size-xs;
  color: $color-warning;
}

.csheet__right {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

/* ---------------------------------------------------------------- 步进器 */
.stepper {
  display: flex;
  align-items: center;
  border: 1px solid $color-border-subtle;
  border-radius: $radius-sm;
  overflow: hidden;
}

.stepper__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  background-color: $color-surface-2;
}

.stepper__btn--hover {
  background-color: $color-surface-sunken;
}

.stepper__btn--off {
  opacity: 0.4;
}

.stepper__val {
  min-width: 34px;
  height: 26px;
  line-height: 26px;
  text-align: center;
  font-size: $font-size-xs;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  border-left: 1px solid $color-border-subtle;
  border-right: 1px solid $color-border-subtle;
  font-variant-numeric: tabular-nums;
}
</style>