<template>
  <!--
    ⚠️ **必须只有一个根节点**：Vue 对多根（fragment）组件不继承 class/style
    且静默丢弃，父级给的 `class="xxx"` 会凭空消失。AppIcon / AppCheckbox 都吃过这个亏。
  -->
  <view class="iupload" :class="[`iupload--${shape}`, { 'iupload--disabled': disabled }]">
    <!-- ============================================== 有图：预览 + 操作 -->
    <template v-if="modelValue">
      <view class="iupload__preview" :style="previewStyle">
        <image class="iupload__img" :src="modelValue" mode="aspectFill" @error="onImgError" />
        <!-- 上传中蒙层（压缩是同步的，这里主要给「还在传接口」用） -->
        <view v-if="uploading" class="iupload__mask">
          <AppIcon name="loading" :size="20" spin color="#ffffff" />
        </view>
      </view>

      <view v-if="!disabled" class="iupload__ops">
        <view class="iupload__op" @tap="choose">
          <AppIcon name="image-plus" :size="13" :color="COLOR.action" />
          <text class="iupload__op-text">更换</text>
        </view>
        <view class="iupload__op" @tap="askRemove">
          <AppIcon name="delete" :size="13" :color="COLOR.danger" />
          <text class="iupload__op-text iupload__op-text--danger">移除</text>
        </view>
      </view>
    </template>

    <!-- ============================================== 没图：虚线占位，点了就选 -->
    <view
      v-else
      class="iupload__empty"
      :style="emptyStyle"
      :hover-class="disabled ? '' : 'iupload__empty--hover'"
      @tap="choose"
    >
      <AppIcon :name="uploading ? 'loading' : icon" :size="iconSize" :spin="uploading" :color="COLOR.textMuted" />
      <text class="iupload__empty-text">{{ uploading ? '处理中…' : label }}</text>
    </view>

    <!-- 错误提示：压缩失败 / 体积超限 / 后端拒了 -->
    <text v-if="error" class="iupload__err">{{ error }}</text>
  </view>
</template>

<script setup>
/**
 * 图片上传控件（选图 → 客户端压缩 → 预览 → 交给父级提交）
 *
 * ── 职责边界 ─────────────────────────────────────────────────────────────
 * 这个组件**只负责「拿到 base64 data URL」并把它 v-model 出去**，
 * 不自己调上传接口。原因：
 *   · 商品封面是跟着「保存商品」一起提交的，不能一选图就发请求
 *     （否则用户选完图点取消，图已经在服务端了，语义就不对了）
 *   · 头像虽然可以立刻提交，但也应该走「保存」这一个出口
 * 所以它是个**受控组件**，父级拿 modelValue 自己决定何时提交。
 *
 * ── 为什么 shape 有两档 ──────────────────────────────────────────────────
 *   商品封面：sq  —— 1:1 方形（与顾客端 ProductImage 的 aspectFill 对齐）
 *   用户头像：circle —— 圆形（与「我的」页账号卡的头像一致）
 *
 * ── 为什么移除要二次确认 ─────────────────────────────────────────────────
 * 与项目里其他破坏性操作（删购物车条目、强制取消订单）保持一致。
 * 而且移除后本地没有原图备份，误触就是「得重新拍一张」。
 */
