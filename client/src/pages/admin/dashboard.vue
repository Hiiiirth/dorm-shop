<template>
  <view class="page-root dash">
    <NavBar title="经营看板" border />

    <view class="page-body dash__body">
      <!-- ================================================= 首屏骨架 -->
      <view v-if="firstLoading" class="dash__sk">
        <view class="surface skbox skbox--tall" />
        <view class="dash__skrow">
          <view class="surface skbox skbox--metric" v-for="i in 3" :key="i" />
        </view>
        <view class="surface skbox skbox--list" />
      </view>

      <!-- ================================================= 整页错误 -->
      <EmptyState
        v-else-if="firstError"
        variant="error"
        desc="看板数据没拿到"
        action-text="重新加载"
        @action="reload"
      />

      <EmptyState
        v-else-if="!isAdmin"
        variant="empty"
        icon="switch-role"
        title="需要切换到店长身份"
        desc="经营看板是店长工作台，切换身份后才能看到"
        action-text="去切换身份"
        @action="navSwitchRole"
      />

      <template v-else-if="stat">
        <!-- ============================================ ① 今日营收 -->
        <view class="surface rev">
          <text class="rev__label">今日营收</text>
          <view class="rev__amount">
            <text class="rev__yuan">¥</text>
            <PriceText :value="stat.today.revenue" size="xxl" tone="default" :symbol="false" />
          </view>
          <text class="rev__hint">
            只算已送达订单 · 今日 {{ stat.today.orderCount }} 单 / 取消 {{ stat.today.cancelledCount }} 单
          </text>
        </view>

        <!--
          数字自洽校验：前端也验一遍「各状态计数之和 = 总单数」。
          对不上说明后端统计有问题，这时给一条**黄色警示**而不是静默显示错数字。
          用 today.orderCount 比（today 是当天口径，最容易肉眼核对）。
        -->
        <view v-if="countMismatch" class="notice notice--warn icon-lead">
          <view class="icon-lead__icon">
            <AppIcon name="alert" :size="14" color="#b86e00" />
          </view>
          <text class="notice__text">
            状态计数（{{ countMismatch }}）与今日单数（{{ stat.today.orderCount }}）对不上，数据可能不准
          </text>
        </view>

        <!-- ============================================ ② 三个状态块 -->
        <view class="metrics">
          <view
            v-for="m in metricCards"
            :key="m.key"
            class="surface metric"
            :class="`metric--${m.key}`"
            @tap="goOrders(m.status)"
          >
            <view class="metric__head">
              <AppIcon :name="m.icon" :size="13" :color="m.color" />
              <text class="metric__label" :style="{ color: m.color }">{{ m.label }}</text>
            </view>
            <text class="metric__value">{{ m.value }}</text>
          </view>
        </view>

        <!-- ============================================ ③ 待处理订单（看板的核心理由） -->
        <view class="surface block">
          <view class="block__head">
            <text class="block__title">待处理订单</text>
            <text class="block__sub">还没送达的</text>
          </view>

          <view v-if="pendingOrders.length === 0" class="block__empty">
            <AppIcon name="finished" :size="18" color="#68707e" />
            <text class="block__empty-text">没有待处理的单子，全部送完了</text>
          </view>

          <view v-else>
            <view
              v-for="o in pendingOrders"
              :key="o.id"
              class="prow"
              hover-class="prow--hover"
              :hover-stay-time="80"
              @tap="goOrderDetail(o.id)"
            >
              <view class="prow__avatar" :class="`prow__avatar--${o.status === 'PENDING' ? 'wait' : 'doing'}`">
                <text class="prow__initial">{{ initialOf(o) }}</text>
              </view>

              <view class="prow__main">
                <text class="prow__name">{{ o.contactName || o.customer?.nickname || '匿名顾客' }}</text>
                <text class="prow__meta">
                  <text class="prow__room">{{ o.roomNo || '未填门牌' }}</text>
                  · {{ summarizeItems(o) }}
                </text>
              </view>

              <OrderStatusTag :status="o.status" size="sm" />
            </view>

            <!-- 超过 3 条：给一个去订单 tab 的入口，并带上筛选条件 -->
            <!--
              超过 3 条：给一个去订单 tab 的入口。
              注意 pendingTotal 是「待接单 + 处理中」合计，和下面跳的 PENDING 页签口径不同，
              所以文案里带上「先看待接单」，别让店长以为点进去就是全部 23 条。
            -->
            <view v-if="pendingTotal > pendingOrders.length" class="more" @tap="goOrders('PENDING')">
              <text class="more__text">共 {{ pendingTotal }} 条待处理，先看待接单 ›</text>
            </view>
          </view>
        </view>

        <!-- ============================================ ④ 热销 TOP 3 -->
        <view v-if="stat.hotProducts && stat.hotProducts.length" class="surface block">
          <view class="block__head">
            <text class="block__title">热销榜</text>
            <text class="block__sub">按已送达的件数</text>
          </view>

          <view v-for="(p, i) in hotTop" :key="p.productId" class="hrow">
            <text class="hrow__rank" :class="{ 'hrow__rank--top': i < 3 }">{{ i + 1 }}</text>
            <text class="hrow__name">{{ p.name }}</text>
            <text class="hrow__qty">{{ p.quantity }} 件</text>
          </view>
        </view>

        <!-- ============================================ ⑤ 三个总数 -->
        <view class="totals">
          <view class="surface total">
            <text class="total__num">{{ stat.total.productCount }}</text>
            <text class="total__label">在售商品</text>
          </view>
          <view class="surface total">
            <text class="total__num">{{ stat.total.categoryCount }}</text>
            <text class="total__label">商品分类</text>
          </view>
          <view class="surface total">
            <text class="total__num">{{ stat.total.userCount }}</text>
            <text class="total__label">注册用户</text>
          </view>
        </view>
      </template>
    </view>

    <!-- 店长工作台的 tab（当前项 = 看板） -->
    <AppTabBar :items="tabs" active="dashboard" />
  </view>
