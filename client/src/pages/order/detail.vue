<template>
  <view class="page-root odetail">
    <NavBar title="订单详情" :back="true" border />

    <view class="page-body odetail__body">
      <!-- ==================================================== 首屏骨架 -->
      <template v-if="loading && !order">
        <view class="surface card">
          <view class="sk sk--line" style="width: 40%" />
          <view class="sk sk--line" style="width: 60%; margin-top: 12px" />
        </view>
        <view class="surface card">
          <view class="sk sk--line" style="width: 70%" />
          <view class="sk sk--line" style="width: 45%; margin-top: 12px" />
        </view>
      </template>

      <!-- ==================================================== 加载失败 -->
      <EmptyState
        v-else-if="loadError"
        variant="error"
        :title="errorTitle"
        :desc="loadError"
        action-text="重新加载"
        @action="loadOrder"
      />

      <template v-else-if="order">
        <!-- ============================================ ① 状态头 -->
        <view class="surface hero" :class="[`hero--${hero.variant}`]">
          <view class="hero__icon">
            <!-- ⚠️ `color` 显式给：小程序端 `<image>` 不吃 CSS color。
                 不给的话 5 个状态的 hero 图标全变深灰，状态色整个丢掉。映射见 `heroIconColor`。 -->
            <AppIcon
              :name="hero.icon"
              :size="24"
              :stroke-width="2.2"
              :color="heroIconColor"
            />
          </view>
          <view class="hero__main">
            <text class="hero__title">{{ hero.title }}</text>
            <text class="hero__desc">{{ hero.desc }}</text>
          </view>
        </view>

        <!-- ============================================ ② 状态轨迹 -->
        <view class="surface card">
          <view class="card__head">
            <AppIcon name="order-timeline" :size="16" color="#C7450A" />
            <text class="card__title">订单进度</text>
          </view>
          <StatusTimeline :logs="order.statusLogs" :created-at="order.createdAt" />
        </view>

        <!-- ============================================ ③ 商品清单 -->
        <view class="surface card">
          <view class="card__head">
            <AppIcon name="bag" :size="16" color="#C7450A" />
            <text class="card__title">商品清单</text>
            <text class="card__head-right">共 {{ order.totalQuantity }} 件</text>
          </view>

          <view class="goods">
            <OrderItemRow
              v-for="(it, i) in order.items"
              :key="it.id || i"
              class="goods__row"
              :item="it"
              :thumb="48"
            />
          </view>

          <view class="divider" />

          <view class="mrow">
            <text class="mrow__k">商品金额</text>
            <text class="mrow__v">{{ formatYuan(order.totalAmount) }}</text>
          </view>
          <view class="mrow">
            <text class="mrow__k">配送费</text>
            <text class="mrow__v mrow__v--free">宿舍楼下免配送费</text>
          </view>
          <view class="mrow mrow--total">
            <text class="mrow__k">合计</text>
            <PriceText :value="order.totalAmount" size="lg" />
          </view>

          <view class="paynote">
            <AppIcon name="money" :size="14" color="#0E8A43" />
            <text class="paynote__text">货到付款 · 当面结算，线上不收钱</text>
          </view>
        </view>

        <!-- ============================================ ④ 收货信息 -->
        <view class="surface card">
          <view class="card__head">
            <AppIcon name="location" :size="16" color="#C7450A" />
            <text class="card__title">收货信息</text>
          </view>

          <view class="row">
            <text class="row__label">送达地址</text>
            <text class="row__value">{{ order.roomNo }}</text>
          </view>
          <view class="row">
            <text class="row__label">联系人</text>
            <text class="row__value">{{ order.contactName }}</text>
          </view>
          <view class="row">
            <text class="row__label">联系电话</text>
            <text class="row__value row__value--mono">{{ order.contactPhone }}</text>
          </view>
          <view v-if="order.remark" class="row row--remark">
            <text class="row__label">备注</text>
            <text class="row__value row__value--remark">{{ order.remark }}</text>
          </view>
        </view>

        <!-- ============================================ ⑤ 订单信息 -->
        <view class="surface card">
          <view class="card__head">
            <AppIcon name="receipt" :size="16" color="#C7450A" />
            <text class="card__title">订单信息</text>
          </view>

          <view class="row">
            <text class="row__label">订单号</text>
            <view class="row__value-wrap">
              <text class="row__value row__value--mono">{{ order.orderNo }}</text>
              <view class="copybtn" @tap="copyOrderNo">
                <AppIcon name="copy" :size="13" color="#C7450A" />
                <text class="copybtn__text">复制</text>
              </view>
            </view>
          </view>
          <view class="row">
            <text class="row__label">下单时间</text>
            <text class="row__value">{{ formatDateTime(order.createdAt) }}</text>
          </view>
          <view v-if="order.deliveredAt" class="row">
            <text class="row__label">送达时间</text>
            <text class="row__value">{{ formatDateTime(order.deliveredAt) }}</text>
          </view>
          <view v-if="order.cancelledAt" class="row">
            <text class="row__label">取消时间</text>
            <text class="row__value">{{ formatDateTime(order.cancelledAt) }}</text>
          </view>
          <view v-if="order.cancelReason" class="row row--remark">
            <text class="row__label">取消原因</text>
            <text class="row__value row__value--remark">{{ order.cancelReason }}</text>
          </view>
        </view>

        <view class="odetail__pad" />
      </template>
    </view>

    <!-- ==================================================== 底部操作栏 -->
    <view v-if="order && showBar" class="obar">
      <view class="obar__hint">
        <text class="obar__hint-text">{{ barHint }}</text>
      </view>
      <AppButton
        v-if="canCancel"
        type="secondary"
        size="md"
        text="取消订单"
        @tap="openCancel"
      />
      <AppButton
        v-else-if="canRebuy"
        type="primary"
        size="md"
        text="再来一单"
        @tap="rebuy"
      />
    </view>

    <!-- 取消订单确认弹层 -->
    <ConfirmSheet
      v-model="cancelSheet.show"
      title="取消订单"
      :desc="order ? `订单 ${order.orderNo}` : ''"
      confirm-text="确认取消"
      :loading="cancelSheet.loading"
      show-input
      v-model:input-value="cancelSheet.reason"
      placeholder="说说原因（选填，店长能看到）"
      :quick-reasons="QUICK_REASONS"
      @confirm="doCancel"
    />
  </view>
