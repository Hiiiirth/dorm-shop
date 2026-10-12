<template>
  <view class="page-root confirm">
    <NavBar title="确认订单" :back="true" border />

    <!-- ============================================================== 骨架 -->
    <view v-if="loading" class="page-body">
      <view class="surface block">
        <view class="sk sk--line" style="width: 45%" />
        <view class="sk sk--line" style="width: 70%; margin-top: 12px" />
      </view>
      <view class="surface block">
        <view class="sk sk--line" style="width: 55%" />
        <view class="sk sk--line" style="width: 40%; margin-top: 12px" />
      </view>
    </view>

    <!-- ========================================================== 预览失败 -->
    <EmptyState
      v-else-if="previewError"
      variant="error"
      title="结算信息没拿到"
      :desc="previewError"
      action-text="重新加载"
      @action="loadPreview"
    />

    <!-- =============================================================== 表单 -->
    <view v-else class="page-body confirm__body">
      <!-- ---------------------------------------------------------- 收货信息 -->
      <view class="surface block">
        <view class="block__head">
          <AppIcon name="location" :size="16" color="#C7450A" />
          <text class="block__title">送到哪里</text>

          <!-- 有地址簿时给个「用其它地址」的入口。没有地址簿就不显示，不摆空入口 -->
          <view v-if="addresses.length" class="block__link" @tap="openAddressSheet">
            <text class="block__link-text">选择地址</text>
            <AppIcon name="forward" :size="13" color="#C7450A" />
          </view>
        </view>

        <view class="field">
          <text class="field__label">宿舍门牌号</text>
          <input
            v-model="form.roomNo"
            class="field__input"
            :maxlength="MAX_ROOM_NO_LENGTH"
            placeholder="例：3 号楼 305"
            placeholder-class="field__ph"
            type="text"
          />
        </view>
        <text class="field__tip">店长按这个地址送货，写清楚楼号和房间号</text>

        <view class="field">
          <text class="field__label">收件人</text>
          <input
            v-model="form.contactName"
            class="field__input"
            :maxlength="MAX_CONTACT_NAME_LENGTH"
            placeholder="你的名字或称呼"
            placeholder-class="field__ph"
            type="text"
          />
        </view>

        <view class="field">
          <text class="field__label">联系电话</text>
          <input
            v-model="form.contactPhone"
            class="field__input"
            :maxlength="11"
            placeholder="11 位手机号"
            placeholder-class="field__ph"
            type="number"
          />
        </view>
        <text v-if="phoneError" class="field__error">{{ phoneError }}</text>
      </view>

      <!-- -------------------------------------------------------------- 备注 -->
      <view class="surface block">
        <view class="block__head">
          <AppIcon name="remark" :size="16" color="#C7450A" />
          <text class="block__title">备注</text>
          <text class="block__optional">选填</text>
        </view>

        <textarea
          v-model="form.remark"
          class="remark"
          :maxlength="MAX_REMARK_LENGTH"
          placeholder="口味、送达时间、放门口就行…有什么要求都写在这"
          placeholder-class="field__ph"
          :auto-height="true"
          :show-confirm-bar="false"
        />
        <text class="remark__count">{{ form.remark.length }}/{{ MAX_REMARK_LENGTH }}</text>
      </view>

      <!-- ----------------------------------------------------------- 商品清单 -->
      <view class="surface block">
        <view class="block__head">
          <AppIcon name="bag" :size="16" color="#C7450A" />
          <text class="block__title">商品清单</text>
          <text class="block__optional">共 {{ preview.totalQuantity }} 件</text>
        </view>

        <view v-for="(line, i) in preview.items" :key="line.productId" class="oline" :class="{ 'oline--first': i === 0 }">
          <ProductImage
            class="oline__img"
            :src="line.coverImage"
            :name="line.name"
            size="96rpx"
            radius="sm"
          />
          <view class="oline__main">
            <text class="oline__name">{{ line.name }}</text>
            <text class="oline__unit">{{ line.unit }}</text>
          </view>
          <view class="oline__right">
            <PriceText :value="line.unitPrice" size="sm" />
            <text class="oline__qty">×{{ line.quantity }}</text>
          </view>
        </view>
      </view>

      <!-- ------------------------------------------------------------- 金额 -->
      <view class="surface block">
        <view class="sumrow">
          <text class="sumrow__label">商品金额</text>
          <text class="sumrow__value">{{ formatYuan(preview.totalAmount) }}</text>
        </view>
        <view class="sumrow">
          <text class="sumrow__label">配送费</text>
          <text class="sumrow__value sumrow__value--free">宿舍楼下免配送</text>
        </view>
        <view class="divider" />
        <view class="sumrow sumrow--total">
          <text class="sumrow__label sumrow__label--total">合计</text>
          <PriceText :value="preview.totalAmount" size="lg" />
        </view>

        <view class="paynote">
          <AppIcon name="money" :size="15" color="#0E8A43" />
          <text class="paynote__text">货到付款 · 当面结算，线上不收钱</text>
        </view>
      </view>

      <view class="confirm__pad" />
    </view>

    <!-- ============================================================ 提交栏 -->
    <view v-if="!loading && !previewError" class="submit" :style="submitStyle">
      <view class="submit__inner">
        <view class="submit__sum">
          <view class="submit__amount">
            <text class="submit__amount-label">合计</text>
            <PriceText :value="preview.totalAmount" size="lg" />
          </view>
          <text class="submit__hint">共 {{ preview.totalQuantity }} 件 · 货到付款</text>
        </view>

        <AppButton
          class="submit__btn"
          type="primary"
          size="md"
          :text="submitting ? '提交中' : '提交订单'"
          :loading="submitting"
          :disabled="!canSubmit"
          @tap="submit"
        />
      </view>
      <view class="safe-area-bottom" />
    </view>

    <!-- ======================================================== 地址选择弹层 -->
    <view v-if="sheetOpen" class="mask" @tap="sheetOpen = false">
      <view class="sheet" @tap.stop>
        <view class="sheet__head">
          <text class="sheet__title">选择宿舍地址</text>
          <view class="sheet__close" @tap="sheetOpen = false">
            <AppIcon name="close" :size="18" color="#68707E" />
          </view>
        </view>

        <scroll-view class="sheet__list" scroll-y>
          <view
            v-for="addr in addresses"
            :key="addr.id"
            class="addr"
            :class="{ 'addr--on': isCurrentAddress(addr) }"
            hover-class="addr--hover"
            @tap="pickAddress(addr)"
          >
            <view class="addr__main">
              <view class="addr__top">
                <text class="addr__room">{{ addr.roomNo }}</text>
                <view v-if="addr.isDefault === 1" class="addr__badge">
                  <text class="addr__badge-text">默认</text>
                </view>
              </view>
              <text class="addr__meta">{{ addr.contactName }} · {{ addr.contactPhone }}</text>
            </view>
            <AppIcon v-if="isCurrentAddress(addr)" name="check" :size="18" color="#C7450A" />
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 确认订单页
 *
 * ── 这一页最要紧的一件事：**金额只信服务端** ──────────────────────────────
 * 进页先 `POST /orders/preview`（同一份入参结构），拿服务端算好的行单价 + 合计；
 * 提交时把**同一份**入参再发给 `POST /orders`。
 * 本地永远不自己乘一遍 —— 后端库存/上下架会变，本地算出来的数字可能和服务端不一样，
 * 那样用户看到的钱和真正下单的钱就对不上了。
 *
 * ── 两种来源 ──────────────────────────────────────────────────────────────
 *   · ?cartIds=1,2,3  购物车结算
 *   · ?productId=5&quantity=2  商品详情页「立即购买」
 * 二者共用一个 source 对象，直接喂给 preview 和 create。
 *
 * ── 没有默认地址也要能下单 ────────────────────────────────────────────────
 * H5 预览账号（舍友view）在种子数据里**没有地址**，
 * 所以这里不能在「没地址」时拦住用户。回填顺序是：
 *   1) 地址簿里的默认地址
 *   2) `GET /users/me` 的 `defaultRoom`（种子账号 student 是 '305'）
 *   3) 空 —— 让用户手填
 * 收件人/电话同理，没有就留空让用户填。
 *
 * ── 下单成功后怎么走 ──────────────────────────────────────────────────────
 * 后端 `POST /orders` 直接返回**完整订单详情**，而且已经删掉了用到的购物车行。
 * 所以这里只需要：refresh 购物车角标 → redirectTo 到成功页带上 orderId。
 * 用 redirectTo 而不是 navigateTo 是**故意的**：
 * 提交成功后不应该还能「返回」到确认页再提交一次。
 */
