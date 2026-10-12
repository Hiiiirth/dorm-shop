<template>
  <view class="page-root aord">
    <NavBar title="订单管理" border />

    <!-- ================================================ 搜索 + 筛选 -->
    <view class="toolbar">
      <view class="searchbox">
        <AppIcon name="search" :size="15" color="#9AA2AF" />
        <input
          class="searchbox__input"
          type="text"
          v-model="keyword"
          placeholder="订单号 / 门牌 / 顾客 / 电话"
          placeholder-class="searchbox__ph"
          confirm-type="search"
          @confirm="applySearch"
          @input="onSearchInput"
        />
        <view v-if="keyword" class="searchbox__clear" @tap="clearSearch">
          <AppIcon name="close" :size="12" color="#9AA2AF" />
        </view>
      </view>

      <view class="filterbtn" :class="{ 'filterbtn--on': hasFilter }" @tap="openFilter">
        <AppIcon name="filter" :size="15" :color="hasFilter ? '#c7450a' : '#68707e'" />
        <text class="filterbtn__text" :style="{ color: hasFilter ? '#c7450a' : '#68707e' }">筛选</text>
      </view>
    </view>

    <!-- ================================================ 状态页签（带实时计数） -->
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
          <text v-if="countOf(t.key) > 0" class="tab__count">{{ countOf(t.key) }}</text>
          <view v-if="t.key === activeStatus" class="tab__bar" />
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

    <view class="page-body aord__body">
      <!-- 首屏骨架 -->
      <view v-if="pager.isFirstLoading.value" class="sklist">
        <view v-for="i in 3" :key="`sk${i}`" class="surface skcard">
          <view class="sk sk--line" style="width: 50%" />
          <view class="sk sk--thumb" />
          <view class="sk sk--line" style="width: 70%" />
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
        v-else-if="!isAdmin"
        variant="empty"
        icon="switch-role"
        title="需要切换到店长身份"
        desc="这个页面是店长工作台，切换身份后才能看到"
        action-text="去切换身份"
        @action="navSwitchRole"
      />

      <EmptyState
        v-else-if="pager.isEmpty.value"
        :variant="emptyVariant"
        icon="receipt"
        :title="emptyTitle"
        :desc="emptyDesc"
        :action-text="emptyTitle === '还没有订单' ? '去逛逛看看商品' : ''"
        @action="emptyTitle === '还没有订单' ? goHome : null"
      />

      <template v-else>
        <!-- ============================================ 订单卡片 -->
        <view
          v-for="o in pager.list.value"
          :key="o.id"
          class="surface ocard"
          hover-class="ocard--hover"
          :hover-stay-time="80"
          @tap="goDetail(o.id)"
        >
          <!-- ① 头部：谁点的 + 状态 -->
          <view class="ocard__head">
            <view class="ocard__who">
              <text class="ocard__name">{{ o.customer?.nickname || o.contactName || '匿名顾客' }}</text>
              <text v-if="maskPhone(o.contactPhone)" class="ocard__phone">{{ maskPhone(o.contactPhone) }}</text>
            </view>
            <OrderStatusTag :status="o.status" size="sm" />
          </view>

          <!-- ② 商品行（列表只显示第一件，完整清单去详情） -->
          <view v-if="o.items && o.items.length" class="ocard__goods">
            <view class="ocard__thumb">
              <ProductImage
                v-if="firstItem(o).coverImage"
                :src="firstItem(o).coverImage"
                :name="firstItem(o).name"
                size="40px"
                mono-size="14px"
              />
            </view>
            <view class="ocard__goods-main">
              <text class="ocard__goods-name">{{ firstItem(o).name }}</text>
              <text class="ocard__goods-meta">
                <PriceText :value="firstItem(o).unitPrice" size="sm" tone="default" />
                × {{ firstItem(o).quantity }}
                <text v-if="o.items.length > 1" class="ocard__more">等 {{ o.items.length }} 种</text>
              </text>
            </view>
            <view class="ocard__amount">
              <PriceText :value="o.totalAmount" size="md" tone="action" />
            </view>
          </view>

          <!-- ③ 送到哪 -->
          <view class="ocard__meta">
            <text class="ocard__room">送至 {{ o.roomNo || '未填门牌' }}</text>
            <text class="ocard__dot">·</text>
            <text>共 {{ o.totalQuantity || o.itemCount }} 件</text>
            <text v-if="o.remark" class="ocard__remark">有备注</text>
          </view>

          <!-- ④ 操作区：按钮按状态变，取消收进「···」 -->
          <view class="ocard__ops" @tap.stop>
            <view class="ocard__ops-main">
              <!-- PENDING：接单是次要（描边），送达是主要（实心） -->
              <AppButton
                v-if="o.status === 'PENDING'"
                type="secondary"
                size="sm"
                text="接单"
                class="ocard__btn"
                :loading="actingId === o.id && actingAction === 'accept'"
                @tap="doAccept(o)"
              />
              <AppButton
                v-if="canDeliver(o.status)"
                type="primary"
                size="sm"
                :text="o.status === 'PENDING' ? '确认送达' : '确认送达'"
                class="ocard__btn"
                :loading="actingId === o.id && actingAction === 'deliver'"
                @tap="doDeliver(o)"
              />
              <!-- 两个终态：没有任何状态操作按钮 -->
              <text v-if="isTerminal(o.status)" class="ocard__done">
                {{ o.status === 'DELIVERED' ? '这一单已送达' : '这一单已取消' }}
              </text>
            </view>

            <view class="ocard__more-btn" hover-class="ocard__more-btn--hover" @tap="openSheet(o)">
              <AppIcon name="more" :size="16" color="#68707e" />
            </view>
          </view>
        </view>

        <!--
          LoadMore 只有三个 prop：state / empty / endText。
          ⚠️ 别传 has-more / is-empty —— 组件不认，会被当成透传到根节点上。
          「还有没有下一页」由 usePagedList 自己判断，这里不用管。
        -->
        <LoadMore
          :state="pager.state.value"
          :empty="pager.isEmpty.value"
          @retry="pager.retry()"
        />
      </template>
    </view>

    <!-- ================================================ 取消订单（必须填原因） -->
    <ConfirmSheet
      v-model="sheet.show"
      title="强制取消这一单？"
      :desc="sheet.desc"
      confirm-text="确认取消"
      danger
      show-input
      :input-value="sheet.reason"
      :quick-reasons="CANCEL_REASONS"
      placeholder="写一下取消原因（店长看得到）"
      :maxlength="50"
      :loading="actingId === sheet.order?.id && actingAction === 'cancel'"
      @update:input-value="sheet.reason = $event"
      @confirm="doCancel"
    />

    <!-- ================================================ 筛选面板 -->
    <ConfirmSheet
      v-model="filter.show"
      title="筛选订单"
      confirm-text="应用筛选"
      :danger="false"
      :mask-closable="true"
      @confirm="applyFilter"
      @cancel="cancelFilter"
    >
      <view class="fpane">
        <text class="fpane__label">日期范围</text>
        <view class="fpane__row">
          <input
            class="fpane__input"
            type="text"
            v-model="filter.dateFrom"
            placeholder="开始 YYYY-MM-DD"
            placeholder-class="searchbox__ph"
          />
          <text class="fpane__sep">至</text>
          <input
            class="fpane__input"
            type="text"
            v-model="filter.dateTo"
            placeholder="结束 YYYY-MM-DD"
            placeholder-class="searchbox__ph"
          />
        </view>
        <text class="fpane__tip">格式必须是 YYYY-MM-DD，填错后端会返回 10001</text>
      </view>
    </ConfirmSheet>

    <!-- 店长工作台的 tab -->
    <AppTabBar :items="tabs" active="orders" />
  </view>
