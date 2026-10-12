<template>
  <view class="page-root clist">
    <NavBar title="分类管理" :back="true" border />

    <view class="page-body clist__body">
      <!--
        守卫的判断顺序必须是「守卫 → 骨架」：
        `loadTree` 里 `if (!isAdmin.value) return;` 会**直接返回**，不复位 loading。
        如果骨架写在守卫前面，顾客进来就永远停在骨架屏上，
        既看不到「去切换身份」，也没有任何请求能把他踢走 —— 一个死界面。
      -->
      <EmptyState
        v-if="!isAdmin"
        variant="empty"
        icon="switch-role"
        title="需要切换到店长身份"
        desc="这个页面是店长工作台，切换身份后才能看到"
        action-text="去切换身份"
        @action="goSwitchRole"
      />

      <!-- 首屏骨架 -->
      <view v-else-if="loading" class="sklist">
        <view v-for="i in 5" :key="`sk${i}`" class="surface skrow">
          <view class="sk sk--line" style="width: 45%" />
        </view>
      </view>

      <EmptyState
        v-else-if="loadError"
        variant="error"
        :desc="loadError"
        action-text="重新加载"
        @action="loadTree"
      />

      <EmptyState
        v-else-if="tree.length === 0"
        variant="empty"
        icon="category-tree"
        title="还没有任何分类"
        desc="先建一个一级分类，再往里加二级分类"
        action-text="新建分类"
        @action="createCategory(null)"
      />

      <template v-else>
        <!-- ============================================ 树 -->
        <view
          v-for="node in flatTree"
          :key="node.id"
          class="surface crow"
          :class="{ 'crow--child': node.depth === 1, 'crow--off': node.status !== 1 }"
          :style="node.depth === 1 ? 'margin-left: 28px' : ''"
        >
          <!-- 展开/收起：只有有子节点时才显示这个箭头 -->
          <!--
            展开/收起用「旋转的箭头」而不是 sort-asc/sort-desc：
            那两个是「排序」语义（上下箭头带横杠），用在展开上店长会以为是排序。
            复用 forward（向右箭头），收起时旋转 90 度朝下。
          -->
          <view
            class="crow__toggle"
            :class="{ 'crow__toggle--hidden': !node.hasChildren }"
            @tap="toggleExpand(node.id)"
          >
            <view v-if="node.hasChildren" class="crow__arrow" :class="{ 'crow__arrow--open': expanded[node.id] }">
              <AppIcon name="forward" :size="13" color="#68707e" />
            </view>
          </view>

          <view class="crow__main" @tap="openSheet(node)">
            <text class="crow__name">{{ node.name }}</text>
            <text v-if="node.status !== 1" class="crow__off">已停用</text>
          </view>

          <view class="crow__ops" @tap.stop>
            <!-- 排序：只跟同级比，上移/下移在同层里换 sortOrder -->
            <view
              class="crow__op"
              :class="{ 'crow__op--off': !node.canMoveUp }"
              @tap="moveCategory(node, -1)"
            >
              <AppIcon name="sort-asc" :size="15" color="#68707e" />
            </view>
            <view
              class="crow__op"
              :class="{ 'crow__op--off': !node.canMoveDown }"
              @tap="moveCategory(node, 1)"
            >
              <AppIcon name="sort-desc" :size="15" color="#68707e" />
            </view>
            <view class="crow__op" @tap="toggleStatus(node)">
              <AppIcon
                :name="node.status === 1 ? 'toggle-power' : 'default-on'"
                :size="15"
                :color="node.status === 1 ? '#0e8a43' : '#68707e'"
              />
            </view>
            <view class="crow__op" @tap="openSheet(node)">
              <AppIcon name="more" :size="16" color="#68707e" />
            </view>
          </view>
        </view>

        <!-- ============================================ 层级说明 -->
        <view class="hint">
          <AppIcon name="alert" :size="13" color="#68707E" />
          <view class="hint__col">
            <text class="hint__text">
              箭头上下调整排序（只在同级内比较）；停用的分类顾客端看不到，但商品数据保留
            </text>
            <text class="hint__text">
              有子分类或还有商品的分类删不掉，会明确告诉你要先处理什么
            </text>
          </view>
        </view>
      </template>

      <view class="clist__pad" />
    </view>

    <!-- ================================================ 浮动新建 -->
    <view class="fab" hover-class="fab--hover" @tap="createCategory(null)">
      <AppIcon name="plus" :size="20" color="#ffffff" />
    </view>

    <!-- ================================================ 更多操作 -->
    <ConfirmSheet
      v-model="sheet.show"
      title="这个分类"
      :desc="sheet.node ? sheet.node.name : ''"
      confirm-text="删除"
      danger
      :loading="actingId === sheet.node?.id && actingAction === 'remove'"
      @confirm="doRemove"
      @cancel="closeSheet"
    >
      <view class="spane">
        <view class="spane__row" @tap="doEdit">
          <AppIcon name="edit-field" :size="15" color="#3c4658" />
          <text class="spane__text">编辑信息</text>
        </view>
        <view class="spane__row" @tap="createChild">
          <AppIcon name="address-add" :size="15" color="#3c4658" />
          <text class="spane__text">在它下面加二级分类</text>
        </view>
        <text class="spane__tip">
          停用比删除安全：停用后顾客端看不到，但商品的分类归属还在
        </text>
      </view>
    </ConfirmSheet>
  </view>
