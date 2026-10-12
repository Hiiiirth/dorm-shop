<template>
  <view class="page-root cat">
    <NavBar title="商品分类" :back="true" border>
      <template #default>
        <view class="navsearch" hover-class="navsearch--hover" :hover-stay-time="60" @tap="goSearch">
          <AppIcon name="search" :size="14" color="#68707E" />
          <text class="navsearch__ph">搜索商品</text>
        </view>
      </template>
    </NavBar>

    <view class="cat__main">
      <!-- ======================================================== 左侧一级分类 -->
      <scroll-view class="rail" scroll-y :scroll-into-view="`rail-${activeId}`" scroll-with-animation>
        <view
          v-for="cat in categories"
          :id="`rail-${cat.id}`"
          :key="cat.id"
          class="rail__item"
          :class="{ 'rail__item--active': cat.id === activeId }"
          :hover-class="cat.id === activeId ? '' : 'rail__item--hover'"
          :hover-stay-time="60"
          @tap="selectCategory(cat)"
        >
          <view class="rail__bar" />
          <text class="rail__text">{{ cat.name }}</text>
        </view>

        <view class="rail__pad" />
      </scroll-view>

      <!-- ============================================================ 右侧商品
           ⚠️ 只滚自己的内容，跟左栏完全解耦（两个独立 scroll-view，谁也不听谁的）。
           触底行为分两种，见 onPanelLower()：
             · 本分类还有下一页   -> 加载下一页
             · 本分类已到底       -> 自动切到左栏的下一个分类 -->
      <scroll-view
        class="panel"
        scroll-y
        :scroll-top="panelScrollTop"
        scroll-with-animation
        :lower-threshold="80"
        @scroll="onPanelScroll"
        @scrolltolower="onPanelLower"
      >
        <!-- 子分类 chips：父分类有子分类时才出现。
             后端的 categoryId 是精确匹配、不含子分类，所以必须让用户能下钻，
             否则父分类下只在子分类挂了商品时会永远看着是空的。 -->
        <scroll-view v-if="subCategories.length" class="chips" scroll-x show-scrollbar="false">
          <view class="chips__inner">
            <view
              class="chip"
              :class="{ 'chip--on': subId === 0 }"
              @tap="selectSub(0)"
            >
              <text class="chip__text">全部</text>
            </view>
            <view
              v-for="sub in subCategories"
              :key="sub.id"
              class="chip"
              :class="{ 'chip--on': subId === sub.id }"
              @tap="selectSub(sub.id)"
            >
              <text class="chip__text">{{ sub.name }}</text>
            </view>
          </view>
        </scroll-view>

        <!-- 分类头：当前在哪个分类、共几件 -->
        <view class="panel__head">
          <text class="panel__title">{{ currentTitle }}</text>
          <text v-if="pager.ready.value" class="panel__count">{{ pager.total.value }} 件</text>
        </view>

        <!-- 首屏骨架 -->
        <view v-if="pager.isFirstLoading.value" class="grid">
          <view v-for="i in 4" :key="`s${i}`" class="grid__cell">
            <view class="surface skcard">
              <view class="sk sk--img" />
              <view class="sk sk--line" style="width: 80%" />
              <view class="sk sk--line" style="width: 45%" />
            </view>
          </view>
        </view>

        <EmptyState
          v-else-if="pager.firstError.value"
          variant="error"
          desc="商品列表没拿到"
          action-text="重新加载"
          @action="reload"
        />

        <EmptyState
          v-else-if="pager.isEmpty.value"
          variant="empty"
          :title="subCategories.length ? '该分类下暂无商品' : '这个分类还没上货'"
          :desc="
            subCategories.length
              ? '试试点上面的子分类看看'
              : '店主补货后会出现在这里，先去别的分类逛逛'
          "
        />

        <template v-else>
          <view class="grid">
            <view v-for="p in pager.list.value" :key="p.id" class="grid__cell">
              <ProductCard
                class="grid__card"
                :product="p"
                mode="grid"
                @tap="goDetail(p.id)"
                @add="quickAdd(p)"
              />
            </view>
          </view>

          <!--
            列表的**最后一项**：「已经到底啦」。
            它就是 scroll-view 内容流的收尾节点，后面只接 tabbar 的等高空占位 ——
            所以滚到底 = 看到它，再往下拉不动（用户要求的 3 条）。
          -->
          <LoadMore
            class="panel__more"
            :state="pager.state.value"
            :empty="pager.isEmpty.value"
            @retry="pager.retry"
          />
        </template>

        <!--
          ⚠️⚠️ tabbar 必须挂**在右栏这个 scroll-view 内部**（不能放在 .cat__main 的兄弟位置）。

          踩过的坑：放在外面时它的 `tabbar__spacer`（52px，**在文档流里**）会算进 .cat 的高度 ——
          `.cat` 是 `flex:1`、它的父级高度又是**内容驱动**的，于是整页被撑到 980px、
          超出 844px 视口 136px。后果是 .panel 跟着变成 882px 高，
          「内容撑开」变成了「容器比视口还高」，右栏那条滚动条永远滚不动
          （内容再少也是 scrollHeight === clientHeight），
          触底加载 / 自动切下一个分类统统失效。

          放在这里（scroll-view 的最后一项）才对：
          · 页面本身不再溢出，.cat 严格等于视口高度；
          · 这 52px 高占位留在**右栏的滚动内容**里，保证最后一个商品卡
            不会被 fixed 的 tabbar 盖住（这就是「让位」的正确位置）。
        -->
        <AppTabBar :items="tabs" active="category" />
      </scroll-view>
    </view>

    <!--
      需求 6：底部吸底购物车。
      盖住**全宽**（左栏 + 右栏）—— 放在 `.cat__main` 的兄弟节点上，
      两栏都不用单独加 padding-bottom，一个 fixed 元素就覆盖整屏宽度。
      `bottom-offset` 让它叠在 tabbar 之上，和 tabbar 用同一套高度算法。
    -->
    <CartBar :bottom-offset="CART_BAR_OFFSET" />
  </view>