</template>

<script setup>
/**
 * 订单管理 / 店长工作台第二个 tab
 *
 * 设计决策见 docs/03-前端设计.md §8.4 / §8.5。三个要点：
 *
 * 1) **按钮按订单状态变，不是按页面变。**
 *    v1.2 起允许 `PENDING` 直达 `DELIVERED`（店长可能已经把货放门口了），
 *    所以 PENDING 卡片上有两个按钮：接单（描边）+ 确认送达（实心）。
 *    DELIVERING 只剩送达，且占满宽度。两个终态都没有状态按钮。
 *
 * 2) **取消绝不放在卡片主区**，收进右侧「···」→ ConfirmSheet（必须填原因）。
 *    误触成本最高的操作不能和「送达」并排 —— 顾客打电话说不要了是真实场景，
 *    但那是「店长确认后」的操作，不是一下误点就该发生的。
 *
 * 3) **顾客信息放卡片最上方**，不在底部也不在详情页。
 *    管理端和顾客端最本质的区别：店长关心的第一件事是「谁点的、送到哪」。
 *
 * 两个容易踩的 uni-app 坑（都已在顾客端踩过）：
 *   · hash 路由下只改 query 时 onLoad 不重跑 → 所有带参跳转都加 `?_r=`
 *   · `?status=X` 传参进来要做「参数签名守卫」，签名没变就不重拉（见 applyRouteOptions）
 */
