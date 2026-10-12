<template>
  <view class="page-root prof">
    <NavBar title="个人资料" :back="true" border />

    <view class="page-body prof__body">
      <!-- ================================================ 头像 -->
      <!--
        头像单独一张卡、放最上面：它是这一页唯一的「非文本」编辑项，
        操作路径也最长（要跳相册、跑压缩），混在昵称/门牌号的行里容易被当成装饰忽略掉。
        图存在 → 保存：`save()` 里已被 `dirty` 覆盖，不需要改提交逻辑。
      -->
      <view class="surface card card--pad">
        <view class="field field--last field--avatar">
          <text class="field__label">头像</text>
          <ImageUpload
            v-model="form.avatar"
            shape="circle"
            size="128rpx"
            label="设置头像"
            icon="image-plus"
            :show-size="false"
          />
        </view>
      </view>

      <!-- ================================================ 昵称 / 门牌号 -->
      <view class="surface card">
        <view class="field">
          <text class="field__label">昵称</text>
          <input
            class="field__input"
            :value="form.nickname"
            type="text"
            :maxlength="64"
            placeholder="给自己起个名"
            placeholder-class="field__ph"
            @input="form.nickname = $event.detail.value"
          />
        </view>

        <view class="field field--last">
          <text class="field__label">默认门牌号</text>
          <input
            class="field__input"
            :value="form.defaultRoom"
            type="text"
            :maxlength="32"
            placeholder="例：3 号楼 305"
            placeholder-class="field__ph"
            @input="form.defaultRoom = $event.detail.value"
          />
        </view>
      </view>

      <view class="hint icon-lead">
        <view class="icon-lead__icon">
          <AppIcon name="alert" :size="13" color="#68707E" />
        </view>
        <text class="hint__text">
          默认门牌号会在下单时自动填进去。常改地址的话，用「收货地址」更省事。
        </text>
      </view>

      <!-- ================================================ 身份管理 -->
      <view class="surface card">
        <view class="card__head">
          <AppIcon name="switch-role" :size="16" color="#C7450A" />
          <text class="card__title">我的身份</text>
        </view>

        <!-- 当前身份 -->
        <view class="role">
          <view class="role__icon">
            <AppIcon :name="ROLE_ICON[userStore.currentRole] || 'mine'" :size="16" color="#C7450A" />
          </view>
          <view class="role__main">
            <text class="role__name">
              {{ ROLE_TEXT[userStore.currentRole] || userStore.currentRole }}
            </text>
            <text class="role__sub">当前正在用这个身份</text>
          </view>
          <view class="role__tag">
            <text class="role__tag-text">使用中</text>
          </view>
        </view>

        <!-- 其它可切换身份 -->
        <view
          v-for="r in userStore.switchableRoles"
          :key="r"
          class="role role--switchable"
          @tap="doSwitch(r)"
        >
          <view class="role__icon role__icon--muted">
            <AppIcon :name="ROLE_ICON[r] || 'mine'" :size="16" color="#68707E" />
          </view>
          <view class="role__main">
            <text class="role__name">{{ ROLE_TEXT[r] || r }}</text>
            <text class="role__sub">点一下切到{{ ROLE_TEXT[r] || r }}工作台</text>
          </view>
          <AppIcon name="forward" :size="14" color="#9AA2AF" />
        </view>
      </view>

      <view class="prof__pad" />
    </view>

    <!-- 底部保存 -->
    <view class="abar" :style="barStyle">
      <AppButton
        type="primary"
        size="md"
        block
        text="保存"
        :disabled="!dirty || !form.nickname.trim()"
        :loading="saving"
        @tap="save"
      />
    </view>

    <!--
      小程序端压缩图片用的离屏画布。头像这一页在小程序里必须挂它，
      否则 createCanvasContext 拿到空上下文 → 存下一张全白的头像且不报错。
      「我的」页只跳转、不压缩，所以那边不用挂。
    -->
    <CompressCanvas />
  </view>
</template>

<script setup>
/**
 * 个人资料 · 身份管理
 *
 * 两个关键约定（都在 user store 的注释里）：
 *
 * 1) **切身份 = 换 token**。`POST /auth/switch-role` 会返回一组新的
 *    accessToken / refreshToken，`store.switchRole()` 已经负责写回 store + storage。
 *    漏掉这一步的表现是：页面跳过去了，但所有接口 403 + 20003。
 */
import { computed, reactive, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useKeyboardOffset } from '../../composables/useKeyboardOffset';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppButton from '../../components/AppButton.vue';
import ImageUpload from '../../components/ImageUpload.vue';
import CompressCanvas from '../../components/CompressCanvas.vue';
import { userApi } from '../../api/user';
import { useUserStore } from '../../store/user';
import { ROLE_ICON, ROLE_TEXT } from '../../utils/constants';
import { STORAGE_KEYS } from '../../utils/config';
import { toErrorMessage } from '../../utils/money';

const userStore = useUserStore();

