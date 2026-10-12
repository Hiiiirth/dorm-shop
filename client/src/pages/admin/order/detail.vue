<template>
  <view class="page-root adetail">
    <NavBar title="订单详情" :back="true" border />

    <view class="page-body adetail__body">
      <!-- 首屏骨架 -->
      <view v-if="loading && !order" class="skgroup">
        <view class="surface card">
          <view class="sk sk--line" style="width: 45%" />
          <view class="sk sk--line" style="width: 70%; margin-top: 12px" />
        </view>
        <view class="surface card">
          <view class="sk sk--line" style="width: 60%" />
          <view class="sk sk--line" style="width: 35%; margin-top: 12px" />
          <view class="sk sk--line" style="width: 50%; margin-top: 12px" />
        </view>
      </view>

      <!-- 加载失败 -->
      <EmptyState
        v-else-if="loadError"
        variant="error"
        :desc="loadError"
        action-text="重新加载"
        @action="load"
      />

      <template v-else-if="order">
        <!-- ============================================ ① 状态 + 顾客 -->
        <view class="surface hero" :class="[`hero--${hero.variant}`]">
          <view class="hero__row">
            <view class="hero__icon">
              <AppIcon :name="hero.icon" :size="20" :color="HERO_ICON_COLOR[hero.variant] || COLOR.textMuted" />
            </view>
            <view class="hero__main">
              <text class="hero__title">{{ hero.title }}</text>
              <text class="hero__desc">{{ hero.desc }}</text>
            </view>
            <OrderStatusTag :status="order.status" size="sm" />
          </view>

          <!-- 店长视角最关心的是「谁点的、送哪、什么时候」 -->
          <view class="hero__who">
            <view class="hero__who-item">
              <text class="hero__who-k">顾客</text>
              <text class="hero__who-v">{{ customerName }}</text>
            </view>
            <view class="hero__who-item">
              <text class="hero__who-k">电话</text>
              <text class="hero__who-v hero__who-v--mono">{{ order.contactPhone || '—' }}</text>
            </view>
            <view class="hero__who-item">
              <text class="hero__who-k">送达</text>
              <text class="hero__who-v">{{ order.roomNo || '未填门牌' }}</text>
            </view>
          </view>
        </view>

        <!-- ============================================ ② 商品清单（全量） -->
        <view class="surface card">
          <view class="card__head">
            <AppIcon name="receipt" :size="16" :color="COLOR.action" />
            <text class="card__title">商品清单</text>
            <text class="card__head-right">
              {{ orderKindText }} · 共 {{ totalQuantity }} 件
            </text>
          </view>

          <!--
            这里列**全部** items，不是列表页那种「第一件 + 等 N 种」。
            店长要在这一页把货凑齐，漏一件就得来回翻。
          -->
          <view class="goods">
            <OrderItemRow
              v-for="(it, i) in order.items"
              :key="it.id || i"
              class="goods__row"
              :item="it"
              :thumb="52"
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
            <text class="mrow__k">应收合计</text>
            <PriceText :value="order.totalAmount" size="lg" />
          </view>

          <view class="paynote">
            <AppIcon name="money" :size="14" :color="COLOR.success" />
            <text class="paynote__text">货到付款 · 线下当面结算，线上不收钱</text>
          </view>
        </view>

        <!-- ============================================ ③ 备注（重点） -->
        <view class="surface card">
          <view class="card__head">
            <AppIcon name="alert" :size="16" :color="COLOR.warning" />
            <text class="card__title">顾客备注</text>
          </view>

          <!-- 没备注也要给一句「无」，不能留白让人以为没加载出来 -->
          <view v-if="order.remark" class="remark remark--on">
            <text class="remark__text">{{ order.remark }}</text>
          </view>
          <view v-else class="remark">
            <text class="remark__empty">这一单没有备注</text>
          </view>
        </view>

        <!-- ============================================ ④ 收货与联系 -->
        <view class="surface card">
          <view class="card__head">
            <AppIcon name="location" :size="16" :color="COLOR.action" />
            <text class="card__title">收货信息</text>
          </view>
          <view class="row">
            <text class="row__label">联系人</text>
            <text class="row__value">{{ order.contactName || '—' }}</text>
          </view>
          <view class="row">
            <text class="row__label">联系电话</text>
            <view class="row__value-wrap">
              <text class="row__value row__value--mono">{{ order.contactPhone || '—' }}</text>
              <view class="copybtn" @tap="copyPhone">
                <AppIcon name="copy" :size="13" :color="COLOR.action" />
                <text class="copybtn__text">复制</text>
              </view>
            </view>
          </view>
          <view class="row">
            <text class="row__label">送达门牌</text>
            <text class="row__value">{{ order.roomNo || '未填写' }}</text>
          </view>
        </view>

        <!-- ============================================ ⑤ 订单信息 -->
        <view class="surface card">
          <view class="card__head">
            <AppIcon name="clock" :size="16" :color="COLOR.action" />
            <text class="card__title">订单信息</text>
          </view>
          <view class="row">
            <text class="row__label">订单号</text>
            <view class="row__value-wrap">
              <text class="row__value row__value--mono">{{ order.orderNo }}</text>
              <view class="copybtn" @tap="copyOrderNo">
                <AppIcon name="copy" :size="13" :color="COLOR.action" />
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

        <!-- ============================================ ⑥ 状态流转 -->
        <view class="surface card">
          <view class="card__head">
            <AppIcon name="history" :size="16" :color="COLOR.action" />
            <text class="card__title">状态流转</text>
          </view>
          <StatusTimeline :logs="order.statusLogs || []" />
        </view>

        <view class="adetail__pad" />
      </template>
    </view>

    <!-- ==================================================== 底部操作栏 -->
    <!-- 与列表页同款：按状态给对应操作，终态不给任何按钮 -->
    <view v-if="order" class="obar">
      <view class="obar__hint">
        <text class="obar__hint-text">{{ barHint }}</text>
      </view>
      <AppButton
        v-if="order.status === 'PENDING'"
        type="secondary"
        size="md"
        text="接单"
        @tap="doAccept"
      />
      <AppButton
        v-if="order.status === 'PENDING' || order.status === 'DELIVERING'"
        type="primary"
        size="md"
        text="确认送达"
        @tap="doDeliver"
      />
      <AppButton
        v-if="order.status === 'PENDING' || order.status === 'DELIVERING'"
        type="text"
        size="md"
        text="取消"
        @tap="askCancel"
      />
    </view>

    <!-- 强制取消：必填原因 -->
    <ConfirmSheet
      v-model="cancelSheet.show"
      title="强制取消订单"
      :desc="order ? `订单 ${order.orderNo}` : ''"
      confirm-text="确认取消"
      :loading="cancelSheet.loading"
      show-input
      v-model:input-value="cancelSheet.reason"
      placeholder="说说原因（顾客会看到）"
      :quick-reasons="QUICK_REASONS"
      @confirm="doCancel"
    />
  </view>