</template>

<script setup>
/**
 * 经营看板 / 店长工作台首页
 *
 * 设计决策见 docs/03-前端设计.md §8.3，摘要：
 *   信息层级从上到下四块，**顺序就是优先级**：
 *     ① 今日营收（店长唯一真正关心的数字，28px）
 *     ② 三个状态块（待接单/处理中/今日送达）
 *     ③ 待处理订单 —— 看板不只是报表，是**待办入口**
 *     ④ 热销 TOP 3 + 底行三个总数
 *
 * 为什么 ① 的副标题必须写「只算已送达」：
 *   后端 `revenue` 只累加 DELIVERED 订单。如果不写清楚，店长看到
 *   「下了 8 单但营收只有 24.5」会以为系统漏算了。这是文案问题不是数据问题。
 *
 * 为什么 ③ 最多只列 3 条：
 *   看板是「概览」，不是订单列表。要处理全部去订单 tab（那里有分页和筛选）。
 *   列太多会把热销榜挤到屏幕外，得不偿失。
 *
 * 本页**不轮询、不自动刷新**。理由：这是一个可能一直开着不熄屏的页面，
 * 定时刷新会在店长点「接单」的瞬间换掉整屏内容。要最新数据就下拉刷新。
 */
import { computed, ref, watch } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppTabBar from '../../components/AppTabBar.vue';
import EmptyState from '../../components/EmptyState.vue';
import OrderStatusTag from '../../components/OrderStatusTag.vue';
import PriceText from '../../components/PriceText.vue';
import { adminApi } from '../../api/admin';
import { useAdminGuard, goSwitchRole as navSwitchRole } from '../../composables/useAdminGuard';
import { useUserStore } from '../../store/user';
import { tabsOfRole } from '../../utils/tabs';
import { OrderStatus, UserRole } from '../../utils/constants';

const userStore = useUserStore();

