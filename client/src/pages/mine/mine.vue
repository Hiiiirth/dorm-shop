<template>
  <view class="page-root mine">
    <NavBar title="我的" :back="false" border />

    <view class="page-body mine__body">
      <!-- ================================================== 未登录 -->
      <view v-if="!userStore.isLogin" class="surface card">
        <view class="card__head">
          <AppIcon name="mine" :size="20" color="#C7450A" />
          <text class="card__title">还没登录</text>
        </view>
        <text class="card__desc">
          登录后才能加购物车、下单、看订单。浏览商品不需要登录。
        </text>
        <view class="card__actions">
          <AppButton type="primary" size="sm" text="去登录" @tap="goLogin" />
        </view>
      </view>

      <template v-else>
        <!-- ================================================ 账号卡 -->
        <view class="surface card account" @tap="goProfile">
          <view class="account__avatar">
            <!--
              有头像就显示头像，没有就退回「昵称末字」字标。
              `v-if` 而不是把空串塞给 <image src=""> —— 空 src 会渲染成碎图图标，
              整张卡看上去像坏了（ProductImage.vue 里同一个坑的注释）。
              头像内容跟着 userStore.user 走，所以在「个人资料」页保存后
              回到这里会自动变成新头像，不需要额外刷新。
            -->
            <image
              v-if="userStore.avatar"
              class="account__avatar-img"
              :src="userStore.avatar"
              mode="aspectFill"
            />
            <text v-else class="account__avatar-text">{{ initial }}</text>
          </view>
          <view class="account__info">
            <text class="account__name">{{ userStore.nickname }}</text>
            <view class="account__meta">
              <view v-for="r in userStore.roles" :key="r" class="rolechip icon-line">
                <AppIcon :name="ROLE_ICON[r] || 'mine'" :size="11" color="#C7450A" />
                <text class="rolechip__text">{{ ROLE_TEXT[r] || r }}</text>
              </view>
            </view>
          </view>
          <AppIcon name="forward" :size="16" color="#9AA2AF" />
        </view>

        <!-- ================================================ 订单入口 -->
        <view class="surface card">
          <view class="card__head">
            <AppIcon name="receipt" :size="16" color="#C7450A" />
            <text class="card__title">我的订单</text>
            <view class="card__more icon-line" @tap="goOrders('')">
              <text class="card__more-text">全部</text>
              <AppIcon name="forward" :size="13" color="#68707E" />
            </view>
          </view>

          <view class="grid">
            <view
              v-for="q in orderQuicks"
              :key="q.key"
              class="grid__item"
              @tap="goOrders(q.key)"
            >
              <view class="grid__icon">
                <AppIcon :name="q.icon" :size="20" color="#C7450A" />
              </view>
              <text class="grid__label">{{ q.label }}</text>
            </view>
          </view>
        </view>

        <!--
          功能列表。
          ⚠️ 这里**不再有「个人资料」cell** —— 顶部账号卡（见上）点一下就是进个人资料页，
          同一页里放两个入口属于重复，已删除。
        -->
        <view class="surface card card--list">
          <view class="cell" @tap="goAddress">
            <view class="cell__icon">
              <AppIcon name="address-book" :size="16" color="#C7450A" />
            </view>
            <text class="cell__label">收货地址</text>
            <text v-if="addressCount !== null" class="cell__value">{{ addressCount }} 个</text>
            <AppIcon name="forward" :size="14" color="#9AA2AF" />
          </view>
        </view>

        <view class="mine__logout">
          <AppButton type="text" size="sm" icon="sign-out" text="退出登录" @tap="doLogout" />
        </view>
      </template>
    </view>

    <AppTabBar :items="tabs" active="mine" />
  </view>
</template>

<script setup>
/**
 * 我的
 *
 * 这一页是**顾客端的收口**：订单入口、地址、资料、身份、退出都在这儿。
 *
 * · 订单入口做成一排 3 个宫格（会带 status 参数进列表页），
 *   比「一个入口点进去再筛」少一次点击 —— 宿舍小超市的订单量小，
 *   用户大部分时候就是想看「我那个还没送到的单」。
 * · 地址数量是**顺手查的**，查不到就不显示数字（不阻塞主界面）。
 */
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppButton from '../../components/AppButton.vue';
import AppTabBar from '../../components/AppTabBar.vue';
import { useCartStore } from '../../store/cart';
import { useUserStore } from '../../store/user';
import { userApi } from '../../api/user';
import { ROLE_ICON, ROLE_TEXT, OrderStatus } from '../../utils/constants';
import { tabsOfRole } from '../../utils/tabs';

