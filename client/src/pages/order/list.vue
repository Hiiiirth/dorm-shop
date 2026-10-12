<template>
  <view class="page-root olist">
    <NavBar :back="true" title="我的订单" border />

    <!-- ====================================================== 状态筛选页签 -->
    <scroll-view class="tabs" scroll-x :show-scrollbar="false">
      <view class="tabs__inner">
        <view
          v-for="t in statusTabs"
          :key="t.key"
          class="tab"
          :class="{ 'tab--on': t.key === activeStatus }"
          @tap="switchStatus(t.key)"
        >
          <text class="tab__text">{{ t.label }}</text>
          <view v-if="t.key === activeStatus" class="tab__bar" />
        </view>
      </view>
    </scroll-view>

    <view class="page-body olist__body">
      <!-- 首屏骨架 -->
      <view v-if="pager.isFirstLoading.value" class="sklist">
        <view v-for="i in 3" :key="`s${i}`" class="surface skcard">
          <view class="sk sk--line" style="width: 45%" />
          <view class="skcard__row">
            <view class="sk sk--thumb" />
            <view class="skcard__body">
              <view class="sk sk--line" style="width: 80%" />
              <view class="sk sk--line" style="width: 35%" />
            </view>
          </view>
        </view>
      </view>

      <EmptyState
        v-else-if="pager.firstError.value"
        variant="error"
        desc="订单列表没拿到"
        action-text="重新加载"
        @action="reload"
      />

      <EmptyState
        v-else-if="!userStore.isLogin"
        variant="empty"
        icon="user-check"
        title="登录后才能看订单"
        desc="下单、查订单、取消都需要先登录"
        action-text="去登录"
        @action="goLogin"
      />

      <EmptyState
        v-else-if="pager.isEmpty.value"
        :variant="activeStatus ? 'search' : 'empty'"
        icon="receipt"
        :title="emptyTitle"
        :desc="emptyDesc"
        action-text="去逛逛"
        @action="goHome"
      />

      <template v-else>
        <view
          v-for="o in pager.list.value"
          :key="o.id"
          class="surface ocard"
          @tap="goDetail(o.id)"
        >
          <!-- 头：订单号 + 状态标签 -->
          <view class="ocard__head">
            <view class="ocard__no">
              <text class="ocard__no-text">{{ o.orderNo }}</text>
            </view>
            <OrderStatusTag :status="o.status" size="sm" />
          </view>

          <!-- 商品缩略图横排（最多 3 个 + 更多） -->
          <view class="ocard__thumbs">
            <ProductImage
              v-for="(it, i) in thumbItems(o)"
              :key="i"
              class="ocard__thumb"
              :src="it.coverImage"
              :name="it.name"
              size="72px"
              mono-size="30px"
              radius="sm"
            />
            <view v-if="o.items.length > 3" class="ocard__more">
              <text class="ocard__more-text">+{{ o.items.length - 3 }}</text>
            </view>
            <view class="ocard__spacer" />

            <view class="ocard__amount">
              <text class="ocard__amount-text">{{ formatYuan(o.totalAmount) }}</text>
              <text class="ocard__qty">共 {{ o.totalQuantity }} 件</text>
            </view>
          </view>

          <!-- 第一条商品的名称 + 下单时间（补足缩略图看不出是什么的短板） -->
          <view class="ocard__foot">
            <text class="ocard__first">{{ firstName(o) }}</text>
            <text class="ocard__time">{{ formatRelative(o.createdAt) }}</text>
          </view>

          <!-- 操作：只有 PENDING / DELIVERING 能自己取消 -->
          <view v-if="canCancel(o)" class="ocard__acts">
            <AppButton type="secondary" size="sm" text="取消订单" @tap.stop="askCancel(o)" />
          </view>
        </view>

        <LoadMore
          :state="pager.state.value"
          :empty="pager.isEmpty.value"
          @retry="pager.retry"
        />
      </template>
    </view>

    <!-- 取消订单确认弹层 -->
    <ConfirmSheet
      v-model="cancelSheet.show"
      title="取消订单"
      :desc="cancelSheet.orderNo ? `订单 ${cancelSheet.orderNo}` : ''"
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
 * 我的订单列表
 *
 * 三个要点：
 *
 * 1) **页签是后端 OrderStatus 的直译**，不做「进行中」这类业务聚合 ——
 *    后端 `GET /orders?status=` 就是按 status 精确过滤的，
 *    页签和查询参数一一对应，用户点哪个、请求就发哪个，不会出现「点了没反应」。
 *
 * 2) **取消按钮的显示条件是 `CUSTOMER_CANCELLABLE`**（PENDING / DELIVERING）。
 *    这不是安全边界 —— 真正的校验在后端（进入 DELIVERING 后必须找店长）。
 *    前端只是不给用户展示注定失败的操作。
 *
 * 3) 从订单详情页取消完返回时，列表要刷新（否则还显示着已取消的单）。
 *    用 onShow + 签名守卫做，见下方 `shouldReloadOnShow`。
 */