/**
 * 底部 tab 跟随当前身份（不写死 `TAB_ADMIN`）。
 * 与顾客端口径一致，保证「身份 ↔ tab」永远同源，不会出现错配。
 */
const tabs = computed(() => tabsOfRole(userStore.currentRole || 'CUSTOMER'));

/** 身份守卫：不是店长时**一个请求都不发**（见 composables/useAdminGuard.js） */
const isAdmin = useAdminGuard();

const stat = ref(null);
const firstLoading = ref(true);
const firstError = ref(null);

/**
 * 待处理订单 = PENDING + DELIVERING 两种状态的单子。
 *
 * ⚠️ 后端 `/admin/orders` 的 `status` 只收**单个**枚举值，没法一次查两个状态，
 *    所以这里并发拉两页再合并（各 pageSize=3，合并后最多 6 条，列表够填）。
 *    踩过的坑：早先这里直接 `orderList({ page: 1, pageSize: 3 })` 不带 status，
 *    结果拿到的是**最新 3 条**（含已送达/已取消），标题写着「待处理订单」、
 *    副标题写着「还没送达的」，内容却全是终态单 —— 文案和数据自相矛盾。
 *
 * 真实条数不取列表的 total（两个请求各自的 total 没法相加），
 * 而是取统计接口的 statusCounts —— 那是后端一次算准的总数。
 */
const pendingOrders = ref([]);
const pendingTotal = ref(0);

async function load() {
  // 守卫先行：不是店长就别请求，避免 403 + 20003 变成一片空白
  if (!isAdmin.value) {
    firstLoading.value = false;
    return;
  }
  firstLoading.value = true;
  firstError.value = null;
  try {
    // 三个请求并发：互不依赖，串行会白白多两个 RTT。
    // 列表挂了不影响看板主体（统计 + 计数），所以各自 catch 后降级。
    const LIST_ERR = null;
    const [statRes, waitRes, doingRes] = await Promise.all([
      adminApi.statistics(),
      adminApi.orderList({ status: OrderStatus.PENDING, page: 1, pageSize: 3 }).catch(() => LIST_ERR),
      adminApi.orderList({ status: OrderStatus.DELIVERING, page: 1, pageSize: 3 }).catch(() => LIST_ERR),
    ]);
    stat.value = statRes;

    // 待处理单：待接单在前（更急），处理中在后；按 id 倒序让新单在上面
    const merged = [];
    if (waitRes && Array.isArray(waitRes.list)) merged.push(...waitRes.list);
    if (doingRes && Array.isArray(doingRes.list)) merged.push(...doingRes.list);
    merged.sort((a, b) => Number(b.id) - Number(a.id));
    pendingOrders.value = merged.slice(0, 3);

    // 条数用统计口径（后端算准的），没有统计就退化成列表长度
    const c = statRes?.statusCounts;
    if (c && typeof c === 'object') {
      pendingTotal.value = (Number(c[OrderStatus.PENDING]) || 0) + (Number(c[OrderStatus.DELIVERING]) || 0);
    } else {
      pendingTotal.value = merged.length;
    }
  } catch (err) {
    firstError.value = err;
  } finally {
    firstLoading.value = false;
  }
}

async function reload() {
  await load();
}

/** 下拉刷新：两个请求都等完再松手，否则动画会提前结束（观感上像没刷新） */
async function onPullDown() {
  if (!isAdmin.value) {
    uni.stopPullDownRefresh();
    return;
  }
  await load();
  uni.stopPullDownRefresh();
}

onLoad(load);

/**
 * 身份变化时自动加载 —— **这是本页能正常工作的关键**。
 *
 * 踩过的坑：App.vue 的 `userStore.restore()` 是**异步**的（要等 /users/me），
 * 它虽然做了乐观恢复（先读 storage 写 store），但在 `onLoad` 那一刻
 * store 里可能还是空的 → `isAdmin` 是 false → load() 直接 return →
 * 页面永远停在守卫态，即使 store 后来填好了也不会重新请求。
 *
 * 所以这里 `watch` 身份：从 false 变 true 时自动补一次 load()。
 * 只在「从顾客切成店长」时触发（`was false → now true`），
 * 不会每次 token 续期都重新拉一遍。
 */
