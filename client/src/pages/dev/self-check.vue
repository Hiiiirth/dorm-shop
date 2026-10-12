<template>
  <view class="page-root">
    <NavBar title="宿舍小超市" :back="false" border />

    <view class="page-body">
      <!-- ---------------------------------------------------------- 登录态 -->
      <view class="section-title">① 登录态自检</view>
      <view class="surface card">
        <view class="kv">
          <text class="kv__k">状态</text>
          <text class="kv__v" :class="userStore.isLogin ? 'kv__v--ok' : 'kv__v--idle'">
            {{ userStore.isLogin ? '已登录' : '未登录' }}
          </text>
        </view>
        <view v-if="userStore.isLogin" class="kv">
          <text class="kv__k">昵称</text>
          <text class="kv__v">{{ userStore.nickname }}</text>
        </view>
        <view v-if="userStore.isLogin" class="kv">
          <text class="kv__k">当前身份</text>
          <text class="kv__v">{{ roleText }}（{{ userStore.currentRole }}）</text>
        </view>
        <view v-if="userStore.isLogin" class="kv">
          <text class="kv__k">拥有身份</text>
          <text class="kv__v">{{ (userStore.roles || []).join(' / ') }}</text>
        </view>
        <view v-if="userStore.isLogin" class="kv">
          <text class="kv__k">时间字段类型</text>
          <text class="kv__v kv__v--mono">
            {{ meCreatedAtType }}
            <text class="kv__note">
              （/users/me.createdAt；应为 number，即毫秒时间戳）。注意 /home 和
              /products 的 VO 里没有时间字段，别拿它们验这条约定。
            </text>
          </text>
        </view>
        <view class="kv">
          <text class="kv__k">storage 里的 token</text>
          <text class="kv__v">{{ tokenPreview }}</text>
        </view>

        <view class="card__actions">
          <AppButton
            v-if="!userStore.isLogin"
            type="primary"
            size="sm"
            text="H5 预览登录"
            :loading="loggingIn"
            @tap="doPreviewLogin"
          />
          <AppButton v-else type="text" size="sm" text="退出登录" @tap="doLogout" />
          <AppButton type="secondary" size="sm" text="重新校验 /users/me" @tap="probeMe(false)" />
        </view>
      </view>

      <!-- ------------------------------------------------------ 接口连通性 -->
      <view class="section-title">② 接口连通性（GET /home）</view>
      <view class="surface card">
        <view class="kv">
          <text class="kv__k">请求地址</text>
          <text class="kv__v kv__v--mono">{{ API_BASE }}/home</text>
        </view>
        <view class="kv">
          <text class="kv__k">耗时</text>
          <text class="kv__v">{{ homeProbe.ms == null ? '—' : homeProbe.ms + ' ms' }}</text>
        </view>
        <view class="kv">
          <text class="kv__k">结果</text>
          <text class="kv__v" :class="homeProbe.ok ? 'kv__v--ok' : 'kv__v--err'">
            {{ homeProbe.label }}
          </text>
        </view>

        <template v-if="homeProbe.ok">
          <view class="divider" />
          <view class="kv">
            <text class="kv__k">一级分类</text>
            <text class="kv__v">{{ homeProbe.categories.length }} 个</text>
          </view>
          <view class="kv">
            <text class="kv__k">分类名（验中文编码）</text>
            <text class="kv__v">{{ homeProbe.categories.map((c) => c.name).join('、') }}</text>
          </view>
          <view class="kv">
            <text class="kv__k">热销商品</text>
            <text class="kv__v">{{ homeProbe.hotProducts.length }} 个</text>
          </view>
          <view class="kv">
            <text class="kv__k">热销第一名</text>
            <text class="kv__v">
              {{ homeProbe.hotProducts[0]?.name }}
              <PriceText :value="homeProbe.hotProducts[0]?.price || 0" size="sm" />
            </text>
          </view>
          <view class="kv">
            <text class="kv__k">新品</text>
            <text class="kv__v">{{ homeProbe.newProducts.length }} 个</text>
          </view>
        </template>

        <view class="card__actions">
          <AppButton type="secondary" size="sm" text="重新请求" :loading="probing" @tap="probeHome" />
        </view>

        <view v-if="debugRaw" class="raw">
          <text class="raw__text">{{ debugRaw }}</text>
        </view>
      </view>

      <!-- ------------------------------------------------------ 服务端地址 -->
      <view class="section-title">③ 当前运行环境</view>
      <view class="surface card">
        <view class="kv">
          <text class="kv__k">API_BASE</text>
          <text class="kv__v kv__v--mono">{{ API_BASE }}</text>
        </view>
        <view class="kv">
          <text class="kv__k">平台</text>
          <text class="kv__v">{{ platform }}</text>
        </view>
        <view class="kv">
          <text class="kv__k">说明</text>
          <text class="kv__v">{{ apiBaseHint }}</text>
        </view>
      </view>

      <!-- --------------------------------------------------------- 开发者入口 -->
      <view class="section-title">④ 开发者入口</view>
      <view class="surface card">
        <view class="card__actions card__actions--stack">
          <AppButton
            type="primary"
            size="sm"
            block
            text="打开设计系统预览页"
            @tap="goDesignPreview"
          />
        </view>
        <text class="hint">
          预览页会把配色 / 字号 / 间距 / 按钮各状态 / 订单状态标签 / 空状态全部渲染一遍，
          用来验收 S7-0 的设计 token 是否落地。这个入口后面会移除。
        </text>
      </view>

      <view class="footnote">
        <text class="footnote__text">S7-0 · 脚手架 + 设计 token + 请求层 + user store + 基础组件</text>
      </view>

      <view class="has-own-tabbar" />
    </view>

    <AppTabBar :items="tabs" active="home" />
  </view>