</template>

<script setup>
/**
 * 分类管理（二级页，**树形**）
 *
 * 后端契约（实测确认）：
 *   GET /admin/categories → CategoryVo[]
 *     CategoryVo = { id, parentId, name, icon, sortOrder, status, children? }
 *     `children` **只有一级分类才带**，叶子节点不返回该字段（不是空数组，是 undefined）
 *   DELETE /admin/categories/:id → 有子分类 40005 / 有商品 40006
 *
 * ⚠️ 种子数据的 `parent_id` 全是 0，所以**当前库里的树只有一层**。
 *    这不代表可以按「只有一层」写 —— 页面必须同时正确处理：
 *      · 一层（现状）：箭头区要留位但不能显示图标
 *      · 两层（以后建了子分类）：能展开收起、能加二级、能同级排序
 *    所以这里把树**拍平成带 depth 的数组**渲染，而不是递归组件 ——
 *    两层用不着递归，三层再换也不迟。
 *
 * 另一个坑：分页。分类树接口**不分页**（一次给全量），
 * 所以这个页面不用 usePagedList，直接一次加载 + 展开收起。
 */
import { computed, ref, watch } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import NavBar from '../../../components/NavBar.vue';
import AppIcon from '../../../components/AppIcon.vue';
import EmptyState from '../../../components/EmptyState.vue';
import ConfirmSheet from '../../../components/ConfirmSheet.vue';
import { adminApi } from '../../../api/admin';
import { useAdminGuard, goSwitchRole } from '../../../composables/useAdminGuard';
import { toErrorMessage } from '../../../utils/money';

const isAdmin = useAdminGuard();

const loading = ref(true);
const loadError = ref('');
const tree = ref([]);

/** 展开状态：{ [id]: true }。默认全展开 —— 分类数量少，全展开更好找 */
const expanded = ref({});

const actingId = ref(0);
const actingAction = ref('');

/**
 * 把树拍平成 [{...node, depth, hasChildren}]
 *
 * 为什么不用递归组件：分类最多两层（后端只给两层 children），
 * 拍平后排序、渲染、定位全都变成一维数组，代码短一半。
 */