import { computed, reactive, ref, watch } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppTabBar from '../../components/AppTabBar.vue';
import AppButton from '../../components/AppButton.vue';
import EmptyState from '../../components/EmptyState.vue';
import LoadMore from '../../components/LoadMore.vue';
import OrderStatusTag from '../../components/OrderStatusTag.vue';
import PriceText from '../../components/PriceText.vue';
import ProductImage from '../../components/ProductImage.vue';
import ConfirmSheet from '../../components/ConfirmSheet.vue';
import { adminApi } from '../../api/admin';
import { usePagedList } from '../../composables/usePagedList';
import { useAdminGuard, goSwitchRole as navSwitchRole } from '../../composables/useAdminGuard';
import { useUserStore } from '../../store/user';
import { tabsOfRole } from '../../utils/tabs';
import { OrderStatus } from '../../utils/constants';

const userStore = useUserStore();

/**
 * 底部 tab 跟随当前身份（不写死 `TAB_ADMIN`）。
 * 与顾客端口径一致，保证「身份 ↔ tab」永远同源，不会出现错配。
 */
const tabs = computed(() => tabsOfRole(userStore.currentRole || 'CUSTOMER'));

/**
 * 身份守卫：**不是店长身份时不发任何请求**（见 composables/useAdminGuard.js）。
 * 注意模板里的顺序 —— 守卫态排在空态之前，这样顾客误进来看到的是
 * 「去切换身份」而不是「没有订单」。
 */
const isAdmin = useAdminGuard();

// ===========================================================================
// 状态与筛选
// ===========================================================================

const keyword = ref('');
const activeStatus = ref('');
const dateFrom = ref('');
const dateTo = ref('');

/** 状态计数（页签上的小数字）。来自 /admin/statistics，**不额外请求** */
const statusCounts = ref({});

const filter = reactive({ show: false, dateFrom: '', dateTo: '' });

const statusTabs = [
  { key: '', label: '全部' },
  { key: OrderStatus.PENDING, label: '待接单' },
  { key: OrderStatus.DELIVERING, label: '处理中' },
  { key: OrderStatus.DELIVERED, label: '已送达' },
  { key: OrderStatus.CANCELLED, label: '已取消' },
];

const CANCEL_REASONS = ['顾客不想要了', '地址写错了', '电话打不通', '商品缺货'];

// ===========================================================================
// 列表
// ===========================================================================

const pager = usePagedList((page, pageSize) =>
  adminApi.orderList({
    status: activeStatus.value || undefined,
    keyword: keyword.value || undefined,
    dateFrom: dateFrom.value || undefined,
    dateTo: dateTo.value || undefined,
    page,
    pageSize,
  }),
);

async function loadList(silentThrow = false) {
  try {
    await pager.load(silentThrow);
  } catch {
    /* 错误态已经进了 pager.firstError，页面会渲染 */
  }
}

