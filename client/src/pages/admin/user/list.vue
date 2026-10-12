<template>
  <view class="page-root ulist">
    <NavBar title="用户管理" :back="true" border />

    <!-- ================================================ 搜索 -->
    <view class="toolbar">
      <view class="searchbox">
        <AppIcon name="search" :size="15" color="#9AA2AF" />
        <input
          class="searchbox__input"
          type="text"
          v-model="keyword"
          placeholder="昵称 / 手机号 / 用户名"
          placeholder-class="searchbox__ph"
          confirm-type="search"
          @input="onSearchInput"
          @confirm="applySearch"
        />
        <view v-if="keyword" class="searchbox__clear" @tap="clearSearch">
          <AppIcon name="close" :size="12" color="#9AA2AF" />
        </view>
      </view>
    </view>

    <!-- ================================================ 筛选（身份 / 状态） -->
    <!--
      分成两条而不是合成一条：
      两个维度会**交叉**（店长 + 禁用），塞进一个横滑条里就没法表达「两个都选」。
    -->
    <scroll-view class="segbar" scroll-x :show-scrollbar="false">
      <view class="segbar__inner">
        <view
          v-for="r in roleFilters"
          :key="r.value"
          class="seg"
          :class="{ 'seg--on': roleFilter === r.value }"
          @tap="switchRole(r.value)"
        >
          <text class="seg__text">{{ r.label }}</text>
        </view>
      </view>
    </scroll-view>

    <scroll-view class="segbar segbar--gap" scroll-x :show-scrollbar="false">
      <view class="segbar__inner">
        <view
          v-for="s in statusFilters"
          :key="s.value"
          class="seg"
          :class="{ 'seg--on': statusFilter === s.value }"
          @tap="switchStatus(s.value)"
        >
          <text class="seg__text">{{ s.label }}</text>
        </view>
      </view>
    </scroll-view>

    <view class="page-body ulist__body">
      <!-- 首屏骨架 -->
      <view v-if="pager.isFirstLoading.value" class="sklist">
        <view v-for="i in 5" :key="`sk${i}`" class="surface skrow">
          <view class="sk sk--ava" />
          <view class="skcol">
            <view class="sk sk--line" style="width: 50%" />
            <view class="sk sk--line" style="width: 72%" />
          </view>
        </view>
      </view>

      <EmptyState
        v-else-if="!isAdmin"
        variant="empty"
        icon="switch-role"
        title="需要切换到店长身份"
        desc="这个页面是店长工作台，切换身份后才能看到"
        action-text="去切换身份"
        @action="goSwitchRole"
      />

      <EmptyState
        v-else-if="pager.firstError.value"
        variant="error"
        desc="用户列表没拿到"
        action-text="重新加载"
        @action="pager.retry()"
      />

      <EmptyState
        v-else-if="pager.isEmpty.value"
        :variant="hasFilter ? 'search' : 'empty'"
        icon="user-manage"
        :title="hasFilter ? '没有符合条件的用户' : '还没有用户'"
        :desc="hasFilter ? '换个关键词或筛选条件再看看' : '顾客注册后会出现在这里'"
        :action-text="hasFilter ? '清除筛选' : ''"
        @action="hasFilter ? clearFilters() : null"
      />

      <template v-else>
        <view
          v-for="u in pager.list.value"
          :key="u.id"
          class="surface urow"
          :class="{ 'urow--off': u.status !== 1 }"
        >
          <!-- 头像：有 avatar 用图，没有就退回首字字标（跟顾客端一致） -->
          <view class="urow__ava">
            <image v-if="u.avatar" class="urow__ava-img" :src="u.avatar" mode="aspectFill" />
            <text v-else class="urow__ava-text" :style="{ color: tintOf(u)[1] }">{{ initialOf(u) }}</text>
          </view>

          <view class="urow__main">
            <view class="urow__line1">
              <text class="urow__name">{{ u.nickname }}</text>
              <!-- 「我」标签：解释为什么这一行的按钮是灰的 -->
              <text v-if="isSelf(u)" class="tag tag--me">我</text>
              <text v-if="isAdminRole(u)" class="tag tag--admin">店长</text>
              <text v-if="u.status !== 1" class="tag tag--off">已禁用</text>
            </view>
            <text class="urow__sub">
              <!--
                只到「日」粒度：右侧「设为店长」占掉 4 个字宽，
                带上时分就会变成「10-08...」。查用户的场景靠昵称/手机号，不靠精确时间。
              -->
              {{ phoneText(u) }} · {{ joinDay(u.createdAt) }} 注册
            </text>
          </view>

          <!-- ============================ 行内操作区 ============================
            为什么是「身份按钮 + 启停开关」两个控件，而不是都塞进 ···：

            · 授予/撤销身份是这个页面的**主功能**（顾客只是被管理对象，
              身份才是店长真正要改的东西），藏进三层菜单等于没有。
            · 启停是**高频且可逆**的（店长经常临时停一个乱下单的账号），
              开关一次点中，跟商品列表的上下架手感一致。

            两个按钮都必须对「自己」禁用 —— 后端 `30004` 会拦，但让店长
            点下去再看报错是坏体验。禁用态用 pointer-events:none 而不是
            只改颜色，这样既不可点也保留在行内（视觉上说明「这里本来有操作」）。
          -->
          <view class="urow__ops" @tap.stop>
            <view
              class="opbtn"
              :class="{
                'opbtn--danger': isAdminRole(u),
                'opbtn--off': !canChangeRole(u),
              }"
              @tap="onRoleTap(u)"
            >
              <text class="opbtn__text">{{ isAdminRole(u) ? '撤销' : '设为店长' }}</text>
            </view>

            <view class="switchrow" :class="{ 'switchrow--off': !canToggleStatus(u) }">
              <view class="switch" :class="{ 'switch--on': u.status === 1 }">
                <view class="switch__knob" />
              </view>
            </view>
          </view>
        </view>

        <LoadMore :state="pager.state.value" :empty="pager.isEmpty.value" @retry="pager.retry()" />

        <!-- 底部说明：把「为什么这几个按钮是灰的」写清楚，别让店长猜 -->
        <view class="hint">
          <AppIcon name="alert" :size="13" color="#68707E" />
          <view class="hint__col">
            <text class="hint__text">标了「我」的那一行不能改 —— 不能给自己降权或禁用自己</text>
            <text class="hint__text">禁用只是不让登录，订单和身份都保留；随时可以再打开</text>
          </view>
        </view>
      </template>

      <view class="ulist__pad" />
    </view>

    <!-- ================================================ 撤销身份二次确认 -->
    <!--
      撤销比授予危险得多：被撤销的人**当场**就进不了管理端了，
      如果他正在处理订单就会中断。所以要确认，并把后果说清楚。
    -->
    <ConfirmSheet
      v-model="sheet.show"
      title="撤销店长身份"
      :desc="sheet.user ? `${sheet.user.nickname} 会立刻退回顾客身份` : ''"
      confirm-text="撤销"
      danger
      :loading="actingId === sheet.user?.id && actingAction === 'revoke'"
      @confirm="doRevoke"
      @cancel="closeSheet"
    />
  </view>
