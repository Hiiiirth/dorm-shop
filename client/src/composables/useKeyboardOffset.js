import { ref } from 'vue';

/**
 * 键盘弹起时把「固定在底部的操作栏」顶上去
 * ============================================================
 * 解决的问题：表单页有输入框 + 底部固定保存栏时，键盘弹起会**完全盖住保存按钮**。
 * 用户在 address/edit填完「门牌号」，抬头看不见「保存修改」，只能瞎划或回退 ——
 * 典型的「功能都在，但用户走不到最后一步」。
 *
 * 用法（页面里）：
 * ```js
 * const { keyboardHeight, barStyle } = useKeyboardOffset();
 * ```
 * ```vue
 * <view class="abar" :style="barStyle"> ... 保存按钮 ... </view>
 * ```
 *
 * ⚠️ 三个必须知道的坑（都是实测踩出来的）：
 *
 * 1. **必须用运行时 API `uni.onKeyboardHeightChange`**，
 *    不能 `import { onKeyboardHeightChange } from '@dcloudio/uni-app'` ——
 *    当前版本（3.x）**没有导出**那个组合式 hook，写了会直接构建失败。
 *
 * 2. **`typeof === 'function'` 的兜底不能省**。
 *    H5 端这个 API 可能不存在；App 端（如果以后上 App）签名也不同。
 *    不兜住就是白屏。
 *
 * 3. **必须在 `onUnload` 里`uni.offKeyboardHeightChange(listener)`**。
 *    运行时 API 返回一个 listener 句柄，页面销毁后不摘掉，回调会继续跑 ——
 *    表现是「返回上一页后，底栏莫名其妙往上抬了34px」。
 *
 * 另外 H5 端还有个额外收益：iOS Safari 的地址栏收起 / 键盘弹出时
 * `position: fixed` 元素的定位基准会变，用 `transform: translateY()` 而不是
 * 改 `bottom`，能避开这个坑（改 `bottom` 在 H5 上会抖）。
 */
export function useKeyboardOffset() {
  /** 当前键盘高度（px）。0 表示键盘已收起 */
  const keyboardHeight = ref(0);

  let listener = null;

  // H5 端：键盘弹起不改变 fixed 元素的定位基准，用 transform 平移最稳。
  // 小程序端：translateY 同样有效，且比改 bottom 少一次重排。
  const barStyle = ref('');

  function sync(h) {
    keyboardHeight.value = h;
    barStyle.value = h > 0 ? `transform: translateY(-${h}px);` : '';
  }

  function bind() {
    if (typeof uni.onKeyboardHeightChange !== 'function') return;
    try {
      listener = uni.onKeyboardHeightChange((res) => {
        sync(Number(res?.height) || 0);
      });
    } catch {
      listener = null;
    }
  }

  function unbind() {
    if (listener && typeof uni.offKeyboardHeightChange === 'function') {
      uni.offKeyboardHeightChange(listener);
    }
    listener = null;
    // 页面销毁时务必复位，否则下次进页面底栏是抬起来的
    sync(0);
  }

  bind();

  return { keyboardHeight, barStyle, unbindKeyboard: unbind };
}