function reload() {
  return loadList(true);
}

/** 换筛选条件：先清空再拉，避免旧数据和新筛选混在一屏 */
async function applyFilters() {
  // 身份没就绪就不请求 —— 否则会拿到一片 403 空态
  if (!isAdmin.value) {
    pager.clear();
    return;
  }
  pager.clear();
  await loadList(true);
}

function switchStatus(key) {
  if (activeStatus.value === key) return;
  activeStatus.value = key;
  applyFilters();
}

/**
 * 搜索：**边打边搜**（400ms 防抖），不是「按回车才搜」
 *
 * ⚠️ 之前这里只绑了 `@confirm`，手机上等于没有搜索 —— 店长查一个订单号
 * 必须点软键盘上的「搜索」键才生效，而很多用户不知道有这一步。
 * S7-4-2 在商品列表 / 用户列表上踩过同一个坑，这里一并补齐（全项目统一口径）。
 *
 * 回车仍然保留：它让用户可以「不等防抖、立刻出结果」，
 * 所以 `applySearch` 里要把pending 的 timer 清掉，否则回车后会**再打一次请求**。
 */
let searchTimer = null;

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(), 400);
}

async function applySearch() {
  // 回车结束等待：清掉还没触发的防抖，避免重复请求
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  await applyFilters();
}

async function clearSearch() {
  keyword.value = '';
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  await applyFilters();
}

// ===========================================================================
// 状态计数（页签数字）
// ===========================================================================

/**
 * 单独拉一次 statistics 只为拿 statusCounts。
 * 刻意**不跟订单列表并发** —— 列表要先出首屏，计数晚一拍无所谓，
 * 但如果 statistics 挂了也不该阻塞列表渲染。
 */
async function loadCounts() {
  if (!isAdmin.value) return;
  try {
    const res = await adminApi.statistics();
    statusCounts.value = res?.statusCounts || {};
  } catch {
    // 拿不到就把数字全隐藏（countOf 返回 0），不要显示成 0 误导店长
    statusCounts.value = {};
  }
}

function countOf(key) {
  if (!key) return 0;
  return Number(statusCounts.value[key]) || 0;
}

// ===========================================================================
// 筛选面板
// ===========================================================================

/**
 * 有没有在筛选
 *
 * ⚠️ **必须把 `keyword` 算进来**：这一页既有筛选面板（日期）也有搜索框（订单号/手机号），
 * 原来只算日期，于是「搜一个不存在的订单号」→ 列表空 → 空态走`activeStatus` 分支
 * 显示「还没有订单」。这是个**错误结论** —— 库里明明有订单，是没搜到。
 * 店长看到这话会以为今天一单都没接。
 */
const hasFilter = computed(() =>
  !!(dateFrom.value || dateTo.value || keyword.value.trim()),
);

/**
 * 空态：把「真没数据」和「筛没结果」分开
 *
 * EmptyState 的 `variant` 会换图标和配色，`search` 档是放大镜 + 更冷静的配色，
 * 用来提示「不是没有，是你筛出来的这部分没有」。
 */
const emptyVariant = computed(() => (hasFilter.value ? 'search' : 'empty'));

const emptyTitle = computed(() => {
  // 关键词搜索无结果的优先级最高：这是用户刚刚主动做的一件事，
  // 告诉他「还没有订单」等于答非所问。
  if (keyword.value.trim()) return '没有搜到这个订单';
  if (activeStatus.value) return '这个状态没有订单';
  return '还没有订单';
});

const emptyDesc = computed(() => {
  if (keyword.value.trim()) {
    return `换个订单号或手机号再试试，也可以清空搜索看全部订单`;
  }
  switch (activeStatus.value) {
    case OrderStatus.PENDING:
      return '顾客下单后会出现在这里';
    case OrderStatus.DELIVERING:
      return '还没有接单中的订单';
    case OrderStatus.DELIVERED:
      return '还没有送达的订单';
    case OrderStatus.CANCELLED:
      return '没有被取消的订单';
    default:
      return '';
  }
});