</template>

<script setup>
/**
 * 分类页
 *
 * 左右两栏**各自独立滚动**（两个 scroll-view），而不是整页滚动 + 左侧 sticky。
 * 原因：左栏要能长按一屏（分类多了要能滚），右栏要能触底加载 ——
 * 整页滚动的话 onReachBottom 会被左栏的位置干扰，很难判断「右栏到底了没」。
 *
 * 两栏**滚动完全解耦**：滑右栏商品，左栏纹丝不动；点左栏任意分类随时切换。
 * 左侧高亮通过 `scroll-into-view` 跟随（自动前进时也会把选中项滚进视野），
 * 但**左栏的滚动位置由它自己掌握**，不会被右栏带着跑。
 *
 * 右栏触底是两级行为（见 onPanelLower）：
 *   还有下一页 -> 加载下一页；本分类已到底 -> 自动切左栏的下一个分类。
 * 走完最后一个分类就停住，继续下滑不再有任何反应。
 *
 * 后端的 categoryId 是**精确匹配**（不递归子分类），所以：
 *   · 父分类没有子分类 -> 直接用父 id 查
 *   · 父分类有子分类   -> 默认「全部」（=父 id）+ 一排 chips 让用户下钻
 * 这是前端能做的全部；真要「含子分类」得后端加参数，已记在已知缺口里。
 */
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppTabBar from '../../components/AppTabBar.vue';
import CartBar from '../../components/CartBar.vue';
import EmptyState from '../../components/EmptyState.vue';
import LoadMore from '../../components/LoadMore.vue';
import ProductCard from '../../components/ProductCard.vue';
import { catalogApi } from '../../api/catalog';
import { usePagedList } from '../../composables/usePagedList';
import { useCartStore } from '../../store/cart';
import { useUserStore } from '../../store/user';
import { tabsOfRole } from '../../utils/tabs';

const userStore = useUserStore();
const cartStore = useCartStore();

const categories = ref([]);
const activeId = ref(0);
/** 0 = 「全部」（即父分类本身） */
const subId = ref(0);
/** 换分类时把右侧滚回顶部：绑 scroll-top 到一个变化的值 */
const panelScrollTop = ref(0);

