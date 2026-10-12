<template>
  <view class="page-root mng">
    <NavBar title="管理" border />

    <view class="page-body mng__body">
      <!--
        这一页**零请求**。它是店长工作台的导航入口，也是整个管理端的
        「逃生出口」：看板或订单接口挂了，这里照样能立刻点进去改上下架。
        所以刻意不放任何统计数字 —— 放了就要请求，请求挂了就要 loading/错误态。

        身份守卫：这一页不发请求，所以后端 @Roles(ADMIN) 拦不住「顾客手输 URL 进来」。
        不加守卫的话，顾客进来会看到「店长身份 · 可以处理订单和管理商品」这种
        自相矛盾的话。守卫后引导他去切身份 —— 而这不违背「零请求」，
        因为它只读 store，不发任何网络请求。
      -->

      <!-- 不是店长：只给一个引导，不展示任何管理入口 -->
      <EmptyState
        v-if="!isAdmin"
        variant="empty"
        icon="switch-role"
        title="需要切换到店长身份"
        desc="这个页面是店长工作台，切换身份后才能看到"
        action-text="去切换身份"
        @action="goProfile"
      />

      <template v-else>
        <!--
          当前身份卡 = **进「个人资料」页的入口**（与顾客端「我的」页顶部卡片一致）。
          身份切换本身只发生在个人资料页的「我的身份」模块里，
          这里不再放任何独立的「切换到顾客身份」按钮。
        -->
        <view class="surface who" @tap="goProfile">
          <view class="who__avatar">
            <text class="who__initial">{{ initial }}</text>
          </view>
          <view class="who__main">
            <text class="who__name">{{ userStore.user?.nickname || '店长' }}</text>
            <text class="who__role">店长身份 · 可以处理订单和管理商品</text>
          </view>
          <AppIcon name="forward" :size="14" color="#9AA2AF" />
        </view>

        <view class="surface list">
          <view class="cell" @tap="goProduct">
            <view class="cell__icon cell__icon--p1">
              <AppIcon name="product-manage" :size="16" color="#c7450a" />
            </view>
            <view class="cell__main">
              <text class="cell__label">商品管理</text>
              <text class="cell__desc">改价 · 补库存 · 上下架</text>
            </view>
            <AppIcon name="forward" :size="14" color="#9AA2AF" />
          </view>

          <view class="cell" @tap="goCategory">
            <view class="cell__icon cell__icon--p2">
              <AppIcon name="category-tree" :size="16" color="#185fa5" />
            </view>
            <view class="cell__main">
              <text class="cell__label">分类管理</text>
              <text class="cell__desc">增删分类 · 调整排序与启停</text>
            </view>
            <AppIcon name="forward" :size="14" color="#9AA2AF" />
          </view>

          <view class="cell" @tap="goUser">
            <view class="cell__icon cell__icon--p3">
              <AppIcon name="user-manage" :size="16" color="#0e8a43" />
            </view>
            <view class="cell__main">
              <text class="cell__label">用户管理</text>
              <text class="cell__desc">授予店长身份 · 启用或禁用账号</text>
            </view>
            <AppIcon name="forward" :size="14" color="#9AA2AF" />
          </view>
        </view>

        <view class="tip icon-lead">
          <view class="icon-lead__icon">
            <AppIcon name="alert" :size="13" color="#9aa2af" />
          </view>
          <text class="tip__text">
            商品分类和用户的增删改会立刻影响顾客端，删不掉的项会有明确提示
          </text>
        </view>
      </template>
    </view>

    <AppTabBar :items="tabs" active="manage" />
  </view>
</template>

<script setup>
/**
 * 管理 / 店长工作台第三个 tab —— **纯导航页**
 *
 * 为什么刻意不做数据聚合（不显示「在售 8 个商品」这种概览）：
 *   放了就得请求，请求挂了就要 loading / 错误态，一个纯导航页反而变得不可用。
 *   现在这样它在任何网络状况下都能立刻点进去 —— 它是管理端的「逃生出口」。
 *
 * 视觉沿用顾客端 mine.vue 的 cell 列表模式（图标 + 主副标题 + `›`），
 * 所以店长在两个工作台之间切换时手感一致。
 */
