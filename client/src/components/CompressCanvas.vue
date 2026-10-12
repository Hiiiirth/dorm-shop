<template>
  <!--
    压缩用的离屏画布（**只在微信小程序端渲染**）

    ── 为什么需要它 ─────────────────────────────────────────────────────────
    小程序没有「直接压缩图片」的 API。唯一路径是：
      临时文件 → 画到 <canvas> → canvasToTempFilePath 导出成新文件。
    而 `uni.createCanvasContext(canvasId)` **要求页面里真的存在这个 canvas 节点**，
    否则拿到的是个空上下文，draw() 之后导出的是**空白图**（不报错，静默失败）。

    ── 为什么要藏起来 ───────────────────────────────────────────────────────
    这个画布只是个中转站，用户不该看见。用 `position: fixed` +
    挪到屏幕外 + `opacity: 0` 三件套：
      · 不能用 `display: none` —— 隐藏的 canvas 在小程序里**拿不到绘图上下文**
      · 不能用 `visibility: hidden` —— 同理，部分基础库会拒绝绘制
      · 必须还在渲染树里、有真实尺寸
    所以是「移到屏幕外 + 全透明」而不是「不显示」。

    ── 尺寸为什么写死 800 ───────────────────────────────────────────────────
    canvas 的显示尺寸（CSS px）与导出尺寸（destWidth/destHeight）是两回事：
    我们传入 drawImage 的目标宽高，再按同样的值 destWidth/destHeight 导出，
    所以画布的 CSS 尺寸只要**够大**即可，不必等于图片尺寸。
    给 800x800 是为了覆盖 MAX_EDGE=800 的最坏情况（正方形图满幅）。
    ⚠️ 如果以后把 MAX_EDGE 调大，这里要同步调大，否则图会被裁掉一部分。
  -->
  <view class="ccv">
    <canvas
      :id="canvasId"
      :canvas-id="canvasId"
      class="ccv__node"
      :style="{ width: SIZE + 'px', height: SIZE + 'px' }"
    />
  </view>
</template>

<script setup>
/**
 * 压缩画布
 *
 * ⚠️ 一定要**每个用到压缩的页面都挂一个**，并且 id 唯一。
 *    id 重复时 `createCanvasContext` 拿到的是先找到的那个 ——
 *    如果那个页面同时在跑压缩，画出来的就是别人那张图（非常隐蔽的串图 bug）。
 *    所以 id 由调用方传入，默认值只是「只有一个页面用」时的便利。
 */
const props = defineProps({
  /** canvas 元素 id。同一页面多个上传控件时**必须各给一个唯一值** */
  canvasId: { type: String, default: 'compress-canvas' },
});

/** 与 utils/image.js 的 MAX_EDGE 对齐，见模板里的注释 */
const SIZE = 800;
void props;
</script>

<style lang="scss" scoped>
.ccv {
  position: fixed;
  /* 挪到视口外。用负值而不是 top:9999px，避免撑出滚动条 */
  left: -9999px;
  top: 0;
  width: 0;
  height: 0;
  overflow: hidden;
  /* 双保险：万一有基础库强行把它摆回视口，也是全透明的 */
  opacity: 0;
  pointer-events: none;
}

.ccv__node {
  display: block;
}
</style>