const filterSummary = computed(() => {
  if (dateFrom.value && dateTo.value) return `${dateFrom.value} ~ ${dateTo.value}`;
  return dateFrom.value ? `${dateFrom.value} 起` : `${dateTo.value} 止`;
});

function openFilter() {
  filter.dateFrom = dateFrom.value;
  filter.dateTo = dateTo.value;
  filter.show = true;
}

function applyFilter() {
  dateFrom.value = filter.dateFrom.trim();
  dateTo.value = filter.dateTo.trim();
  filter.show = false;
  applyFilters();
}

function cancelFilter() {
  filter.show = false;
}

async function clearFilters() {
  dateFrom.value = '';
  dateTo.value = '';
  await applyFilters();
}

// ===========================================================================
// 订单操作
// ===========================================================================

/** 正在操作的单 id + 动作，用来让对应按钮转圈 */
const actingId = ref(0);
const actingAction = ref('');

const sheet = reactive({ show: false, order: null, reason: '', desc: '' });

function isTerminal(status) {
  return status === OrderStatus.DELIVERED || status === OrderStatus.CANCELLED;
}

/** PENDING 和 DELIVERING 都能送达 —— v1.2 允许跳步 */
function canDeliver(status) {
  return status === OrderStatus.PENDING || status === OrderStatus.DELIVERING;
}

/**
 * 把一张卡就地替换成最新的详情。
 * 后端三个操作接口返回的都是**完整的新详情**，所以不需要二次请求。
 */
function replaceOrder(detail) {
  if (!detail || !detail.id) return;
  const idx = pager.list.value.findIndex((it) => it.id === detail.id);
  if (idx >= 0) {
    const next = pager.list.value.slice();
    next[idx] = { ...next[idx], ...detail };
    pager.list.value = next;
  }
  // 状态可能变了（比如送达后不再属于「待接单」筛选）→ 计数要刷新
  loadCounts();
}

async function runAction(order, action, apiCall) {
  actingId.value = order.id;
  actingAction.value = action;
  try {
    const detail = await apiCall();
    replaceOrder(detail);
    uni.showToast({ title: action === 'accept' ? '已接单' : '已确认送达', icon: 'success' });
  } catch (err) {
    // 错误文案由 request 层统一 toast，这里不重复弹
  } finally {
    actingId.value = 0;
    actingAction.value = '';
  }
}

function doAccept(order) {
  return runAction(order, 'accept', () => adminApi.acceptOrder(order.id));
}

function doDeliver(order) {
  return runAction(order, 'deliver', () => adminApi.deliverOrder(order.id));
}

function openSheet(order) {
  sheet.order = order;
  sheet.reason = '';
  sheet.desc = isTerminal(order.status)
    ? `订单 ${order.orderNo}`
    : `取消后库存会回滚，顾客 ${order.contactName || ''} 会看到这一单已取消`;
  sheet.show = true;
}

async function doCancel() {
  const order = sheet.order;
  if (!order) return;
  // 后端 cancelReason 是必填验收点 → 前端先拦一道，不让空原因发出去
  if (!sheet.reason.trim()) {
    uni.showToast({ title: '写一下取消原因', icon: 'none' });
    return;
  }
  actingId.value = order.id;
  actingAction.value = 'cancel';
  try {
    const detail = await adminApi.cancelOrder(order.id, { reason: sheet.reason.trim() });
    sheet.show = false;
    replaceOrder(detail);
    uni.showToast({ title: '已取消', icon: 'success' });
  } catch {
    /* toast 已由 request 层弹 */
  } finally {
    actingId.value = 0;
    actingAction.value = '';
  }
}

// ===========================================================================
// 展示辅助
// ===========================================================================

function firstItem(order) {
  return (order.items && order.items[0]) || { name: '（无商品）', quantity: 0, unitPrice: 0 };
}

/** 列表脱敏：138****8901。完整号码在详情页 */
function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length !== 11) return s || '';
  return `${s.slice(0, 3)}****${s.slice(7)}`;
}