</template>

<script setup>
/**
 * 用户管理（二级页，不挂底部 tab）
 *
 * 后端契约（读 `admin-user.service.ts` + 实测确认，别猜）：
 *   GET /admin/users → { list: UserVo[], page, pageSize, total, hasMore }
 *   UserVo = { id, nickname, avatar, phone(可空), gender,
 *              roles: ('CUSTOMER'|'ADMIN')[], currentRole,
 *              defaultRoom, status(1正常 0禁用), createdAt }
 *   PUT /admin/users/:id/role   body { role, action: 'GRANT' | 'REVOKE' }
 *   PUT /admin/users/:id/status body { status: 0 | 1 }   ← **数字，不能传布尔**
 *
 * 三条硬约束（前端必须自己先拦，别等后端报错）：
 *   1. 不能撤销自己的 ADMIN      → `30004`
 *   2. 不能禁用自己               → `30004`
 *   3. 撤销的身份正好是对方 currentRole 时，后端会把 currentRole 落回 CUSTOMER
 *      —— 所以撤销是「有副作用」的，必须二次确认并说明后果
 *
 * ⚠️ `createdAt` 实测拿到的是 **ISO 字符串**（`2026-10-08T11:38:00.000Z`）
 *    而不是毫秒数 —— `utils/format.js` 的 toDate 两种都吃，所以直接用它。
 *
 * ⚠️ `id` 是 BIGINT，实体上挂了 bigintTransformer，运行时可能是 string，
 *    所以**所有 id 比较都要过 Number()**，别用 `===` 直接比。
 */