</template>

<script setup>
/**
 * 订单详情
 *
 * 数据源：`GET /orders/:id`（OrderDetailVo）。
 *
 * 三个状态分支必须都对：
 *   · `50001` 订单不存在 / 不是你的订单 → 后端**故意统一**成同一个码（防探测），
 *     所以前端也只能给一句中性文案，不能提示「这不是你的订单」
 *   · v1.2 起没有派单端，未送达（PENDING / DELIVERING）都能自助取消
 *   · 终态（DELIVERED / CANCELLED）→ 没有可做的操作，给「再来一单」收尾
 *
 * 参数签名守卫：和确认订单页同样的坑（uni-app hash 路由只改查询串不重跑 onLoad）。
 */
import { computed, reactive, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppButton from '../../components/AppButton.vue';
import EmptyState from '../../components/EmptyState.vue';
import PriceText from '../../components/PriceText.vue';
import StatusTimeline from '../../components/StatusTimeline.vue';
import OrderItemRow from '../../components/OrderItemRow.vue';
import ConfirmSheet from '../../components/ConfirmSheet.vue';
import { orderApi } from '../../api/order';
import { useCartStore } from '../../store/cart';
import { OrderStatus, CUSTOMER_CANCELLABLE } from '../../utils/constants';
import { formatYuan, toErrorMessage } from '../../utils/money';
import { formatDateTime } from '../../utils/format';
import { COLOR } from '../../utils/colors';

const cartStore = useCartStore();

const QUICK_REASONS = ['买错了', '不想要了', '等太久了', '想换别的'];

const orderId = ref(0);
const order = ref(null);
const loading = ref(false);
const loadError = ref('');
/** 区分「参数不对」和「接口失败」两种错误文案 */
const errorKind = ref('load');

// ------------------------------------------------------------------- 状态头
const HERO = {
  [OrderStatus.PENDING]: {
    variant: 'warning',
    icon: 'clock',
    title: '待接单',
    desc: '店长还没看到这一单，稍等一下下',
  },
  [OrderStatus.DELIVERING]: {
    variant: 'solid',
    icon: 'truck',
    title: '处理中',
    desc: '店长正在准备你的订单',
  },
  [OrderStatus.DELIVERED]: {
    variant: 'success',
    icon: 'finished',
    title: '已送达',
    desc: '订单完成，记得当面结算',
  },
  [OrderStatus.CANCELLED]: {
    variant: 'muted',
    icon: 'close',
    title: '已取消',
    desc: '这一单已经取消了',
  },
};

const hero = computed(
  () => HERO[order.value?.status] || { variant: 'muted', icon: 'alert', title: '未知状态', desc: '' },
);

/**
 * hero 图标色（小程序端通道）
 * 必须与下面 `.hero--xxx .hero__icon { color }` 一致：
 * solid 是实底橙 → 白图标；其余三档是浅底 → 各自的彩色。
 */
const HERO_ICON_COLOR = {
  warning: COLOR.warning,
  action: COLOR.action,
  solid: COLOR.textInverse,
  success: COLOR.success,
  muted: COLOR.textMuted,
};

const heroIconColor = computed(
  () => HERO_ICON_COLOR[hero.value.variant] || COLOR.textMuted,
);

// ------------------------------------------------------------------- 操作栏
const canCancel = computed(() => !!order.value && CUSTOMER_CANCELLABLE.includes(order.value.status));
const canRebuy = computed(() =>
  !!order.value && [OrderStatus.DELIVERED, OrderStatus.CANCELLED].includes(order.value.status),
);

const showBar = computed(() => canCancel.value || canRebuy.value);

const barHint = computed(() => {
  if (canCancel.value) return '还没送达，可以自己取消';
  if (order.value?.status === OrderStatus.CANCELLED) return '已取消，库存已经还回去了';
  return '还想吃同样的？';
});

// ------------------------------------------------------------------- 加载
async function loadOrder() {
  if (!orderId.value) {
    errorKind.value = 'param';
    loadError.value = '没有拿到订单号，请从订单列表进来';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    order.value = await orderApi.detail(orderId.value);
  } catch (err) {
    errorKind.value = 'load';
    // 后端把「不存在」和「不是你的」统一成 50001（防探测），所以文案也只能中性
    loadError.value = toErrorMessage(err, '订单详情加载失败');
  } finally {
    loading.value = false;
  }
}

const errorTitle = computed(() =>
  errorKind.value === 'param' ? '订单号不对' : '订单没打开',
);

// ------------------------------------------------------------------- 取消
const cancelSheet = reactive({ show: false, loading: false, reason: '' });

function openCancel() {
  cancelSheet.show = true;
  cancelSheet.loading = false;
  cancelSheet.reason = '';
}

async function doCancel() {
  cancelSheet.loading = true;
  try {
    // 后端返回的是新的完整详情，直接替换，省一次请求
    order.value = await orderApi.cancel(orderId.value, {
      reason: cancelSheet.reason.trim() || undefined,
    });
    cancelSheet.show = false;
    uni.showToast({ title: '订单已取消', icon: 'none' });
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '取消失败'), icon: 'none' });
  } finally {
    cancelSheet.loading = false;
  }
}

