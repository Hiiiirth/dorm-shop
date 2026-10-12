<template>
  <view class="page-root">
    <NavBar title="登录" :back="true" border />

    <view class="page-body">
      <view class="hero">
        <view class="hero__logo">
          <text class="hero__logo-text">超</text>
        </view>
        <text class="hero__title">宿舍线上小超市</text>
        <text class="hero__sub">下单后由店长送到宿舍门口</text>
      </view>

      <!--
        ------------------------------------------------ H5 预览登录
        ⚠️ 这整块必须包在 `#ifdef H5` 里。条件编译发生在构建期，
        不加的话**小程序端也会渲染出这张卡**（已确认 `dist/build/mp-weixin/pages/login/login.wxml`
        里有「H5 预览登录」四个字）。而小程序上点它会传固定 code `h5-preview` 走mock 登录 ——
        后端 `WX_MOCK_LOGIN=true` 会**给每个用户新建一个「舍友XXXX」账号**，
        等于每个人的购物车和订单都是空的，体验跟真机完全不一样。
      -->
      <!-- #ifdef H5 -->
      <view class="surface card">
        <text class="card__title">H5 预览登录</text>
        <text class="card__desc">
          H5 没有 wx.login，这里用固定 code（{{ H5_PREVIEW_CODE }}）走 mock 登录。
          固定 code 的意义是：每次预览都是同一个账号，购物车和订单能连续看到；
          如果每次都用随机 code，后端会不停新建「舍友XXXX」账号。
        </text>
        <view class="card__actions">
          <AppButton
            type="primary"
            size="md"
            block
            text="一键预览登录"
            :loading="previewLoading"
            @tap="doPreviewLogin"
          />
        </view>
      </view>
      <!-- #endif -->

      <!-- ------------------------------------------------ 手机号登录 -->
      <view class="surface card">
        <text class="card__title">手机号登录</text>
        <text class="card__desc">
          店长的种子账号**没有微信 openid**，必须用手机号登录。
          开发环境发验证码时，后端会把验证码直接回传，下面会自动填上。
        </text>

        <view class="field">
          <text class="field__label">手机号</text>
          <input
            v-model="phone"
            class="field__input"
            type="number"
            maxlength="11"
            placeholder="11 位手机号"
            placeholder-class="field__ph"
          />
        </view>

        <view class="field">
          <text class="field__label">验证码</text>
          <view class="field__row">
            <input
              v-model="smsCode"
              class="field__input field__input--flex"
              type="number"
              maxlength="6"
              placeholder="6 位数字"
              placeholder-class="field__ph"
            />
            <AppButton
              type="secondary"
              size="sm"
              :text="countdown > 0 ? `${countdown}s 后重发` : '获取验证码'"
              :disabled="countdown > 0 || !phoneValid"
              @tap="doSendCode"
            />
          </view>
        </view>

        <view class="card__actions">
          <AppButton
            type="primary"
            size="md"
            block
            text="登录"
            :loading="loginLoading"
            :disabled="!phoneValid || smsCode.length !== 6"
            @tap="doPhoneLogin"
          />
        </view>

        <text v-if="devHint" class="dev-hint">{{ devHint }}</text>
      </view>

      <view class="footnote">
        <text class="footnote__text">
          登录成功后会跳回首页。种子账号：店长 13800000001 / 顾客 13800000003
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 登录页
 *
 * S7-0 阶段先把两条登录路径打通，方便后续每个阶段都能自测：
 *   · H5 预览登录 —— 固定 code，复用同一个账号
 *   · 手机号登录  —— 店长必须走这条（种子账号没有 openid）
 */
import { computed, ref } from 'vue';
import { onUnload } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppButton from '../../components/AppButton.vue';
import { authApi } from '../../api/auth';
import { useUserStore } from '../../store/user';
import { H5_PREVIEW_CODE } from '../../utils/config';

const userStore = useUserStore();

const phone = ref('');
const smsCode = ref('');
const countdown = ref(0);
const previewLoading = ref(false);
const loginLoading = ref(false);
const devHint = ref('');

let timer = null;

const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(phone.value));

function startCountdown() {
  countdown.value = 60;
  clearInterval(timer);
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) clearInterval(timer);
  }, 1000);
}

onUnload(() => clearInterval(timer));

async function doSendCode() {
  if (!phoneValid.value) return;
  try {
    const data = await authApi.sendSmsCode(phone.value);
    startCountdown();
    if (data && data.mockCode) {
      // 开发环境后端把验证码回传了，直接填上，省得来回查日志
      smsCode.value = data.mockCode;
      devHint.value = `开发环境：验证码已自动填入（${data.mockCode}），${data.expireIn} 秒内有效`;
    } else {
      devHint.value = '验证码已发送，请查看手机短信';
    }
  } catch (err) {
    uni.showToast({ title: err.message || '发送失败', icon: 'none' });
  }
}

async function doPhoneLogin() {
  loginLoading.value = true;
  try {
    const vo = await userStore.loginByPhone(phone.value, smsCode.value);
    uni.showToast({ title: `欢迎，${vo.user.nickname}`, icon: 'none' });
    setTimeout(() => uni.reLaunch({ url: '/pages/home/home' }), 600);
  } catch (err) {
    uni.showToast({ title: err.message || '登录失败', icon: 'none' });
  } finally {
    loginLoading.value = false;
  }
}

async function doPreviewLogin() {
  previewLoading.value = true;
  try {
    const vo = await userStore.loginForH5Preview();
    uni.showToast({ title: `欢迎，${vo.user.nickname}`, icon: 'none' });
    setTimeout(() => uni.reLaunch({ url: '/pages/home/home' }), 600);
  } catch (err) {
    uni.showToast({ title: err.message || '登录失败', icon: 'none' });
  } finally {
    previewLoading.value = false;
  }
}
</script>

<style lang="scss" scoped>
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $space-8 0 $space-6;
}

.hero__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 128rpx;
  height: 128rpx;
  border-radius: $radius-lg;
  background-color: $color-action;
  margin-bottom: $space-4;
}

.hero__logo-text {
  font-size: 56rpx;
  font-weight: $font-weight-semibold;
  color: $color-on-action;
}

.hero__title {
  font-size: $font-size-xl;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.hero__sub {
  margin-top: $space-2;
  font-size: $font-size-sm;
  color: $color-text-muted;
}

.card {
  padding: $space-4;
  margin-bottom: $space-3;
}

.card__title {
  display: block;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.card__desc {
  display: block;
  margin-top: $space-2;
  font-size: $font-size-xs;
  line-height: $line-height-loose;
  color: $color-text-muted;
}

.card__actions {
  margin-top: $space-4;
}

.field {
  margin-top: $space-4;
}

.field__label {
  display: block;
  margin-bottom: $space-2;
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.field__row {
  display: flex;
  align-items: center;
  gap: $space-2;
}

.field__input {
  height: $touch-min;
  padding: 0 $space-3;
  border: 1px solid $color-border-strong;
  border-radius: $radius-sm;
  background-color: $color-surface;
  font-size: $font-size-md;
  color: $color-text-primary;
}

.field__input--flex {
  flex: 1;
}

.field__ph {
  color: $color-text-disabled;
}

.dev-hint {
  display: block;
  margin-top: $space-3;
  padding: $space-2 $space-3;
  border-radius: $radius-sm;
  background-color: $color-success-soft;
  font-size: $font-size-xs;
  color: $color-text-primary;
}

.footnote {
  padding: $space-5 0 $space-8;
  text-align: center;
}

.footnote__text {
  font-size: $font-size-xs;
  line-height: $line-height-loose;
  color: $color-text-muted;
}
</style>