import { computed, reactive, ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppButton from '../../components/AppButton.vue';
import EmptyState from '../../components/EmptyState.vue';
import PriceText from '../../components/PriceText.vue';
import ProductImage from '../../components/ProductImage.vue';
import { orderApi } from '../../api/order';
import { userApi } from '../../api/user';
import { useCartStore } from '../../store/cart';
import { useUserStore } from '../../store/user';
import { useKeyboardOffset } from '../../composables/useKeyboardOffset';
import { formatYuan, toErrorMessage } from '../../utils/money';
import {
  MAX_ROOM_NO_LENGTH,
  MAX_CONTACT_NAME_LENGTH,
  MAX_REMARK_LENGTH,
  PHONE_PATTERN,
  ErrorCode,
} from '../../utils/constants';

const cartStore = useCartStore();
const userStore = useUserStore();

/** 下单来源：{ cartIds } 或 { items }，二者其一。直接喂给 preview / create */
const source = ref({});

const loading = ref(true);
const previewError = ref('');
const submitting = ref(false);

const preview = reactive({
  items: [],
  unitCount: 0,
  totalQuantity: 0,
  totalAmount: 0,
});

const form = reactive({
  roomNo: '',
  contactName: '',
  contactPhone: '',
  remark: '',
});

const addresses = ref([]);
const sheetOpen = ref(false);

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------
const roomNoTrimmed = computed(() => form.roomNo.trim());
const nameTrimmed = computed(() => form.contactName.trim());
const phoneTrimmed = computed(() => form.contactPhone.trim());

/**
 * 手机号错误提示
 * `@Matches` 在后端是硬校验，前端先拦一道，避免「点了提交才被拒」。
 * 只有**用户已经开始输**（长度 >= 3）时才提示，否则一进页面就报红很烦人。
 */
const phoneError = computed(() => {
  const v = phoneTrimmed.value;
  if (!v || v.length < 3) return '';
  if (!/^\d*$/.test(v)) return '手机号只能是数字';
  if (v.length === 11 && !PHONE_PATTERN.test(v)) return '手机号格式不对（1 开头的 11 位）';
  if (v.length > 11) return '手机号最多 11 位';
  return '';
});

const canSubmit = computed(
  () =>
    !submitting.value &&
    !!preview.items.length &&
    !!roomNoTrimmed.value &&
    !!nameTrimmed.value &&
    PHONE_PATTERN.test(phoneTrimmed.value),
);

/**
 * 键盘弹起时把提交栏整体上移。
 * 只在 H5 / 小程序调整：键盘高度 0 时 style 为空串，完全走 CSS 的 `bottom: 0`。
 * → 具体实现已移到 `composables/useKeyboardOffset.js`，见本页 useKeyboardOffset() 调用处。
 */

// ---------------------------------------------------------------------------
// 加载
// ---------------------------------------------------------------------------
async function loadPreview() {
  loading.value = true;
  previewError.value = '';

  // 1) 拉地址簿（失败不影响下单，只影响「选择地址」入口）
  userApi
    .listAddresses()
    .then((list) => {
      addresses.value = Array.isArray(list) ? list : [];
      applyDefaultAddress();
    })
    .catch(() => {
      addresses.value = [];
    });

  // 2) 用同一份 source 换服务端算好的金额
  try {
    const vo = await orderApi.preview(source.value);
    preview.items = vo.items || [];
    preview.unitCount = vo.unitCount || 0;
    preview.totalQuantity = vo.totalQuantity || 0;
    preview.totalAmount = vo.totalAmount || 0;
  } catch (err) {
    previewError.value = toErrorMessage(err, '结算预览失败，请返回购物车重试');
  } finally {
    loading.value = false;
  }
}

/**
 * 回填门牌号 / 收件人 / 电话
 * 顺序：地址簿默认地址 > 用户资料 defaultRoom > 留空
 * **不覆盖用户已经手填的内容** —— 地址是异步回来的，可能比用户打字还慢。
 */
function applyDefaultAddress() {
  if (!roomNoTrimmed.value)

    {
    const def = addresses.value.find((a) => a.isDefault === 1) || addresses.value[0];
    if (def) {
      form.roomNo = def.roomNo || '';
      form.contactName = def.contactName || '';
      form.contactPhone = def.contactPhone || '';
      return;
    }
  }
  if (!roomNoTrimmed.value && userStore.defaultRoom) {
    form.roomNo = userStore.defaultRoom;
  }
  if (!nameTrimmed.value && userStore.isLogin) {
    form.contactName = userStore.user?.nickname || '';
  }
  if (!phoneTrimmed.value && userStore.user?.phone) {
    form.contactPhone = userStore.user.phone;
  }
}

function isCurrentAddress(addr) {
  return (
    !!roomNoTrimmed.value &&
    addr.roomNo === roomNoTrimmed.value &&
    addr.contactName === nameTrimmed.value &&
    addr.contactPhone === phoneTrimmed.value
  );
}

function openAddressSheet() {
  if (!addresses.value.length) return;
  sheetOpen.value = true;
}

function pickAddress(addr) {
  form.roomNo = addr.roomNo || '';
  form.contactName = addr.contactName || '';
  form.contactPhone = addr.contactPhone || '';
  sheetOpen.value = false;
}

// ---------------------------------------------------------------------------
// 提交
// ---------------------------------------------------------------------------
async function submit() {
  if (submitting.value) return;

  if (!roomNoTrimmed.value) {
    uni.showToast({ title: '请填写宿舍门牌号', icon: 'none' });
    return;
  }
  if (!nameTrimmed.value) {
    uni.showToast({ title: '请填写收件人', icon: 'none' });
    return;
  }
  if (!PHONE_PATTERN.test(phoneTrimmed.value)) {
    uni.showToast({ title: '请填写正确的联系电话', icon: 'none' });
    return;
  }
  if (!preview.items.length) {
    uni.showToast({ title: '没有可下单的商品', icon: 'none' });
    return;
  }

  submitting.value = true;
  try {
    const detail = await orderApi.create({
      ...source.value,
      // 注意：门牌号/收件人都 trim 过再发。后端 @IsNotEmpty() **拦不住 "   "**
      roomNo: roomNoTrimmed.value,
      contactName: nameTrimmed.value,
      contactPhone: phoneTrimmed.value,
      remark: form.remark.trim() || undefined,
    });

    // 后端在下单事务里已经删掉了用到的购物车行 → 刷新一次让角标归位
    cartStore.refresh();

    // redirectTo：提交成功后不该还能返回到这一页再提交一次
    uni.redirectTo({
      url: `/pages/order/success?id=${detail.id}`,
      fail: () => {
        // redirectTo 到不存在的页会 fail，兜底回首页而不是把用户卡在确认页
        uni.reLaunch({ url: '/pages/home/home' });
      },
    });
  } catch (err) {
    const code = err?.code;
    // 库存/上下架这类问题是**离开这一页之前**商品状态就变了，
    // 提示用户回购物车看一眼，比在确认页干等有用
    if (code === ErrorCode.STOCK_NOT_ENOUGH || code === ErrorCode.PRODUCT_OFF_SHELF) {
      uni.showModal({
        title: '商品状态变了',
        content: err.message || '有商品已下架或库存不足，请返回购物车确认',
        showCancel: false,
      });
    }
    // 其它错误 request 层已经 toast 过
  } finally {
    submitting.value = false;
  }
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------
/**
 * 把 URL query 解析成下单来源，并记下「当前生效的是哪一组参数」。
 * 返回 true 表示参数变了（需要重新预览）。
 *
 * ⚠️ 为什么要这么绕，而不是直接写在 onLoad 里：
 *    在 H5（以及小程序的某些跳转路径）下，从
 *      `/pages/order/confirm?productId=2&quantity=2`
 *    跳到
 *      `/pages/order/confirm?probe=none`
 *    **只改 query 的部分，页面不会重建** —— `onLoad` 不会再跑，
 *    于是页面上还留着上一次的商品清单和金额（实测：URL 变了，内容没变）。
 *    这是个真 bug：用户从 A 商品跳到 B 商品，看到的是 A 的订单。
 *    所以参数变化必须能被检测到，按「参数签名」判断要不要重新拉预览。
 */
let appliedSignature = '';

function applyRouteOptions(options) {
  const cartIdsRaw = options?.cartIds || '';
  const productId = Number(options?.productId) || 0;
  const quantity = Math.max(1, Number(options?.quantity) || 1);
  const signature = `${cartIdsRaw}|${productId}|${quantity}`;

  // 参数没变 → 什么都不做（onShow 会反复触发，不能每次都重拉）
  if (signature === appliedSignature) return false;
  appliedSignature = signature;

  // 参数变了：清掉上一次的结果，避免「URL 已经是新的、画面还是旧的」这种中间态
  preview.items = [];
  preview.unitCount = 0;
  preview.totalQuantity = 0;
  preview.totalAmount = 0;
  previewError.value = '';

  if (cartIdsRaw) {
    const cartIds = String(cartIdsRaw)
      .split(',')
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!cartIds.length) {
      previewError.value = '没有要下单的商品，请从购物车或商品详情页进来';
      loading.value = false;
      return true;
    }
    source.value = { cartIds };
  } else if (productId) {
    source.value = { items: [{ productId, quantity }] };
  } else {
    previewError.value = '没有要下单的商品，请从购物车或商品详情页进来';
    loading.value = false;
    return true;
  }

  loadPreview();
  return true;
}

onLoad((options) => {
  applyRouteOptions(options);
});

/**
 * onShow 兜底：H5 的 query-only 跳转不会重跑 onLoad，
 * 但 onShow 会触发 —— 靠参数签名识别出「换了商品」，重新预览。
 *
 * 注意必须用 `getCurrentPages()` 拿当前页的 options，
 * 因为 onShow **不带参数**。取不到就跳过（不能让兜底逻辑把页面搞坏）。
 */
onShow(() => {
  const pages = getCurrentPages();
  const current = pages.length ? pages[pages.length - 1] : null;
  // @ts-ignore —— H5 端 vue-router 的实例挂在 $page 上，小程序端是 options
  const opts = current?.$page?.options || current?.options || null;
  if (opts) applyRouteOptions(opts);
});

/**
 * 键盘弹起时把固定提交栏顶上去。
 * 不做这一步的话，H5 / 微信里键盘会盖住提交按钮，用户填完找不到「提交」。
 *
 * 逻辑已抽到 `composables/useKeyboardOffset.js`，
 * 因为**有固定底栏 + 输入框**的表单页一共5 个（confirm / address-edit / profile /
 * admin-product-edit / admin-category-edit），各自抄一遍必然抄漏 —— 本来就只有这一页做了。
 */
const { barStyle: submitStyle, unbindKeyboard } = useKeyboardOffset();

onUnload(() => {
  unbindKeyboard();
});
</script>

<style lang="scss" scoped>
.confirm {
  background-color: $color-bg-app;
}

.confirm__body {
  padding: 0 0 0;
}

/* 固定提交栏占位 */
.confirm__pad {
  height: calc(72px + constant(safe-area-inset-bottom));
  height: calc(72px + env(safe-area-inset-bottom));
}

/* ==================================================================== 区块 */
.block {
  margin: $space-3 $space-4 0;
  padding: $space-4;
}

.block__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: $space-3;
}