</template>

<script setup>
/**
 * 管理端 · 订单详情
 *
 * 为什么单独一页：订单列表是**扫单**工具，一屏能看七八单，所以只显示
 * 「第一件商品 + 等 N 种」。但店长真正要做事的时候是**凑货**——
 * 得知道一共几样东西、每样几件、顾客有没有备注。这些必须一页看全，
 * 不能来回切列表。所以列表点一下就跳这里。
 *
 * 数据源：`GET /admin/orders/:id`（比列表多 statusLogs / cancelReason）。
 * 注意：订单 id 是**数字主键**，不是列表里展示的 SO 开头单号。
 *
 * 身份守卫：`if (!isAdmin) return` —— 这一页必然发 /admin 请求，
 * 所以后端的 @Roles(ADMIN) 能兜底，但前端守卫要排在骨架屏前面，
 * 否则顾客手输 URL 会永远停在骨架屏上。
 */
import { computed, reactive, ref } from 'vue';
import { onLoad, onUnload, onShow } from '@dcloudio/uni-app';
import NavBar from '../../../components/NavBar.vue';
import AppIcon from '../../../components/AppIcon.vue';
import AppButton from '../../../components/AppButton.vue';
import EmptyState from '../../../components/EmptyState.vue';
import OrderStatusTag from '../../../components/OrderStatusTag.vue';
import OrderItemRow from '../../../components/OrderItemRow.vue';
import StatusTimeline from '../../../components/StatusTimeline.vue';
import PriceText from '../../../components/PriceText.vue';
import ConfirmSheet from '../../../components/ConfirmSheet.vue';
import { adminApi } from '../../../api/admin';
import { useUserStore } from '../../../store/user';
import { OrderStatus } from '../../../utils/constants';
import { formatYuan, toErrorMessage } from '../../../utils/money';
import { formatDateTime } from '../../../utils/format';
import { COLOR } from '../../../utils/colors';

const userStore = useUserStore();
const isAdmin = computed(() => userStore.currentRole === 'ADMIN');

const QUICK_REASONS = ['商品缺货', '联系不上顾客', '顾客主动取消', '重复下单'];

const orderId = ref(0);
const order = ref(null);
const loading = ref(true);
const loadError = ref('');

const cancelSheet = reactive({ show: false, loading: false, reason: '' });

