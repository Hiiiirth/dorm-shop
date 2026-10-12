<template>
  <view class="page-root">
    <NavBar title="设计系统预览" :back="true" border />

    <view class="page-body">
      <text class="intro">
        这一页把 S7-0 的设计 token 和基础组件全部渲染一遍，用来肉眼验收。
        每个色块下面的比值是 **WCAG 对比度实测值**，不是估的。
      </text>

      <!-- ============================================ 1. 配色 -->
      <view class="section-title">1. 语义色板</view>
      <view class="surface card">
        <text class="card__note">
          色值是 src/uni.scss 的镜像（SCSS 变量没法在运行时读，所以这里手抄了一份），
          下表 token 名省略了公共前缀 `$color-`。下方所有**真实组件**都消费 token，
          改 token 它们会跟着变，只有这张表的文字不会。
        </text>

        <view v-for="group in palette" :key="group.name" class="pgroup">
          <text class="pgroup__title">{{ group.name }}</text>
          <view v-for="c in group.items" :key="c.name" class="prow">
            <view class="prow__chip" :style="{ background: c.hex }" />
            <view class="prow__meta">
              <text class="prow__name">{{ c.name }}</text>
              <text class="prow__token">{{ c.token }}</text>
            </view>
            <view class="prow__right">
              <text class="prow__hex">{{ c.hex }}</text>
              <text class="prow__ratio" :class="ratioClass(c.ratio)">{{ c.ratio }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ============================================ 2. 主色取舍 -->
      <view class="section-title">2. 主色取舍（重要）</view>
      <view class="surface card">
        <text class="card__note">
          品牌鲜艳橙 #FF6A2B 压白字只有 2.86:1，**达不到 4.5:1**，做实底按钮会看不清。
          所以主操作改用同色阶更深的 #C7450A（白字 4.90:1）。两者并排对比：
        </text>

        <view class="compare">
          <view class="compare__item">
            <view class="compare__btn" :style="{ background: '#FF6A2B' }">
              <text class="compare__label">确认下单</text>
            </view>
            <text class="compare__ratio compare__ratio--fail">白字 2.86:1 ✗</text>
            <text class="compare__desc">品牌鲜艳橙 #FF6A2B —— 只做装饰/图形</text>
          </view>
          <view class="compare__item">
            <view class="compare__btn" :style="{ background: '#C7450A' }">
              <text class="compare__label">确认下单</text>
            </view>
            <text class="compare__ratio compare__ratio--pass">白字 4.90:1 ✓</text>
            <text class="compare__desc">主操作色 #C7450A —— 实底按钮用它</text>
          </view>
        </view>
      </view>

      <!-- ============================================ 3. 字号 -->
      <view class="section-title">3. 字号阶梯</view>
      <view class="surface card">
        <view v-for="t in types" :key="t.name" class="trow">
          <text class="trow__sample" :style="{ fontSize: t.px + 'px', fontWeight: t.weight }">
            宿舍小超市 12.50
          </text>
          <text class="trow__meta">{{ t.name }} · {{ t.px }}px · {{ t.usage }}</text>
        </view>
      </view>

      <!-- ============================================ 4. 间距与圆角 -->
      <view class="section-title">4. 间距与圆角</view>
      <view class="surface card">
        <view v-for="s in spaces" :key="s.name" class="srow">
          <text class="srow__name">{{ s.name }} · {{ s.px }}px</text>
          <view class="srow__bar" :style="{ width: s.px * 3 + 'px' }" />
        </view>

        <view class="divider" />

        <view class="radii">
          <view v-for="r in radii" :key="r.name" class="radii__item">
            <view class="radii__box" :style="{ borderRadius: r.px + 'px' }" />
            <text class="radii__label">{{ r.name }} {{ r.px }}px</text>
          </view>
        </view>
      </view>

      <!-- ============================================ 5. 按钮 -->
      <view class="section-title">5. 按钮（含全部状态）</view>
      <view class="surface card">
        <text class="card__note">按压态在 H5 上要真的按住才看得到；禁用态必须「看起来就点不动」。</text>

        <view class="btnrow">
          <AppButton type="primary" size="md" text="主操作" />
          <AppButton type="secondary" size="md" text="次级操作" />
          <AppButton type="text" size="md" text="文字按钮" />
          <AppButton type="danger" size="md" text="危险操作" />
        </view>

        <view class="btnrow">
          <AppButton type="primary" size="sm" text="小号" />
          <AppButton type="primary" size="md" text="中号" />
          <AppButton type="primary" size="lg" text="大号" />
        </view>

        <view class="btnrow">
          <AppButton type="primary" size="md" text="禁用" disabled />
          <AppButton type="primary" size="md" text="加载中" loading />
          <AppButton type="secondary" size="md" text="禁用（次级）" disabled />
        </view>

        <view class="btnrow btnrow--block">
          <AppButton type="primary" size="md" block text="撑满宽度（下单页主按钮）" />
        </view>
      </view>

      <!-- ============================================ 6. 订单状态标签 -->
      <view class="section-title">6. 订单状态标签</view>
      <view class="surface card">
        <text class="card__note">
          设计约束：状态**不能只靠颜色**。每个标签是「底色 + 图标 + 中文文字」三重复线索，
          灰度截图/色盲/打印都能区分。
        </text>

        <view class="tagrow">
          <OrderStatusTag v-for="s in allStatuses" :key="s" :status="s" />
        </view>

        <text class="sub-label">紧凑版（列表行内用）</text>
        <view class="tagrow">
          <OrderStatusTag v-for="s in allStatuses" :key="s" :status="s" size="sm" />
        </view>
      </view>

      <!-- ============================================ 7. 金额 -->
      <view class="section-title">7. 金额展示（入参是「分」）</view>
      <view class="surface card">
        <view class="pricerow">
          <PriceText :value="1250" size="xxl" />
          <text class="pricerow__hint">value=1250 分 → ¥12.50</text>
        </view>
        <view class="pricerow">
          <PriceText :value="300" size="md" :original="350" />
          <text class="pricerow__hint">带划线原价 300 / 350 分</text>
        </view>
        <view class="pricerow">
          <PriceText :value="0" size="lg" tone="muted" />
          <text class="pricerow__hint">0 分也要显示 ¥0.00，不要显示空</text>
        </view>
        <view class="pricerow">
          <PriceText :value="999999" size="lg" tone="danger" />
          <text class="pricerow__hint">大额（¥9999.99）不换行、不缩位</text>
        </view>
      </view>

      <!-- ============================================ 8. 空状态 -->
      <view class="section-title">8. 空状态（4 个变体）</view>
      <view class="surface card card--flush">
        <EmptyState variant="empty" desc="去首页挑几件吧" />
        <view class="divider" />
        <EmptyState variant="search" />
        <view class="divider" />
        <EmptyState variant="error" action-text="重新加载" @action="onFakeAction" />
        <view class="divider" />
        <EmptyState variant="offline" action-text="检查网络" @action="onFakeAction" />
      </view>

      <!-- ============================================ 9. 底部 tab -->
      <view class="section-title">9. 自绘底部 tab（按身份切换）</view>
      <view class="surface card">
        <text class="card__note">
          pages.json 的 tabBar 是编译期静态的，只有一套；这里按身份给不同 tab。
          代价是切换要用 reLaunch，会丢页面内滚动位置。
        </text>

        <text class="sub-label">顾客</text>
        <AppTabBar :items="tabsCustomer" active="home" inline :interactive="false" />
        <text class="sub-label">店长</text>
        <AppTabBar :items="tabsAdmin" active="dashboard" inline :interactive="false" />
      </view>

      <!-- ============================================ 10. 图标系统 -->
      <view class="section-title">10. 图标系统（Lucide + morphicons）</view>

      <view class="surface card">
        <text class="card__note">
          图标来源是 <text class="ic-em">Lucide</text>（24×24 描边网格，统一线宽），
          按语义名注册在 <text class="ic-mono">src/utils/icons.js</text>。
          页面只写 <text class="ic-mono">&lt;AppIcon name="cart" /&gt;</text>，
          平台差异（H5/App 走 inline SVG、小程序走 data-URI）收在组件内部。
        </text>

        <text class="sub-label">全部已注册图标（{{ iconNames.length }} 个）</text>
        <view class="iconwall">
          <view v-for="n in iconNames" :key="n" class="iconwall__cell">
            <view class="iconwall__box">
              <AppIcon :name="n" :size="22" color="#4E5665" :stroke-width="1.9" />
            </view>
            <text class="iconwall__name">{{ n }}</text>
          </view>
        </view>

        <text class="sub-label">同一份数据在四种尺寸 / 四种颜色下的表现</text>
        <view class="rows">
          <view class="irow">
            <text class="irow__k">尺寸</text>
            <view class="irow__v">
              <AppIcon name="hot" :size="12" color="#C7450A" />
              <AppIcon name="hot" :size="16" color="#C7450A" />
              <AppIcon name="hot" :size="22" color="#C7450A" />
              <AppIcon name="hot" :size="30" color="#C7450A" />
            </view>
          </view>
          <view class="irow">
            <text class="irow__k">颜色</text>
            <view class="irow__v">
              <AppIcon name="check" :size="20" color="#0E8A43" />
              <AppIcon name="clock" :size="20" color="#B86E00" />
              <AppIcon name="close" :size="20" color="#D93A3F" />
              <AppIcon name="truck" :size="20" color="#C7450A" />
              <AppIcon name="minus" :size="20" color="#9AA2AF" />
            </view>
          </view>
          <view class="irow">
            <text class="irow__k">线宽</text>
            <view class="irow__v">
              <AppIcon name="cart" :size="20" :stroke-width="1.5" />
              <AppIcon name="cart" :size="20" :stroke-width="2" />
              <AppIcon name="cart" :size="20" :stroke-width="2.5" />
            </view>
          </view>
          <view class="irow">
            <text class="irow__k">跟随 CSS color</text>
            <view class="irow__v irow__v--green">
              <AppIcon name="check" :size="20" />
              <AppIcon name="finished" :size="20" />
            </view>
          </view>
          <view class="irow">
            <text class="irow__k">转圈</text>
            <view class="irow__v">
              <AppIcon name="loading" :size="18" spin color="#C7450A" />
              <AppIcon name="loading" :size="18" spin color="#68707E" />
            </view>
          </view>
        </view>
      </view>

      <view class="surface card">
        <text class="card__note">
          <text class="ic-em">morphicons</text> 是「图形形变」库 ——
          它让同一个位置的图标从一个形状**长**成另一个形状，而不是「消失再出现」。
          它吃的是 IconNode 数据，正好和我们注册表里的数据是同一份。
          <text class="ic-strong">只在 H5 生效</text>，小程序端会自动退回静态图标。
        </text>
        <text class="card__note">
          点下面的按钮看看效果（弹簧手感 snappy）。全项目只有两处用到形变：
          加购按钮、以及商品列表的价格排序图标。
        </text>

        <text class="sub-label">加购按钮：plus → check</text>
        <view class="morphrow">
          <AppButton
            type="secondary"
            size="sm"
            :text="added ? '已加入' : '加入购物车'"
            :icon="added ? 'check' : 'plus'"
            @tap="toggleAdded"
          />
          <text class="morphrow__hint">{{ added ? '再点一次变回去' : '点一下看形变' }}</text>
        </view>

        <text class="sub-label">价格排序：升序 ↔ 降序</text>
        <view class="morphrow">
          <view class="sortdemo" @tap="toggleSort">
            <text class="sortdemo__text">价格</text>
            <AppIcon
              :name="sortAsc ? 'sort-asc' : 'sort-desc'"
              morphable
              :size="15"
              color="#C7450A"
              :stroke-width="2.2"
            />
          </view>
          <text class="morphrow__hint">{{ sortAsc ? '当前升序，点一下降落序' : '当前降序，点一下回升序' }}</text>
        </view>

        <text class="sub-label">弹簧手感对比（同一对图形）</text>
        <view class="morphrow morphrow--gap">
          <view v-for="s in springs" :key="s.name" class="springbox" @tap="flipSpring(s.name)">
            <AppIcon
              :name="s.dir ? 'sort-asc' : 'sort-desc'"
              morphable
              :spring="s.name"
              :size="24"
              color="#4E5665"
            />
            <text class="springbox__name">{{ s.name }}</text>
          </view>
        </view>
      </view>

      <!-- ============================================ 11. 已知缺口 -->
      <view class="section-title">11. 已知缺口（需要你决策）</view>
      <view class="surface card">
        <view v-for="(g, i) in gaps" :key="i" class="gap">
          <text class="gap__idx">{{ i + 1 }}</text>
          <text class="gap__text">{{ g }}</text>
        </view>
      </view>

      <view class="footnote">
        <text class="footnote__text">
          S7-0 设计系统 + S7-1 顾客端浏览：首页 / 分类 / 商品列表 / 商品详情
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 设计系统预览页（S7-0 验收页）
 *
 * 存在的意义：设计 token 这种东西，写在文档里谁都看不出对不对，
 * 必须**渲染出来**才能判断。这个页面后面会保留成长期的可视化回归页。
 */
import { ref } from 'vue';
import NavBar from '../../components/NavBar.vue';
import AppButton from '../../components/AppButton.vue';
import AppIcon from '../../components/AppIcon.vue';
import OrderStatusTag from '../../components/OrderStatusTag.vue';
import PriceText from '../../components/PriceText.vue';
import EmptyState from '../../components/EmptyState.vue';
import AppTabBar from '../../components/AppTabBar.vue';
import { OrderStatus } from '../../utils/constants';
import { ICON_NAMES } from '../../utils/icons';
import { TAB_CUSTOMER, TAB_ADMIN } from '../../utils/tabs';

const tabsCustomer = TAB_CUSTOMER;
const tabsAdmin = TAB_ADMIN;

const iconNames = ICON_NAMES;

// ---- 形变演示用的两个开关 ----
const added = ref(false);
const sortAsc = ref(true);
/** 三种弹簧手感各一个，可以直观比较 */
const springs = ref([
  { name: 'smooth', dir: true },
  { name: 'snappy', dir: true },
  { name: 'bouncy', dir: true },
]);

function toggleAdded() {
  added.value = !added.value;
}

function toggleSort() {
  sortAsc.value = !sortAsc.value;
}

function flipSpring(name) {
  const s = springs.value.find((it) => it.name === name);
  if (s) s.dir = !s.dir;
}

const allStatuses = [
  OrderStatus.PENDING,
  OrderStatus.DELIVERING,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

/** 色板镜像（uni.scss 是权威来源；这里只为把色值和实测对比度一起展示出来） */
const palette = [
  {
    name: '品牌与操作',
    items: [
      { name: '品牌鲜艳橙', token: 'brand-vivid', hex: '#FF6A2B', ratio: '2.86 ✗ 仅装饰' },
      { name: '主操作', token: 'action', hex: '#C7450A', ratio: '4.90 ✓' },
      { name: '按下态', token: 'action-pressed', hex: '#A93C08', ratio: '6.29 ✓' },
      { name: '柔和底', token: 'action-soft', hex: '#FFF1EA', ratio: '4.69 ✓' },
    ],
  },
  {
    name: '背景与面',
    items: [
      { name: '页面底', token: 'bg-app', hex: '#F5F6F8', ratio: '—' },
      { name: '卡片面', token: 'surface', hex: '#FFFFFF', ratio: '—' },
      { name: '次级面', token: 'surface-2', hex: '#F7F8FA', ratio: '—' },
    ],
  },
  {
    name: '文字（压在 #F5F6F8 上）',
    items: [
      { name: '主文字', token: 'text-primary', hex: '#1A1D23', ratio: '15.61 ✓' },
      { name: '次文字', token: 'text-secondary', hex: '#4E5665', ratio: '6.83 ✓' },
      { name: '弱文字', token: 'text-muted', hex: '#68707E', ratio: '4.62 ✓' },
    ],
  },
  {
    name: '状态（压在各自浅底上）',
    items: [
      { name: '成功', token: 'success', hex: '#0E8A43', ratio: '4.01 ✓ 图形' },
      { name: '警告', token: 'warning', hex: '#B86E00', ratio: '3.63 ✓ 图形' },
      { name: '危险', token: 'danger', hex: '#D93A3F', ratio: '3.97 ✓ 图形' },
    ],
  },
];

const types = [
  { name: 'xxl', px: 28, weight: 600, usage: '金额 / 关键数字' },
  { name: 'xl', px: 22, weight: 600, usage: '页面大标题' },
  { name: 'lg', px: 18, weight: 600, usage: '区块标题' },
  { name: 'md', px: 16, weight: 600, usage: '列表主标题' },
  { name: 'sm', px: 14, weight: 400, usage: '正文默认' },
  { name: 'xs', px: 12, weight: 400, usage: '次要元信息' },
];

const spaces = [
  { name: 'space-1', px: 4 },
  { name: 'space-2', px: 8 },
  { name: 'space-3', px: 12 },
  { name: 'space-4', px: 16 },
  { name: 'space-5', px: 20 },
  { name: 'space-6', px: 24 },
  { name: 'space-8', px: 32 },
];

const radii = [
  { name: 'sm 控件', px: 8 },
  { name: 'md 卡片', px: 12 },
  { name: 'lg 弹层', px: 16 },
  { name: 'xl 底部弹层', px: 20 },
];

const gaps = [
  '商品列表的 categoryId 是**精确匹配、不含子分类**（后端 applyFilters 里是 p.categoryId = :id）。现在种子数据把商品都挂在一级分类上，所以看不出问题；一旦店主开始用二级分类，点一级分类就会看到空列表。分类页已经用「子分类 chips」绕过去了，但要彻底解决得给 /products 加一个 withChildren 参数 —— 属于后端改动，等你发话。',
  '商品封面图 seed 数据里全是空字符串。当前用「商品名首字 + 稳定配色」的字标占位（ProductImage 组件），看着是设计过的，不是坏图。等有真图了直接把 coverImage 填上即可，不用改前端。',
  '深浅色主题只做了浅色。语义 token 命名已经留好口子（改值不改名），但按你的意思先不排期。',
  '自绘 nav + 自绘 tab 意味着每个页面都要自己留状态栏和安全区。已在 NavBar/AppTabBar 内部处理，业务页不要重复加。',
  '「立即购买」和购物车 tab 目前是占位：加购是真的（真写后端），但购物车列表 / 结算下单在 S7-2。',
];

function ratioClass(ratio) {
  if (ratio.includes('✗')) return 'prow__ratio--fail';
  if (ratio.includes('✓')) return 'prow__ratio--pass';
  return '';
}

function onFakeAction() {
  uni.showToast({ title: '空状态按钮点了', icon: 'none' });
}
</script>

<style lang="scss" scoped>
.intro {
  display: block;
  padding: $space-4 0 $space-2;
  font-size: $font-size-xs;
  line-height: $line-height-loose;
  color: $color-text-muted;
}

.card {
  padding: $space-4;
}

.card--flush {
  padding: 0;
}

.card__note {
  display: block;
  margin-bottom: $space-3;
  font-size: $font-size-xs;
  line-height: $line-height-loose;
  color: $color-text-muted;
}

.sub-label {
  display: block;
  margin: $space-4 0 $space-2;
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

/* ------------------------------------------------------- 色板 */
.pgroup {
  margin-top: $space-3;
}

.pgroup__title {
  display: block;
  margin-bottom: $space-2;
  font-size: $font-size-xs;
  font-weight: $font-weight-semibold;
  color: $color-text-secondary;
}

.prow {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: 6px 0;
}

.prow__chip {
  flex: none;
  width: 56rpx;
  height: 56rpx;
  border-radius: $radius-sm;
  border: 1px solid $color-border-subtle;
}

/* min-width: 0 是必须的：否则 flex 子项不会收缩，长 token 名会把整页撑宽 */
.prow__meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.prow__name {
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.prow__token {
  font-family: Menlo, Consolas, monospace;
  font-size: 20rpx;
  color: $color-text-muted;
  /* 长 token 名换行而不是撑破容器 */
  word-break: break-all;
}

.prow__right {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 40%;
}

.prow__hex {
  font-family: Menlo, Consolas, monospace;
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.prow__ratio {
  font-size: 20rpx;
  color: $color-text-muted;
}

.prow__ratio--pass {
  color: $color-success;
}

.prow__ratio--fail {
  color: $color-danger;
}

/* ------------------------------------------------------- 主色对比 */
.compare {
  display: flex;
  gap: $space-3;
}

.compare__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.compare__btn {
  width: 100%;
  height: $touch-primary;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-sm;
}

.compare__label {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: #ffffff;
}

.compare__ratio {
  margin-top: $space-2;
  font-size: $font-size-xs;
  font-weight: $font-weight-medium;
}

.compare__ratio--pass {
  color: $color-success;
}

.compare__ratio--fail {
  color: $color-danger;
}

.compare__desc {
  margin-top: 2px;
  font-size: 20rpx;
  color: $color-text-muted;
  text-align: center;
}

/* ------------------------------------------------------- 字号 */
.trow {
  padding: $space-2 0;
  border-bottom: 1px solid $color-border-subtle;
}

.trow:last-child {
  border-bottom: none;
}

.trow__sample {
  display: block;
  color: $color-text-primary;
}

.trow__meta {
  display: block;
  margin-top: 2px;
  font-size: 20rpx;
  color: $color-text-muted;
}

/* ------------------------------------------------------- 间距 */
.srow {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: 5px 0;
}

.srow__name {
  flex: none;
  width: 200rpx;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.srow__bar {
  height: 20rpx;
  border-radius: $radius-xs;
  background-color: $color-action;
}

.radii {
  display: flex;
  gap: $space-4;
  padding-top: $space-3;
  flex-wrap: wrap;
}

.radii__item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.radii__box {
  width: 88rpx;
  height: 88rpx;
  background-color: $color-action-soft;
  border: 1px solid $color-action-soft-border;
}

.radii__label {
  margin-top: $space-2;
  font-size: 20rpx;
  color: $color-text-muted;
}

/* ------------------------------------------------------- 按钮 */
.btnrow {
  display: flex;
  align-items: center;
  gap: $space-3;
  flex-wrap: wrap;
  margin-top: $space-3;
}

.btnrow--block {
  display: block;
}

/* ------------------------------------------------------- 标签 */
.tagrow {
  display: flex;
  align-items: center;
  gap: $space-3;
  flex-wrap: wrap;
}

/* ------------------------------------------------------- 金额 */
.pricerow {
  display: flex;
  align-items: baseline;
  gap: $space-3;
  padding: $space-2 0;
}

.pricerow__hint {
  font-size: 20rpx;
  color: $color-text-muted;
}

/* ------------------------------------------------------- 图标系统 */
.ic-em {
  color: $color-action;
  font-weight: $font-weight-medium;
}

.ic-strong {
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.ic-mono {
  font-family: Menlo, Consolas, monospace;
  font-size: 20rpx;
  color: $color-text-secondary;
}

/* 图标墙：一行 6 个，每个格子下面标语义名。
   名字可能比较长（sort-desc / search-empty），所以允许折行，格子固定宽度。 */
.iconwall {
  display: flex;
  flex-wrap: wrap;
  margin-top: $space-2;
}

.iconwall__cell {
  width: 16.6%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $space-2 0;
}

.iconwall__box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: $radius-sm;
  background-color: $color-surface-2;
}

.iconwall__name {
  margin-top: 4px;
  width: 100%;
  font-size: 18rpx;
  line-height: 1.2;
  color: $color-text-muted;
  text-align: center;
  word-break: break-all;
}

.rows {
  margin-top: $space-2;
}

.irow {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-2 0;
  border-bottom: 1px solid $color-border-subtle;
}

.irow:last-child {
  border-bottom: none;
}

.irow__k {
  flex: none;
  width: 200rpx;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.irow__v {
  flex: 1;
  display: flex;
  align-items: center;
  gap: $space-4;
  color: $color-text-primary;
}

/* 验证 currentColor：只在外层给 color，图标自己不传 color prop */
.irow__v--green {
  color: $color-success;
}

.morphrow {
  display: flex;
  align-items: center;
  gap: $space-4;
  margin-top: $space-2;
}

.morphrow--gap {
  gap: $space-6;
}

.morphrow__hint {
  font-size: 20rpx;
  color: $color-text-muted;
}

.sortdemo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 $space-3;
  border-radius: $radius-sm;
  background-color: $color-surface-2;
  color: $color-action;
}

.sortdemo__text {
  font-size: $font-size-sm;
  color: $color-action;
  font-weight: $font-weight-semibold;
}

.springbox {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: $space-2 $space-3;
  border-radius: $radius-sm;
  background-color: $color-surface-2;
}

.springbox__name {
  font-size: 20rpx;
  color: $color-text-muted;
}

/* ------------------------------------------------------- 缺口 */
.gap {
  display: flex;
  gap: $space-3;
  padding: $space-2 0;
}

.gap__idx {
  flex: none;
  width: 36rpx;
  height: 36rpx;
  border-radius: $radius-pill;
  background-color: $color-warning-soft;
  color: $color-warning;
  font-size: 20rpx;
  text-align: center;
  line-height: 36rpx;
}

.gap__text {
  flex: 1;
  font-size: $font-size-xs;
  line-height: $line-height-loose;
  color: $color-text-secondary;
}

.footnote {
  padding: $space-6 0 $space-8;
  text-align: center;
}

.footnote__text {
  font-size: $font-size-xs;
  color: $color-text-muted;
}
</style>