const flatTree = computed(() => {
  const out = [];
  (tree.value || []).forEach((parent) => {
    const kids = Array.isArray(parent.children) ? parent.children : [];
    out.push({
      ...parent,
      depth: 0,
      hasChildren: kids.length > 0,
      canMoveUp: false, // 后面统一算
      canMoveDown: false,
    });
    if (expanded.value[parent.id]) {
      kids.forEach((kid) => {
        out.push({
          ...kid,
          depth: 1,
          hasChildren: false, // 后端只支持两层
          canMoveUp: false,
          canMoveDown: false,
        });
      });
    }
  });

  // 同级内的上移/下移可用性：按数组顺序判断，首个不能上、末个不能下
  const siblingsOf = (depth) => out.filter((n) => n.depth === depth);
  [0, 1].forEach((depth) => {
    const same = siblingsOf(depth);
    same.forEach((n, i) => {
      n.canMoveUp = i > 0;
      n.canMoveDown = i < same.length - 1;
    });
  });

  return out;
});

// ===========================================================================
// 数据
// ===========================================================================

async function loadTree() {
  if (!isAdmin.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await adminApi.categoryTree();
    const list = Array.isArray(res) ? res : [];
    tree.value = list;
    // 默认全展开：把有子节点的 id 都标上
    const next = {};
    list.forEach((p) => {
      if (Array.isArray(p.children) && p.children.length) next[p.id] = true;
    });
    expanded.value = next;
  } catch (err) {
    loadError.value = toErrorMessage(err, '分类没拿到');
  } finally {
    loading.value = false;
  }
}

function toggleExpand(id) {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] };
}

// ===========================================================================
// 操作
// ===========================================================================

/** 启停：停用是「安全」操作，保留在主区；删除才收进 ··· */
async function toggleStatus(node) {
  if (!isAdmin.value || actingId.value) return;
  const next = node.status === 1 ? 0 : 1;
  actingId.value = node.id;
  actingAction.value = 'status';
  try {
    await adminApi.updateCategory(node.id, { status: next });
    await loadTree();
    uni.showToast({ title: next === 1 ? '已启用' : '已停用', icon: 'none' });
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '操作失败'), icon: 'none' });
  } finally {
    actingId.value = 0;
    actingAction.value = '';
  }
}

/**
 * 同级排序：把当前项和同层的上/下一项交换 sortOrder。
 *
 * ⚠️ 后端没有「批量排序」接口，所以这里是两次 PUT 换 sortOrder。
 *    交换用同一个中间值（取两者中点）会冲突吗？不会 —— sortOrder 没有唯一约束，
 *    而且顾客端只按 sortOrder 升序排，两次 PUT 后顺序就对了。
 *    代价是**中间态可能短暂错序**，但页面 reload 后就是对的。
 */
async function moveCategory(node, dir) {
  if (!isAdmin.value || actingId.value) return;
  if (dir < 0 && !node.canMoveUp) return;
  if (dir > 0 && !node.canMoveDown) return;

  const sameDepth = flatTree.value.filter((n) => n.depth === node.depth);
  const idx = sameDepth.findIndex((n) => n.id === node.id);
  const target = sameDepth[idx + dir];
  if (!target) return;

  actingId.value = node.id;
  actingAction.value = 'move';
  try {
    // 用较大的那个 sortOrder 当中间值，避免出现重复
    const max = Math.max(Number(node.sortOrder) || 0, Number(target.sortOrder) || 0) + 1;
    await adminApi.updateCategory(target.id, { sortOrder: max });
    await adminApi.updateCategory(node.id, { sortOrder: Number(target.sortOrder) || 0 });
    await loadTree();
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '排序失败'), icon: 'none' });
  } finally {
    actingId.value = 0;
    actingAction.value = '';
  }
}

// ---------------------------------------------------------------- 更多面板
const sheet = ref({ show: false, node: null });

function openSheet(node) {
  sheet.value = { show: true, node };
}

function closeSheet() {
  sheet.value = { ...sheet.value, show: false };
}

function doEdit() {
  const node = sheet.value.node;
  if (!node) return;
  closeSheet();
  uni.navigateTo({ url: `/pages/admin/category/edit?id=${node.id}&_r=${Date.now()}` });
}

function createChild() {
  const node = sheet.value.node;
  closeSheet();
  uni.navigateTo({ url: `/pages/admin/category/edit?parentId=${node.id}&_r=${Date.now()}` });
}

