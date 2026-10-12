import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { setAuthHandlers } from './utils/request';
import { useUserStore } from './store/user';

export function createApp() {
  const app = createSSRApp(App);

  const pinia = createPinia();
  app.use(pinia);

  // 依赖倒置：request 层不 import store（否则 request.js <-> store/user.js 成环），
  // 改由这里把两个回调注入进去。
  setAuthHandlers({
    // token 续不回来了 -> 清本地登录态
    onExpired: () => useUserStore().handleAuthExpired(),
    // 静默续期成功 -> 把新 token 同步回 store
    onRefreshed: (tokens) => useUserStore().handleTokensRefreshed(tokens),
  });

  return { app };
}
