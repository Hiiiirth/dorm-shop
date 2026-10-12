/**
 * 统一请求层
 * ---------------------------------------------------------------------------
 * 这个文件承载了和后端的全部约定，页面里不要再直接调 uni.request。
 *
 * 对齐后端响应规范：
 *   · 信封固定 `{ code, message, data, timestamp, traceId }`，code === 0 才算成功
 *   · **业务失败 = HTTP 200 + code != 0**（不是 4xx！）
 *   · 401 / 403 只用于鉴权失败，不用于业务错误
 *
 * 所以这里的分支是：
 *   1) HTTP 2xx 且 code === 0            -> resolve(body.data)
 *   2) HTTP 401 或 code 20001/20002      -> 用 refreshToken 续一次，成功就重放原请求
 *   3) HTTP 403 或 code 20003            -> 身份不对（currentRole 与接口不匹配），
 *                                          不续期，直接把错误抛给调用方引导切换身份
 *   4) 其它 HTTP 200 + code != 0         -> 业务失败，reject(BizError)
 *   5) 网络层失败                        -> reject(BizError, 90002)
 *
 * 续期做**并发去重**：同时发 5 个请求都撞上 401 时，只会真正刷新一次。
 */
import { API_BASE, REQUEST_TIMEOUT } from './config';
import { ErrorCode } from './constants';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './token';

/** 统一的业务错误对象，页面可以 `e.code` / `e.message` 精确处理 */
export class BizError extends Error {
  constructor(code, message, extra = {}) {
    super(message || '请求失败');
    this.name = 'BizError';
    this.code = code;
    this.http = extra.http;
    this.traceId = extra.traceId;
    this.data = extra.data;
  }
}

// --- 由 store 注入的钩子（避免 request.js 反向 import store 造成循环依赖）---
let onAuthExpired = null;
let onTokensRefreshed = null;

export function setAuthHandlers({ onExpired, onRefreshed } = {}) {
  if (onExpired) onAuthExpired = onExpired;
  if (onRefreshed) onTokensRefreshed = onRefreshed;
}

/** 生成 traceId，回显在后端响应的 traceId 里，排障时能一把捞出整条链路 */
function newTraceId(prefix = 'c') {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildHeader(cfg) {
  const header = { 'Content-Type': 'application/json', 'X-Request-Id': newTraceId() };
  // auth 默认 true；登录/注册这类接口显式传 auth:false
  const needAuth = cfg.auth !== false;
  if (needAuth) {
    const token = getAccessToken();
    if (token) header.Authorization = `Bearer ${token}`;
  }
  return { ...header, ...(cfg.header || {}) };
}

/**
 * 清理 GET/DELETE 的 query 参数
 *
 * 起因是一个真实踩过的坑：页面里习惯写
 *     catalogApi.products({ categoryId: categoryId.value || undefined, ... })
 * 想表达「这个筛选条件没传」。但 uni.request 对 GET 的 data 是**逐字段拼进 query**，
 * `undefined` 会被序列化成字面量 `categoryId=undefined`，后端 `@Type(() => Number)`
 * 一转就成了 `NaN`，`@IsInt` 直接判失败 → 10001「categoryId 必须大于 0」。
 * 表现是「页面什么都没干就报加载失败」，而且只在**不带这个筛选条件**时复现，很难查。
 *
 * 所以这里统一把 undefined / null 去掉。空字符串**保留** ——
 * 后端的 @IsOptional 字段见到空串会当成「没填」（applyFilters 里是 if (query.keyword)），
 * 去掉反而是多余的动作。
 */
function cleanQuery(method, data) {
  if (!data || typeof data !== 'object') return data;
  const m = (method || 'GET').toUpperCase();
  if (m !== 'GET' && m !== 'DELETE') return data;

  const out = {};
  for (const key of Object.keys(data)) {
    const v = data[key];
    if (v === undefined || v === null) continue;
    out[key] = v;
  }
  return out;
}

function once(options) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: API_BASE + options.url,
      method: options.method || 'GET',
      data: cleanQuery(options.method, options.data),
      timeout: options.timeout || REQUEST_TIMEOUT,
      header: buildHeader(options),
      success: resolve,
      fail: reject,
    });
  });
}

/** 需要走「续期后用新 token 重放」的情况 */
function isTokenExpired(http, code) {
  return http === 401 || code === ErrorCode.UNAUTHORIZED || code === ErrorCode.TOKEN_EXPIRED;
}

