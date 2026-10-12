<template>
  <view class="page-root pedit">
    <NavBar :title="isEdit ? '编辑商品' : '新增商品'" :back="true" border />

    <view class="page-body pedit__body">
      <!-- 首屏骨架：编辑时要等 detail 回来才知道原价 / 描述，别先渲染空表单 -->
      <view v-if="detailLoading" class="sklist">
        <view class="surface skcard">
          <view class="sk sk--line" style="width: 40%" />
          <view class="sk sk--line" style="width: 70%" />
          <view class="sk sk--line" style="width: 55%" />
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
        v-else-if="loadError"
        variant="error"
        :desc="loadError"
        action-text="重新加载"
        @action="loadDetail"
      />

      <template v-else>
        <!-- ============================================ 封面图 -->
        <!--
          放在最上面是刻意的：店长配一个商品的顺序就是「先看图、再填名」，
          而且封面是这一页**唯一**需要跳出去到相册的操作，放底部容易被漏掉。

          上传的是**客户端压缩后的 base64**（最长边 800px / 质量 0.8），
          由 ImageUpload 组件全权处理，这一页只拿 data URL 塞进 form.coverImage。
        -->
        <view class="surface card">
          <view class="field field--col">
            <text class="field__label field__label--top">商品封面</text>
            <ImageUpload
              v-model="form.coverImage"
              shape="sq"
              size="200rpx"
              label="添加封面"
              icon="image-plus"
            />
            <text class="field__hint">
              选一张图即可，会压到 800px 内再保存。不配图的话，顾客端会用商品名首字做占位。
            </text>
          </view>
        </view>


        <!-- ============================================ 基本信息 -->
        <view class="surface card">
          <view class="field">
            <text class="field__label">商品名</text>
            <input
              class="field__input"
              type="text"
              :value="form.name"
              :maxlength="MAX_NAME"
              placeholder="例：可口可乐 330ml"
              placeholder-class="field__ph"
              @input="form.name = $event.detail.value"
            />
          </view>

          <view class="field">
            <text class="field__label">副标题</text>
            <input
              class="field__input"
              type="text"
              :value="form.subtitle"
              :maxlength="MAX_SUBTITLE"
              placeholder="选填，例：仅用于冒烟测试"
              placeholder-class="field__ph"
              @input="form.subtitle = $event.detail.value"
            />
          </view>

          <view class="field">
            <text class="field__label">所属分类</text>
            <!--
              分类用「弹出选择」而不是下拉：分类是树形的（可能有两级），
              select 在小程序里表现又各不相同。统一走 ConfirmSheet + 单选列表。
            -->
            <view class="field__picker" @tap="openCategorySheet">
              <text class="field__value" :class="{ 'field__value--ph': !form.categoryId }">
                {{ categoryNameOf(form.categoryId) || '请选择分类' }}
              </text>
              <AppIcon name="forward" :size="14" color="#9AA2AF" />
            </view>
          </view>

          <view class="field field--last">
            <text class="field__label">单位</text>
            <input
              class="field__input"
              type="text"
              :value="form.unit"
              :maxlength="16"
              placeholder="瓶 / 包 / 个"
              placeholder-class="field__ph"
              @input="form.unit = $event.detail.value"
            />
          </view>
        </view>

        <!-- ============================================ 价格与库存 -->
        <view class="surface card">
          <!--
            金额铁律：**输入用「元」，接口用「分」**。
            让店长输入 "4.50" 而不是 "450"，是这一页最重要的一处转换。
            反向（分→元）用 fenToYuanText（固定两位，和 placeholder「0.00」一致）；
            正向（元→分）用 parseYuanToFen（它同时做格式校验）。
          -->
          <view class="field">
            <text class="field__label">售价</text>
            <view class="field__money">
              <text class="field__unit">¥</text>
              <input
                class="field__moneyinput"
                type="digit"
                :value="form.priceYuan"
                placeholder="0.00"
                placeholder-class="field__ph"
                @input="form.priceYuan = $event.detail.value"
              />
            </view>
          </view>

          <view class="field">
            <text class="field__label">划线原价</text>
            <view class="field__money">
              <text class="field__unit">¥</text>
              <input
                class="field__moneyinput"
                type="digit"
                :value="form.originYuan"
                placeholder="选填"
                placeholder-class="field__ph"
                @input="form.originYuan = $event.detail.value"
              />
            </view>
            <AppButton
              v-if="form.originYuan"
              type="secondary"
              size="sm"
              text="清除"
              @tap="form.originYuan = ''"
            />
          </view>

          <view class="field field--last">
            <text class="field__label">库存</text>
            <input
              class="field__input"
              type="number"
              :value="form.stock"
              placeholder="0"
              placeholder-class="field__ph"
              @input="form.stock = $event.detail.value"
            />
          </view>
        </view>

        <!-- ============================================ 描述 -->
        <view class="surface card">
          <view class="field field--col">
            <text class="field__label field__label--top">描述</text>
            <textarea
              class="field__textarea"
              :value="form.description"
              placeholder="选填，顾客端商品详情页会显示"
              placeholder-class="field__ph"
              :maxlength="500"
              auto-height
              @input="form.description = $event.detail.value"
            />
          </view>
        </view>

        <!-- ============================================ 上架状态 -->
        <view class="surface card togglecard" @tap="toggleStatus">
          <view class="togglecard__main">
            <text class="togglecard__title">立即上架</text>
            <text class="togglecard__desc">
              {{ form.status === 1 ? '顾客端现在就能看到并购买' : '保存后顾客端看不到（草稿）' }}
            </text>
          </view>
          <AppCheckbox :checked="form.status === 1" @change="(v) => (form.status = v ? 1 : 0)" />
        </view>

        <!-- ============================================ 校验提示 -->
        <!-- 只在点过保存之后才显示，见底部保存栏上方的注释 -->
        <view v-if="showErrors && errors.length" class="hint hint--err">
          <AppIcon name="alert" :size="13" color="#D93A3F" />
          <view class="hint__col">
            <text v-for="(e, i) in errors" :key="i" class="hint__text">{{ e }}</text>
          </view>
        </view>
      </template>

      <view class="pedit__pad" />
    </view>

    <!-- ================================================ 底部保存 -->
    <!--
      ⚠️ 这里**故意不用** `:disabled="!canSubmit"`。
      空表单的 `errors` 一上来就有 4 条，如果跟着 disabled 走，店长看到的是
      「按钮灰的 + 满屏红字」，却不知道自己先填哪个 —— 校验提示反而变成了干扰。
      改法：按钮永远可点，点下去才 `showErrors = true` 把错误显示出来。
      （顾客端 address/edit.vue 的 phoneError 已经是这个思路）

      ⚠️ `v-if="isAdmin"` 不能省：这层在 page-body **外面**，
      不受页面里守卫分支的 v-else 约束。少了它，顾客手输 URL 进来
      会看到一个能点的「添加商品」按钮，点下去才报 403。
    -->
    <view v-if="isAdmin" class="abar" :style="barStyle">
      <AppButton
        type="primary"
        size="md"
        block
        :text="isEdit ? '保存修改' : '添加商品'"
        :loading="submitting"
        @tap="submit"
      />
    </view>

    <!-- ================================================ 分类选择 -->
    <ConfirmSheet
      v-model="catSheet.show"
      title="选择分类"
      confirm-text="确定"
      :danger="false"
      @confirm="catSheet.show = false"
      @cancel="catSheet.show = false"
    >
      <view class="copt">
        <view
          v-for="c in categoryOptions"
          :key="c.id"
          class="copt__item"
          :class="{ 'copt__item--on': form.categoryId === c.id }"
          @tap="pickCategory(c.id)"
        >
          <text class="copt__name">{{ c.name }}</text>
          <text class="copt__count">{{ c.productCount }} 个商品</text>
          <AppIcon v-if="form.categoryId === c.id" name="check" :size="15" color="#c7450a" />
        </view>
        <text v-if="categoryOptions.length === 0" class="copt__empty">
          还没有任何分类，请先到「分类管理」里建一个
        </text>
      </view>
    </ConfirmSheet>

    <!--
      小程序端压缩图片用的离屏画布（H5 端该组件内部是空实现，不渲染任何可见内容）。
      必须挂在这一页，否则 `createCanvasContext` 找不到 canvas 节点 ——
      表现是「选完图没反应 / 存了一张全白的图」，而且**不报错**。
      id 用默认的 `compress-canvas`，与 ImageUpload 的默认 canvasId 对应。
    -->
    <CompressCanvas />
  </view>
