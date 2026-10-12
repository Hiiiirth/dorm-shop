<template>
  <view class="page-root cedit">
    <NavBar :title="isEdit ? '编辑分类' : '新增分类'" :back="true" border />

    <view class="page-body cedit__body">
      <view v-if="detailLoading" class="surface skcard">
        <view class="sk sk--line" style="width: 45%" />
        <view class="sk sk--line" style="width: 65%" />
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
        v-else-if="loadError"
        variant="error"
        :desc="loadError"
        action-text="重新加载"
        @action="loadDetail"
      />

      <template v-else>
        <!-- ============================================ 基本信息 -->
        <view class="surface card">
          <view class="field">
            <text class="field__label">分类名</text>
            <input
              class="field__input"
              type="text"
              :value="form.name"
              :maxlength="32"
              placeholder="例：饮料冲调"
              placeholder-class="field__ph"
              @input="form.name = $event.detail.value"
            />
          </view>

          <view class="field field--last">
            <text class="field__label">排序</text>
            <input
              class="field__input"
              type="number"
              :value="form.sortOrder"
              placeholder="数字小的排前面"
              placeholder-class="field__ph"
              @input="form.sortOrder = $event.detail.value"
            />
          </view>
        </view>

        <!-- ============================================ 上级分类 -->
        <view class="surface card">
          <view class="field field--col">
            <text class="field__label field__label--top">上级分类</text>
            <!--
              只能选**一级分类**当上级（后端只支持两层）。
              而且不能选自己和自己的子孙 —— 后端有 assertNoCycle 会拦（返回业务错误），
              但前端先过滤掉，别让店长提交了才被拒。
            -->
            <view class="prow" @tap="openParentSheet">
              <view class="prow__main">
                <text class="prow__value" :class="{ 'prow__value--ph': !form.parentId }">
                  {{ form.parentId ? parentNameOf(form.parentId) : '顶级分类（没有上级）' }}
                </text>
                <text class="prow__hint">
                  {{
                    form.parentId
                      ? '会成为上面这个分类的二级分类'
                      : '会显示在顾客端分类页的第一层'
                  }}
                </text>
              </view>
              <AppIcon name="forward" :size="14" color="#9AA2AF" />
            </view>
          </view>
        </view>

        <!-- ============================================ 启用状态 -->
        <view class="surface card togglecard" @tap="toggleStatus">
          <view class="togglecard__main">
            <text class="togglecard__title">启用</text>
            <text class="togglecard__desc">
              {{ form.status === 1 ? '顾客端能看到这个分类' : '停用后顾客端看不到（商品数据保留）' }}
            </text>
          </view>
          <AppCheckbox :checked="form.status === 1" @change="(v) => (form.status = v ? 1 : 0)" />
        </view>

        <!-- ============================================ 错误提示 -->
        <view v-if="showErrors && errors.length" class="hint hint--err">
          <AppIcon name="alert" :size="13" color="#D93A3F" />
          <view class="hint__col">
            <text v-for="(e, i) in errors" :key="i" class="hint__text">{{ e }}</text>
          </view>
        </view>

        <!--
          新建时给一句兜底提示：有商品的分类删不掉。
          提前说比事后撞 40006 更好。
        -->
        <view v-else class="hint">
          <AppIcon name="alert" :size="13" color="#68707E" />
          <text class="hint__text">
            分类下还有商品或子分类时删不掉，会明确提示要先处理什么
          </text>
        </view>
      </template>

      <view class="cedit__pad" />
    </view>

    <!-- ================================================ 底部保存 -->
    <!-- 与商品编辑页同一个取舍：不预先 disabled，点下去才显示校验错误（见 showErrors 的注释） -->
    <!-- `v-if="isAdmin"` 不能省：这层在 page-body 外面，不受页面里守卫分支的 v-else 约束 -->
    <view v-if="isAdmin" class="abar" :style="barStyle">
      <AppButton
        type="primary"
        size="md"
        block
        :text="isEdit ? '保存修改' : '添加分类'"
        :loading="submitting"
        @tap="submit"
      />
    </view>

    <!-- ================================================ 上级分类选择 -->
    <ConfirmSheet
      v-model="sheet.show"
      title="选择上级分类"
      confirm-text="确定"
      :danger="false"
      @confirm="sheet.show = false"
      @cancel="sheet.show = false"
    >
      <view class="popt">
        <view
          class="popt__item"
          :class="{ 'popt__item--on': form.parentId === 0 }"
          @tap="pickParent(0)"
        >
          <text class="popt__name">顶级分类（没有上级）</text>
          <AppIcon v-if="form.parentId === 0" name="check" :size="15" color="#c7450a" />
        </view>

        <view
          v-for="c in parentCandidates"
          :key="c.id"
          class="popt__item"
          :class="{ 'popt__item--on': form.parentId === c.id }"
          @tap="pickParent(c.id)"
        >
          <text class="popt__name">{{ c.name }}</text>
          <AppIcon v-if="form.parentId === c.id" name="check" :size="15" color="#c7450a" />
        </view>

        <text v-if="parentCandidates.length === 0" class="popt__empty">
          没有可选的上级分类（只有这一个分类时它只能是顶级）
        </text>
      </view>
    </ConfirmSheet>
  </view>