const userStore = useUserStore();
const cartStore = useCartStore();

const tabs = computed(() =>
  tabsOfRole(userStore.currentRole || 'CUSTOMER').map((t) =>
    t.key === 'cart' ? { ...t, badge: cartStore.badge } : t,
  ),
);

/** 订单宫格的三个入口：只留最常看的，其余去「全部」里筛 */
const orderQuicks = [
  { key: OrderStatus.PENDING, label: '待接单', icon: 'clock' },
  { key: OrderStatus.DELIVERING, label: '处理中', icon: 'truck' },
  { key: OrderStatus.DELIVERED, label: '已送达', icon: 'finished' },
];

const initial = computed(() => (userStore.nickname || '舍').slice(-1));

const addressCount = ref(null);

async function loadAddressCount() {
  if (!userStore.isLogin) {
    addressCount.value = null;
    return;
  }
  try {
    const list = await userApi.listAddresses();
    addressCount.value = Array.isArray(list) ? list.length : 0;
  } catch {
    // 查不到就不显示数字，不要为了一行小字弹错误
    addressCount.value = null;
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' });
}

function goOrders(status) {
  const q = status ? `?status=${status}` : '';
  uni.navigateTo({ url: `/pages/order/list${q}` });
}

function goAddress() {
  uni.navigateTo({ url: '/pages/address/list' });
}

function goProfile() {
  uni.navigateTo({ url: '/pages/mine/profile' });
}

function doLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出当前账号吗？',
    success: (res) => {
      if (res.confirm) {
        userStore.logout();
        cartStore.reset();
      }
    },
  });
}

onShow(() => {
  cartStore.refresh();
  loadAddressCount();
});
</script>

<style lang="scss" scoped>
.mine {
  background-color: $color-bg-app;
}

.mine__body {
  padding: $space-3 $space-4 calc(#{$tabbar-height} + 12px + env(safe-area-inset-bottom));
}

.card {
  padding: $space-4;
  margin-bottom: $space-3;
}

/* 抵消全局 `.surface + .surface { margin-top: 12px }`，间距只由 margin-bottom 提供 */
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

.card__more {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 0;
}

.card__more-text {
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.card__desc {
  display: block;
  font-size: $font-size-sm;
  line-height: 1.7;
  color: $color-text-secondary;
  margin-bottom: $space-2;
}

.card__actions {
  display: flex;
  align-items: center;
  gap: $space-3;
  margin-top: $space-3;
}

/* ================================================================== 账号卡 */
.account {
  display: flex;
  align-items: center;
  gap: $space-3;
}

.account__avatar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: $radius-pill;
  background-color: $color-action-soft;
  /* 头像是 <image mode="aspectFill">，必须裁圆，否则方形图会溢出圆形底 */
  overflow: hidden;
}

.account__avatar-img {
  display: block;
  width: 100%;
  height: 100%;
}

.account__avatar-text {
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  color: $color-action;
}

.account__info {
  flex: 1;
  min-width: 0;
}

.account__name {
  display: block;
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.account__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center; /* ⚠️ 必写：不写默认 stretch，图标会被拉高，标签高低不齐 */
  gap: $space-2;
  margin-top: 6px;
}

.rolechip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: $radius-pill;
  background-color: $color-action-soft;
}

.rolechip__text {
  font-size: $font-size-xs;
  color: $color-action;
}

/* ================================================================ 订单宫格 */
.grid {
  display: flex;
  align-items: stretch;
}

.grid__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: $space-2 0;

  &:active {
    opacity: 0.6;
  }
}

.grid__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: $radius-md;
  background-color: $color-action-soft;
}

.grid__label {
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

/* ================================================================ 功能列表 */
.card--list {
  padding: 0 $space-4;
}

.cell {
  display: flex;
  align-items: center;
  gap: $space-3;
  min-height: 52px;
  border-bottom: 1px solid $color-border-subtle;

  &:last-child {
    border-bottom: none;
  }

  &:active {
    opacity: 0.6;
  }
}

.cell__icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: $radius-sm;
  background-color: $color-action-soft;
}

.cell__label {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.cell__value {
  flex: none;
  max-width: 160px;
  font-size: $font-size-xs;
  color: $color-text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mine__logout {
  display: flex;
  justify-content: center;
  margin-top: $space-2;
}
</style>