// ===========================================================================
// 路由参数（带参页必须做签名守卫）
// ===========================================================================

let lastSignature = '';

/**
 * uni-app hash 路由的坑：只改 query 时 onLoad 不重跑、onShow 也不触发。
 * 所以 onLoad 和 onShow 都调这里，用「参数签名」判断要不要重新拉数据。
 */
function applyRouteOptions(opts) {
  const status = opts?.status || '';
  const sig = `${status}`;
  if (sig === lastSignature && pager.ready.value) return;
  lastSignature = sig;
  activeStatus.value = status;
  applyFilters();
  loadCounts();
}

onLoad((opts) => {
  applyRouteOptions(opts);
});

/**
 * 身份变化时补一次加载 —— 和 dashboard 同一个坑。
 *
 * App.vue 的 `userStore.restore()` 是异步的，`onLoad` 那一刻 store 可能还是空的
 * → `isAdmin` 为 false → applyFilters 直接 return，什么都不拉。
 * store 后来填好了如果不 watch，就永远停在守卫态。
 * 只在「顾客 → 店长」这一下触发，token 续期不会重复拉。
 */
watch(isAdmin, (now, was) => {
  if (now && !was) {
    applyFilters();
    loadCounts();
  }
});

onShow(() => {
  // 从订单详情页返回时，操作可能已经改过状态 → 静默刷新第一页
  const opts = getCurrentPages()
    .at(-1)
    ?.$page?.options || getCurrentPages().at(-1)?.options;
  const status = opts?.status || '';
  const sig = `${status}`;
  if (sig !== lastSignature) {
    applyRouteOptions(opts);
    return;
  }
  if (pager.ready.value) {
    pager.load(true);
    loadCounts();
  }
});

// ===========================================================================
// 生命周期
// ===========================================================================

onReachBottom(() => {
  if (!isAdmin.value) return;
  pager.loadMore();
});

async function onPullDown() {
  if (!isAdmin.value) {
    uni.stopPullDownRefresh();
    return;
  }
  await Promise.all([loadList(true), loadCounts()]);
  uni.stopPullDownRefresh();
}

onPullDownRefresh(onPullDown);

// ===========================================================================
// 导航
// ===========================================================================

/** 二级页：不挂 tab，用 navigateTo 才能返回 */
function goDetail(id) {
  uni.navigateTo({ url: `/pages/admin/order/detail?id=${id}&_r=${Date.now()}` });
}

function goHome() {
  uni.reLaunch({ url: '/pages/home/home' });
}
</script>

<style lang="scss" scoped>
.aord {
  background-color: $color-bg-app;
}

/* ================================================================ 搜索条 */
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2 $space-3;
  background-color: $color-surface;
  border-bottom: 1px solid $color-border-subtle;
}

.searchbox {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: $space-2;
  height: 34px;
  padding: 0 $space-3;
  border-radius: $radius-pill;
  background-color: $color-surface-2;
}