// ------------------------------------------------------------------- 其他
function copyOrderNo() {
  uni.setClipboardData({
    data: order.value.orderNo,
    success: () => uni.showToast({ title: '订单号已复制', icon: 'none' }),
  });
}

/** 再来一单：把这一单的商品重新加回购物车，然后去购物车 */
async function rebuy() {
  const items = order.value?.items || [];
  if (!items.length) return;
  try {
    for (const it of items) {
      // 串行加购：后端 add() 对同一商品是累加，并发会打乱顺序（虽然结果一样，
      // 但串行能让「部分失败」时的语义更清楚）
      await cartStore.add(it.productId, it.quantity);
    }
    uni.showToast({ title: '已加回购物车', icon: 'none' });
    setTimeout(() => uni.reLaunch({ url: '/pages/cart/cart' }), 500);
  } catch (err) {
    // 商品可能已下架 —— 这是真实的边界，提示就好，不要静默
    uni.showToast({ title: toErrorMessage(err, '加购失败，可能已下架'), icon: 'none' });
  }
}

// ------------------------------------------------------------- 生命周期
let appliedSignature = '';

function applyRouteOptions(options) {
  const id = Number(options?.id) || 0;
  const signature = `id=${id}`;
  if (signature === appliedSignature) return false;
  appliedSignature = signature;

  orderId.value = id;
  order.value = null;
  loadError.value = '';
  loadOrder();
  return true;
}

onLoad((options) => {
  applyRouteOptions(options);
});

onShow(() => {
  const pages = getCurrentPages();
  const current = pages.length ? pages[pages.length - 1] : null;
  const opts = current?.$page?.options || current?.options || null;
  if (opts) applyRouteOptions(opts);
});
</script>

<style lang="scss" scoped>
.odetail {
  background-color: $color-bg-app;
}

.odetail__body {
  padding: $space-3 $space-4;
}

.card {
  padding: $space-4;
  margin-bottom: $space-3;
}

.card + .card {
  margin-top: 0;
}

.card__head {
  display: flex;
  align-items: center;
  gap: $space-2;
  margin-bottom: $space-3;
}