/** 身份不对（不是没登录，是当前身份没权限）—— 续期没用，要引导切身份 */
function isForbidden(http, code) {
  return http === 403 || code === ErrorCode.FORBIDDEN;
}

// 并发去重：同一时刻只会有一个真实的续期请求在飞
let refreshTask = null;

async function refreshTokens() {
  if (refreshTask) return refreshTask;

  refreshTask = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await once({
        url: '/auth/refresh',
        method: 'POST',
        data: { refreshToken },
        auth: false,
      });
      const body = res.data || {};
      const http = res.statusCode;
      if (http >= 200 && http < 300 && body.code === 0 && body.data && body.data.accessToken) {
        setTokens({
          accessToken: body.data.accessToken,
          refreshToken: body.data.refreshToken || refreshToken,
        });
        if (onTokensRefreshed) onTokensRefreshed(body.data);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      // 释放锁要在本次 Promise 结束之后，放到微任务尾部
      setTimeout(() => {
        refreshTask = null;
      }, 0);
    }
  })();

  return refreshTask;
}

function toast(message) {
  uni.showToast({ title: message, icon: 'none', duration: 2200 });
}

function redirectToLogin() {
  const pages = getCurrentPages();
  const current = pages.length ? pages[pages.length - 1].route : '';
  if (current === 'pages/login/login') return;
  uni.reLaunch({ url: '/pages/login/login' });
}

/**
 * 发请求
 * @param {object} cfg
 *   url     相对路径，如 '/home'（会自动拼 API_BASE）
 *   method  GET / POST / PUT / DELETE
 *   data    body 或 query
 *   auth    是否带 token，默认 true
 *   silent  业务失败时是否**不**弹 toast（默认 false，即默认会弹）
 *   loading 是否显示全屏 loading（默认 false）
 */
export async function request(cfg) {
  const showLoading = !!cfg.loading;
  if (showLoading) uni.showLoading({ title: '加载中', mask: true });

  try {
    return await send(cfg, false);
  } finally {
    if (showLoading) uni.hideLoading();
  }
}

async function send(cfg, retried) {
  let res;
  try {
    res = await once(cfg);
  } catch (err) {
    // 网络层失败（断网、域名不通、超时）
    if (!cfg.silent) toast('网络连接失败，请检查网络');
    throw new BizError(ErrorCode.SERVICE_UNAVAILABLE, '网络连接失败，请检查网络', {
      http: 0,
      data: err,
    });
  }

  const http = res.statusCode;
  const body = res.data && typeof res.data === 'object' ? res.data : {};
  const code = typeof body.code === 'number' ? body.code : ErrorCode.SERVER_ERROR;
  const message = body.message || '请求失败';
  const traceId = body.traceId || '';

  // 1) 成功
  if (http >= 200 && http < 300 && code === ErrorCode.SUCCESS) {
    return body.data === undefined ? null : body.data;
  }

  // 2) token 过期 -> 续期后重放一次（只重放一次，避免死循环）
  if (isTokenExpired(http, code) && !retried) {
    const ok = await refreshTokens();
    if (ok) return send(cfg, true);
    clearTokens();
    if (onAuthExpired) onAuthExpired();
    if (!cfg.silent) toast(ErrorCode.TOKEN_EXPIRED === code ? '登录已过期，请重新登录' : message);
    redirectToLogin();
    throw new BizError(code, message, { http, traceId, data: body.data });
  }

  // 3) 身份不对 —— 注意：**不要**续期、**不要**踢回登录页。
  //    用户是登录着的，只是当前身份（currentRole）打不了这个接口，
  //    引导他切身份即可。详见项目约定「身份 ≠ 登录」。
  if (isForbidden(http, code)) {
    if (!cfg.silent) toast('当前身份没有该权限，请先切换身份');
    throw new BizError(code, message, { http, traceId, data: body.data });
  }

  // 4) 其它业务失败（HTTP 200 + code != 0）
  if (!cfg.silent) toast(message);
  throw new BizError(code, message, { http, traceId, data: body.data });
}

// --- 语法糖 ---
export const http = {
  get: (url, data, opts) => request({ url, method: 'GET', data, ...opts }),
  post: (url, data, opts) => request({ url, method: 'POST', data, ...opts }),
  put: (url, data, opts) => request({ url, method: 'PUT', data, ...opts }),
  del: (url, data, opts) => request({ url, method: 'DELETE', data, ...opts }),
};

export default request;
