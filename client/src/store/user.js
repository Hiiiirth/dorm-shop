/**
 * 用户 / 登录态 store
 * ---------------------------------------------------------------------------
 * 两条必须记住的约定：
 *
 * 1) **token 必须持久化**。后端 WX_MOCK_LOGIN=true 时每次 mock 登录都会新建账号，
 *    所以启动流程是「读 storage -> GET /users/me 校验」，绝不能每次启动重新登录。
 *
 * 2) **切身份必须重新签发 token**。守卫校验的是 token 里的 currentRole，
 *    只改本地 user.currentRole 而不写回新 token，后面所有请求都会 403 + 20003。
 */
import { defineStore } from 'pinia';
import { authApi } from '../api/auth';
import { userApi } from '../api/user';
import { STORAGE_KEYS, H5_PREVIEW_CODE } from '../utils/config';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from '../utils/token';
import { UserRole, ROLE_HOME, ROLE_LANDING } from '../utils/constants';

/** 把登录返回体统一落到 state + storage */
function toState(loginVo) {
  return {
    user: loginVo.user || null,
    accessToken: loginVo.accessToken || '',
    refreshToken: loginVo.refreshToken || '',
  };
}

export const useUserStore = defineStore('user', {
  state: () => ({
    /** 当前用户（后端 UserVo：不含 passwordHash / openid） */
    user: null,
    accessToken: '',
    refreshToken: '',
    /** 是否已完成一次启动恢复（用于控制「启动中」骨架屏） */
    booted: false,
    /** 正在切身份，用于禁用按钮防重复点击 */
    roleSwitching: false,
  }),

  getters: {
    isLogin: (s) => !!s.accessToken && !!s.user,
    currentRole: (s) => s.user?.currentRole || '',
    roles: (s) => s.user?.roles || [],

    isCustomer: (s) => s.user?.currentRole === UserRole.CUSTOMER,
    isAdmin: (s) => s.user?.currentRole === UserRole.ADMIN,

    /** 当前身份对应的工作台首页（自绘 tab 之间用 reLaunch 跳，见 pages.json） */
    roleHome: (s) => ROLE_HOME[s.user?.currentRole] || ROLE_HOME[UserRole.CUSTOMER],

    /** 「我的」页里可以切换到的其它身份 */
    switchableRoles: (s) =>
      (s.user?.roles || []).filter((r) => r !== s.user?.currentRole),

    nickname: (s) => s.user?.nickname || '未登录',
    defaultRoom: (s) => s.user?.defaultRoom || '',
    /**
     * 头像（v1.3 起是 base64 data URL，可能上百 KB）
     *
     * 注意这里**不**给默认值/占位 —— 空串就是「没头像」，
     * 由调用方用 `v-if` 决定是渲染 <image> 还是首字字标。
     * 给它塞个默认图反而会让「没设头像」和「设了头像」分不清。
     */
    avatar: (s) => s.user?.avatar || '',
  },

  actions: {
    // -----------------------------------------------------------------------
    // 登录
    // -----------------------------------------------------------------------
    /** 微信静默登录（小程序端） */
    async loginByWx(code) {
      const vo = await authApi.wxLogin(code);
      this.applyLogin(vo);
      return vo;
    },

    /** 手机号 + 验证码登录（店长必须走这条，种子账号没有 openid） */
    async loginByPhone(phone, smsCode) {
      const vo = await authApi.phoneLogin(phone, smsCode);
      this.applyLogin(vo);
      return vo;
    },

    /**
     * H5 预览专用登录
     * H5 没有 wx.login，用固定 code 走 mock 登录，保证每次预览都是同一个账号。
     */
    async loginForH5Preview() {
      const vo = await authApi.wxLogin(H5_PREVIEW_CODE);
      this.applyLogin(vo);
      return vo;
    },

    applyLogin(vo) {
      const next = toState(vo);
      this.user = next.user;
      this.accessToken = next.accessToken;
      this.refreshToken = next.refreshToken;
      setTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
      uni.setStorageSync(STORAGE_KEYS.USER, next.user);
    },

    // -----------------------------------------------------------------------
    // 启动恢复
    // -----------------------------------------------------------------------
    /**
     * App 启动时调用：先信 storage，再用 /users/me 验一次。
     * 校验失败（token 过期且续不回来）就静默清空，让用户停在未登录态，
     * 而不是反复弹错误。
     */
    async restore() {
      const cachedUser = uni.getStorageSync(STORAGE_KEYS.USER) || null;
      const token = getAccessToken();

      if (!token) {
        this.booted = true;
        return { restored: false, reason: 'no-token' };
      }

      // 先乐观恢复，界面能立刻渲染，不发白屏
      this.user = cachedUser;
      this.accessToken = token;
      this.refreshToken = getRefreshToken();

      try {
        const me = await userApi.me();
        this.user = me;
        uni.setStorageSync(STORAGE_KEYS.USER, me);
        this.booted = true;
        return { restored: true, user: me };
      } catch {
        // token 彻底失效（refresh 也没救回来）—— request 层已经清过 token 了
        this.reset();
        this.booted = true;
        return { restored: false, reason: 'token-invalid' };
      }
    },

    /** 主动刷新一次用户信息 */
    async refreshMe() {
      const me = await userApi.me();
      this.user = me;
      uni.setStorageSync(STORAGE_KEYS.USER, me);
      return me;
    },

    // -----------------------------------------------------------------------
    // 切身份
    // -----------------------------------------------------------------------
    /**
     * 切换当前身份。
     * ⚠️ 后端会返回**新的 token**，必须整组替换，否则守卫读到的还是旧身份。
     *
     * 切换成功后**必须 reLaunch**（不是 navigateTo）：
     *   ① 换了身份就换了工作台，旧页面（尤其管理端页面）不该留在栈里
     *   ② 顺便**清空页面栈**，避免用户按返回键回到「上一个身份的页面」
     *   ③ reLaunch 会重建目标页 → 底部 tab 在页面初始化时按**新身份**算出来，
     *      不需要额外的「通知 tab 刷新」机制（tab 是 `tabsOfRole(currentRole)` 的 computed）
     *
     * 落地页取 `ROLE_LANDING`（「我的」/「管理」）而不是 `ROLE_HOME`（首页），
     * 这样切完能立刻在卡片上看到新身份，见 constants.js 的说明。
     *
     * @param {string} role UserRole
     * @param {{ reLaunch?: boolean }} opts 默认切完跳该身份的落地页
     */
    async switchRole(role, opts = {}) {
      if (this.roleSwitching) return null;
      if (role === this.currentRole) return this.user;

      this.roleSwitching = true;
      try {
        const vo = await authApi.switchRole(role);
        // 先落 store + storage + 新 token，**再**跳页。
        // 顺序反了的话，目标页初始化时读到的还是旧身份 → tab 会算错。
        this.applyLogin(vo);

        if (opts.reLaunch !== false) {
          const url = ROLE_LANDING[role] || ROLE_LANDING[UserRole.CUSTOMER];
          uni.reLaunch({ url });
        }
        return vo.user;
      } finally {
        this.roleSwitching = false;
      }
    },

    // -----------------------------------------------------------------------
    // 退出 / 失效
    // -----------------------------------------------------------------------
    reset() {
      this.user = null;
      this.accessToken = '';
      this.refreshToken = '';
      clearTokens();
    },

    async logout() {
      try {
        await authApi.logout();
      } catch {
        // 退出接口失败也要把本地清干净，不能把用户卡在登录态
      }
      this.reset();
      uni.reLaunch({ url: '/pages/login/login' });
    },

    /** 由 request 层回调：token 彻底失效（续期也失败） */
    handleAuthExpired() {
      this.reset();
    },

    /** 由 request 层回调：静默续期成功，把新 token 同步进来 */
    handleTokensRefreshed(tokens) {
      if (!tokens) return;
      if (tokens.accessToken) this.accessToken = tokens.accessToken;
      if (tokens.refreshToken) this.refreshToken = tokens.refreshToken;
    },
  },
});