watch(isAdmin, (now, was) => {
  if (now && !was) load();
});

onPullDownRefresh(onPullDown);

// ===========================================================================
// 派生数据
// ===========================================================================

const metricCards = computed(() => {
  const t = stat.value?.today || {};
  const c = stat.value?.statusCounts || {};
  return [
    {
      key: 'wait',
      label: '待接单',
      value: Number(c[OrderStatus.PENDING]) || 0,
      status: OrderStatus.PENDING,
      icon: 'clock',
      color: '#b86e00',
    },
    {
      key: 'doing',
      label: '处理中',
      value: Number(c[OrderStatus.DELIVERING]) || 0,
      status: OrderStatus.DELIVERING,
      icon: 'truck',
      color: '#185fa5',
    },
    {
      key: 'done',
      label: '今日送达',
      value: Number(t.deliveredCount) || 0,
      status: OrderStatus.DELIVERED,
      icon: 'finished',
      color: '#0e8a43',
    },
  ];
});

/**
 * 自洽校验：待接单 + 处理中 + 今日送达 + 今日取消 应该等于今日单数。
 * 对不上返回 true → 页面上显示黄色警示条。
 */
const countMismatch = computed(() => {
  if (!stat.value) return false;
  const t = stat.value.today || {};
  const c = stat.value.statusCounts || {};
  const sum =
    (Number(c[OrderStatus.PENDING]) || 0) +
    (Number(c[OrderStatus.DELIVERING]) || 0) +
    (Number(t.deliveredCount) || 0) +
    (Number(t.cancelledCount) || 0);
  const total = Number(t.orderCount) || 0;
  // 全 0 时（刚建库还没订单）不算异常
  if (total === 0 && sum === 0) return false;
  return sum !== total;
});

const hotTop = computed(() => (stat.value?.hotProducts || []).slice(0, 3));

// ===========================================================================
// 展示辅助
// ===========================================================================

/** 头像取名字最后一个字（和顾客端 mine.vue 一致） */
function initialOf(order) {
  const name = order.contactName || order.customer?.nickname || '';
  return name ? name.slice(-1) : '?';
}

/**
 * 商品摘要：「可口可乐 ×2」/ 「可乐 ×2 等 3 件」
 * 店长扫一眼要知道「要拿几件货」，件数比商品名重要。
 */
function summarizeItems(order) {
  const items = order.items || [];
  if (items.length === 0) return '无商品';
  const first = items[0];
  const head = `${first.name} ×${first.quantity}`;
  if (items.length === 1) return head;
  return `${head} 等 ${order.totalQuantity || order.itemCount} 件`;
}

// ===========================================================================
// 导航
// ===========================================================================

/**
 * 去订单 tab 并带上状态筛选。
 * 用 reLaunch（而不是 navigateTo）：订单 tab 页是根页面，
 * 从看板点过去应该清栈，否则用户再点 tab 会退回来看到旧看板。
 *
 * ⚠️ hash 路由下要加 `?_r=`，否则 query 变了但页面没重跑 onLoad。
 */
function goOrders(status) {
  const q = status ? `?status=${status}&_r=${Date.now()}` : `?_r=${Date.now()}`;
  uni.reLaunch({ url: `/pages/admin/orders${q}` });
}

/** 待处理列表点一条 → 进二级页（二级页不挂 tab，只有返回箭头） */
function goOrderDetail(id) {
  uni.navigateTo({ url: `/pages/admin/order/detail?id=${id}` });
}
</script>

<style lang="scss" scoped>
.dash {
  background-color: $color-bg-app;
}

.dash__body {
  padding: $space-3 $space-4;
}

