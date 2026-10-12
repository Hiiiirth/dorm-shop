/**
 * 运行时配置
 *
 * 接口基地址按端分流：
 *   · H5 开发态 —— 走 vite 代理（`/api` → 127.0.0.1:3000），同源，彻底绕开跨域
 *   · 小程序 / App —— 必须用绝对地址（小程序不支持相对路径，也不支持跨域）
 *
 * ============================ 小程序端真机调试 ============================
 * **小程序端目前还不能直接真机联调**，原因是一条链，缺一环都不行：
 *
 *   ① 这里的 `127.0.0.1` 在真机上是**手机自己**，不是你的电脑 → 必须改成电脑局域网 IP
 *      （Windows 执行 `ipconfig`，看「IPv4 地址」，例如 `192.168.1.20`）
 *   ② `http://` 不是 https。微信小程序正式版**强制要求 https 域名**，
 *      开发者工具里勾掉「不校验合法域名」才能用 http/ip 调试
 *   ③ `manifest.json` 的 `mp-weixin.appid` 现在是**空字符串**，
 *      编译出来是 `touristappid`（游客模式）→ **游客模式无法预览真机**，必须填自己的 appid
 *   ④ 正式发布时还要在 MP 后台配「服务器域名」白名单
 *
 * 所以下面这行是**开发期的占位值**，跑真机前按上面①~③ 改一遍。
 * 改动只影响非 H5 端，H5 端走代理不受影响。
 */

// #ifdef H5
export const API_BASE = '/api/v1';
// #endif

// #ifndef H5
export const API_BASE = 'http://127.0.0.1:3000/api/v1';
// #endif

/** 请求超时（毫秒） */
export const REQUEST_TIMEOUT = 15000;

/**
 * H5 预览用的固定登录 code
 * 原因：H5 没有 wx.login，只能走手机号 mock 登录；
 *      用固定 code 能让每次预览都是同一个账号，购物车 / 订单能连续看到。
 *      （后端 WX_MOCK_LOGIN=true 时，每次新的 code 都会新建一个账号「舍友XXXX」）
 */
export const H5_PREVIEW_CODE = 'h5-preview';

/** 本地存储 key */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'ws_access_token',
  REFRESH_TOKEN: 'ws_refresh_token',
  USER: 'ws_user',
};
