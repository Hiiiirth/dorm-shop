/**
 * 店长身份守卫（管理端三个页面共用）
 *
 * ## 为什么需要
 *
 * 后端 `/admin/*` 已经有 `@Roles(ADMIN)` + `RolesGuard`，拿顾客 token 打进去会得到
 * **403 + 20003**。但那是在**已经发完请求之后**才知道 —— 页面白屏一下再弹 toast，
 * 店长会以为是网络问题。
 *
 * 所以前端在**发请求之前**先判一次：不是 ADMIN 身份就直接渲染「去切换身份」的空态，
 * 请求一个都不发。
 *
 * ## 关键：切换身份必须重签 token
 *
 * `userStore.switchRole()` 内部会调 `/auth/switch-role` 拿**新 token** 并写回 store + storage。
 * 如果只改了本地 `user.currentRole` 而不换 token，`RolesGuard` 读到的还是旧身份，
 * 后面每个 `/admin/*` 请求都是 403 + 20003 —— 页面看着进了，但数据一条都拿不到。
 * 见 store/user.js 的 switchRole。
 *
 * ## 用法
 *
 * ```js
 * const isAdmin = useAdminGuard();
 * // 模板：v-if="!isAdmin" 先渲染守卫态（不发任何请求），v-else 才是真正内容
 * ```
 */
import { computed } from 'vue';
import { useUserStore } from '../store/user';

/**
 * @returns {import('vue').ComputedRef<boolean>} 当前身份能不能进管理端
 */
export function useAdminGuard() {
  const userStore = useUserStore();
  return computed(() => userStore.isLogin && userStore.isAdmin);
}

/**
 * 「去切换身份」的统一跳转 —— 实际就是**打开个人资料页**。
 *
 * 身份切换的唯一入口是个人资料页的「我的身份」模块，
 * 所以这里只负责把用户送过去，切不切、切哪个由用户在那页决定。
 *
 * ⚠️ 用 `navigateTo` 而**不是** `reLaunch`：
 *    navigateTo 会压栈，个人资料页左上角的返回能**回到来源页**
 *    （比如某个管理端页面），符合「返回来源页」的预期；
 *    reLaunch 会清空页面栈，返回键就无处可去。
 *
 * 真正切换身份后会由 store `reLaunch` 到对应端的落地页 —— 那里清空页面栈
 * 是**预期行为**（换工作台了，旧页面不该留在栈里）。
 */
export function goSwitchRole() {
  uni.navigateTo({ url: `/pages/mine/profile?_r=${Date.now()}` });
}