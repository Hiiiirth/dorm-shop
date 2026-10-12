<template>
  <view class="page-root aedit">
    <NavBar :title="isEdit ? '编辑地址' : '新增地址'" :back="true" border />

    <view class="page-body aedit__body">
      <view class="surface card">
        <view class="field">
          <text class="field__label">收件人</text>
          <input
            class="field__input"
            :value="form.contactName"
            type="text"
            :maxlength="MAX_CONTACT_NAME_LENGTH"
            placeholder="收件人姓名"
            placeholder-class="field__ph"
            @input="form.contactName = $event.detail.value"
          />
        </view>

        <view class="field">
          <text class="field__label">联系电话</text>
          <input
            class="field__input"
            :value="form.contactPhone"
            type="number"
            :maxlength="11"
            placeholder="11 位手机号"
            placeholder-class="field__ph"
            @input="onPhoneInput"
          />
        </view>

        <view class="field field--last">
          <text class="field__label">宿舍门牌号</text>
          <input
            class="field__input"
            :value="form.roomNo"
            type="text"
            :maxlength="MAX_ROOM_NO_LENGTH"
            placeholder="例：3 号楼 305"
            placeholder-class="field__ph"
            @input="form.roomNo = $event.detail.value"
          />
        </view>
      </view>

      <!-- 电话错误：实时提示，但只在「输得差不多」时才报，别一边打一边催 -->
      <view v-if="phoneError" class="hint hint--err">
        <AppIcon name="alert" :size="13" color="#D93A3F" />
        <text class="hint__text">{{ phoneError }}</text>
      </view>
      <view v-else class="hint">
        <AppIcon name="alert" :size="13" color="#68707E" />
        <text class="hint__text">店长按门牌号送货，写清楚楼号和房间号</text>
      </view>

      <!-- 设为默认 -->
      <view class="surface card togglecard" @tap="form.isDefault = form.isDefault ? 0 : 1">
        <view class="togglecard__main">
          <text class="togglecard__title">设为默认地址</text>
          <text class="togglecard__desc">下单时会自动带出这个地址</text>
        </view>
        <AppCheckbox :checked="form.isDefault === 1" @change="(v) => (form.isDefault = v ? 1 : 0)" />
      </view>

      <view class="aedit__pad" />
    </view>

    <!-- 底部按钮 -->
    <view class="abar" :style="barStyle">
      <AppButton
        type="primary"
        size="md"
        block
        :text="isEdit ? '保存修改' : '添加地址'"
        :disabled="!canSubmit"
        :loading="submitting"
        @tap="submit"
      />
    </view>
  </view>
</template>

<script setup>
/**
 * 地址新增 / 编辑（同一个页面，靠有没有 id 区分）
 *
 * 后端地址接口返回的是**原始实体**（没有 VO 包装），字段是：
 *   { id, userId, contactName, contactPhone, roomNo, isDefault(0|1), createdAt, updatedAt }
 *
 * ⚠️ `isDefault` 是 **0 / 1 的 TINYINT**，不是布尔。
 * 传 `true` 后端 `@IsIn([0,1])` 会拒 —— 所以表单里存的也是数字。
 */
import { computed, reactive, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useKeyboardOffset } from '../../composables/useKeyboardOffset';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppButton from '../../components/AppButton.vue';
import AppCheckbox from '../../components/AppCheckbox.vue';
import { userApi } from '../../api/user';
import {
  MAX_CONTACT_NAME_LENGTH,
  MAX_ROOM_NO_LENGTH,
  PHONE_PATTERN,
} from '../../utils/constants';
import { toErrorMessage } from '../../utils/money';

const addressId = ref(0);
const submitting = ref(false);

const form = reactive({
  contactName: '',
  contactPhone: '',
  roomNo: '',
  isDefault: 0,
});

const isEdit = computed(() => addressId.value > 0);