const tabs = computed(() =>
  tabsOfRole(userStore.currentRole || 'CUSTOMER').map((t) =>
    t.key === 'cart' ? { ...t, badge: cartStore.badge } : t,
  ),
);

/**
 * 左右两栏的可视高度不用 JS 算空间
 *
 * 直觉做法是 `windowHeight - 状态栏 - 导航条 - tab - 安全区`，
 * 但那串减法在 H5 和小程序上**基数不一样**（windowHeight 有没有含状态栏、安全区怎么算），
 * 很容易某一端多减一次导致底部被切。
 * 更稳的是让 CSS 负责：整页 flex 竖向铺满，中间那栏 `flex: 1; min-height: 0`
 * 自动吃掉剩余高度。
 * min-height: 0 是关键 —— 不写的话 flex 子项有内容时不会收缩，scroll-view 就滚不动了。
 *
 * tabbar 的让位由 `AppTabBar` 自带的 `tabbar__spacer` 完成（它在右栏内部），
 * **不要再在这里扣一次高度**，否则底部会多出一片空白。
 */

/**
 * 底部购物车横条 / 浮层的 bottom 偏移。
 * ⚠️ 传**真实数值**而不是 CSS 变量：
 *    CartBar 里 `.csheet` 是 position:fixed，继承不到页面上的 CSS 变量。
 *    用和 `AppTabBar` 同一个来源 `uni.upx2px(100)` 算，值必然一致。
 *    安全区交给子组件自己拼 `env()`。
 */
const TAB_BAR_H = uni.upx2px(100);
const CART_BAR_OFFSET = `${TAB_BAR_H}px`;

const activeCategory = computed(() => categories.value.find((c) => c.id === activeId.value) || null);
const subCategories = computed(() => activeCategory.value?.children || []);

const currentTitle = computed(() => {
  if (!activeCategory.value) return '全部商品';
  if (subId.value === 0) return activeCategory.value.name;
  const sub = subCategories.value.find((c) => c.id === subId.value);
  return sub ? sub.name : activeCategory.value.name;
});

/** 实际发给后端的 categoryId */
const queryCategoryId = computed(() => (subId.value > 0 ? subId.value : activeId.value));

const pager = usePagedList((page, pageSize) =>
  catalogApi.products({ categoryId: queryCategoryId.value, page, pageSize }),
);

/* ------------------------------------------------------------------
 * 右栏滚动 / 自动前进用的状态（声明在 reload 之前，reload 里会用到）
 * ------------------------------------------------------------------ */

/** 右栏当前 scrollTop（@scroll 实时更新） */
const panelTop = ref(0);
/** 右栏可滚动的总距离（scrollHeight - clientHeight），>0 才谈得上「下滑」 */
const panelMax = ref(0);
/** 刚切完分类的冷静期：这段时间内的 scrolltolower 一律忽略（见 goNextCategory） */
let advancing = false;
let advanceTimer = null;

async function loadCategories() {
  const tree = await catalogApi.categories();
  // 只保留启用的一级分类。后端已经过滤了 status，这里再挡一道防止以后改回去
  categories.value = (tree || []).filter((c) => c.parentId === 0 && c.status !== 0);
}

function selectCategory(cat) {
  if (cat.id === activeId.value) return;
  activeId.value = cat.id;
  subId.value = 0;
  reload();
}

function selectSub(id) {
  if (id === subId.value) return;
  subId.value = id;
  reload();
}

function reload() {
  panelScrollTop.value = panelScrollTop.value === 0 ? 0.1 : 0;
  uni.pageScrollTo({ scrollTop: 0, duration: 0 });
  // 换分类后重新量：右栏会滚回顶部，可滚距离由新内容决定
  panelTop.value = 0;
  panelMax.value = 0;
  pager.clear();
  pager.load(true).catch(() => {});
}

/* ==================================================================
 * 右栏触底：先判断「本分类还有没有下一页」，没有就顺势切下一个分类
 * ================================================================== */

