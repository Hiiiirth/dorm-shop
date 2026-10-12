/**
 * 设备信息
 *
 * 单独抽出来是因为**多个页面都要自绘导航栏**（pages.json 里全局
 * navigationStyle: custom），状态栏高度要测同一个值。
 * 各页各写一遍 getSystemInfoSync 的话，很容易有一处忘了 try/catch。
 */

let cache = null;

/**
 * 状态栏高度（px）
 *
 * 用 try/catch 是因为：小程序某些场景 getSystemInfoSync 会抛
 * （例如在 App.vue 的 onLaunch 之前被调用），而状态栏高度拿不到时
 * 退化成 0 也比整个页面白屏强。
 */
export function getStatusBarHeight() {
  if (cache !== null) return cache;
  try {
    const info = uni.getSystemInfoSync();
    cache = Number(info.statusBarHeight) || 0;
  } catch {
    cache = 0;
  }
  return cache;
}

/**
 * 底部安全区高度（px）
 *
 * `safeArea.bottom` 是「安全区底边距屏幕上沿的距离」，
 * 屏幕高度减掉它才是 home indicator 那一块的高度。
 * iPhone 上是 34px，Android 大多数是 0。
 */
export function getSafeAreaBottom() {
  try {
    const info = uni.getSystemInfoSync();
    const screenHeight = Number(info.screenHeight) || 0;
    const safeBottom = info.safeArea ? Number(info.safeArea.bottom) || 0 : 0;
    if (!screenHeight || !safeBottom) return 0;
    return Math.max(0, screenHeight - safeBottom);
  } catch {
    return 0;
  }
}