import { computed } from 'vue';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppTabBar from '../../components/AppTabBar.vue';
import EmptyState from '../../components/EmptyState.vue';
import { useUserStore } from '../../store/user';
import { useAdminGuard } from '../../composables/useAdminGuard';
import { tabsOfRole } from '../../utils/tabs';

const userStore = useUserStore();
const isAdmin = useAdminGuard();

/**
 * 底部 tab **跟随当前身份**，不写死 `TAB_ADMIN`。
 *
 * 顾客端页面一直是 `tabsOfRole(currentRole)`（响应式），管理端却写死常量，
 * 于是「身份变了但 tab 没变」就成了一种可能。统一成响应式之后，
 * **tab 永远等于当前身份的 tab** —— 从根上杜绝「页面/tab 与身份不匹配」。
 */
const tabs = computed(() => tabsOfRole(userStore.currentRole || 'CUSTOMER'));

/** 头像取昵称最后一个字（和 mine.vue / dashboard 一致） */
const initial = computed(() => {
  const n = userStore.user?.nickname || '';
  return n ? n.slice(-1) : '店';
});

// ===========================================================================
// 导航 —— 全部是二级页，用 navigateTo（能返回），且二级页不挂底部 tab
// ===========================================================================

function goProduct() {
  uni.navigateTo({ url: '/pages/admin/product/list?_r=' + Date.now() });
}

function goCategory() {
  uni.navigateTo({ url: '/pages/admin/category/list?_r=' + Date.now() });
}

function goUser() {
  uni.navigateTo({ url: '/pages/admin/user/list?_r=' + Date.now() });
}

/**
 * 进「个人资料」页 —— 顶部身份卡 与 守卫空态的「去切换身份」共用。
 *
 * ⚠️ 用 `navigateTo` 而**不是** `reLaunch`：
 *    navigateTo 会压栈，个人资料页点左上角返回能**回到来源页**（管理端「管理」页）；
 *    reLaunch 会清空页面栈，返回键就无处可去了。
 *    真正的身份切换在个人资料页里完成，切完由 store `reLaunch` 到对应端的落地页
 *    （那时页面栈被清空是**预期行为**）。
 */
function goProfile() {
  uni.navigateTo({ url: '/pages/mine/profile?_r=' + Date.now() });
}
</script>

<style lang="scss" scoped>
.mng {
  background-color: $color-bg-app;
}

.mng__body {
  padding: $space-3 $space-4;
}

/* ================================================================ 当前身份 */
.who {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-4;
  margin-bottom: $space-3;
}

.who__avatar {
  flex: none;
  width: $avatar-md;
  height: $avatar-md;
  border-radius: 50%;
  background-color: $color-action-soft;
  display: flex;
  align-items: center;
  justify-content: center;
}

.who__initial {
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  color: $color-action;
}

.who__main {
  flex: 1;
  min-width: 0;
}

.who__name {
  display: block;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.who__role {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin-top: 2px;
}

/* ================================================================ 入口列表 */
.list {
  padding: 0 $space-4;
  margin-bottom: $space-3;
}

.cell {
  display: flex;
  align-items: center;
  gap: $space-3;
  min-height: 60px;
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
  width: 32px;
  height: 32px;
  border-radius: $radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cell__icon--p1 {
  background-color: $color-action-soft;
}

.cell__icon--p2 {
  background-color: #e6f1fb;
}

.cell__icon--p3 {
  background-color: $color-success-soft;
}

.cell__main {
  flex: 1;
  min-width: 0;
}

.cell__label {
  display: block;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.cell__desc {
  display: block;
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin-top: 2px;
}

/* ================================================================ 底部提示 */
.tip {
  display: flex;
  align-items: flex-start;
  /* `.icon-lead__icon` 用 1.6em 算壳高，em 相对**本容器**字号 → 必须显式给 */
  font-size: $font-size-xs;
  gap: 6px;
  padding: $space-2 $space-1;
}

.tip__text {
  flex: 1;
  font-size: $font-size-xs;
  color: $color-text-muted;
  line-height: $line-height-normal;
}
</style>