/**
 * 防御设计（都是实测出来的，不是想当然）
 *
 * ① **不用「滚了多远」当闸门。**
 *    一开始写的是「从上次切换起必须又往下拉 ≥120px 才允许跳下一个」，
 *    想法是防短分类被连锁跳过。但实测发现：
 *      · 内容**不溢出**的分类（scrollHeight === clientHeight，scrollTop 恒为 0）
 *        **根本不会派发任何 scroll / scrolltolower 事件** ——
 *        无论是程序设 scrollTop 还是真实的触摸滑动都一样（已在 H5 实测两种手势确认）。
 *        也就是说「短分类被连锁跳过」这个风险**压根不存在**。
 *      · 反而那条 ≥120px 的规则会**误杀慢速滑动**：
 *        用户慢慢往下拖，scrolltolower 在 `max - lower-threshold` 处就触发了，
 *        此刻的增量可能只有几十 px —— 判不通过；而这时已经到底、不会再有新事件，
 *        于是「怎么滑都切不过去」。
 *    所以闸门换成「**这一下确实是把右栏往下滚了**」（panelMax > 0 且 scrollTop > 0）。
 *
 * ② **冷静期只用来吸收「切换瞬间的余波」。**
 *    reload() 之后新内容渲染、scroll-top 被写回 0，uni 有可能在这一刻补发一次
 *    scrolltolower。用 advancing 锁 + scrollTop>0 一起挡：余波那次 scrollTop 是 0，挡掉。
 */

/** 当前分类在左栏列表里的下标；-1 表示没找到 */
const activeIndex = computed(() => categories.value.findIndex((c) => c.id === activeId.value));

/** 是否还能往后走（还有下一个分类） */
const canAdvance = computed(
  () => activeIndex.value >= 0 && activeIndex.value < categories.value.length - 1,
);

function onPanelScroll(e) {
  const d = e?.detail || {};
  panelTop.value = Number(d.scrollTop) || 0;
  // scrollHeight / clientHeight 在小程序端 scroll 事件里不一定给，缺了就别覆盖旧值
  if (d.scrollHeight != null && d.clientHeight != null) {
    panelMax.value = Math.max(0, Number(d.scrollHeight) - Number(d.clientHeight));
  }
}

function onPanelLower() {
  // 还没加载完 / 正在加载 / 上次失败 —— 都交给 pager 自己处理
  if (!pager.ready.value) return;
  if (pager.state.value === 'loading' || pager.state.value === 'error') return;

  // ① 本分类还有下一页：老老实实加载下一页
  if (pager.hasMore.value) {
    pager.loadMore();
    return;
  }

  // ② 本分类到底了 —— 继续下滑切下一个分类
  goNextCategory();
}

/**
 * 切到左栏的下一个分类。
 *
 * 四道闸门：
 *   1. `advancing`        —— 冷静期内 / 连续事件，直接忽略
 *   2. `subId !== 0`      —— 用户点了子分类 chips 是在**主动下钻**，
 *                            这时滑到底把他弹去下一个大分类属于抢方向盘，让他停住
 *   3. `canAdvance`       —— 已经是最后一个分类 -> 到底为止，继续滑没反应
 *   4. `panelTop > 0`     —— **这一下确实把右栏往下滚了**。
 *                            切换余波（新内容刚渲染、scrollTop 还是 0）会被这条挡掉；
 *                            内容不溢出的分类因为压根不派发事件，也进不来。
 *
 * ⚠️ 闸门**只用 `scrollTop`，不用 `scrollHeight/clientHeight`**：
 *    uni 的 `@scroll` 事件里 `scrollTop` 一定在，但 `scrollHeight` / `clientHeight`
 *    在**小程序端不保证给**（H5 给、微信端历史上就缺过）。
 *    拿它当闸门的话，小程序上会「怎么滑都切不过去」，而且完全没有报错线索。
 *    （`panelMax` 只做记录，方便排查，不参与判断。）
 */
function goNextCategory() {
  if (advancing) return;
  if (subId.value !== 0) return;
  if (!canAdvance.value) return;
  if (panelTop.value <= 0) return;

  const next = categories.value[activeIndex.value + 1];
  if (!next) return;

  advancing = true;
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    advancing = false;
  }, 450);

  activeId.value = next.id;
  subId.value = 0;
  reload();
}