import { computed, ref, watch } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import NavBar from '../../../components/NavBar.vue';
import AppIcon from '../../../components/AppIcon.vue';
import EmptyState from '../../../components/EmptyState.vue';
import LoadMore from '../../../components/LoadMore.vue';
import ConfirmSheet from '../../../components/ConfirmSheet.vue';
import { adminApi } from '../../../api/admin';
import { useAdminGuard, goSwitchRole } from '../../../composables/useAdminGuard';
import { usePagedList } from '../../../composables/usePagedList';
import { useUserStore } from '../../../store/user';
import { toErrorMessage } from '../../../utils/money';
import { formatShortTime, monogramOf, monogramTint } from '../../../utils/format';

const userStore = useUserStore();

/** 身份守卫：不是店长时一个请求都不发 */
const isAdmin = useAdminGuard();

const keyword = ref('');
/** '' | 'ADMIN' | 'CUSTOMER' —— 空串表示不筛（不能传 undefined 之外的 falsy 给后端枚举校验） */
const roleFilter = ref('');
/** '' | '0' | '1' —— 字符串，因为 `0` 会被 `!filter` 判成「没选」 */
const statusFilter = ref('');

const actingId = ref(0);
const actingAction = ref('');

const ROLE_FILTERS = [
  { label: '全部身份', value: '' },
  { label: '店长', value: 'ADMIN' },
  { label: '顾客', value: 'CUSTOMER' },
];

const STATUS_FILTERS = [
  { label: '不限状态', value: '' },
  { label: '正常', value: '1' },
  { label: '已禁用', value: '0' },
];

const roleFilters = ROLE_FILTERS;
const statusFilters = STATUS_FILTERS;

const pager = usePagedList((page, pageSize) =>
  adminApi.userList({
    keyword: keyword.value.trim() || undefined,
    role: roleFilter.value || undefined,
    // ⚠️ 这里是 '0' → Number 0。后端 `@Type(()=>Number)` + `@IsIn([0,1])` 只吃数字，
    //    传字符串 '0' 会被 IsIn 拒；传布尔 false 会被 @Type 转成 NaN（见项目约定）
    status: statusFilter.value === '' ? undefined : Number(statusFilter.value),
    page,
    pageSize,
  }),
);

const hasFilter = computed(
  () => keyword.value.trim() !== '' || roleFilter.value !== '' || statusFilter.value !== '',
);

// ===========================================================================
// 搜索
// ===========================================================================

/**
 * 边打边搜（防抖 400ms），和顾客端 `pages/product/list.vue` 同一套手感。
 *
 * 为什么不能只靠 @confirm：手机上「输入 → 等回车」在筛人这种场景里太慢，
 * 店长找一个人的心理预期是「打完就看到结果」。
 * 为什么还要保留 @confirm：回车能立刻结束防抖等待。
 */
let searchTimer = null;
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(), 400);
}

// ===========================================================================
// 行内展示辅助
// ===========================================================================

/** BIGINT id 可能是 string，比较一律过 Number() */
function isSelf(u) {
  return Number(u.id) === Number(userStore.user?.id);
}