.block__title {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.block__optional {
  margin-left: auto;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.block__link {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  padding: 4px 0 4px 8px;
}

.block__link-text {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $color-action;
}

/* ================================================================== 表单行 */
.field {
  display: flex;
  align-items: center;
  min-height: 44px;
  border-bottom: 1px solid $color-border-subtle;
}

.field__label {
  flex: none;
  width: 84px;
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

/* uni-app H5 会把 input 编译成 <uni-input><input>，样式写在 input 上即可 */
.field__input {
  flex: 1;
  min-width: 0;
  height: 44px;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.field__ph {
  color: $color-text-disabled;
  font-size: $font-size-sm;
}

.field__tip {
  display: block;
  margin-top: 6px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.field__error {
  display: block;
  margin-top: 6px;
  font-size: $font-size-xs;
  color: $color-danger;
}

/* ==================================================================== 备注 */
.remark {
  width: 100%;
  min-height: 72px;
  font-size: $font-size-sm;
  line-height: 1.6;
  color: $color-text-primary;
}

.remark__count {
  display: block;
  margin-top: 4px;
  text-align: right;
  font-size: 11px;
  color: $color-text-disabled;
  font-variant-numeric: tabular-nums;
}

/* ================================================================ 商品清单 */
.oline {
  display: flex;
  align-items: center;
  padding-top: $space-3;
  border-top: 1px solid $color-border-subtle;
}

.oline--first {
  padding-top: 0;
  border-top: none;
}

.oline + .oline {
  margin-top: 0;
}

.oline__img {
  flex: none;
  margin-right: $space-3;
}

.oline__main {
  flex: 1;
  min-width: 0;
}

.oline__name {
  display: block;
  font-size: $font-size-sm;
  color: $color-text-primary;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.oline__unit {
  display: block;
  margin-top: 2px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.oline__right {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.oline__qty {
  font-size: $font-size-xs;
  color: $color-text-muted;
  font-variant-numeric: tabular-nums;
}

/* ==================================================================== 金额 */
.sumrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
}

.sumrow__label {
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.sumrow__value {
  font-size: $font-size-sm;
  color: $color-text-primary;
  font-variant-numeric: tabular-nums;
}

.sumrow__value--free {
  color: $color-success;
}

.sumrow--total {
  min-height: 40px;
}

.sumrow__label--total {
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.paynote {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: $space-3;
  padding: $space-2 $space-3;
  border-radius: $radius-sm;
  background-color: $color-success-soft;
}

.paynote__text {
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

/* ================================================================ 提交栏 */
.submit {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: $z-sticky;
  background-color: $color-surface;
  border-top: 1px solid $color-border-subtle;
  /* 键盘弹起时整体上移，露出提交按钮 */
  transition: transform $motion-state $easing-standard;
}

.submit__inner {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-4;
}

.submit__sum {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.submit__amount {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.submit__amount-label {
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.submit__hint {
  font-size: 11px;
  color: $color-text-muted;
}

.submit__btn {
  flex: none;
  min-width: 120px;
}

/* ============================================================ 地址选择弹层 */
.mask {
  position: fixed;
  inset: 0;
  z-index: $z-mask;
  background-color: rgba(26, 29, 35, 0.45);
  display: flex;
  align-items: flex-end;
}

.sheet {
  width: 100%;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background-color: $color-surface;
  border-radius: $radius-xl $radius-xl 0 0;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-4 $space-4 $space-2;
}

.sheet__title {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.sheet__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
}

.sheet__list {
  flex: 1;
  min-height: 0;
  padding: 0 $space-4 $space-4;
}

.addr {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3;
  border: 1px solid $color-border-subtle;
  border-radius: $radius-sm;
  margin-bottom: $space-2;
}

.addr--on {
  border-color: $color-action;
  background-color: $color-action-soft;
}

.addr--hover {
  background-color: $color-surface-2;
}

.addr__main {
  flex: 1;
  min-width: 0;
}

.addr__top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.addr__room {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.addr__badge {
  padding: 1px 6px;
  border-radius: $radius-xs;
  background-color: $color-action;
}

.addr__badge-text {
  font-size: 10px;
  line-height: 1.4;
  color: $color-on-action;
}

.addr__meta {
  display: block;
  margin-top: 3px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* =================================================================== 骨架 */
.sk {
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 37%, #eef0f4 63%);
  background-size: 400% 100%;
  border-radius: $radius-xs;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk--line {
  height: 14px;
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
