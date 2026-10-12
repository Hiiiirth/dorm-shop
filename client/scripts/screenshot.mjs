/**
 * 移动端视口截图工具（开发自用，不参与打包）
 * ---------------------------------------------------------------------------
 * 为什么需要它：本机无头 Chrome 的 `--window-size` 不生效，布局视口恒为 512×646，
 * 直接 --screenshot 出来的是「512 宽布局被裁成 390」，看着像布局溢出的假象。
 * 改用 CDP 的 Emulation.setDeviceMetricsOverride 才能真正模拟手机宽度。
 *
 * 用法：
 *   1) 先起 Chrome（带调试端口）：
 *      chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<临时目录> about:blank
 *   2) node scripts/screenshot.mjs <url> <输出png> [宽=390] [高=1400]
 */
import { writeFileSync } from 'node:fs';

const CDP_HOST = process.env.CDP_HOST || 'http://127.0.0.1:9222';
const [, , url, out, widthArg, heightArg, yArg, sliceArg] = process.argv;

if (!url || !out) {
  console.error('用法: node scripts/screenshot.mjs <url> <out.png> [width] [height] [yOffset] [sliceHeight]');
  process.exit(1);
}

const width = Number(widthArg) || 390;
const height = Number(heightArg) || 1400;
/** 长页面分片截图用：从 yOffset 开始，只截 sliceHeight 高 */
const yOffset = Number(yArg) || 0;
const sliceHeight = Number(sliceArg) || 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 找到调试端口上的页面 target
  let targets;
  for (let i = 0; i < 30; i += 1) {
    try {
      targets = await (await fetch(`${CDP_HOST}/json/list`)).json();
      if (targets.length) break;
    } catch {
      /* 端口还没起来，继续等 */
    }
    await sleep(300);
  }
  const page = targets?.find((t) => t.type === 'page');
  if (!page) throw new Error('没找到可用的 page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  // 关键：真正把视口设成手机宽度（deviceScaleFactor 2 = 高清截图）
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
  });

  await send('Page.navigate', { url });
  // 等网络空闲 + Vue 挂载 + 接口返回（uni-app 首屏要编译，给足时间）
  await sleep(6000);

  const layout = await send('Page.getLayoutMetrics');
  const cssHeight = Math.ceil(layout.cssContentSize?.height || height);
  const fullHeight = Math.min(Math.max(cssHeight, 200), 12000);

  const clipHeight = sliceHeight > 0 ? sliceHeight : fullHeight;
  const y = Math.min(yOffset, Math.max(0, fullHeight - clipHeight));

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y, width, height: clipHeight, scale: 1 },
  });

  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(
    `已保存 ${out}  页面总高 ${fullHeight}，本次截 y=${y} 高 ${clipHeight}（CSS px，2 倍图）`,
  );
  ws.close();
}

main().catch((err) => {
  console.error('截图失败:', err.message);
  process.exit(1);
});