function isAdminRole(u) {
  return Array.isArray(u.roles) && u.roles.includes('ADMIN');
}

/** 不能撤销自己的 ADMIN，也不能对一个没身份的人点「撤销」 */
function canChangeRole(u) {
  if (!isAdminRole(u)) return true; // 顾客 → 授予，谁都能授
  return !isSelf(u);
}

/** 不能禁用自己 */
function canToggleStatus(u) {
  return !isSelf(u);
}

/** 头像字标：跟顾客端 mine.vue 一致取昵称最后一个字 */
function initialOf(u) {
  const n = (u.nickname || '').trim();
  return n ? n.slice(-1) : '友';
}

function tintOf(u) {
  return monogramTint(u.nickname || '');
}

/**
 * 手机号脱敏 —— 列表里不展示完整号码。
 * `phone` 可能是 null（微信静默登录的用户没绑手机号），别显示成 "null"。
 */
function phoneText(u) {
  const s = String(u.phone || '');
  if (!s) return '未绑手机号';
  if (s.length !== 11) return s;
  return `${s.slice(0, 3)}****${s.slice(7)}`;
}

/** 注册日期只到「MM-DD」：列表右侧有操作按钮，横幅空间留给昵称更重要 */
function joinDay(value) {
  return formatShortTime(value).slice(0, 5);
}

// ===========================================================================
// 筛选
// ===========================================================================

async function applyFilters() {
  if (!isAdmin.value) {
    pager.clear();
    return;
  }
  await pager.load(true);
}

async function applySearch() {
  // 回车 / 防抖到期都会走到这里，清掉挂起的定时器避免重复请求
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  await applyFilters();
}

function switchRole(v) {
  if (roleFilter.value === v) return;
  roleFilter.value = v;
  applyFilters();
}

function switchStatus(v) {
  if (statusFilter.value === v) return;
  statusFilter.value = v;
  applyFilters();
}

async function clearSearch() {
  keyword.value = '';
  await applySearch();
}

function clearFilters() {
  keyword.value = '';
  roleFilter.value = '';
  statusFilter.value = '';
  applySearch();
}

// ===========================================================================
// 操作
// ===========================================================================

/**
 * 操作完**只替换那一行**，不整页重拉。
 *
 * 原因：启停是高频操作，整页重拉会让页面闪一下、滚动位置也可能跳。
 * 但有个例外 —— 改完之后这一行**可能不再满足当前筛选条件**
 * （比如在「店长」筛选下撤销了某人的身份），这时要把它从列表里摘掉，
 * 否则会留下一条「筛选是店长、列表里却不是店长」的自相矛盾数据。
 */
function applyRowUpdate(vo) {
  const next = pager.list.value.slice();
  const idx = next.findIndex((u) => Number(u.id) === Number(vo.id));
  if (idx < 0) return;
  if (!matchesFilter(vo)) {
    next.splice(idx, 1);
    pager.total.value = Math.max(0, Number(pager.total.value || 0) - 1);
  } else {
    next[idx] = vo;
  }
  pager.list.value = next;
}

/** 跟请求参数用同一套条件判断，避免「显示逻辑」和「筛选逻辑」各写一套走偏 */
function matchesFilter(u) {
  const kw = keyword.value.trim();
  if (kw) {
    const hit =
      (u.nickname || '').includes(kw) ||
      String(u.phone || '').includes(kw) ||
      String(u.username || '').includes(kw);
    if (!hit) return false;
  }
  if (roleFilter.value && !(Array.isArray(u.roles) && u.roles.includes(roleFilter.value))) return false;
  if (statusFilter.value !== '' && Number(u.status) !== Number(statusFilter.value)) return false;
  return true;
}

/** 授予直接做（正向、可逆）；撤销要先确认 */
function onRoleTap(u) {
  if (!isAdmin.value || actingId.value) return;
  if (!canChangeRole(u)) {
    // 走到这里说明 UI 有 bug（按钮已经禁用了），保底给个提示而不是静默
    uni.showToast({ title: isSelf(u) ? '不能改自己的身份' : '这个操作做不了', icon: 'none' });
    return;
  }
  if (isAdminRole(u)) {
    sheet.value = { show: true, user: u };
    return;
  }
  grantRole(u);
}