import { computed, reactive, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import ProductImage from '../../components/ProductImage.vue';
import OrderStatusTag from '../../components/OrderStatusTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import LoadMore from '../../components/LoadMore.vue';
import AppButton from '../../components/AppButton.vue';
import ConfirmSheet from '../../components/ConfirmSheet.vue';
import { usePagedList } from '../../composables/usePagedList';
import { orderApi } from '../../api/order';
import { useUserStore } from '../../store/user';
import { OrderStatus, CUSTOMER_CANCELLABLE } from '../../utils/constants';
import { formatYuan, toErrorMessage } from '../../utils/money';
import { formatRelative } from '../../utils/format';

const userStore = useUserStore();

/** 「全部」用空字符串表示不传 status */
const statusTabs = [
  { key: '', label: '全部' },
  { key: OrderStatus.PENDING, label: '待接单' },
  { key: OrderStatus.DELIVERING, label: '处理中' },
  { key: OrderStatus.DELIVERED, label: '已送达' },
  { key: OrderStatus.CANCELLED, label: '已取消' },
];

const QUICK_REASONS = ['买错了', '不想要了', '等太久了', '想换别的'];

const activeStatus = ref('');

const pager = usePagedList((page, pageSize) =>
  orderApi.list({
    status: activeStatus.value || undefined,
    page,
    pageSize,
  }),
);

const emptyTitle = computed(() => {
  const t = statusTabs.find((x) => x.key === activeStatus.value);
  return t && t.key ? `没有${t.label}的订单` : '还没有订单';
});

const emptyDesc = computed(() =>
  activeStatus.value ? '换个页签看看，或者去首页下单' : '挑几件喜欢的，宿舍楼下送到手',
);

function thumbItems(order) {
  return (order.items || []).slice(0, 3);
}

function firstName(order) {
  const list = order.items || [];
  if (!list.length) return '';
  const extra = list.length > 1 ? ` 等 ${list.length} 种` : '';
  return `${list[0].name}${extra}`;
}

function canCancel(order) {
  return CUSTOMER_CANCELLABLE.includes(order.status);
}

function reload() {
  pager.clear();
  pager.load(true).catch(() => {});
}

function switchStatus(key) {
  if (key === activeStatus.value) return;
  activeStatus.value = key;
  reload();
}

// ------------------------------------------------------------------- 取消订单
const cancelSheet = reactive({
  show: false,
  loading: false,
  orderId: 0,
  orderNo: '',
  reason: '',
});

function askCancel(order) {
  cancelSheet.show = true;
  cancelSheet.loading = false;
  cancelSheet.orderId = order.id;
  cancelSheet.orderNo = order.orderNo;
  cancelSheet.reason = '';
}

async function doCancel() {
  cancelSheet.loading = true;
  try {
    await orderApi.cancel(cancelSheet.orderId, {
      reason: cancelSheet.reason.trim() || undefined,
    });
    cancelSheet.show = false;
    uni.showToast({ title: '订单已取消', icon: 'none' });
    reload();
  } catch (err) {
    // 失败要留在弹层里，让用户能看到原因（多半是状态已经变了）
    uni.showToast({ title: toErrorMessage(err, '取消失败'), icon: 'none' });
  } finally {
    cancelSheet.loading = false;
  }
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/order/detail?id=${id}` });
}

function goHome() {
  uni.reLaunch({ url: '/pages/home/home' });
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' });
}

// --------------------------------------------------------------- 生命周期
let appliedSignature = '';

/**
 * 参数签名守卫 —— 和确认订单页同一个坑：
 * uni-app 的 hash 路由在**只改查询串**时不重跑 onLoad，所以要在这里手动处理。
 * @returns {boolean} 是否真的应用了新参数
 */
function applyRouteOptions(options) {
  const status = options?.status || '';
  const signature = `status=${status}`;
  if (signature === appliedSignature) return false;
  appliedSignature = signature;

  activeStatus.value = status;
  pager.clear();
  pager.load(true).catch(() => {});
  return true;
}

onLoad((options) => {
  applyRouteOptions(options);
});

/** 从详情页取消完返回时，列表里的状态已经过期了，重拉一次 */
let cameFromDetail = false;

onShow(() => {
  if (cameFromDetail && userStore.isLogin) {
    pager.load(true).catch(() => {});
  }
  cameFromDetail = true;
});

onReachBottom(() => {
  pager.loadMore();
});

onPullDownRefresh(async () => {
  await pager.load(true);
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.olist {
  background-color: $color-bg-app;
}

/* ============================================================== 状态页签 */
.tabs {
  flex: none;
  width: 100%;
  white-space: nowrap;
  background-color: $color-surface;
  border-bottom: 1px solid $color-border-subtle;
}

/*
 * 5 个页签（全部/待接单/处理中/已送达/已取消）在 390px 宽里**放不下**，
 * 所以用横向 scroll-view + inline-flex 让它们溢出可滑，而不是换行。
 *
 * ⚠️ 两个必须一起写：
 *   · `.tabs__inner` 用 inline-flex —— 让它按内容宽度撑开（block 会被压成屏宽）
 *   · `.tab__text` 用 white-space:nowrap —— 否则「待接单」会被拆成竖排三行
 *     （踩过：少了这条，页签区变成一片竖排的「待/派/单」，整个头部错乱）
 */
.tabs__inner {
  display: inline-flex;
  align-items: stretch;
  padding: 0 $space-2;
}

.tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: none;
  height: 88rpx;
  padding: 0 $space-4;
}

.tab__text {
  font-size: $font-size-sm;
  color: $color-text-secondary;
  /* 关键：不让页签文字换行（见上方注释） */
  white-space: nowrap;
  line-height: 1.2;
}

.tab--on .tab__text {
  color: $color-action;
  font-weight: $font-weight-semibold;
}

/* 下划线：比「只变文字颜色」更明确，也照顾了色弱用户 */
.tab__bar {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 32rpx;
  height: 3px;
  margin-left: -16rpx;
  border-radius: 2px;
  background-color: $color-action;
}

/* ============================================================== 订单卡片 */
.olist__body {
  padding: $space-3 $space-4;
}

.ocard {
  padding: $space-4;
  margin-bottom: $space-3;
}

/* 抵消全局 `.surface + .surface { margin-top: 12px }`，间距只由 margin-bottom 提供 */
.ocard + .ocard {
  margin-top: 0;
}

.ocard__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-2;
  padding-bottom: $space-3;
  border-bottom: 1px dashed $color-border-subtle;
}

.ocard__no {
  flex: 1;
  min-width: 0;
}

.ocard__no-text {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.ocard__thumbs {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-3 0;
}

.ocard__thumb {
  flex: none;
}

.ocard__more {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: $radius-sm;
  background-color: $color-surface-sunken;
}

.ocard__more-text {
  font-size: $font-size-sm;
  color: $color-text-muted;
}

/* 把金额推到最右 */
.ocard__spacer {
  flex: 1;
  min-width: $space-2;
}

.ocard__amount {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.ocard__amount-text {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.ocard__qty {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.ocard__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-2;
}

.ocard__first {
  flex: 1;
  min-width: 0;
  font-size: $font-size-xs;
  color: $color-text-secondary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ocard__time {
  flex: none;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.ocard__acts {
  display: flex;
  justify-content: flex-end;
  margin-top: $space-3;
  padding-top: $space-3;
  border-top: 1px dashed $color-border-subtle;
}

/* ================================================================= 骨架 */
.sklist {
  display: flex;
  flex-direction: column;
  gap: $space-3;
}

.skcard {
  padding: $space-4;
}

.skcard__row {
  display: flex;
  gap: $space-3;
  margin-top: $space-3;
}

.skcard__body {
  flex: 1;
  min-width: 0;
}

/* ================================================================= 骨架 */
.sk {
  background-color: $color-surface-sunken;
  border-radius: $radius-xs;
  animation: sk-fade 1.2s ease-in-out infinite;
}

.sk--line {
  height: 14px;
  margin-bottom: $space-2;
}

.sk--thumb {
  flex: none;
  width: 72px;
  height: 72px;
  border-radius: $radius-sm;
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
