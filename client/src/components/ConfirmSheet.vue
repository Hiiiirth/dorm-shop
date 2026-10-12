<template>
  <view v-if="modelValue" class="sheet-root">
    <!-- 遮罩：点击关闭（可选）。用 view 而不是 scroll-view，避免弹层里出现滚动条 -->
    <view class="sheet__mask" @tap="onMaskTap" />

    <view class="sheet__panel" @tap.stop>
      <view class="sheet__head">
        <text class="sheet__title">{{ title }}</text>
        <text v-if="desc" class="sheet__desc">{{ desc }}</text>
      </view>

      <!-- 可选：自定义内容区（管理端的日期筛选就挂这里） -->
      <!--
        为什么加插槽而不是新写一个 FilterSheet：
        遮罩 / 底部弹出动画 / 圆角 / 安全区 padding / 双按钮布局全在这一个组件里，
        复制一份出去就要维护两份。插槽让这些全部复用。
        用默认插槽（无 name）而不是具名插槽 —— 项目里只用得上一个内容区。
      -->
      <view v-if="$slots.default" class="sheet__slot">
        <slot />
      </view>

      <!-- 可选：一个输入框收集原因（取消订单的理由） -->
      <view v-if="showInput" class="sheet__field">
        <textarea
          class="sheet__input"
          :value="inputValue"
          :placeholder="placeholder"
          :maxlength="maxlength"
          placeholder-class="sheet__ph"
          :auto-height="false"
          @input="onInput"
        />
        <text class="sheet__count">{{ (inputValue || '').length }}/{{ maxlength }}</text>
      </view>

      <!-- 快捷原因（可选） -->
      <view v-if="quickReasons && quickReasons.length" class="sheet__chips">
        <view
          v-for="r in quickReasons"
          :key="r"
          class="chip"
          :class="{ 'chip--on': inputValue === r }"
          @tap="pickQuick(r)"
        >
          <text class="chip__text">{{ r }}</text>
        </view>
      </view>

      <view class="sheet__actions">
        <AppButton type="secondary" size="md" block text="再想想" @tap="onCancel" />
        <AppButton
          :type="danger ? 'danger' : 'primary'"
          size="md"
          block
          :text="confirmText"
          :loading="loading"
          @tap="onConfirm"
        />
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 底部确认弹层
 *
 * 用于**危险 / 不可逆**的操作（取消订单、删除地址）。
 * 和 uni.showModal 的区别：
 *   ① 可以带输入框（收集取消原因）
 *   ② 样式跟项目一致（showModal 在 H5/小程序端外观不同）
 *   ③ 底部弹出比居中弹窗在手机上更好点
 *
 * `v-model` 控制显隐；确认后由父组件决定要不要关（例如接口失败要留在弹层里）。
 */
import AppButton from './AppButton.vue';const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '确定要这样做吗？' },
  desc: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  /** 危险操作（红按钮） */
  danger: { type: Boolean, default: true },
  /** 点遮罩是否关闭 */
  maskClosable: { type: Boolean, default: true },
  /** 确认按钮转圈 */
  loading: { type: Boolean, default: false },
  /** 显示原因输入框 */
  showInput: { type: Boolean, default: false },
  inputValue: { type: String, default: '' },
  placeholder: { type: String, default: '说说原因（选填）' },
  maxlength: { type: Number, default: 50 },
  /** 快捷原因 chips */
  quickReasons: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel', 'update:inputValue']);

function close() {
  emit('update:modelValue', false);
}

function onMaskTap() {
  if (props.maskClosable && !props.loading) {
    close();
    emit('cancel');
  }
}

function onCancel() {
  if (props.loading) return;
  close();
  emit('cancel');
}

function onConfirm() {
  if (props.loading) return;
  emit('confirm');
}

function onInput(e) {
  emit('update:inputValue', e.detail.value);
}

function pickQuick(text) {
  // 再点一次同一个 → 取消选择，方便手滑
  emit('update:inputValue', props.inputValue === text ? '' : text);
}
</script>

<style lang="scss" scoped>
.sheet-root {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 900;
}

.sheet__mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background-color: rgba(17, 22, 30, 0.45);
}

.sheet__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: $space-5 $space-4 calc(#{$space-4} + env(safe-area-inset-bottom));
  background-color: $color-surface;
  border-radius: $radius-xl $radius-xl 0 0;
}

.sheet__head {
  margin-bottom: $space-4;
}

/* 自定义内容区：给筛选这类「要填几个字段」的弹层用 */
.sheet__slot {
  margin-bottom: $space-3;
}

.sheet__title {
  display: block;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  text-align: center;
}

.sheet__desc {
  display: block;
  margin-top: 6px;
  font-size: $font-size-sm;
  line-height: 1.6;
  color: $color-text-secondary;
  text-align: center;
}

/* ------------------------------------------------------------------ 输入区 */
.sheet__field {
  position: relative;
  padding: $space-3;
  margin-bottom: $space-3;
  border-radius: $radius-sm;
  background-color: $color-surface-2;
  border: 1px solid $color-border-subtle;
}

.sheet__input {
  width: 100%;
  height: 64px;
  font-size: $font-size-sm;
  line-height: 1.6;
  color: $color-text-primary;
}

.sheet__ph {
  color: $color-text-muted;
}

.sheet__count {
  display: block;
  margin-top: 4px;
  font-size: $font-size-xs;
  color: $color-text-muted;
  text-align: right;
}

.sheet__chips {
  display: flex;
  flex-wrap: wrap;
  gap: $space-2;
  margin-bottom: $space-4;
}

.chip {
  padding: 5px 12px;
  border-radius: $radius-pill;
  background-color: $color-surface-sunken;
  border: 1px solid transparent;
}

.chip--on {
  background-color: $color-action-soft;
  border-color: $color-action-soft-border;
}

.chip__text {
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.chip--on .chip__text {
  color: $color-action;
  font-weight: $font-weight-medium;
}

/* -------------------------------------------------------------------- 按钮 */
.sheet__actions {
  display: flex;
  gap: $space-3;
}
</style>