async function grantRole(u) {
  actingId.value = u.id;
  actingAction.value = 'grant';
  try {
    const vo = await adminApi.updateUserRole(u.id, { role: 'ADMIN', action: 'GRANT' });
    applyRowUpdate(vo);
    uni.showToast({ title: `已设为店长`, icon: 'none' });
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '设置失败'), icon: 'none' });
  } finally {
    actingId.value = 0;
    actingAction.value = '';
  }
}

// ---------------------------------------------------------------- 撤销确认
const sheet = ref({ show: false, user: null });

function closeSheet() {
  sheet.value = { ...sheet.value, show: false };
}

async function doRevoke() {
  const u = sheet.value.user;
  if (!u) return;
  actingId.value = u.id;
  actingAction.value = 'revoke';
  try {
    const vo = await adminApi.updateUserRole(u.id, { role: 'ADMIN', action: 'REVOKE' });
    applyRowUpdate(vo);
    uni.showToast({ title: '已撤销店长身份', icon: 'none' });
    closeSheet();
  } catch (err) {
    // 30004 原样展示：店长需要知道到底是哪条约束挡住了
    uni.showToast({ title: toErrorMessage(err, '撤销失败'), icon: 'none', duration: 2500 });
  } finally {
    actingId.value = 0;
    actingAction.value = '';
  }
}

/** 启停：可逆操作，不做二次确认（跟商品上下架一个待遇） */
async function toggleStatus(u) {
  if (!isAdmin.value || actingId.value) return;
  if (!canToggleStatus(u)) {
    uni.showToast({ title: '不能禁用自己', icon: 'none' });
    return;
  }
  const next = u.status === 1 ? 0 : 1;
  actingId.value = u.id;
  actingAction.value = 'status';
  try {
    const vo = await adminApi.updateUserStatus(u.id, { status: next });
    applyRowUpdate(vo);
    uni.showToast({ title: next === 1 ? '已启用' : '已禁用', icon: 'none' });
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '操作失败'), icon: 'none' });
  } finally {
    actingId.value = 0;
    actingAction.value = '';
  }
}

// ===========================================================================
// 生命周期
// ===========================================================================

async function load() {
  if (!isAdmin.value) return;
  await pager.load(true);
}

onLoad(load);

// store 恢复是异步的：onLoad 那刻可能还没登录完，守卫会拦住第一次加载
watch(isAdmin, (now, was) => {
  if (now && !was) load();
});

onReachBottom(() => pager.loadMore());