import { computed, getCurrentInstance, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { COLOR } from '../utils/colors';
import { pickAndCompressImage, dataUrlSizeText, dataUrlBytes, COMPRESS_CANVAS_ID } from '../utils/image';

const props = defineProps({
  /** base64 data URL，或空串（没设） */
  modelValue: { type: String, default: '' },
  /** sq 方形（商品封面） / circle 圆形（头像） */
  shape: { type: String, default: 'sq' },
  /** 空态文案 */
  label: { type: String, default: '添加图片' },
  /** 空态图标 */
  icon: { type: String, default: 'image-plus' },
  /** 预览区边长（CSS 长度）。默认方形 200rpx、圆形 128rpx */
  size: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  /** 是否在预览下方显示体量（店长配图时有用） */
  showSize: { type: Boolean, default: true },
  /**
   * 压缩画布的 id（**小程序端才用得到**）。
   * 同一页面挂了多个上传控件时，每个页面的 <CompressCanvas> 与每个控件的
   * 这个 prop 都要给**唯一且互相对应**的值，否则会串图。
   * 只有一个控件时用默认值即可。
   */
  canvasId: { type: String, default: COMPRESS_CANVAS_ID },
});

// 新版基础库的 canvasToTempFilePath 要组件实例；H5 端拿到也没关系，
// compressH5 根本不碰这个参数。
const instance = getCurrentInstance();

const emit = defineEmits(['update:modelValue', 'change', 'error']);

const uploading = ref(false);
const error = ref('');

const boxSize = computed(() => props.size || (props.shape === 'circle' ? '128rpx' : '200rpx'));

const previewStyle = computed(() => ({
  width: boxSize.value,
  height: boxSize.value,
  // 圆角在 CSS 里按 shape 给，这里只给尺寸
}));

const emptyStyle = computed(() => ({
  width: boxSize.value,
  height: boxSize.value,
}));

const iconSize = computed(() => (props.shape === 'circle' ? 22 : 26));

const sizeText = computed(() => (props.modelValue && props.showSize ? dataUrlSizeText(props.modelValue) : ''));

/**
 * 选图 → 压缩 → 抛出
 *
 * ⚠️ `pickAndCompressImage` 在**用户取消**时 resolve(null) 而不是 reject ——
 *    取消是正常操作，不能弹错误提示。
 *
 * ⚠️ `instance` / `canvasId` 是**小程序端专用**（H5 端会忽略）。
 *    不传 instance 时新版基础库的 canvasToTempFilePath 会失败；
 *    不传 canvasId 或与页面里的 <CompressCanvas> 对不上时，
 *    createCanvasContext 拿到空上下文，导出**空白图且不报错**。
 */
async function choose() {
  if (props.disabled || uploading.value) return;
  error.value = '';
  uploading.value = true;
  try {
    const res = await pickAndCompressImage({
      instance,
      canvasId: props.canvasId,
    });
    if (!res) return; // 用户取消
    emit('update:modelValue', res.dataUrl);
    emit('change', res);
  } catch (err) {
    const msg = err?.message || '选图失败';
    error.value = msg;
    emit('error', err);
    uni.showToast({ title: msg, icon: 'none', duration: 2500 });
  } finally {
    uploading.value = false;
  }
}

function askRemove() {
  if (props.disabled) return;
  uni.showModal({
    title: '移除图片',
    content: '移除后需要重新选一张才能恢复，确定吗？',
    confirmText: '移除',
    confirmColor: COLOR.danger,
    success: (r) => {
      if (!r.confirm) return;
      error.value = '';
      emit('update:modelValue', '');
      emit('change', { dataUrl: '', size: 0 });
    },
  });
}

/** 图片渲染失败（data URL 损坏 / 外链 404）→ 提示，但不清空值（用户可能只是网络抖了） */
function onImgError() {
  error.value = '这张图显示不出来';
}

defineExpose({ sizeText, bytes: () => dataUrlBytes(props.modelValue) });
</script>

<style lang="scss" scoped>
.iupload {
  display: flex;
  align-items: center;
  gap: $space-3;
}

/* 圆形档：预览与空态都居中，操作按钮放右边 */
.iupload--circle {
  align-items: center;
}

/* ============================================================== 预览 */
.iupload__preview {
  position: relative;
  flex: none;
  overflow: hidden;
  background-color: $color-surface-sunken;
}

.iupload--sq .iupload__preview {
  border-radius: $radius-md;
}

.iupload--circle .iupload__preview {
  border-radius: $radius-pill;
}

.iupload__img {
  display: block;
  width: 100%;
  height: 100%;
}

/* 上传中蒙层 */
.iupload__mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.42);
}

/* ============================================================== 空态 */
.iupload__empty {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  /* 虚线框 = 「这里可以放东西」的通用语言，比实线框更明确 */
  border: 1px dashed $color-border-strong;
  background-color: $color-surface-2;
  transition: background-color $motion-press $easing-standard;
}

.iupload__empty--hover {
  background-color: $color-surface-sunken;
}

.iupload--sq .iupload__empty {
  border-radius: $radius-md;
}

.iupload--circle .iupload__empty {
  border-radius: $radius-pill;
}

.iupload__empty-text {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* ============================================================== 操作 */
.iupload__ops {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.iupload__op {
  display: flex;
  align-items: center;
  gap: 6px;
  /* 最小触控热区 44px，行高撑够 */
  min-height: 34px;
  padding: 0 4px;

  &:active {
    opacity: 0.6;
  }
}

.iupload__op-text {
  font-size: $font-size-sm;
  color: $color-action;
}

.iupload__op-text--danger {
  color: $color-danger;
}

/* ============================================================== 错误 */
.iupload__err {
  flex: none;
  font-size: $font-size-xs;
  color: $color-danger;
}
</style>