</template>

<script setup>
/**
 * 商品新增 / 编辑（同一个页面，靠有没有 id 区分）
 *
 * 后端契约（实测确认）：
 *   GET  /admin/products/:id → ProductDetailVo
 *        { id, categoryId, name, subtitle, coverImage, price(分), originalPrice(分|null),
 *          unit, stock, salesCount, status(1上架 0下架), description, images }
 *   POST /admin/products      → 必填 categoryId / name / price / stock
 *   PUT  /admin/products/:id  → 字段全可选
 *
 * ⚠️ 金额单位：接口一律「分」，输入框一律「元」。
 *    这是全项目最容易出错的一处转换，`submit()` 里有注释标出三条铁律。
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
import ImageUpload from '../../../components/ImageUpload.vue';
import CompressCanvas from '../../../components/CompressCanvas.vue';
import { adminApi } from '../../../api/admin';
import { useAdminGuard, goSwitchRole } from '../../../composables/useAdminGuard';
import { fenToYuanText, parseYuanToFen, toErrorMessage } from '../../../utils/money';

const MAX_NAME = 64;
const MAX_SUBTITLE = 128;

const isAdmin = useAdminGuard();

const productId = ref(0);
const isEdit = computed(() => productId.value > 0);
const submitting = ref(false);
const detailLoading = ref(false);
const loadError = ref('');
/**
 * 校验错误**从什么时候开始显示**
 *
 * 空表单的 errors 一上来就有 4 条（名字/分类/售价/库存都空着）。
 * 一进页面就铺红字 + 保存按钮置灰，是把「校验」变成了「劝退」。
 * 所以默认 false，点第一次保存时才置 true —— 这时候店长已经知道自己漏了，
 * 提示是回答问题而不是发难。
 */