.card__title {
  flex: 1;
  min-width: 0;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.card__head-right {
  flex: none;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* ==================================================================== 状态头 */
.hero {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-4;
  margin-bottom: $space-3;
}

.hero__icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: $radius-pill;
}

.hero__main {
  flex: 1;
  min-width: 0;
}

.hero__title {
  display: block;
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
}

.hero__desc {
  display: block;
  margin-top: 3px;
  font-size: $font-size-sm;
}

.hero--warning {
  background-color: $color-warning-soft;

  .hero__icon {
    background-color: rgba(184, 110, 0, 0.14);
    color: $color-warning;
  }
  .hero__title {
    color: $color-text-primary;
  }
  .hero__desc {
    color: #8a6420;
  }
}

.hero--action {
  background-color: $color-action-soft;

  .hero__icon {
    background-color: rgba(199, 69, 10, 0.12);
    color: $color-action;
  }
  .hero__title {
    color: $color-text-primary;
  }
  .hero__desc {
    color: $color-action;
  }
}

/* 配送中：实底橙 + 白字，最有推进感 */
.hero--solid {
  background-color: $color-action;

  .hero__icon {
    background-color: rgba(255, 255, 255, 0.18);
    color: $color-text-inverse;
  }
  .hero__title {
    color: $color-text-inverse;
  }
  .hero__desc {
    color: rgba(255, 255, 255, 0.86);
  }
}

.hero--success {
  background-color: $color-success-soft;

  .hero__icon {
    background-color: rgba(14, 138, 67, 0.12);
    color: $color-success;
  }
  .hero__title {
    color: $color-text-primary;
  }
  .hero__desc {
    color: #2f6b45;
  }
}

.hero--muted {
  background-color: $color-surface-sunken;

  .hero__icon {
    background-color: rgba(104, 112, 126, 0.12);
    color: $color-text-muted;
  }
  .hero__title {
    color: $color-text-primary;
  }
  .hero__desc {
    color: $color-text-muted;
  }
}

/* ================================================================== 商品清单 */
.goods {
  display: flex;
  flex-direction: column;
  gap: $space-3;
}

.goods__row + .goods__row {
  margin-top: 0;
}

/* ==================================================================== 金额 */
.divider {
  height: 1px;
  margin: $space-3 0;
  background-color: $color-border-subtle;
}

.mrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
}

.mrow__k {
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.mrow__v {
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.mrow__v--free {
  color: $color-success;
  font-size: $font-size-xs;
}

.mrow--total .mrow__k {
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.paynote {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: $space-3;
  padding: $space-2 $space-3;
  border-radius: $radius-sm;
  background-color: $color-success-soft;
}

.paynote__text {
  font-size: $font-size-xs;
  color: #2f6b45;
}

/* ================================================================ 收货信息 */
.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: $space-3;
  min-height: 34px;
  padding: 3px 0;
}

.row__label {
  flex: none;
  width: 76px;
  font-size: $font-size-sm;
  color: $color-text-secondary;
  line-height: 1.5;
}

.row__value {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: $font-size-sm;
  line-height: 1.5;
  color: $color-text-primary;
  word-break: break-all;
}

.row--remark .row__value--remark {
  text-align: right;
  padding: $space-2;
  border-radius: $radius-sm;
  background-color: $color-surface-2;
  font-size: $font-size-xs;
  line-height: 1.6;
  color: $color-text-secondary;
}

.row__value--mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.row__value-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: $space-2;
}

.row__value-wrap .row__value {
  flex: 0 1 auto;
}

.copybtn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: $radius-xs;
  background-color: $color-action-soft;
}

.copybtn__text {
  font-size: $font-size-xs;
  color: $color-action;
}

/* ============================================================== 底部操作栏 */
.odetail__pad {
  /**
   * 占位 = `.obar` 真实高度（含安全区）。
   * 这个页的 `.obar` 用了 `padding-bottom: calc(12px + env(...))`，
   * 刘海屏上会比 76px 高出约 34px —— 原来的 76px 不管安全区，最后一条状态轨迹会被盖住。
   */
  height: calc(76px + env(safe-area-inset-bottom));
}

.obar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-4 calc(#{$space-3} + env(safe-area-inset-bottom));
  background-color: $color-surface;
  border-top: 1px solid $color-border-subtle;
  z-index: 500;
}

.obar__hint {
  flex: 1;
  min-width: 0;
}

.obar__hint-text {
  font-size: $font-size-xs;
  line-height: 1.4;
  color: $color-text-muted;
}

/* ====================================================================== 骨架 */
.sk {
  background-color: $color-surface-sunken;
  border-radius: $radius-xs;
  animation: sk-fade 1.2s ease-in-out infinite;
}

.sk--line {
  height: 14px;
}

@keyframes sk-fade {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
