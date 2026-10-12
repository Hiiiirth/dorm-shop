/**
 * 认证相关接口
 *
 * 路径与入参严格对齐后端 src/modules/auth/auth.controller.ts。
 * 注意 `auth: false` 的接口不要带 token —— 尤其是 /auth/refresh，
 * 带着过期 token 去续期会打回自己。
 */
import { http } from '../utils/request';

export const authApi = {
  /** 微信静默登录（小程序端用；H5 无 wx.login 走不了） */
  wxLogin: (code) => http.post('/auth/login', { code }, { auth: false, silent: true }),

  /** 发送短信验证码（开发环境响应里会带 mockCode，方便自测） */
  sendSmsCode: (phone) => http.post('/auth/sms-code', { phone }, { auth: false }),

  /** 手机号 + 验证码登录 */
  phoneLogin: (phone, smsCode) =>
    http.post('/auth/phone-login', { phone, smsCode }, { auth: false, silent: true }),

  /** 刷新 accessToken */
  refresh: (refreshToken) =>
    http.post('/auth/refresh', { refreshToken }, { auth: false, silent: true }),

  /**
   * 切换当前身份 —— 会返回**新的一组 token**。
   * 调用方必须把新 token 写回 storage + store，否则后续请求
   * 守卫读到的还是旧身份，全部 403 + 20003。
   */
  switchRole: (role) => http.post('/auth/switch-role', { role }),

  logout: () => http.post('/auth/logout', undefined, { silent: true }),

  /** 当前登录态资料（走 token，不需要额外参数） */
  profile: () => http.get('/auth/profile', undefined, { silent: true }),
};