</template>

<script setup>
/**
 * 分类新增 / 编辑（同一个页面）
 *
 * 后端契约：
 *   GET /admin/categories            → 完整树（含停用）
 *   POST /admin/categories           → parentId 可选（不传或 0 = 顶级）
 *   PUT  /admin/categories/:id       → 字段全可选
 *
 * 后端已做的校验（前端别重复造轮子，但要知道边界）：
 *   · assertParentExists：parentId 必须存在
 *   · assertNoCycle：不能把分类挂到自己的子孙下面（防环）
 * 前端这里直接把「自己和自己的子孙」从候选里滤掉 —— 提交前就拦，
 * 比提交后吃一个业务错误体验好。
 */
import { computed, reactive, ref, watch } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useKeyboardOffset } from '../../../composables/useKeyboardOffset';
import NavBar from '../../../components/NavBar.vue';
import AppIcon from '../../../components/AppIcon.vue';
import AppButton from '../../../components/AppButton.vue';
import AppCheckbox from '../../../components/AppCheckbox.vue';
import EmptyState from '../../../components/EmptyState.vue';
import ConfirmSheet from '../../../components/ConfirmSheet.vue';
import { adminApi } from '../../../api/admin';
import { useAdminGuard, goSwitchRole } from '../../../composables/useAdminGuard';
import { toErrorMessage } from '../../../utils/money';

const isAdmin = useAdminGuard();

const categoryId = ref(0);
const isEdit = computed(() => categoryId.value > 0);
const submitting = ref(false);
const detailLoading = ref(false);
const loadError = ref('');
/** 校验错误从点过保存才开始显示（和商品编辑页一致，见那边的注释） */
const showErrors = ref(false);

/** 整棵树，编辑时要靠它排除「自己和子孙」 */
const tree = ref([]);
const sheet = ref({ show: false });

const form = reactive({
  name: '',
  parentId: 0,
  sortOrder: '0',
  status: 1,
});

// ===========================================================================
// 派生
// ===========================================================================

/** 自己和所有子孙的 id —— 用来防止把分类挂到自己的子孙下面（成环） */
const selfAndDescendantIds = computed(() => {
  if (!isEdit.value) return new Set();
  const banned = new Set([categoryId.value]);
  const walk = (nodes) => {
    (nodes || []).forEach((n) => {
      const kids = Array.isArray(n.children) ? n.children : [];
      if (kids.length) {
        kids.forEach((k) => banned.add(k.id));
        walk(kids);
      }
    });
  };
  walk(tree.value);
  return banned;
});

/** 可选的上级：所有顶级分类，减去自己和自己的子孙 */
const parentCandidates = computed(() => {
  const banned = selfAndDescendantIds.value;
  return (tree.value || [])
    .filter((n) => n.parentId === 0 && !banned.has(n.id))
    .map((n) => ({ id: n.id, name: n.name }));
});

const errors = computed(() => {
  const list = [];
  // 前端先 trim：后端有 @Trim() + @IsNotEmpty()，纯空格会被拒，
  // 但让店长看到「填了名字却说为空」很困惑
  if (!form.name.trim()) list.push('分类名不能为空');
  if (form.name.trim().length > 32) list.push('分类名最长 32 个字符');

  const sort = Number(form.sortOrder);
  if (form.sortOrder !== '' && !Number.isInteger(sort)) list.push('排序要填整数');
  return list;
});

const canSubmit = computed(() => errors.value.length === 0 && !submitting.value);

function parentNameOf(id) {
  const hit = parentCandidates.value.find((c) => c.id === id);
  return hit ? hit.name : '';
}

// ===========================================================================
// 数据
// ===========================================================================

async function loadTree() {
  try {
    const res = await adminApi.categoryTree();
    tree.value = Array.isArray(res) ? res : [];
  } catch {
    tree.value = [];
  }
}

async function loadDetail() {
  if (!isAdmin.value || !isEdit.value) return;
  detailLoading.value = true;
  loadError.value = '';
  try {
    // 编辑时当前分类就是从树里找的，不用单独 GET 详情（后端也没这个接口）
    let found = null;
    const walk = (nodes) => {
      (nodes || []).forEach((n) => {
        if (n.id === categoryId.value) found = n;
        if (Array.isArray(n.children) && n.children.length) walk(n.children);
      });
    };
    walk(tree.value);
    if (!found) {
      loadError.value = '这个分类不存在或已被删除';
      return;
    }
    form.name = found.name ?? '';
    form.parentId = found.parentId ?? 0;
    form.sortOrder = String(found.sortOrder ?? 0);
    form.status = found.status ?? 1;
  } catch (err) {
    loadError.value = toErrorMessage(err, '分类没拿到');
  } finally {
    detailLoading.value = false;
  }
}

// ===========================================================================
// 交互
// ===========================================================================

function openParentSheet() {
  sheet.value = { ...sheet.value, show: true };
}