async function doRemove() {
  const node = sheet.value.node;
  if (!node) return;
  actingId.value = node.id;
  actingAction.value = 'remove';
  try {
    await adminApi.removeCategory(node.id);
    uni.showToast({ title: '已删除', icon: 'none' });
    closeSheet();
    await loadTree();
  } catch (err) {
    // 40005（有子分类）/ 40006（有商品）—— **原样展示**，
    // 店长需要知道到底缺什么才能删成功，转成自己的话术等于让人猜
    uni.showToast({ title: toErrorMessage(err, '删除失败'), icon: 'none', duration: 2500 });
  } finally {
    actingId.value = 0;
    actingAction.value = '';
  }
}

// ---------------------------------------------------------------- 导航
function createCategory(parentId) {
  const q = parentId ? `?parentId=${parentId}&_r=${Date.now()}` : `?_r=${Date.now()}`;
  uni.navigateTo({ url: `/pages/admin/category/edit${q}` });
}

// ===========================================================================
// 生命周期
// ===========================================================================

onLoad(loadTree);

watch(isAdmin, (now, was) => {
  if (now && !was) loadTree();
});

onPullDownRefresh(async () => {
  if (!isAdmin.value) {
    uni.stopPullDownRefresh();
    return;
  }
  await loadTree();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.clist {
  background-color: $color-bg-app;
}

.clist__body {
  padding: $space-3 $space-4 0;
}

.clist__pad {
  height: 76px;
}

.sklist {
  display: flex;
  flex-direction: column;
  gap: $space-2;
}

.skrow {
  padding: $space-4 $space-3;
}

.sk {
  height: 13px;
  border-radius: $radius-sm;
  background-color: $color-bg-app;
}

/* ================================================================ 分类行 */
.crow {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: 0 $space-2 0 0;
  margin-bottom: $space-2;
  /* 给二级分类的缩进让位：父级有 margin-left，子级用行内 margin-left 缩进 */
}

.crow--off {
  opacity: 0.62;
}

/* 展开箭头：固定宽度占位，没子节点时是空的（但仍占位，保证文字对齐） */
.crow__toggle {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 44px;
}

.crow__toggle--hidden {
  /* 空占位，不响应点击 */
  pointer-events: none;
}

/* 箭头旋转：收起时朝右，展开时朝下 */
.crow__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}

.crow__arrow--open {
  transform: rotate(90deg);
}

.crow__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  /* 44px 最小点击热区 */
  height: 44px;
}

.crow__name {
  font-size: $font-size-sm;
  font-weight: 600;
  color: $color-text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 二级分类的字重轻一点，视觉上从属 */
.crow--child .crow__name {
  font-weight: 400;
}

.crow__off {
  flex: none;
  padding: 1px 5px;
  border-radius: $radius-xs;
  font-size: $font-size-xs;
  color: $color-text-muted;
  background-color: $color-bg-app;
}

.crow__ops {
  flex: none;
  display: flex;
  align-items: center;
}

.crow__op {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 44px;
  border-radius: $radius-sm;
}

.crow__op--off {
  opacity: 0.28;
  /* 到头了还点得动，但点了没反应 —— 不如直接不响应，语义更明确 */
  pointer-events: none;
}

/* ==================================================================== 提示 */
.hint {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: $space-2 $space-2 0 4px;
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

/* ================================================================== 浮动按钮 */
.fab {
  position: fixed;
  right: 16px;
  bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: $color-action;
  box-shadow: 0 4px 12px rgba(199, 69, 10, 0.32);
  z-index: 20;
}

.fab--hover {
  opacity: 0.88;
}

/* ============================================================== 更多面板内容 */
.spane {
  margin-bottom: $space-2;
}

.spane__row {
  display: flex;
  align-items: center;
  gap: $space-2;
  height: 42px;
  border-bottom: 1px solid $color-border-subtle;
}

.spane__text {
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.spane__tip {
  display: block;
  margin-top: $space-2;
  font-size: $font-size-xs;
  color: $color-text-muted;
  line-height: 1.5;
}
</style>