const showErrors = ref(false);

const categoryOptions = ref([]);
const catSheet = ref({ show: false });

/**
 * 表单里存的是「元」的**字符串**，不是数字。
 * 用字符串是因为输入框中间态可以是 "4." / ""，转成数字会丢这些状态。
 */
const form = reactive({
  name: '',
  subtitle: '',
  categoryId: 0,
  /**
   * 封面图：**base64 data URL 或空串**。
   *
   * 与别的字段不同，它不参与 `errors` 校验 —— 「没图」是合法状态
   * （种子数据全是空串，顾客端有字标占位）。上传的合法性由
   * ImageUpload（客户端压缩）与后端 DTO（格式/体量白名单）共同保证。
   */
  coverImage: '',
  /** 元，字符串 */
  priceYuan: '',
  /** 元，字符串，空 = 不设划线价 */
  originYuan: '',
  stock: '0',
  unit: '件',
  description: '',
  status: 1,
});

// ===========================================================================
// 校验
// ===========================================================================

const errors = computed(() => {
  const list = [];
  // 后端有 @Trim()，但**纯空格过不了 @IsNotEmpty** 之前会先被 trim，
  // 这里前端先 trim 一遍，避免「看起来填了名字却报空」
  const name = form.name.trim();
  if (!name) list.push('商品名不能为空');
  else if (name.length > MAX_NAME) list.push(`商品名最长 ${MAX_NAME} 个字符`);

  if (!form.categoryId) list.push('请选择所属分类');

  const priceFen = parseYuanToFen(form.priceYuan);
  if (priceFen === null) list.push('售价要填数字，最多两位小数（比如 4.50）');
  else if (priceFen < 0) list.push('售价不能为负');

  if (form.originYuan !== '') {
    const originFen = parseYuanToFen(form.originYuan);
    if (originFen === null) list.push('划线原价要填数字，最多两位小数');
    else if (priceFen !== null && originFen <= priceFen) {
      // 不是硬校验（后端没管），但划线价低于售价是明显的配置错误，提前拦下来更省事
      list.push('划线原价要高于售价');
    }
  }

  const stock = Number(form.stock);
  if (form.stock === '' || !Number.isInteger(stock) || stock < 0) {
    list.push('库存要填 0 或正整数');
  }

  return list;
});