</template>

<script setup>
/**
 * 地基自检页（开发用，不面向用户）
 *
 * S7-0 阶段它原本是首页，S7-1 做了真正的首页之后搬到 /pages/dev/self-check。
 * 留着它的原因：它是**唯一**一处能一眼看到
 *   「登录态持久化 / storage 里的 token / 接口连通性 / 时间字段是不是 number」
 * 的地方，后面每加一个功能都可以顺手回来点一下。
 *
 * 三个它专门盯着的约定：
 *   ① 设计 token 有没有生效（配色/字号/圆角都是 token 驱动的）
 *   ② 请求层通不通（GET /home 一次拿齐 categories + hot + new，而不是发三次）
 *   ③ 登录持久化对不对（刷新页面后仍是同一个账号，不会又新建一个「舍友XXXX」）
 */
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppTabBar from '../../components/AppTabBar.vue';
import AppButton from '../../components/AppButton.vue';
import PriceText from '../../components/PriceText.vue';
import { homeApi } from '../../api/home';
import { userApi } from '../../api/user';
import { useUserStore } from '../../store/user';
import { API_BASE, H5_PREVIEW_CODE } from '../../utils/config';
import { getAccessToken } from '../../utils/token';
import { ROLE_TEXT } from '../../utils/constants';
import { tabsOfRole } from '../../utils/tabs';

const userStore = useUserStore();

const probing = ref(false);
const loggingIn = ref(false);
const debugRaw = ref('');
/** /users/me.createdAt 的 typeof —— 用来验证「时间统一毫秒时间戳」这条约定 */
const meCreatedAtType = ref('—');

const homeProbe = ref({
  ok: false,
  label: '尚未请求',
  ms: null,
  categories: [],
  hotProducts: [],
  newProducts: [],
});

const roleText = computed(() => ROLE_TEXT[userStore.currentRole] || userStore.currentRole);

const tokenPreview = computed(() => {
  const t = getAccessToken();
  if (!t) return '无';
  return `${t.slice(0, 12)}…（共 ${t.length} 字符）`;
});

const tabs = computed(() => tabsOfRole(userStore.currentRole || 'CUSTOMER'));

const platform = (() => {
  try {
    // #ifdef H5
    return 'H5';
    // #endif
    // #ifdef MP-WEIXIN
    return '微信小程序';
    // #endif
    // #ifndef H5
    // #ifndef MP-WEIXIN
    return uni.getSystemInfoSync().platform || '未知';
    // #endif
    // #endif
  } catch {
    return '未知';
  }
})();

const apiBaseHint = computed(() =>
  API_BASE.startsWith('http')
    ? '小程序/App 走绝对地址（真机调试记得把 127.0.0.1 换成电脑局域网 IP）'
    : 'H5 走 vite 代理，同源，不触发 CORS 预检',
);