async function quickAdd(product) {
  if (!userStore.isLogin) {
    uni.showToast({ title: '登录后才能加购物车', icon: 'none' });
    setTimeout(() => uni.navigateTo({ url: '/pages/login/login' }), 600);
    return;
  }
  try {
    const count = await cartStore.add(product.id, 1);
    uni.showToast({ title: `已加入购物车（${count} 种）`, icon: 'none' });
  } catch {
    /* request 层已提示 */
  }
}

function goSearch() {
  uni.navigateTo({ url: '/pages/product/list?focus=1' });
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/product/detail?id=${id}` });
}

onLoad(async (options) => {
  await loadCategories();

  const wanted = Number(options?.categoryId) || 0;
  activeId.value = categories.value.some((c) => c.id === wanted)
    ? wanted
    : categories.value[0]?.id || 0;

  await pager.load(true);
});

onShow(() => {
  cartStore.refresh();
});

onPullDownRefresh(async () => {
  await loadCategories();
  await pager.load(true);
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.cat {
  background-color: $color-bg-app;
  /* 整页锁死一屏，内部两栏各自滚 —— 这样就不会出现「外层滚 + 内层滚」打架。
   *
   * ⚠️⚠️ 这里必须是**定高**，且必须覆盖掉 `.page-root` 的 `min-height: 100vh`。
   *  `.cat` 和 `.page-root` 是**同一个元素**（`class="page-root cat"`），
   *  全局的 `.page-root { min-height: 100vh }` 是「随内容长高」的语义。
   *  只写 `height: 100vh` 而不写 `min-height: 0` 的话：
   *    height=844 但 min-height=844，一旦右栏内容超过 844（商品多就会），
   *    min-height 直接胜出 → 整页被撑到 980px、超出视口 136px。
   *  后果非常隐蔽：`.panel` 跟着长到 934px，
   *  `scrollHeight === clientHeight`（内容永远填不满容器）→ 右栏那条滚动条**永远滚不动**，
   *  触底加载、自动切下一个分类全部失效，但页面上看起来「什么都没坏」。
   *
   *  这正是「滚动容器高度由商品内容撑开」的反面案例：
   *  容器比视口还高 = 内容被截在屏幕外，还滚不到。
   *
   * ⚠️ 用 `100vh` 不是 `100%`：`100%` 的父级 `uni-page-body` 是 `height:auto`，
   *    百分比高度解析不出来 → 又会退回内容撑开。`vh` 不依赖父级。
   *
   * ⚠️ 也不能只给 `.cat` 加 `padding-bottom: <tabbar 高度>` 来让位：
   *    那样是把 52px 加在**内容盒**上，整页还是超出去；
   *    正确的让位位置是**右栏滚动内容的末尾**，由 `AppTabBar` 自带的
   *    `tabbar__spacer` 完成（见模板里那段注释）。 */
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
}

/* 导航条里的假搜索框 —— 它自己不接受输入，点一下跳真正的搜索页。
   这样做是为了让分类页保持「纯浏览」的单一职责。 */
.navsearch {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 $space-3;
  border-radius: $radius-pill;
  background-color: $color-surface-2;
}

.navsearch--hover {
  background-color: $color-surface-sunken;
}

.navsearch__ph {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* ==================================================================== 两栏 */
.cat__main {
  /* min-height: 0 是必须的：flex 子项默认 min-height:auto，有内容时不会收缩，
     结果就是 scroll-view 高度被内容撑开、滚动条失效。 */
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* --------------------------------------------------------------- 左栏
 * 独立滚动三件套：
 *   · `height: 100%`  + `overflow` 由 scroll-view 自己管 —— 它有自己的滚动条，
 *     不参与右栏的滚动，也不受右栏 scroll-top 影响（**这就是解耦**）。
 *   · `overscroll-behavior: contain` 防止内层滚到头之后把滚动链甩给外层/右栏，
 *     手机上表现为「滑左栏结果右边动了」。
 *   · 宽度用 rpx（随屏宽缩放），但不要用 `min-width:0` ——
 *     它已经有 `flex:none`，宽度是定死的，再加 min-width 只会在窄屏上被压扁。
 */
.rail {
  flex: none;
  width: 176rpx;
  height: 100%;
  background-color: $color-surface-2;
  overscroll-behavior: contain;
}

.rail__item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 104rpx;
  padding: $space-2 $space-2 $space-2 $space-3;
}

.rail__item--hover {
  background-color: $color-surface-sunken;
}

.rail__item--active {
  background-color: $color-surface;
}

/* 左侧竖条：选中态不只靠底色，多加一重形状线索 */
.rail__bar {
  position: absolute;
  left: 0;
  top: 50%;
  width: 6rpx;
  height: 0;
  border-radius: 0 $radius-xs $radius-xs 0;
  background-color: $color-action;
  transform: translateY(-50%);
  transition: height $motion-state $easing-standard;
}

.rail__item--active .rail__bar {
  height: 36rpx;
}

.rail__text {
  font-size: $font-size-sm;
  line-height: 1.3;
  color: $color-text-secondary;
  text-align: center;
}

.rail__item--active .rail__text {
  color: $color-action;
  font-weight: $font-weight-semibold;
}

.rail__pad {
  height: $space-6;
}

/* --------------------------------------------------------------- 右栏 */
.panel {
  flex: 1;
  height: 100%;
  min-width: 0;
  background-color: $color-surface;
  /* 右栏自己滚，滚动链不往上传（否则滑到底会带动整页/左栏） */
  overscroll-behavior: contain;
}

/* 子分类 chips */
.chips {
  white-space: nowrap;
  padding: $space-3 $space-3 0;
}

.chips__inner {
  display: inline-flex;
  align-items: center;
  gap: $space-2;
}

.chip {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 $space-3;
  border-radius: $radius-pill;
  background-color: $color-surface-2;
  border: 1px solid transparent;
}

.chip--on {
  background-color: $color-action-soft;
  border-color: $color-action;
}

.chip__text {
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.chip--on .chip__text {
  color: $color-action;
  font-weight: $font-weight-medium;
}

.panel__head {
  display: flex;
  align-items: baseline;
  gap: $space-2;
  padding: $space-3 $space-3 $space-2;
}

.panel__title {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.panel__count {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* 商品网格 */
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: $space-3;
  padding: 0 $space-3;
}

/*
 * 右栏比整屏窄，所以是「一列半」——用 2 列会挤成一条，1 列又浪费宽度。
 * 这里用固定两列，卡片内部靠 ellipsis 收。
 *
 * display:flex 是故意留的：让卡片 flex:1 撑满格子高度，价格才能同行对齐。
 * 别在这里改卡片内部排布 —— 那是 ProductCard 的事（见 list.vue 的踩坑注释）。
 */
.grid__cell {
  width: calc((100% - #{$space-3}) / 2);
  display: flex;
}

.grid__card {
  flex: 1;
  border: 1px solid $color-border-subtle;
}

/*
 * 列表收尾条（「已经到底啦」/ 加载中 / 重试）。
 * · 它是右栏 scroll-view 的**最后一个内容节点**，所以「滚到底」就是它所在的位置。
 * · padding 用 $space-4 收口，不加额外 min-height —— 底部不留空白灰区。
 *   高度由内容撑开（flex 默认 auto），**不要**给 .panel 或这里写死 height，
 *   写死就会在商品少的时候于下方撑出一片灰（用户要求 3 条）。
 * · 注意别写 `margin-bottom`：那会在它下方再撑出一段空白，
 *   变成「拉到最底还有一片灰」，正是要避免的现象。
 * · 处于**最后一个分类**时它同样是收尾 —— 只是再往下滑不会切换分类了。
 */
.panel__more {
  padding-bottom: $space-4;
}

.skcard {
  padding: $space-2;
  flex: 1;
}

.sk {
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 37%, #eef0f4 63%);
  background-size: 400% 100%;
  border-radius: $radius-xs;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk--img {
  width: 100%;
  /* 跟 ProductImage 一样用「高 0 + padding 撑」做正方形，别用 aspect-ratio */
  height: 0;
  padding-bottom: 100%;
  margin-bottom: $space-2;
}

.sk--line {
  height: 12px;
  margin-bottom: 6px;
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