const canSubmit = computed(() => errors.value.length === 0 && !submitting.value);

// ===========================================================================
// 数据
// ===========================================================================

async function loadOptions() {
  try {
    const res = await adminApi.categoryOptions();
    categoryOptions.value = Array.isArray(res) ? res : [];
  } catch {
    categoryOptions.value = [];
  }
}

async function loadDetail() {
  if (!isAdmin.value) return;
  if (!isEdit.value) return;
  detailLoading.value = true;
  loadError.value = '';
  try {
    const d = await adminApi.productDetail(productId.value);
    // 分 → 元（表单里是字符串）
    form.name = d.name ?? '';
    form.subtitle = d.subtitle ?? '';
    form.categoryId = d.categoryId ?? 0;
    // 空封面统一成空串（后端可能给 null）—— ImageUpload 靠 falsy 判空态
    form.coverImage = d.coverImage ?? '';
    form.priceYuan = fenToYuanText(d.price);
    form.originYuan = d.originalPrice === null || d.originalPrice === undefined
      ? ''
      : fenToYuanText(d.originalPrice);
    form.stock = String(d.stock ?? 0);
    form.unit = d.unit ?? '件';
    form.description = d.description ?? '';
    form.status = d.status ?? 1;
  } catch (err) {
    loadError.value = toErrorMessage(err, '商品信息没拿到');
  } finally {
    detailLoading.value = false;
  }
}

function categoryNameOf(id) {
  const hit = categoryOptions.value.find((c) => c.id === id);
  return hit ? hit.name : '';
}

// ===========================================================================
// 交互
// ===========================================================================

function openCategorySheet() {
  if (!categoryOptions.value.length) loadOptions();
  catSheet.value = { ...catSheet.value, show: true };
}

function pickCategory(id) {
  form.categoryId = id;
  catSheet.value = { ...catSheet.value, show: false };
}

function toggleStatus() {
  form.status = form.status === 1 ? 0 : 1;
}

/**
 * 提交
 *
 * 金额三条铁律：
 *   1. 输入框的「元」→ 接口的「分」：用 parseYuanToFen（顺带做格式校验）
 *   2. 划线价留空时传 `null`，**不要传 0**（0 会变成「划线价 0 元」）
 *   3. `stock` 传 Number，接口是整数校验，传字符串会被 @IsInt 拒
 */
async function submit() {
  showErrors.value = true;
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      categoryId: form.categoryId,
      price: parseYuanToFen(form.priceYuan),
      stock: Number(form.stock),
      status: form.status,
    };
    // 选填字段：留空就不传，传空串会被后端 @MaxLength 之外的空值校验挑出来
    if (form.subtitle.trim()) payload.subtitle = form.subtitle.trim();
    if (form.unit.trim()) payload.unit = form.unit.trim();
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.originYuan !== '') payload.originalPrice = parseYuanToFen(form.originYuan);

    /**
     * 封面图：**永远传**，即使为空串。
     *
     * 原因：PUT 的语义是「`undefined` = 不改这个字段，`''` = 改成空」。
     * 店长在编辑页点了「移除图片」后 form.coverImage 变成 ''，
     * 如果这里用 `if (form.coverImage)` 判空跳过，那这个「移除」就永远提交不上去，
     * 后端保持原图 —— 表现是「点了移除、保存了、图还在」。这是最经典的
     * 「PUT 局部更新 + falsy 判断」组合拳 bug。
     */
    payload.coverImage = form.coverImage || '';

    if (isEdit.value) {
      await adminApi.updateProduct(productId.value, payload);
    } else {
      await adminApi.createProduct(payload);
    }
    uni.showToast({ title: isEdit.value ? '已保存' : '已添加', icon: 'none' });
    // 延迟返回，等 toast 播完
    setTimeout(() => uni.navigateBack(), 600);
  } catch (err) {
    // 后端的校验提示（分类被停用、商品名重复等）原样展示，别转成自己的话术
    uni.showToast({ title: toErrorMessage(err, '保存失败'), icon: 'none', duration: 2500 });
  } finally {
    submitting.value = false;
  }
}