/* ================================================================ 骨架 */
.dash__sk {
  display: flex;
  flex-direction: column;
  gap: $space-3;
}

.dash__skrow {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $space-2;
}

.skbox {
  background-color: $color-surface;
  border-radius: $radius-md;
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
    animation: sk 1.2s ease-in-out infinite;
  }
}

.skbox--tall {
  height: 96px;
}

.skbox--metric {
  height: 68px;
}

.skbox--list {
  height: 150px;
}

@keyframes sk {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* ================================================================ 营收 */
.rev {
  padding: $space-4;
  margin-bottom: $space-3;
}

.rev__label {
  display: block;
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.rev__amount {
  display: flex;
  align-items: baseline;
  gap: 2px;
  margin-top: $space-1;
}

.rev__yuan {
  font-size: $font-size-md;
  color: $color-text-primary;
  font-weight: $font-weight-medium;
}

.rev__hint {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin-top: $space-2;
}

/* ================================================================ 警示条 */
.notice {
  display: flex;
  align-items: flex-start;
  /* `.icon-lead__icon` 用 1.6em 算壳高，em 相对**本容器**字号 → 必须显式给 */
  font-size: $font-size-xs;
  gap: $space-2;
  padding: $space-2 $space-3;
  border-radius: $radius-sm;
  margin-bottom: $space-3;
}

.notice--warn {
  background-color: $color-warning-soft;
}

.notice__text {
  flex: 1;
  font-size: $font-size-xs;
  color: $color-warning;
  line-height: $line-height-normal;
}

/* ================================================================ 状态块 */
.metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $space-2;
  margin-bottom: $space-3;
}

.metric {
  padding: $space-3 $space-2;
  text-align: left;

  &:active {
    opacity: 0.7;
  }
}

.metric__head {
  display: flex;
  align-items: center;
  gap: 4px;
}

.metric__label {
  font-size: $font-size-xs;
}

.metric__value {
  display: block;
  font-size: $font-size-xxl;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  line-height: 1.1;
  margin-top: $space-1;
}

/* ================================================================ 通用区块 */
.block {
  padding: $space-4;
  margin-bottom: $space-3;
}

.block__head {
  display: flex;
  align-items: baseline;
  gap: $space-2;
  margin-bottom: $space-2;
}

.block__title {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.block__sub {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.block__empty {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-3 0;
}

.block__empty-text {
  font-size: $font-size-sm;
  color: $color-text-muted;
}

/* ================================================================ 待处理订单行 */
.prow {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 0;
  border-top: 1px solid $color-border-subtle;
}

.prow--hover {
  background-color: $color-surface-2;
}

.prow__avatar {
  flex: none;
  width: $avatar-sm;
  height: $avatar-sm;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.prow__avatar--wait {
  background-color: $color-warning-soft;
}

.prow__avatar--doing {
  background-color: $color-action-soft;
}

.prow__initial {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.prow__main {
  flex: 1;
  min-width: 0;
}

.prow__name {
  display: block;
  font-size: $font-size-sm;
  color: $color-text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prow__meta {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prow__room {
  color: $color-text-secondary;
  font-weight: $font-weight-medium;
}

.more {
  padding-top: $space-3;
  border-top: 1px solid $color-border-subtle;
  text-align: center;
}

.more__text {
  font-size: $font-size-sm;
  color: $color-action;
}

/* ================================================================ 热销榜 */
.hrow {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-2 0;
}

.hrow__rank {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: $radius-xs;
  background-color: $color-surface-sunken;
  color: $color-text-muted;
  font-size: $font-size-xs;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hrow__rank--top {
  background-color: $color-action-soft;
  color: $color-action;
  font-weight: $font-weight-semibold;
}

.hrow__name {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  color: $color-text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hrow__qty {
  flex: none;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* ================================================================ 三个总数 */
.totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $space-2;
}

.total {
  padding: $space-3 $space-2;
  text-align: center;
}

.total__num {
  display: block;
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.total__label {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin-top: 2px;
}
</style>