async function probeHome() {
  probing.value = true;
  const started = Date.now();
  try {
    const data = await homeApi.get();
    homeProbe.value = {
      ok: true,
      label: 'code = 0，请求成功',
      ms: Date.now() - started,
      categories: data?.categories || [],
      hotProducts: data?.hotProducts || [],
      newProducts: data?.newProducts || [],
    };
    debugRaw.value = JSON.stringify(
      {
        categories: (data?.categories || []).length,
        hotProducts: (data?.hotProducts || []).length,
        newProducts: (data?.newProducts || []).length,
        sample: data?.newProducts?.[0] || null,
      },
      null,
      2,
    );
  } catch (err) {
    homeProbe.value = {
      ...homeProbe.value,
      ok: false,
      label: `失败：${err.code ?? '?'} ${err.message}`,
      ms: Date.now() - started,
    };
    debugRaw.value = JSON.stringify({ code: err.code, message: err.message, http: err.http }, null, 2);
  } finally {
    probing.value = false;
  }
}

/**
 * 校验 /users/me，顺带验证时间字段是毫秒数
 * @param {boolean} silent 静默模式：启动时自动跑，不弹 toast
 */
async function probeMe(silent = false) {
  if (!userStore.isLogin) {
    if (!silent) uni.showToast({ title: '当前未登录', icon: 'none' });
    return;
  }
  try {
    const me = await userApi.me();
    meCreatedAtType.value = typeof me.createdAt;
    await userStore.refreshMe();
    if (!silent) {
      uni.showToast({ title: `校验通过：${me.nickname}`, icon: 'none' });
    }
  } catch (err) {
    if (!silent) uni.showToast({ title: err.message || '校验失败', icon: 'none' });
  }
}

async function doPreviewLogin() {
  loggingIn.value = true;
  try {
    const vo = await userStore.loginForH5Preview();
    uni.showToast({ title: `已登录：${vo.user.nickname}`, icon: 'none' });
  } catch (err) {
    uni.showToast({ title: err.message || '登录失败', icon: 'none' });
  } finally {
    loggingIn.value = false;
  }
}

function doLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出当前账号吗？',
    success: (res) => {
      if (res.confirm) userStore.logout();
    },
  });
}

function goDesignPreview() {
  uni.navigateTo({ url: '/pages/dev/design-preview' });
}

onLoad(() => {
  probeHome();
  // 已登录就顺手验一次 token + 时间字段类型（静默，不打扰）
  if (userStore.isLogin) probeMe(true);
});
</script>

<style lang="scss" scoped>
.card {
  padding: $space-4;
}

.card__actions {
  display: flex;
  align-items: center;
  gap: $space-2;
  margin-top: $space-4;
  flex-wrap: wrap;
}

.card__actions--stack {
  flex-wrap: nowrap;
}

.kv {
  display: flex;
  align-items: flex-start;
  gap: $space-3;
  padding: 6px 0;
}

.kv__k {
  flex: none;
  width: 200rpx;
  font-size: $font-size-sm;
  color: $color-text-muted;
}

.kv__v {
  flex: 1;
  font-size: $font-size-sm;
  color: $color-text-primary;
  word-break: break-all;
}

.kv__v--mono {
  font-family: Menlo, Consolas, monospace;
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.kv__v--ok {
  color: $color-success;
  font-weight: $font-weight-medium;
}

.kv__v--err {
  color: $color-danger;
  font-weight: $font-weight-medium;
}

.kv__v--idle {
  color: $color-text-muted;
}

.kv__note {
  font-size: 20rpx;
  line-height: 1.5;
  color: $color-text-muted;
}

.raw {
  margin-top: $space-3;
  padding: $space-3;
  border-radius: $radius-sm;
  background-color: $color-surface-2;
  max-height: 320rpx;
  overflow: hidden;
}

.raw__text {
  font-family: Menlo, Consolas, monospace;
  font-size: 20rpx;
  line-height: 1.5;
  color: $color-text-secondary;
  white-space: pre-wrap;
  word-break: break-all;
}

.hint {
  display: block;
  margin-top: $space-3;
  font-size: $font-size-xs;
  line-height: $line-height-normal;
  color: $color-text-muted;
}

.footnote {
  padding: $space-6 0 $space-4;
  text-align: center;
}

.footnote__text {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/* 给自绘 tabbar 留位 */
.has-own-tabbar {
  height: $tabbar-height;
}
</style>