/**
 * 头像走 base64 data URL（可能上百 KB），和昵称/门牌号放在同一个 form 里。
 * 它不参与 `dirty` 的「必填」判断（昵称为空才拦），但**参与 dirty** ——
 * 只换了头像、没改昵称时也要能保存。
 */
const form = reactive({ nickname: '', defaultRoom: '', avatar: '' });
const saving = ref(false);

const dirty = computed(
  () =>
    form.nickname !== (userStore.user?.nickname || '') ||
    form.defaultRoom !== (userStore.user?.defaultRoom || '') ||
    form.avatar !== (userStore.user?.avatar || ''),
);

async function save() {
  if (!dirty.value || saving.value) return;
  saving.value = true;
  try {
    // 只传**改动过的**字段：后端 UpdateProfileDto 全是可选，
    // 少传几个就少几个被误改的可能
    const payload = {};
    const nextName = form.nickname.trim();
    const nextRoom = form.defaultRoom.trim();
    if (nextName !== (userStore.user?.nickname || '')) payload.nickname = nextName;
    if (nextRoom !== (userStore.user?.defaultRoom || '')) payload.defaultRoom = nextRoom;
    /**
     * 头像：**永远传**（即使空串）。
     *
     * 与商品编辑页同理 —— `undefined` 表示「不改」，`''` 表示「清空」。
     * 用 `if (form.avatar)` 判空的话，「移除头像」这个操作就永远提交不上去。
     */
    payload.avatar = form.avatar || '';

    const me = await userApi.updateMe(payload);
    // updateMe 返回的是更新后的 UserVo → 同步到 store + storage，
    // 这样其它页面读 userStore 才不会拿到旧昵称
    userStore.user = me;
    uni.setStorageSync(STORAGE_KEYS.USER, me);
    uni.showToast({ title: '已保存', icon: 'none' });
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '保存失败'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

/**
 * 切换身份 —— **全站唯一的身份切换入口**（其余页面的入口都已删除）。
 *
 * 链路：`POST /auth/switch-role` → 换一组新 token 写回 store + storage
 *       → `uni.reLaunch` 该身份的**落地页**（顾客「我的」/ 店长「管理」）。
 *
 * reLaunch 有两个作用，缺一不可：
 *   ① 换工作台 —— 目标端页面会按新身份重新初始化，底部 tab 自然就对了
 *   ② 清空页面栈 —— 用户按返回键不会回到「上一个身份」的页面
 * 见 store/user.js 的 `switchRole`。
 */
async function doSwitch(role) {
  try {
    await userStore.switchRole(role);
    // switchRole 内部已 reLaunch 到落地页，这里不用再跳
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '切换失败'), icon: 'none' });
  }
}

onLoad(() => {
  form.nickname = userStore.user?.nickname || '';
  form.defaultRoom = userStore.user?.defaultRoom || '';
  form.avatar = userStore.user?.avatar || '';
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
.prof {
  background-color: $color-bg-app;
}

.prof__body {
  padding: $space-3 $space-4;
}

.card {
  padding: 0 $space-4;
  margin-bottom: $space-3;
}

.card + .card {
  margin-top: 0;
}

/* 头像卡：其他卡靠 .field 的 52px 行高撑出上下留白，这张只有一行且内容高，
   需要自己给上下内边距，否则圆头像会贴到卡片边缘 */
.card--pad {
  padding: $space-3 $space-4;
}

/* 头像行不设固定行高 —— ImageUpload 的预览盒比一行文字高，写死 52px 会挤 */
.field--avatar {
  min-height: auto;
  gap: $space-4;
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
  width: 92px;
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

.hint {
  display: flex;
  align-items: flex-start;
  /* `.icon-lead__icon` 用 1.6em 算壳高，em 相对**本容器**字号 → 必须显式给 */
  font-size: $font-size-xs;
  gap: 5px;
  padding: 0 $space-2;
  margin-bottom: $space-3;
}

.hint__text {
  flex: 1;
  min-width: 0;
  font-size: $font-size-xs;
  /* 必须与全局 `.icon-lead` 的 `--icon-lead-lh` 一致 */
  line-height: $line-height-normal;
  color: $color-text-muted;
}

/* ================================================================ 身份列表 */
.card__head {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-4 0 $space-3;
}

.card__title {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.role {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 0;
  border-top: 1px solid $color-border-subtle;
}

.role--switchable {
  /* 可点的行给一点反馈 */
  &:active {
    opacity: 0.6;
  }
}

.role__icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: $radius-pill;
  background-color: $color-action-soft;
}

.role__icon--muted {
  background-color: $color-surface-sunken;
}

.role__main {
  flex: 1;
  min-width: 0;
}

.role__name {
  display: block;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.role__sub {
  display: block;
  margin-top: 2px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.role__tag {
  flex: none;
  padding: 2px 8px;
  border-radius: $radius-pill;
  background-color: $color-success-soft;
}

.role__tag-text {
  font-size: $font-size-xs;
  color: $color-success;
}

/* ================================================================== 申请框 */
/* ============================================================== 底部按钮栏 */
.prof__pad {
  /** 占位 = 固定栏真实高度（含安全区），否则刘海屏上「保存」会压住最后一条记录 */
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