/** 电话实时校验：和确认订单页同一套规则（不足 3 位不报错，避免边输边催） */
const phoneError = computed(() => {
  const v = form.contactPhone.trim();
  if (!v || v.length < 3) return '';
  if (!/^\d*$/.test(v)) return '手机号只能是数字';
  if (v.length === 11 && !PHONE_PATTERN.test(v)) return '手机号格式不对（1 开头的 11 位）';
  if (v.length > 11) return '手机号最多 11 位';
  return '';
});

const canSubmit = computed(
  () =>
    !submitting.value &&
    !!form.contactName.trim() &&
    !!form.roomNo.trim() &&
    PHONE_PATTERN.test(form.contactPhone.trim()),
);

function onPhoneInput(e) {
  // number 类型的 input 在部分端会带出非数字，统一再过滤一次
  form.contactPhone = String(e.detail.value || '').replace(/\D/g, '').slice(0, 11);
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  const payload = {
    contactName: form.contactName.trim(),
    contactPhone: form.contactPhone.trim(),
    roomNo: form.roomNo.trim(),
    isDefault: form.isDefault ? 1 : 0,
  };
  try {
    if (isEdit.value) {
      await userApi.updateAddress(addressId.value, payload);
    } else {
      await userApi.addAddress(payload);
    }
    uni.showToast({ title: isEdit.value ? '已保存' : '已添加', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 450);
  } catch (err) {
    // 失败时**保留已填内容**（不回滚表单），用户改一下就能重试
    uni.showToast({ title: toErrorMessage(err, '保存失败'), icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

async function loadAddress(id) {
  try {
    // 没有单条查询接口 → 从列表里找（地址数量很少，代价可接受）
    const list = await userApi.listAddresses();
    const found = (list || []).find((a) => a.id === id);
    if (!found) {
      uni.showToast({ title: '地址不存在', icon: 'none' });
      setTimeout(() => uni.navigateBack(), 500);
      return;
    }
    form.contactName = found.contactName || '';
    form.contactPhone = found.contactPhone || '';
    form.roomNo = found.roomNo || '';
    form.isDefault = found.isDefault ? 1 : 0;
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '地址加载失败'), icon: 'none' });
  }
}

onLoad((options) => {
  const id = Number(options?.id) || 0;
  if (id > 0) {
    addressId.value = id;
    loadAddress(id);
  }
});
/**
 * 键盘弹起时把底部「保存」栏顶上去。
 *
 * 这一页有 3 个输入框（收货人/手机号/门牌号）贴着底部固定栏，
 * 键盘弹起会把「保存修改」**完全盖住** —— 用户填完抬头看不见保存按钮，
 * 只能瞎划或者回退重填。加了这个偏移就上移键盘高度，稳在键盘上方。
 */
const { barStyle, unbindKeyboard } = useKeyboardOffset();

onUnload(() => {
  unbindKeyboard();
});
</script>

<style lang="scss" scoped>
.aedit {
  background-color: $color-bg-app;
}

.aedit__body {
  padding: $space-3 $space-4;
}

.card {
  padding: 0 $space-4;
  margin-bottom: $space-3;
}

/* 抵消全局 `.surface + .surface { margin-top: 12px }` */
.card + .card {
  margin-top: 0;
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

.field__label {
  flex: none;
  width: 76px;
  font-size: $font-size-sm;
  color: $color-text-secondary;
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

/* ==================================================================== 提示 */
.hint {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 $space-2 0 4px;
  margin-bottom: $space-3;
}

.hint__text {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.hint--err .hint__text {
  color: $color-danger;
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
  color: $color-text-primary;
}

.togglecard__desc {
  display: block;
  margin-top: 3px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* ============================================================== 底部按钮栏 */
.aedit__pad {
  /**
   * 占位高度必须**等于**固定栏的真实高度，否则最后一行会被盖住。
   * 下面 `.abar` 是 `padding: 12px上下 + 按钮 48px + env(safe-area-inset-bottom)`，
   * 在 iPhone 上安全区约 34px → 实际约 106px。这里写死 80px 就会差 26px，
   * 刘海屏机型上「保存修改」会压住最后一条地址。
   * 对照写法见product/detail.vue 的 `calc(76px + env(...))`。
   */
  height: calc(80px + env(safe-area-inset-bottom));
}

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
</style>