// ----------------------------------------------------------------- 展示派生
const HERO = {
  [OrderStatus.PENDING]: {
    variant: 'warning',
    icon: 'clock',
    title: '待接单',
    desc: '顾客已下单，还没开始处理',
  },
  [OrderStatus.DELIVERING]: {
    variant: 'solid',
    icon: 'truck',
    title: '配送中',
    desc: '已接单，正在准备/配送',
  },
  [OrderStatus.DELIVERED]: {
    variant: 'success',
    icon: 'finished',
    title: '已送达',
    desc: '订单完成，款项线下当面结算',
  },
  [OrderStatus.CANCELLED]: {
    variant: 'muted',
    icon: 'close',
    title: '已取消',
    desc: '这一单已经取消',
  },
};

/** 必须与样式里的 `.hero--xxx .hero__icon` 配色一致（小程序端不走 CSS color） */
const HERO_ICON_COLOR = {
  warning: COLOR.warning,
  action: COLOR.action,
  solid: COLOR.textInverse,
  success: COLOR.success,
  muted: COLOR.textMuted,
};

const hero = computed(
  () => HERO[order.value?.status] || { variant: 'muted', icon: 'alert', title: '未知状态', desc: '' },
);

const customerName = computed(
  () => order.value?.customer?.nickname || order.value?.contactName || '匿名顾客',
);

