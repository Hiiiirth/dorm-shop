/**
 * 元素级放大截图（开发自用，不参与打包）
 * ---------------------------------------------------------------------------
 * 为什么需要它：整页截图缩略之后，1~2px 的间距问题根本看不出来，
 * 很容易把「其实没问题」看成「重叠了」，或者反过来漏掉真的重叠。
 * 这个脚本用 CDP 的 clip + scale 直接把某个元素渲染成 4 倍图，
 * 不用装 Pillow，也不依赖系统截图工具。
 *
 * 前置：
 *   1) node scripts/serve-dist.mjs 4180
 *   2) chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp> about:blank
 *
 * 用法：
 *   node scripts/shot-el.mjs <url> <selector> [scale=4] [out.png]
 *   例：node scripts/shot-el.mjs "http://127.0.0.1:4180/#/pages/category/category" ".grid__cell .pcard__foot"
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CDP_HOST = process.env.CDP_HOST || 'http://127.0.0.1:9222';
const [url, selector, scaleArg, outArg] = process.argv.slice(2);
if (!url || !selector) {
  console.error('用法: node scripts/shot-el.mjs <url> <selector> [scale=4] [out.png]');
  process.exit(2);
}
const scale = Number(scaleArg) || 4;
const out = outArg || 'D:/wechatseller/.workbuddy/shots/el.png';
// 元素外面多留一点边，好看清和邻居之间的间距
const PAD = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  let targets;
  for (let i = 0; i < 40; i += 1) {
    try {
      targets = await (await fetch(`${CDP_HOST}/json/list`)).json();
      if (targets.length) break;
    } catch {
      /* 等 Chrome */
    }
    await sleep(300);
  }
  const page = targets?.find((t) => t.type === 'page');
  if (!page) throw new Error('没找到 page target，Chrome 起来了吗？');

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
  return { send, close: () => ws.close() };
}

async function main() {
  const { send, close } = await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });

  await send('Page.navigate', { url });
  await sleep(4500);

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height, text: el.innerText };
    })()`,
    returnByValue: true,
  });
  const box = res.result?.value;
  if (!box) throw new Error(`页面里没有 ${selector}`);

  // 目标区域明确 -> 用 clip + scale 直接渲染成放大图（比放大已截图清晰）
  const clip = {
    x: Math.max(0, box.x - PAD),
    y: Math.max(0, box.y - PAD),
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
    scale,
  };
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip,
  });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`选中元素: ${selector}`);
  console.log(`尺寸: ${box.width.toFixed(1)} × ${box.height.toFixed(1)}  放大: ${scale}x`);
  console.log(`文字: ${JSON.stringify((box.text || '').replace(/\s+/g, ' '))}`);
  console.log(`→ ${out}`);
  close();
}

main().catch((err) => {
  console.error('截图失败:', err.message);
  process.exit(2);
});