// ===========================================================================
// 生命周期
// ===========================================================================

onLoad(async (opts) => {
  productId.value = Number(opts?.id) || 0;
  if (!isAdmin.value) return;
  // 两件事互不依赖，并发；detail 只在编辑时才要拉
  await Promise.all([loadOptions(), loadDetail()]);
});

watch(isAdmin, (now, was) => {
  if (now && !was) {
    loadOptions();
    loadDetail();
  }
});
/**
 * 键盘弹起时把底部「保存」栏顶上去。
 *
 * 商品编辑有 6 个输入项（名称/描述/价格/库存/单位等），店长填到最后一个时
 * 底部「保存修改」正好被键盘盖住 —— 改完价点不到保存，只能退回列表再进来。
 */
const { barStyle, unbindKeyboard } = useKeyboardOffset();

onUnload(() => {
  unbindKeyboard();
});
</script>

<style lang="scss" scoped>
.pedit {
  background-color: $color-bg-app;
}

.pedit__body {
  padding: $space-3 $space-4 0;
}

.pedit__pad {
  /**
   * 给底部固定按钮栏腾位置。
   * 数值要对齐下面 `.abar` 的真实高度：按钮 md=48px + 上下 padding 各 $space-3(12px)
   * + 安全区。写成 96px 是因为 48+12+12=72，留 24px 余量容纳安全区（≈34px）——
   * 与 address/edit 等页的 `calc(80px + env(...))` 是同一个思路，只是这里用固定值。
   */
  height: calc(96px + env(safe-area-inset-bottom));
}

/**
 * 底部保存栏
 *
 * ⚠️ 这一段以前**整个缺失**：模板里写了 `class="abar"`（跟 address/edit 等页同名），
 * 但本页scoped 样式里没有 `.abar` 的定义，App.vue / uni.scss 也没有全局定义，
 * 而 uni-app 组件样式默认不隔离到可以借用别处的同名类 —— 结果保存按钮
 * 就是个**普通流里的块**，滚到底才看得见，跟其余 11 个固定栏页面的约定完全不一致。
 * 店长改个价要滚一屏才能点保存。
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

.sklist {
  display: flex;
  flex-direction: column;
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

/* 纵向排列的字段（描述） */
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

/* 表单行的补充说明（封面图那一条） */
.field__hint {
  font-size: $font-size-xs;
  line-height: 1.6;
  color: $color-text-muted;
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

.field__value {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.field__value--ph {
  color: $color-text-muted;
}

.field__picker {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-2;
  /* 和输入框同高，整行点击热区才够 */
  height: 52px;
}

.field__textarea {
  width: 100%;
  min-height: 72px;
  font-size: $font-size-sm;
  color: $color-text-primary;
  line-height: 1.5;
}

/* ================================================================ 金额输入 */
/* 左边 ¥ 固定、右边输入框可伸缩 —— 让小数点位置对齐，全页金额视觉一致 */
.field__money {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.field__unit {
  flex: none;
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.field__moneyinput {
  flex: 1;
  min-width: 0;
  height: 52px;
  font-size: $font-size-sm;
  color: $color-text-primary;
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

/* ============================================================ 分类选择面板 */
.copt {
  margin-bottom: $space-2;
  max-height: 46vh;
}

.copt__item {
  display: flex;
  align-items: center;
  gap: $space-2;
  height: 46px;
  padding: 0 $space-2;
  border-bottom: 1px solid $color-border-subtle;
}

.copt__item--on {
  background-color: rgba(199, 69, 10, 0.06);
}

.copt__name {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.copt__count {
  flex: none;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.copt__empty {
  display: block;
  padding: $space-4 0;
  text-align: center;
  font-size: $font-size-sm;
  color: $color-text-muted;
}
</style>