/** 件数兜底：后端给 totalQuantity 就用它，只有老数据才退回 items 求和 */
const totalQuantity = computed(() => {
  const o = order.value;
  if (!o) return 0;
  if (o.totalQuantity) return o.totalQuantity;
  return (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
});

const orderKindText = computed(() => {
  const n = (order.value?.items || []).length;
  return `${n} 种`;
});

const barHint = computed(() => {
  const o = order.value;
  if (!o) return '';
  if (o.status === OrderStatus.PENDING) return '接单后开始备货';
  if (o.status === OrderStatus.DELIVERING) return '送到后点「确认送达」';
  return '订单已结束';
});

// ------------------------------------------------------------------- 数据
async function load() {
  if (!isAdmin.value) {
    loading.value = false;
    return;
  }
  if (!orderId.value) {
    loading.value = false;
    loadError.value = '订单号不对';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    order.value = await adminApi.orderDetail(orderId.value);
  } catch (err) {
    loadError.value = toErrorMessage(err, '订单没加载出来');
  } finally {
    loading.value = false;
  }
}

/**
 * 参数签名守卫 —— 与其他带参页同一个坑：
 * uni-app 的 hash 路由只改查询串时，onLoad 不重跑、onShow 也不触发。
 * 这里两处都调 applyRoute，取到的 id 变了才重新拉。
 */
let sig = '';
function applyRoute(opts) {
  const raw = opts?.id ?? opts?._r;
  // 守卫 v-if 必须排在 loading 之前：load 里顾客身份会直接 return，
  // 不复位 loading 的话顾客会永远停在骨架屏上。
  if (!isAdmin.value) {
    loading.value = false;
    return;
  }
  const next = `${raw}`;
  if (next === sig) return;
  sig = next;
  orderId.value = Number(opts?.id) || 0;
  order.value = null;
  load();
}

function toast(text) {
  uni.showToast({ title: text, icon: 'none' });
}

function copyText(value, label) {
  if (!value) {
    toast(`没有${label}`);
    return;
  }
  uni.setClipboardData({
    data: String(value),
    success: () => toast(`${label}已复制`),
    fail: () => toast('复制失败'),
  });
}

function copyOrderNo() {
  copyText(order.value?.orderNo, '订单号');
}

function copyPhone() {
  copyText(order.value?.contactPhone, '电话');
}

// ------------------------------------------------------------------- 操作
async function doAccept() {
  try {
    await adminApi.acceptOrder(orderId.value);
    uni.showToast({ title: '已接单', icon: 'success' });
    await load();
  } catch (err) {
    toast(toErrorMessage(err, '接单失败'));
  }
}

async function doDeliver() {
  try {
    await adminApi.deliverOrder(orderId.value);
    uni.showToast({ title: '已确认送达', icon: 'success' });
    await load();
  } catch (err) {
    toast(toErrorMessage(err, '操作失败'));
  }
}

function askCancel() {
  cancelSheet.reason = '';
  cancelSheet.show = true;
}

async function doCancel() {
  const reason = (cancelSheet.reason || '').trim();
  if (!reason) {
    toast('取消原因必填');
    return;
  }
  cancelSheet.loading = true;
  try {
    await adminApi.cancelOrder(orderId.value, { reason });
    cancelSheet.show = false;
    uni.showToast({ title: '已取消', icon: 'success' });
    await load();
  } catch (err) {
    toast(toErrorMessage(err, '取消失败'));
  } finally {
    cancelSheet.loading = false;
  }
}

// ----------------------------------------------------------------- 生命周期
onLoad((opts) => applyRoute(opts));
onShow(() => {
  const page = getCurrentPages().at(-1);
  applyRoute(page?.$page?.options || page?.options || {});
});
onUnload(() => {
  sig = '';
});
</script>

<style lang="scss" scoped>
.adetail {
  background-color: $color-bg-app;
}

/* 占位：把底部操作栏的高度（含安全区）让出来，避免最后一张卡被压 */
.adetail__pad {
  height: calc(72px + env(safe-area-inset-bottom));
}

/* ============================================================ 状态头 */
.hero {
  padding: $space-4;
  border-radius: $radius-lg;
}

.hero--warning { background-color: rgba($color-warning, 0.10); }
.hero--action  { background-color: $color-action-soft; }
.hero--solid   { background-color: $color-action; }
.hero--success { background-color: rgba($color-success, 0.10); }
.hero--muted   { background-color: $color-surface-sunken; }

.hero__row {
  display: flex;
  align-items: center;
  gap: $space-3;
}

.hero__icon {
  flex: none;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-pill;
  background-color: rgba(255, 255, 255, 0.6);
}

.hero--solid .hero__icon {
  background-color: rgba(255, 255, 255, 0.2);
}

.hero__main {
  flex: 1;
  min-width: 0;
}

.hero__title {
  display: block;
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.hero--solid .hero__title,
.hero--solid .hero__desc {
  color: $color-text-inverse;
}

.hero__desc {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-secondary;
  margin-top: 2px;
}

/* 顾客 / 电话 / 送达：店长第一眼要看的三件事 */
.hero__who {
  display: flex;
  gap: $space-4;
  margin-top: $space-3;
  padding-top: $space-3;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.hero--solid .hero__who {
  border-top-color: rgba(255, 255, 255, 0.25);
}

.hero__who-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.hero__who-k {
  flex: none;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.hero--solid .hero__who-k {
  color: rgba(255, 255, 255, 0.8);
}

.hero__who-v {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero--solid .hero__who-v {
  color: $color-text-inverse;
}

.hero__who-v--mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* ================================================================ 卡片 */
.card {
  padding: $space-4;
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

/* 商品清单 */
.goods__row {
  padding: $space-2 0;
}

/* ============================================================== 金额行 */
.mrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
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
}

.mrow--total {
  margin-top: 4px;
  padding-top: $space-3;
  border-top: 1px solid $color-border-subtle;
}

.mrow--total .mrow__k {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
}

.paynote {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: $space-3;
  padding: $space-2 $space-3;
  border-radius: $radius-sm;
  background-color: rgba($color-success, 0.08);
}

.paynote__text {
  font-size: $font-size-xs;
  color: $color-success;
}

/* ================================================================ 备注 */
/* 有备注时才用醒目底色 —— 备注是店长最容易漏掉的坑 */
.remark {
  padding: $space-3;
  border-radius: $radius-sm;
  background-color: $color-surface-sunken;
}

.remark--on {
  background-color: rgba($color-warning, 0.10);
  border-left: 3px solid $color-warning;
}

.remark__text {
  display: block;
  font-size: $font-size-sm;
  line-height: 1.6;
  color: $color-text-primary;
  white-space: pre-wrap;
  word-break: break-all;
}

.remark__empty {
  font-size: $font-size-sm;
  color: $color-text-muted;
}

/* ================================================================ 信息行 */
.row {
  display: flex;
  align-items: flex-start;
  gap: $space-3;
  padding: 5px 0;
}

.row__label {
  flex: none;
  width: 68px;
  font-size: $font-size-sm;
  color: $color-text-muted;
}

.row__value-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: $space-2;
}

.row__value {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  color: $color-text-primary;
  word-break: break-all;
}

/* 等宽数字：让订单号/电话里的数字对齐，跟顾客端详情页同一套写法 */
.row__value--mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.row__value--remark {
  color: $color-warning;
}

.copybtn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: $radius-pill;
  background-color: $color-action-soft;
}

.copybtn__text {
  font-size: $font-size-xs;
  color: $color-action;
}

/* ============================================================ 底部操作栏 */
.obar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2 $space-4 calc(#{$space-2} + env(safe-area-inset-bottom));
  background-color: $color-surface;
  border-top: 1px solid $color-border-subtle;
}

.obar__hint {
  flex: 1;
  min-width: 0;
}

.obar__hint-text {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* 取消入口放在末尾，跟列表页「···」一个思路：不是主路径 */
.obar__cancel {
  flex: none;
}
</style>