onPullDownRefresh(async () => {
  if (!isAdmin.value) {
    uni.stopPullDownRefresh();
    return;
  }
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.ulist {
  background-color: $color-bg-app;
}

/* ==================================================================== 搜索框 */
.toolbar {
  display: flex;
  align-items: center;
  padding: $space-2 $space-4;
  background-color: $color-surface;
}

.searchbox {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border-radius: $radius-pill;
  background-color: $color-bg-app;
}

.searchbox__input {
  flex: 1;
  min-width: 0;
  height: 34px;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.searchbox__ph {
  color: $color-text-muted;
}

.searchbox__clear {
  flex: none;
  display: flex;
  align-items: center;
}

/* ================================================================== 筛选条 */
/*
  两个维度各一条横滑条。inline-flex + nowrap 是必须的：
  筛选项将来加多了要能横向超出屏幕，而不是竖排挤成三行。
*/
.segbar {
  background-color: $color-surface;
  padding-bottom: 2px;
}

.segbar--gap {
  padding-top: 6px;
}

.segbar__inner {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  padding: 0 $space-4;
  min-width: 100%;
  box-sizing: border-box;
}

.seg {
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: $radius-pill;
  background-color: $color-bg-app;
}

.seg--on {
  background-color: rgba(199, 69, 10, 0.1);
}

.seg__text {
  font-size: $font-size-xs;
  color: $color-text-secondary;
  white-space: nowrap;
}

.seg--on .seg__text {
  color: $color-action;
  font-weight: $font-weight-semibold;
}

/* ==================================================================== 列表体 */
.ulist__body {
  padding: $space-3 $space-4 0;
}

.ulist__pad {
  height: $space-6;
}

/* ------------------------------------------------------------------- 骨架 */
.sklist {
  display: flex;
  flex-direction: column;
  gap: $space-2;
}

.skrow {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3;
}

.skcol {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sk {
  border-radius: $radius-sm;
  background-color: $color-bg-app;
}

.sk--ava {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
}

.sk--line {
  height: 12px;
}

/* ================================================================ 用户行 */
.urow {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3;
  margin-bottom: $space-2;
}

/* 禁用态：整体压低，但**不要**降到看不清（店长还得确认是谁） */
.urow--off {
  opacity: 0.66;
}

.urow__ava {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background-color: $color-surface-2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.urow__ava-img {
  width: 100%;
  height: 100%;
}

.urow__ava-text {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
}

.urow__main {
  flex: 1;
  min-width: 0;
}

.urow__line1 {
  display: flex;
  align-items: center;
  gap: 4px;
  /* 长昵称必须能截断，否则会把右侧按钮挤出屏幕 */
  min-width: 0;
}

.urow__name {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.urow__sub {
  display: block;
  margin-top: 3px;
  font-size: $font-size-xs;
  color: $color-text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ------------------------------------------------------------------- 标签 */
.tag {
  flex: none;
  padding: 1px 5px;
  border-radius: $radius-xs;
  font-size: $font-size-xs;
  line-height: 1.5;
}

.tag--me {
  color: $color-text-secondary;
  background-color: $color-bg-app;
}

.tag--admin {
  color: $color-action;
  background-color: $color-action-soft;
}

.tag--off {
  color: $color-text-secondary;
  background-color: $color-surface-sunken;
}

/* --------------------------------------------------------------- 行内操作 */
.urow__ops {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
}

/*
  身份按钮：不用 AppButton —— AppButton 是给「页面级主操作」设计的（36px 高、
  带按压动效），这里要的是「挤在行里的小动作」。用文字按钮更省横向空间。
  最小热区靠 padding 撑到 44px 高。
*/
.opbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 10px;
  border-radius: $radius-sm;
  background-color: $color-action-soft;
}

.opbtn__text {
  font-size: $font-size-xs;
  font-weight: $font-weight-medium;
  color: $color-action;
  white-space: nowrap;
}

.opbtn--danger {
  background-color: $color-surface-sunken;
}

.opbtn--danger .opbtn__text {
  color: $color-danger;
}

/*
  禁用态：pointer-events:none 而不是只改颜色。
  只改颜色的话按钮看着灰的但点得动，点了没反应比直接不可点更让人困惑。
*/
.opbtn--off {
  background-color: $color-surface-sunken;
  opacity: 0.5;
  pointer-events: none;
}

.opbtn--off .opbtn__text {
  color: $color-text-disabled;
}

/* 启停开关：与商品列表上下架同一个纯 CSS 实现 */
.switchrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  /* 44px 是最小可点热区 */
  height: 30px;
}

.switchrow--off {
  opacity: 0.4;
  pointer-events: none;
}

.switch {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: $radius-pill;
  background-color: $color-border-strong;
  transition: background-color 0.2s;
}

.switch--on {
  background-color: $color-action;
}

.switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: #ffffff;
  transition: transform 0.2s;
}

.switch--on .switch__knob {
  transform: translateX(16px);
}

/* ==================================================================== 提示 */
.hint {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: $space-2 $space-2 $space-3 4px;
}

.hint__col {
  flex: 1;
  min-width: 0;
}

.hint__text {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-muted;
  line-height: 1.6;
}
</style>