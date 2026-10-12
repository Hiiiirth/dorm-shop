<template>
  <view class="page-root done">
    <NavBar title="下单成功" :back="false" border />

    <view class="page-body done__body">
      <!-- =============================================================== 成功 -->
      <view v-if="order" class="surface card">
        <view class="card__art">
          <AppIcon name="finished" :size="36" color="#0E8A43" />
        </view>

        <text class="card__title">下单成功</text>
        <text class="card__desc">
          已经通知店长了，货到付款，送到宿舍门口当面结算。线上不收钱。
        </text>

        <view class="card__amount">
          <text class="card__amount-label">应付</text>
          <PriceText :value="order.totalAmount" size="lg" />
        </view>

        <view class="divider" />

        <view class="row">
          <text class="row__label">订单号</text>
          <text class="row__value row__value--mono">{{ order.orderNo }}</text>
        </view>
        <view class="row">
          <text class="row__label">送达地址</text>
          <text class="row__value">{{ order.roomNo }}</text>
        </view>
        <view class="row">
          <text class="row__label">联系人</text>
          <text class="row__value">{{ order.contactName }} {{ order.contactPhone }}</text>
        </view>
        <view class="row">
          <text class="row__label">状态</text>
          <OrderStatusTag :status="order.status" />
        </view>

        <view class="card__actions">
          <AppButton
            class="card__btn"
            type="primary"
            size="md"
            block
            text="查看订单详情"
            @tap="goDetail"
          />
          <AppButton
            class="card__btn"
            type="secondary"
            size="md"
            block
            text="继续逛逛"
            @tap="goHome"
          />
        </view>
      </view>

      <!-- ========================================================= 详情没拿到 -->
      <EmptyState
        v-else-if="loadError"
        variant="error"
        title="订单详情没拿到"
        :desc="loadError"
        action-text="重新加载"
        @action="loadOrder"
      />

      <view v-else class="surface card">
        <view class="sk sk--line" style="width: 50%" />
        <view class="sk sk--line" style="width: 70%; margin-top: 12px" />
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 下单成功页
 *
 * 为什么要有这一页（而不是提交完直接 toast + 返回）：
 *   1) 线下结算没有支付环节，用户提交完**没有任何「钱付掉了」的反馈**，
 *      给一张明确的「成功 + 订单号 + 金额 + 地址」卡片，才能确认真的下单了。
 *   2) 订单号要能看见、能报出来（宿舍里东西送错了要报单号）。
 *   3) 这里是提交成功后 `redirectTo` 过来的，**返回键回不到确认页** —— 不会重复下单。
 *
 * 数据来源：`GET /orders/:id`。
 * 其实上一步 `POST /orders` 已经返回了完整详情，也可以走参数传过来；
 * 但订单号/金额这类关键信息，**重新查一次服务端**更稳（也顺手验证了订单真的落库了）。
 */
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppButton from '../../components/AppButton.vue';
import EmptyState from '../../components/EmptyState.vue';
import PriceText from '../../components/PriceText.vue';
import OrderStatusTag from '../../components/OrderStatusTag.vue';
import { orderApi } from '../../api/order';
import { toErrorMessage } from '../../utils/money';

const orderId = ref(0);
const order = ref(null);
const loadError = ref('');

async function loadOrder() {
  if (!orderId.value) {
    loadError.value = '缺少订单号';
    return;
  }
  loadError.value = '';
  try {
    order.value = await orderApi.detail(orderId.value);
  } catch (err) {
    loadError.value = toErrorMessage(err, '订单详情加载失败');
  }
}

function goDetail() {
  // 详情页 S7-3 已经提供。用 redirectTo 而不是 navigateTo：
  // 成功页是下单后 redirectTo 过来的，页面栈里只有它自己，
  // 再 navigateTo 一层会留下「成功页 → 详情页」两级，
  // 从详情返回就回到了「刚下完单」的成功页 —— 有点怪。
  uni.redirectTo({
    url: `/pages/order/detail?id=${orderId.value}`,
    fail: () => uni.reLaunch({ url: '/pages/home/home' }),
  });
}

function goHome() {
  uni.reLaunch({ url: '/pages/home/home' });
}

onLoad((options) => {
  orderId.value = Number(options?.id) || 0;
  loadOrder();
});
</script>

<style lang="scss" scoped>
.done {
  background-color: $color-bg-app;
}

.done__body {
  padding: 0 0 0;
}

.card {
  margin: $space-4;
  padding: $space-5 $space-4;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card__art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 160rpx;
  height: 160rpx;
  border-radius: $radius-pill;
  background-color: $color-success-soft;
  margin-bottom: $space-3;
}

.card__title {
  font-size: $font-size-xl;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.card__desc {
  margin-top: $space-2;
  font-size: $font-size-sm;
  line-height: 1.6;
  color: $color-text-muted;
  text-align: center;
}

.card__amount {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: $space-4 0 $space-3;
}

.card__amount-label {
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

/* 信息行左对齐，卡片本身居中 —— 金额/标题居中好看，字段列表还是左对齐好读 */
.card .divider {
  width: 100%;
  margin-bottom: $space-3;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-3;
  width: 100%;
  min-height: 34px;
}

.row__label {
  flex: none;
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.row__value {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: $font-size-sm;
  color: $color-text-primary;
  word-break: break-all;
}

.row__value--mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.card__actions {
  width: 100%;
  margin-top: $space-5;
  display: flex;
  flex-direction: column;
  gap: $space-3;
}

.sk {
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 37%, #eef0f4 63%);
  background-size: 400% 100%;
  border-radius: $radius-xs;
  animation: sk-shimmer 1.4s ease infinite;
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
