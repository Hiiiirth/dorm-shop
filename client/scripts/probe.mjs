/**
 * 页面 DOM 探针（开发自用，不参与打包）
 *
 * 用途：改完 UI 想确认「某个元素到底有没有渲染出来」时，比截图更靠谱 ——
 * 截图只能靠眼睛，这个直接数元素、读文本、抓控制台报错。
 *
 * 前置：先起带调试端口的 Chrome（和 screenshot.mjs 共用同一个实例即可）
 *   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<临时目录> about:blank
 *
 * 用法：
 *   node scripts/probe.mjs <url> <要执行的JS表达式> [等待毫秒=4000]
 *
 * 例：
 *   node scripts/probe.mjs http://127.0.0.1:5173/#/pages/dev/icon-probe \
 *     "JSON.stringify({svg:document.querySelectorAll('svg').length})"
 */
const CDP_HOST = process.env.CDP_HOST || 'http://127.0.0.1:9222';
const [, , url, expr, waitArg] = process.argv;

if (!url || !expr) {
  console.error('用法: node scripts/probe.mjs <url> <js表达式> [等待毫秒]');
  process.exit(1);
}

const wait = Number(waitArg) || 4000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let targets;
  for (let i = 0; i < 30; i += 1) {
    try {
      targets = await (await fetch(`${CDP_HOST}/json/list`)).json();
      if (targets.length) break;
    } catch {
      /* 等 Chrome 起来 */
    }
    await sleep(300);
  }
  const page = targets?.find((t) => t.type === 'page');
  if (!page) throw new Error('没找到可用的 page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const logs = [];
  let seq = 0;

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    // 收集页面控制台报错 —— 组件渲染炸了这里能看到
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      logs.push(
        `[${msg.params.type}] ` +
          msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '),
      );
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      logs.push(`[exception] ${msg.params.exceptionDetails?.exception?.description ?? '?'}`);
    }
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

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 1400,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Page.navigate', { url });
  await sleep(wait);

  const res = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });

  console.log('=== 表达式结果 ===');
  console.log(JSON.stringify(res.result?.value ?? res.result, null, 2));
  if (res.exceptionDetails) {
    console.log('=== 表达式抛错 ===');
    console.log(res.exceptionDetails.exception?.description || JSON.stringify(res.exceptionDetails));
  }
  if (logs.length) {
    console.log('=== 页面控制台（error/warning）===');
    console.log(logs.slice(0, 40).join('\n'));
  } else {
    console.log('=== 页面控制台干净（无 error/warning）===');
  }
  ws.close();
}

main().catch((err) => {
  console.error('探针失败:', err.message);
  process.exit(1);
});