.searchbox__input {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.searchbox__ph {
  color: $color-text-disabled;
}

.searchbox__clear {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: $color-border-strong;
  display: flex;
  align-items: center;
  justify-content: center;
}

.filterbtn {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 $space-3;
  border-radius: $radius-pill;
  background-color: $color-surface-2;
}

.filterbtn--on {
  background-color: $color-action-soft;
}

/* ================================================================ 状态页签 */
/*
 * 复用顾客端已验证的那套（见 pages/order/list.vue 同名注释）：
 * inline-flex + nowrap 缺一不可，否则「待接单」会竖排叠三行。
 */
.tabs {
  flex: none;
  width: 100%;
  white-space: nowrap;
  background-color: $color-surface;
  border-bottom: 1px solid $color-border-subtle;
}

.tabs__inner {
  display: inline-flex;
  align-items: stretch;
  padding: 0 $space-2;
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  height: 88rpx;
  padding: 0 $space-3;
}

.tab__text {
  font-size: $font-size-sm;
  color: $color-text-secondary;
  white-space: nowrap;
  line-height: 1.2;
}

.tab--on .tab__text {
  color: $color-action;
  font-weight: $font-weight-semibold;
}

.tab__count {
  font-size: 20rpx;
  color: $color-text-muted;
  background-color: $color-surface-sunken;
  border-radius: $radius-pill;
  padding: 0 8rpx;
  min-width: 28rpx;
  text-align: center;
  line-height: 28rpx;
}

.tab--on .tab__count {
  color: $color-action;
  background-color: $color-action-soft;
}

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

/* ================================================================ 筛选 chips */
.chips {
  flex: none;
  padding: $space-2 $space-3 0;
  background-color: $color-surface;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px $space-2;
  border-radius: $radius-pill;
  background-color: $color-action-soft;
  border: 1px solid $color-action-soft-border;
}

.chip__text {
  font-size: $font-size-xs;
  color: $color-action;
}

/* ================================================================ 列表体 */
.aord__body {
  padding: $space-3 $space-4;
}

/* -------------------------------------------------------------- 骨架 */
.skcard {
  padding: $space-4;
  margin-bottom: $space-3;
}

.sk {
  background-color: $color-surface-sunken;
  border-radius: $radius-xs;
}

.sk--line {
  height: 12px;
  margin-bottom: $space-2;
}

.sk--thumb {
  width: 40px;
  height: 40px;
  border-radius: $radius-sm;
  margin-bottom: $space-2;
}

/* -------------------------------------------------------------- 卡片 */
.ocard {
  padding: $space-4;
  margin-bottom: $space-3;
}

/* 抵消全局 `.surface + .surface { margin-top }` */
.ocard + .ocard {
  margin-top: 0;
}

.ocard--hover {
  background-color: $color-surface-2;
}

.ocard__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-2;
  padding-bottom: $space-3;
  border-bottom: 1px dashed $color-border-subtle;
}

.ocard__who {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: $space-2;
}

.ocard__name {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ocard__phone {
  flex: none;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* 商品行 */
.ocard__goods {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 0;
}

.ocard__thumb {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: $radius-sm;
  overflow: hidden;
  background-color: $color-surface-sunken;
}

.ocard__goods-main {
  flex: 1;
  min-width: 0;
}

.ocard__goods-name {
  display: block;
  font-size: $font-size-sm;
  color: $color-text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ocard__goods-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin-top: 2px;
}

.ocard__more {
  color: $color-text-disabled;
}

.ocard__amount {
  flex: none;
}

/* 送到哪 */
.ocard__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: $font-size-xs;
  color: $color-text-secondary;
  padding-bottom: $space-3;
}

.ocard__room {
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.ocard__dot {
  color: $color-text-disabled;
}

.ocard__remark {
  margin-left: $space-2;
  padding: 1px 6px;
  border-radius: $radius-xs;
  background-color: $color-warning-soft;
  color: $color-warning;
}

/* -------------------------------------------------------------- 操作区 */
.ocard__ops {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding-top: $space-3;
  border-top: 1px solid $color-border-subtle;
}

.ocard__ops-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: $space-2;
}

.ocard__btn {
  flex: 1;
  min-width: 0;
}

.ocard__done {
  font-size: $font-size-xs;
  color: $color-text-muted;
  padding: $space-2 0;
}

.ocard__more-btn {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: $radius-sm;
  border: 1px solid $color-border-subtle;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ocard__more-btn--hover {
  background-color: $color-surface-2;
}

/* ================================================================ 筛选面板 */
.fpane {
  padding: $space-4 0 $space-2;
}

.fpane__label {
  display: block;
  font-size: $font-size-sm;
  color: $color-text-secondary;
  margin-bottom: $space-2;
}

.fpane__row {
  display: flex;
  align-items: center;
  gap: $space-2;
}

.fpane__input {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 $space-3;
  border-radius: $radius-sm;
  border: 1px solid $color-border-strong;
  background-color: $color-surface;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.fpane__sep {
  flex: none;
  font-size: $font-size-sm;
  color: $color-text-muted;
}

.fpane__tip {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin-top: $space-2;
}
</style>