function pickParent(id) {
  form.parentId = id;
  sheet.value = { ...sheet.value, show: false };
}

function toggleStatus() {
  form.status = form.status === 1 ? 0 : 1;
}

async function submit() {
  showErrors.value = true;
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      parentId: form.parentId,
      sortOrder: Number(form.sortOrder) || 0,
      status: form.status,
    };
    if (isEdit.value) {
      await adminApi.updateCategory(categoryId.value, payload);
    } else {
      await adminApi.createCategory(payload);
    }
    uni.showToast({ title: isEdit.value ? '已保存' : '已添加', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (err) {
    // 后端提示（分类名重复、成环等）原样展示
    uni.showToast({ title: toErrorMessage(err, '保存失败'), icon: 'none', duration: 2500 });
  } finally {
    submitting.value = false;
  }
}

// ===========================================================================
// 生命周期
// ===========================================================================

onLoad(async (opts) => {
  categoryId.value = Number(opts?.id) || 0;
  // 新建时如果带了 parentId（从「在它下面加二级分类」进来的），直接预填
  const pre = Number(opts?.parentId) || 0;
  if (!isEdit.value && pre) form.parentId = pre;

  if (!isAdmin.value) return;
  // 树必须先拿到，loadDetail 要从树里找当前分类
  await loadTree();
  await loadDetail();
});

watch(isAdmin, (now, was) => {
  if (now && !was) {
    loadTree().then(loadDetail);
  }
});
/**
 * 键盘弹起时把底部「保存」栏顶上去。
 * 分类编辑虽然只有名称 + 排序两个输入框，但排序框贴着底部，
 * 键盘弹起照样会盖住「保存分类」。
 */
const { barStyle, unbindKeyboard } = useKeyboardOffset();

onUnload(() => {
  unbindKeyboard();
});
</script>

<style lang="scss" scoped>
.cedit {
  background-color: $color-bg-app;
}

.cedit__body {
  padding: $space-3 $space-4 0;
}

.cedit__pad {
  /** 给底部固定按钮栏腾位置，数值对齐下面 `.abar` 的真实高度（含安全区） */
  height: calc(96px + env(safe-area-inset-bottom));
}

/**
 * 底部保存栏
 *
 * ⚠️ 跟 admin/product/edit.vue 同一个坑：模板写了 `class="abar"`，但本页样式没定义它，
 * 按钮就成了普通流里的块，店长要滚到底才点得到保存。两页必须一起改，否则两个页面行为不一致。
 */
.abar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: $space-3 $space-4 calc(#{$space-3} + env(safe-area-inset-bottom));
  background-color: $color-surface;
  border-top: 1px solid $color-border-subtle;
  z-index: 500;
}

.card {
  padding: 0 $space-4;
  margin-bottom: $space-3;
}

/* 抵消全局 `.surface + .surface { margin-top: 12px }` */
.card + .card {
  margin-top: 0;
}

.skcard {
  padding: $space-4;
}

.sk {
  height: 14px;
  margin-bottom: 10px;
  border-radius: $radius-sm;
  background-color: $color-bg-app;
}

/* ================================================================== 表单行 */
.field {
  display: flex;
  align-items: center;
  gap: $space-3;
  min-height: 52px;
  border-bottom: 1px solid $color-border-subtle;
}

.field--last {
  border-bottom: none;
}

.field--col {
  flex-direction: column;
  align-items: stretch;
  gap: $space-2;
  padding: $space-3 0;
}

.field__label {
  flex: none;
  width: 76px;
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.field__label--top {
  width: auto;
}

.field__input {
  flex: 1;
  min-width: 0;
  height: 52px;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.field__ph {
  color: $color-text-muted;
}

/* ============================================================ 上级分类选择行 */
.prow {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2 0;
  min-height: 52px;
}

.prow__main {
  flex: 1;
  min-width: 0;
}

.prow__value {
  display: block;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.prow__value--ph {
  color: $color-text-muted;
}

.prow__hint {
  display: block;
  margin-top: 2px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* ================================================================ 默认开关 */
.togglecard {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-4;
}

.togglecard__main {
  flex: 1;
  min-width: 0;
}

.togglecard__title {
  display: block;
  font-size: $font-size-sm;
  font-weight: 600;
  color: $color-text-primary;
}

.togglecard__desc {
  display: block;
  margin-top: 2px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* ==================================================================== 提示 */
.hint {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 0 $space-2 0 4px;
}

.hint--err .hint__text {
  color: $color-danger;
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

/* ============================================================ 上级候选列表 */
.popt {
  margin-bottom: $space-2;
  max-height: 46vh;
}

.popt__item {
  display: flex;
  align-items: center;
  gap: $space-2;
  height: 46px;
  padding: 0 $space-2;
  border-bottom: 1px solid $color-border-subtle;
}

.popt__item--on {
  background-color: rgba(199, 69, 10, 0.06);
}

.popt__name {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.popt__empty {
  display: block;
  padding: $space-4 0;
  text-align: center;
  font-size: $font-size-sm;
  color: $color-text-muted;
  line-height: 1.6;
}
</style>