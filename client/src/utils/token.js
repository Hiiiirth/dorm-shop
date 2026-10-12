/**
 * token 存取 · 唯一权威来源
 *
 * 单独抽出来是为了打破循环依赖：
 *   request.js 需要 token，store/user.js 也需要 token，
 *   如果两者互相 import 就会成环。这里只依赖 storage，谁都能引。
 *
 * ⚠️ 必须持久化！后端 WX_MOCK_LOGIN=true 时，每次调 mock 登录都会**新建一个账号**，
 *    所以前端绝对不能每次启动都重新登录 —— 启动时先读 storage，再拿 token 调
 *    GET /users/me 校验。
 */
import { STORAGE_KEYS } from './config';

// 内存缓存：避免每次请求都同步读一遍 storage（小程序端 getStorageSync 是同步 IO）
let accessCache = null;
let refreshCache = null;
let loaded = false;

function load() {
  if (loaded) return;
  accessCache = uni.getStorageSync(STORAGE_KEYS.ACCESS_TOKEN) || '';
  refreshCache = uni.getStorageSync(STORAGE_KEYS.REFRESH_TOKEN) || '';
  loaded = true;
}

export function getAccessToken() {
  load();
  return accessCache;
}

export function getRefreshToken() {
  load();
  return refreshCache;
}

export function hasToken() {
  return !!getAccessToken();
}

export function setTokens({ accessToken, refreshToken }) {
  load();
  if (accessToken) {
    accessCache = accessToken;
    uni.setStorageSync(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  }
  if (refreshToken) {
    refreshCache = refreshToken;
    uni.setStorageSync(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  }
}

export function clearTokens() {
  accessCache = '';
  refreshCache = '';
  loaded = true;
  uni.removeStorageSync(STORAGE_KEYS.ACCESS_TOKEN);
  uni.removeStorageSync(STORAGE_KEYS.REFRESH_TOKEN);
  uni.removeStorageSync(STORAGE_KEYS.USER);
}
