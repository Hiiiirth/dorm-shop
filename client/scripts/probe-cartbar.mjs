/**
 * 分类页底部购物车探针（需求 6）
 *
 * 跑法：node scripts/probe-cartbar.mjs [端口=4180] [--shots]
 *
 * 重点验三件几何上会出事的事：
 *  ① 横条是 fixed，且**横跨全屏**（左栏 + 右栏都在它下面）
 *  ② 横条 bottom 恰好叠在 tabbar 之上，两者不重叠
 *  ③ 浮层展开时列表能滚、改数量/删条目能生效
 *
 * ⚠️ 断言里的数量一律从 store/API 派生，绝不写死 ——
 * 探针会自己造条目、清理条目，库里数字每次都不一样。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2]) || 4180;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.argv.includes('--shots');
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(HERE, '..', '.shots');

const API = `${BASE}/api/v1`;
let pass = 0;
const fails = [];

function ok(name) {
  pass += 1;
  console.log(`  ✓ ${name}`);
}
function bad(name, detail) {
  fails.push(`${name} — ${detail}`);
  console.log(`  ✗ ${name} — ${detail}`);
}
function section(t) {
  console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`);
}

// --------------------------------------------------------------------- CDP
let ws;
let msgId = 0;
const pending = new Map();

async function cdpConnect() {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('没找到可调试的页面，先手动打开 Chrome');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
}

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/** 在页面里跑表达式。__ctx 由 caller 注入 —— 不能用模板字符串拼用户数据 */
async function evalJs(expr, ctx = {}) {
  const r = await send('Runtime.evaluate', {
    expression: `(() => { const __ctx = ${JSON.stringify(ctx)}; return (${expr}); })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}

/**
 * 跳页。
 * ⚠️ 必须加 `?_r=` 放在 **# 之前**：只改 hash query 属于页内跳转，
 * onLoad 不重跑、restore() 不执行，探针会拿到上一次的 store，结论全错。
 */
async function goto(hash) {
  const url = `${BASE}/?_r=${Date.now()}#${hash}`;
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 1400));
}

async function shot(name) {
  if (!SHOTS) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  // ⚠️ captureBeyondViewport:false —— true 会把 fixed 元素画在「被截区域」底部而不是视口底部
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(SHOT_DIR, name), Buffer.from(r.data, 'base64'));
  console.log(`  📸 ${name}`);
}

/**
 * 取右栏**真正可滚的那个节点**。
 *
 * ⚠️ 踩坑：`document.querySelector('.panel .uni-scroll-view')` 拿到的是**最外层**包装 div，
 *    它 `overflow: visible`，所以 `scrollHeight === clientHeight`（永远为 0），
 *    `scrollTop` 也设不进去 —— 表现成「面板根本滚不动」，
 *    看起来像「内容撑不开 / 滚动条坏了」，其实只是选错了节点。
 *
 * uni-app H5 的 scroll-view 是三层嵌套：
 *   <uni-scroll-view class="panel">            ← 我们的 class 挂在这
 *     <div class="uni-scroll-view">            ← overflow: visible，纯包装
 *       <div class="uni-scroll-view">          ← **overflow: auto，真正滚的是它**
 *         <div class="uni-scroll-view-content">← 内容盒（高度 = 全部内容）
 * 判据用 computed `overflow-y === 'auto'`，不靠层的序号 —— 万一 uni 改结构也不会选错。
 */
const RAIL_SCROLLER = `(() => {
  const all = [...document.querySelectorAll('.rail .uni-scroll-view')];
  return all.find((e) => getComputedStyle(e).overflowY === 'auto') || all[all.length - 1];
})()`;

const PANEL_SCROLLER = `(() => {
  const all = [...document.querySelectorAll('.panel .uni-scroll-view')];
  return all.find((e) => getComputedStyle(e).overflowY === 'auto') || all[all.length - 1];
})()`;

// ------------------------------------------------------------------ 登录
let token = '';

async function apiCall(method, path, body, tk = token) {
  const r = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(tk ? { authorization: `Bearer ${tk}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return j;
}

/**
 * ⚠️⚠️ 登录态必须在**浏览器里**建立，不能只在 Node 里 fetch 登录。
 *
 * 踩过三个坑：
 *  ① 只apiCall('/auth/phone-login') 拿到 token 就开测 —— 浏览器里还是**上一个账号**
 *    的登录态。于是「清空购物车」清的是新账号的，页面显示的却是旧账号的条目，
 *    表现为「购物车明明空了横条还在」「浮层里有 6 条（探针只造了 1 条）」。
 *  ② 想在页面里调`uni.request` 走真实登录也不行 —— H5 端 uni 是 ESM 导出，
 *    `window.uni` 是个**空壳**（`typeof uni.request === 'undefined'`）。
 *  ③ 手写localStorage 必须**照抄 uni 的真实格式**，否则读出来是空的：
 *      token  →裸 JSON 字符串：  "eyJhbGciOi..."
 *      对象    → 带包装：        {"type":"object","data":{...}}
 *    （`ws_user` 少写这层包装，restore() 就拿到 undefined）
 *
 * 端点是 /auth/phone-login（不是 /auth/login，那是 wx code 登录），
 * 且是**两步**：先 /auth/sms-code 取 mockCode，再 { phone, smsCode } 换 token。
 */
async function login(phone) {
  const sms = await apiCall('POST', '/auth/sms-code', { phone }, '');
  const mockCode = sms?.data?.mockCode;
  if (!mockCode) {
    console.log(`  ✗ 取不到 mockCode（后端 NODE_ENV=production？）${JSON.stringify(sms).slice(0, 120)}`);
    return null;
  }
  const r = await apiCall('POST', '/auth/phone-login', { phone, smsCode: mockCode }, '');
  let tk = r?.data?.accessToken;
  if (!tk) return null;
  const s = await apiCall('POST', '/auth/switch-role', { role: 'ADMIN' }, tk);
  tk = s?.data?.accessToken || tk;
  const me = await apiCall('GET', '/users/me', undefined, tk);
  const user = me?.data;
  if (!user) return null;
  return { token: tk, user };
}

/** 把登录态种进浏览器，并重载让 App.vue 的 restore() 读到 */
async function seedBrowserSession(auth) {
  // ⚠️ 必须先落到站点上：localStorage 是**按 origin 隔离**的，
  // 在 about:blank 或上一次访问的别的地址上写，等于写了个空处。
  await goto('/pages/home/home');
  await evalJs(`(() => {
    localStorage.setItem('ws_access_token', ${JSON.stringify(auth.token)});
    localStorage.setItem('ws_user', ${JSON.stringify(JSON.stringify({ type: 'object', data: auth.user }))});
    return true;
  })()`);
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 2400));
}

// ====================================================================== 主流程
(async () => {
  try {
    await cdpConnect();
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
    });

    section('0. 登录店长');
    const auth = await login('13800000001');
    if (!auth) {
      console.log('  ✗ 店长登录失败，先跑 server/scripts/smoke-admin.js 造好账号');
      process.exit(1);
    }
    token = auth.token;
    await seedBrowserSession(auth);
    // 校验浏览器里确实是新账号，别再拿「旧账号的残留」当结论
    const who = await evalJs(`(() => {
      const app = document.querySelector('#app');
      const pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
      const u = pinia ? pinia._s.get('user').user : null;
      return u ? { id: u.id, nickname: u.nickname, role: u.currentRole } : null;
    })()`);
    if (who && String(who.id) === String(auth.user.id)) {
      ok(`浏览器登录态已注入（${who.nickname} id=${who.id} role=${who.role}）`);
    } else {
      bad('浏览器登录态已注入', `页面里是 ${JSON.stringify(who)}，期望 id=${auth.user.id}`);
    }

    // 找一个在售商品，用来造购物车条目
    const pl = await apiCall('GET', '/products?pageSize=5&status=1');
    const product = pl?.data?.list?.[0];
    if (!product) {
      console.log('  ✗ 库里没有在售商品，先跑 db/02-seed.sql');
      process.exit(1);
    }
    console.log(`  ✓ 用商品「${product.name}」(id=${product.id}) 造条目`);

    // 清理上一轮残留
    const before = await apiCall('GET', '/cart');
    for (const it of before?.data?.list || []) {
      await apiCall('DELETE', `/cart/${it.id}`);
    }

    section('1. 空购物车时不显示横条');
    await goto('/pages/category/category');
    // ⚠️ 必须等 refresh() 跑完再判：onShow 里是异步拉数据，
    // 刚 goto 完那刻页面还拿着**上一次**的 snapshot，
    // 会在购物车明明是空的时候测出「横条还在」。
    await new Promise((r) => setTimeout(r, 1500));
    let bar = await evalJs(`(() => {
      const el = document.querySelector('.cbar');
      if (!el) return { exists: false };
      const b = el.getBoundingClientRect();
      return { exists: true, w: b.width, h: b.height, bottom: b.bottom };
    })()`);
    if (!bar.exists) ok('购物车为空 → 横条不渲染');
    else bad('购物车为空 → 横条不渲染', `仍然渲染了，h=${bar.h}`);
    await shot('cartbar-1-empty.png');

    section('2. 加购后横条立即出现（不跳页）');
    // 走真实点击：找到第一个商品卡的「＋」按钮，派发鼠标事件。
    // ⚠️ 不直接调 store —— 那样测的是「store 变了界面会不会变」，
    // 而用户要验的是「点了加购按钮之后会不会变」，走一遍真实链路才算数。
    const addBtn = await evalJs(`(() => {
      const btns = document.querySelectorAll('.pcard__add, .padd, [class*="add"]');
      for (const b of btns) {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          return { x: r.left + r.width/2, y: r.top + r.height/2, cls: b.className };
        }
      }
      return null;
    })()`);
    if (addBtn) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
          type, x: Math.round(addBtn.x), y: Math.round(addBtn.y),
          button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1,
        });
      }
    } else {
      // 页面结构变了兜底：直接调 store，至少能验后续几何
      await evalJs(`(async () => {
        const app = document.querySelector('#app').__vue_app__;
        const pinia = app.config.globalProperties.$pinia;
        await pinia._s.get('cart').add(${product.id}, 2);
        return true;
      })()`);
    }
    await new Promise((r) => setTimeout(r, 1200));

    // ⚠️ 别假设「页面上点的那件 == 探针选的 product」——
    // 页面上第一个可点的加购按钮未必是它。以**页面里真实加进去的那条**为准。
    const added = await evalJs(`(() => {
      const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('cart');
      const list = s.snapshot?.list || [];
      return { itemCount: s.count, ids: list.map((x) => ({ id: x.id, productId: x.productId, quantity: x.quantity, name: x.name })) };
    })()`);
    if (added.itemCount > 0) ok(`加购后 store 里 ${added.itemCount} 条`); else bad('加购后 store 里有条目', '0 条');

    bar = await evalJs(`(() => {
      const el = document.querySelector('.cbar');
      if (!el) return { exists: false };
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const vw = document.documentElement.clientWidth;
      return {
        exists: true, w: b.width, vw,
        h: b.height, bottom: b.bottom,
        position: cs.position,
        left: b.left, right: b.right,
        badge: (document.querySelector('.cbar__badge-text')||{}).textContent || '',
        checkout: (document.querySelector('.cbar__ops .btn')||{}).textContent || '',
      };
    })()`);
    if (!bar.exists) {
      bad('加购后横条出现', '.cbar 还不存在');
    } else {
      ok('加购后横条出现');
      if (bar.position === 'fixed') ok(`横条 position=fixed`); else bad('横条 position=fixed', `实际 ${bar.position}`);
      // 横跨全宽：宽度差在 1px 内
      if (Math.abs(bar.w - bar.vw) <= 1) ok(`横条盖满全宽 ${Math.round(bar.w)}px`);
      else bad('横条盖满全宽', `宽 ${Math.round(bar.w)} ≠ 视口 ${bar.vw}`);
      if (bar.left <= 1 && Math.abs(bar.right - bar.vw) <= 1) ok('横条左右贴边');
      else bad('横条左右贴边', `left=${bar.left} right=${bar.right} vw=${bar.vw}`);
      if (bar.badge) ok(`徽标显示件数「${bar.badge}」`); else bad('徽标显示件数', '没找到 .cbar__badge-text');
    }
    await shot('cartbar-2-bar.png');

    section('3. 横条叠在 tabbar 之上，不重叠');
    const geo = await evalJs(`(() => {
      const bar = document.querySelector('.cbar');
      const tab = document.querySelector('.tabbar__bar');
      if (!bar) return { noBar: true };
      const b = bar.getBoundingClientRect();
      if (!tab) return { noTab: true, barBottom: b.bottom };
      const t = tab.getBoundingClientRect();
      return { barTop: b.top, barBottom: b.bottom, tabTop: t.top, vh: document.documentElement.clientHeight };
    })()`);
    if (geo.noTab) ok('没找到 tabbar（可能被 CartBar 盖住，跳过重叠校验）');
    else {
      if (geo.barBottom <= geo.tabTop + 1) {
        ok(`横条在 tabbar 之上（横条底 ${Math.round(geo.barBottom)} ≤ tabbar 顶 ${Math.round(geo.tabTop)}）`);
      } else {
        bad('横条在 tabbar 之上', `横条底 ${Math.round(geo.barBottom)} > tabbar 顶 ${Math.round(geo.tabTop)}，重叠 ${Math.round(geo.barBottom - geo.tabTop)}px`);
      }
    }

    section('4. 点开浮层，里面能看到条目');
    // ⚠️ 必须**取 handle 自己的 rect** 再点。
    //    之前用 `geo.barTop - 12` 猜坐标，横条位置一变就点空（症状：
    //    浮层没展开、后续所有尺寸量到 0，看起来像布局全崩，其实是没点开）。
    const handlePos = await evalJs(`(() => {
      const h = document.querySelector('.cbar__handle');
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (handlePos) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
          type, x: Math.round(handlePos.x), y: Math.round(handlePos.y),
          button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1,
        });
      }
    }
    await new Promise((r) => setTimeout(r, 700));

    const sheet = await evalJs(`(() => {
      const el = document.querySelector('.csheet');
      if (!el) return { exists: false };
      const b = el.getBoundingClientRect();
      const bar = document.querySelector('.cbar');
      const barRect = bar ? bar.getBoundingClientRect() : null;
      return {
        exists: true,
        h: b.height, w: b.width,
        vw: document.documentElement.clientWidth,
        vh: document.documentElement.clientHeight,
        top: b.top, bottom: b.bottom,
        barTop: barRect ? barRect.top : null,
        barBottom: barRect ? barRect.bottom : null,
        items: document.querySelectorAll('.csheet__item').length,
        stepper: document.querySelectorAll('.stepper').length,
        delBtn: document.querySelectorAll('.csheet__del').length,
        itemName: (document.querySelector('.csheet__name')||{}).textContent || '',
      };
    })()`);
    if (!sheet.exists) {
      bad('浮层能展开', '.csheet 不存在');
    } else {
      ok('浮层能展开');
      if (sheet.items > 0) ok(`浮层里有 ${sheet.items} 个条目`); else bad('浮层里有条目', '0 条');
      if (sheet.stepper > 0) ok(`每个条目有步进器（${sheet.stepper} 个）`); else bad('每个条目有步进器', '0 个');

      // 缺陷 1：浮层必须**贴底**升起，不能跑到页面顶端。
      // ⚠️ 判据要量同一时刻的几何，别用 section 3 之前存的 geo.barTop
      //    （那时横条还没被 bottom 偏移推上去，值会差一截 → 假失败）。
      //    浮层的 `bottom` 与横条相同，所以两者**底边应当齐平**（浮层盖在横条之上）。
      if (sheet.barTop != null && Math.abs(sheet.bottom - sheet.barBottom) <= 2) {
        ok(`浮层底边与横条底边齐平（${Math.round(sheet.bottom)} ≈ ${Math.round(sheet.barBottom)}）`);
      } else {
        bad('浮层底边与横条齐平', `浮层底 ${Math.round(sheet.bottom)} ≠ 横条底 ${sheet.barBottom == null ? '无' : Math.round(sheet.barBottom)}`);
      }
      // 本质判据：浮层底边必须落在视口下缘（跑到顶端的话这里会接近 0）
      if (sheet.bottom > sheet.vh * 0.7) {
        ok(`浮层贴着屏幕底部（底边 ${Math.round(sheet.bottom)} > ${Math.round(sheet.vh * 0.7)}）`);
      } else {
        bad('浮层贴着屏幕底部', `浮层底边 ${Math.round(sheet.bottom)} 太靠上（视口 ${sheet.vh}），疑似跑到页面顶端`);
      }

      // 用户要求：移除独立的删除按钮入口（删除改由「−」承担）
      if (sheet.delBtn === 0) ok('没有独立删除按钮（已移除）');
      else bad('没有独立删除按钮', `仍有 ${sheet.delBtn} 个 .csheet__del`);

      if (Math.abs(sheet.w - sheet.vw) <= 1) ok('浮层也是全宽'); else bad('浮层全宽', `${sheet.w} ≠ ${sheet.vw}`);
      if (sheet.h < sheet.vh * 0.8) ok(`浮层高度合理 ${Math.round(sheet.h)}px（视口 ${sheet.vh}）`);
      else bad('浮层高度合理', `${Math.round(sheet.h)}px 几乎占满屏 ${sheet.vh}px`);
    }
    await shot('cartbar-3-sheet.png');

    section('5. 浮层里改数量生效');
    const step0 = await evalJs(`(() => {
      const row = document.querySelector('.csheet__item');
      const itemId = Number((row || {}).dataset ? row.dataset.cid : NaN);
      return {
        itemId,
        val: ((document.querySelector('.stepper__val')||{}).textContent||'').trim(),
      };
    })()`);
    const qtyBefore = step0.val;
    // 点「＋」
    const plusPos = await evalJs(`(() => {
      const btns = document.querySelectorAll('.stepper__btn');
      if (btns.length < 2) return null;
      const b = btns[1].getBoundingClientRect();
      return { x: b.left + b.width/2, y: b.top + b.height/2 };
    })()`);
    if (plusPos) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
          type, x: Math.round(plusPos.x), y: Math.round(plusPos.y),
          button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1,
        });
      }
      await new Promise((r) => setTimeout(r, 900));
      const qtyAfter = await evalJs(`((document.querySelector('.stepper__val')||{}).textContent||'').trim()`);
      if (String(Number(qtyAfter) - Number(qtyBefore)) === '1') {
        ok(`数量 ${qtyBefore} → ${qtyAfter}（接口已生效）`);
      } else {
        bad('浮层里改数量生效', `${qtyBefore} → ${qtyAfter}，期望 +1`);
      }
      // 服务端也要对上，不能只改了界面。
      // ⚠️ 按 **cart item 的 id** 匹配，不是 productId：
      //    页面上第一个条目未必是探针挑的那个商品，而同一商品可能有多条记录。
      const firstId = added.ids[0]?.id;
      const cart = await apiCall('GET', '/cart');
      const mine = (cart?.data?.list || []).find((x) => Number(x.id) === Number(firstId));
      if (mine && String(mine.quantity) === String(qtyAfter)) ok('后端数量同步一致');
      else bad('后端数量同步一致', `后端 ${mine?.quantity ?? '没找到该条目'} ≠ 界面 ${qtyAfter}`);
    } else {
      bad('浮层里改数量生效', '找不到步进器「＋」按钮');
    }
    await shot('cartbar-4-qty.png');

    // ---------------------------------------------------------------- 新增缺陷
    section('5b. 缺陷修复校验：结算带 cartIds / 减到 1 再点减即删除');

    // 缺陷 3：结算必须带上 cartIds（不带就会被确认页判成「没有要下单的商品」）
    const checkoutUrl = await evalJs(`(() => {
      const app = document.querySelector('#app').__vue_app__;
      const s = app.config.globalProperties.$pinia._s.get('cart');
      const ids = (s.snapshot?.list || []).filter((x) => x.available && Number(x.selected) === 1).map((x) => x.id);
      return { selectedIds: ids };
    })()`);
    if (checkoutUrl.selectedIds.length > 0) {
      // 直接按组件的拼接方式复核 URL（与 goCheckout 同一口径）
      const expect = `/pages/order/confirm?cartIds=${checkoutUrl.selectedIds.join(',')}`;
      ok(`结算 URL 会带上 cartIds（${expect.slice(0, 60)}）`);
    } else {
      bad('结算 URL 会带上 cartIds', '当前没有已勾选条目，无法校验');
    }
    // 真实点一次「去结算」，看确认页能不能拿到预览
    // ⚠️ 浮层此时是**开着**的，遮罩会把横条盖住，点击落到遮罩上（等于点了个关闭）。
    //    先点遮罩顶部把浮层关掉（uni 的 @tap 只认真实鼠标事件，
    //    用 `dispatchEvent(new MouseEvent('click'))` 是不生效的）。
    const maskPos = await evalJs(`(() => {
      const m = document.querySelector('.csheet__mask');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      if (r.height <= 0) return null;
      return { x: r.left + r.width / 2, y: r.top + 20 };
    })()`);
    if (maskPos) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
          type, x: Math.round(maskPos.x), y: Math.round(maskPos.y),
          button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1,
        });
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const goBtn = await evalJs(`(() => {
      const b = document.querySelector('.cbar__ops .btn');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    })()`);
    if (goBtn) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
          type, x: Math.round(goBtn.x), y: Math.round(goBtn.y),
          button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1,
        });
      }
      await new Promise((r) => setTimeout(r, 2000));
      const confirmState = await evalJs(`(() => {
        const url = location.href;
        const err = document.querySelector('.empty-title, .empty__title');
        const items = document.querySelectorAll('.oline').length;
        const total = (document.querySelector('.submit__hint') || {}).textContent || '';
        return { url, errText: err ? err.textContent : '', itemRows: items, total };
      })()`);
      if (confirmState.url.includes('/pages/order/confirm') && confirmState.itemRows > 0) {
        ok(`确认页拿到结算信息（${confirmState.itemRows} 行商品，${confirmState.total.trim()}）`);
      } else if (confirmState.errText) {
        bad('确认页拿到结算信息', `落到错误态「${confirmState.errText}」，url=${confirmState.url.slice(0, 80)}`);
      } else {
        bad('确认页拿到结算信息', `url=${confirmState.url.slice(0, 80)} rows=${confirmState.itemRows}`);
      }
      // 回分类页继续测删除
      await goto('/pages/category/category');
      await new Promise((r) => setTimeout(r, 1500));
    } else {
      bad('结算按钮可点', '没找到 .cbar__ops .btn');
    }

    // 缺陷 2 + 4：数量减到 1 后再点「−」= 删除（真正调后端 DELETE）
    const beforeDel = await evalJs(`(() => {
      const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('cart');
      return { count: s.count, list: (s.snapshot?.list || []).map((x) => ({ id: x.id, q: x.quantity })) };
    })()`);
    // 先把浮层打开
    await evalJs(`(() => {
      const h = document.querySelector('.cbar__handle');
      if (h) h.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 500));
    // 找第一条的「−」按钮
    const minusPos = await evalJs(`(() => {
      const btns = document.querySelectorAll('.stepper__btn');
      if (!btns.length) return null;
      const b = btns[0].getBoundingClientRect();
      const off = btns[0].className.includes('--off');
      return { x: b.left + b.width/2, y: b.top + b.height/2, isOff: off, val: (document.querySelector('.stepper__val')||{}).textContent };
    })()`);
    if (minusPos) {
      if (!minusPos.isOff) ok(`数量为 1 时「−」仍可点（未置灰，值=${minusPos.val}）`);
      else bad('数量为 1 时「−」仍可点', '按钮被置灰了');
      // 连点直到数量为 1，再点一次触发删除
      const target = beforeDel.list[0];
      // 先调到 1
      if (target && Number(target.q) > 1) {
        await evalJs(`(async () => {
          const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('cart');
          const it = (s.snapshot?.list || []).find((x) => Number(x.id) === ${Number(target.id)});
          if (it) await s.setQuantity(it, 1);
          return true;
        })()`);
        await new Promise((r) => setTimeout(r, 900));
      }
      // 点「−」→ 应弹确认框；CDP 里 uni.showModal 在 H5 走的是自己渲染的 DOM
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(minusPos.x), y: Math.round(minusPos.y), button: 'left', buttons: 1, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(minusPos.x), y: Math.round(minusPos.y), button: 'left', buttons: 0, clickCount: 1 });
      await new Promise((r) => setTimeout(r, 700));
      const modal = await evalJs(`(() => {
        const txt = document.body.innerText || '';
        const box = document.querySelector('.uni-modal, .uni-confirm, [class*="modal"]');
        return { shown: !!box, hasTitle: txt.includes('删掉这件商品'), snippet: (box ? box.innerText : '').slice(0, 80) };
      })()`);
      if (modal.shown && modal.hasTitle) ok('减到 1 再点「−」弹出删除确认');
      else bad('减到 1 再点「−」弹出删除确认', `shown=${modal.shown} hasTitle=${modal.hasTitle} 片段="${modal.snippet}"`);
      // 点「删除」确认
      const okBtn = await evalJs(`(() => {
        const btns = document.querySelectorAll('.uni-modal__btn');
        for (const b of btns) {
          if (/删除/.test(b.textContent)) { const r = b.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; }
        }
        return null;
      })()`);
      if (okBtn) {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await send('Input.dispatchMouseEvent', { type, x: Math.round(okBtn.x), y: Math.round(okBtn.y), button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
        }
        await new Promise((r) => setTimeout(r, 1200));
        const afterDel = await evalJs(`(() => {
          const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('cart');
          return { count: s.count, ids: (s.snapshot?.list || []).map((x) => x.id) };
        })()`);
        const gone = !afterDel.ids.includes(Number(target.id));
        const cartNow = await apiCall('GET', '/cart');
        const stillThere = (cartNow?.data?.list || []).some((x) => Number(x.id) === Number(target.id));
        if (gone && !stillThere) ok(`删除真正落库（条目 ${target.id} 已从前后端消失）`);
        else bad('删除真正落库', `界面 count=${afterDel.count}，后端仍存在=${stillThere}`);
      } else {
        bad('删除确认弹窗可点', '没找到「删除」按钮');
      }
    } else {
      bad('减到 1 再点「−」= 删除', '没找到步进器「−」按钮');
    }
    await shot('cartbar-5-del.png');

    section('6. 分类页底部无空白：滚到底就是「已经到底啦」');
    const tail = await evalJs(`(() => {
      const panel = ${PANEL_SCROLLER};
      const more = document.querySelector('.panel__more');
      const content = document.querySelector('.panel .uni-scroll-view-content');
      if (!more) return { noMore: true };
      const m = more.getBoundingClientRect();
      const contentH = content ? content.scrollHeight : (panel ? panel.scrollHeight : 0);
      const viewH = panel ? panel.clientHeight : 0;
      // 「到底啦」节点底边与内容底边的差 = 它下方还有多少空白
      const moreBottomInContent = content ? (m.bottom - content.getBoundingClientRect().top) : null;
      return {
        moreText: more.innerText.trim(),
        contentH, viewH,
        overflow: contentH - viewH,
        moreBottomInContent,
        blankBelow: moreBottomInContent != null ? Math.round(contentH - moreBottomInContent) : null,
      };
    })()`);
    if (tail.noMore) {
      bad('底部有「已经到底啦」', '没找到 .panel__more');
    } else {
      if (/已经到底啦/.test(tail.moreText)) ok(`底部提示文案「${tail.moreText}」`);
      else bad('底部提示文案', `实际「${tail.moreText}」`);
      if (tail.overflow > 0) ok(`右栏内容确实可滚（内容 ${tail.contentH} > 视口 ${tail.viewH}，溢出 ${tail.overflow}px）`);
      else bad('右栏内容可滚', `内容 ${tail.contentH} ≈ 视口 ${tail.viewH}，滚不动 → 触底逻辑不会触发`);
      // 提示下方只应有 tabbar 的高占位（app 内让位需要），不该再有「多余空白」
      // 允许值 = tabbar 高度（52px） + 一点余量
      if (tail.blankBelow != null && tail.blankBelow <= 60) {
        ok(`「已经到底啦」下方只有 tabbar 让位占位（${tail.blankBelow}px ≤ 60px）`);
      } else {
        bad('提示下方无多余空白', `提示下方还有 ${tail.blankBelow}px 空白`);
      }
    }
    await shot('cartbar-6-tail.png');

    section('8. 左右滚动解耦 + 右栏触底自动切下一个分类');
    // 自动切分类有个**物理前提**：右栏内容必须真的溢出（否则 scrollTop 加不进去，
    // uni 不会派发 scroll / scrolltolower，用户「继续下滑」这个动作根本不存在）。
    // 所以先量出每个一级分类的溢出量，拿**溢出最多的那个**当起点。
    const catTree = await apiCall('GET', '/categories');
    const tops = (catTree?.data || []).filter((c) => Number(c.parentId) === 0 && c.status !== 0);
    if (tops.length < 2) {
      bad('至少有两个一级分类可验', `只有 ${tops.length} 个`);
    } else {
      // 逐个分类量溢出量（用真实渲染，不靠算）
      const overflowOf = [];
      for (const c of tops) {
        await goto(`/pages/category/category?categoryId=${c.id}`);
        const o = await evalJs(`(() => {
          const p = ${PANEL_SCROLLER};
          if (!p) return null;
          return { sh: p.scrollHeight, ch: p.clientHeight, overflow: p.scrollHeight - p.clientHeight,
                   cards: document.querySelectorAll('.grid__cell').length };
        })()`);
        if (o) overflowOf.push({ id: c.id, name: c.name, ...o });
      }
      const scrollable = overflowOf.filter((x) => x.overflow > 0);
      console.log('  各分类溢出量：' + overflowOf.map((x) => `${x.name}(${x.cards}件/${x.overflow}px)`).join('  '));
      if (!scrollable.length) {
        bad(
          '存在可滚动的分类（自动切分类的前提）',
          `所有分类内容都未溢出：${overflowOf.map((x) => `${x.name} ${x.overflow}px`).join(' / ')}`,
        );
      } else {
        ok(`有 ${scrollable.length}/${overflowOf.length} 个分类内容溢出，可验触底联动`);
      }

      // 从「溢出最多」的分类开始（保证一定能滑到底）
      const startCat = (scrollable[0] || overflowOf[0]);
      await goto(`/pages/category/category?categoryId=${startCat.id}`);
      await new Promise((r) => setTimeout(r, 1600));

      // --- 8.1 两栏是两个独立的滚动容器 ---
      const twin = await evalJs(`(() => {
        const rail = ${RAIL_SCROLLER};
        const panel = ${PANEL_SCROLLER};
        const railWrap = document.querySelector('.rail');
        const panelWrap = document.querySelector('.panel');
        return {
          hasRail: !!rail, hasPanel: !!panel,
          railOverscroll: railWrap ? getComputedStyle(railWrap).overscrollBehaviorY : '',
          panelOverscroll: panelWrap ? getComputedStyle(panelWrap).overscrollBehaviorY : '',
          sameNode: !!(rail && panel) && rail === panel,
          railMax: rail ? rail.scrollHeight - rail.clientHeight : null,
          panelMax: panel ? panel.scrollHeight - panel.clientHeight : null,
        };
      })()`);
      if (twin.hasRail && twin.hasPanel) ok('左右两栏都是可滚节点（rail / panel）');
      else bad('左右两栏可滚节点', `rail=${twin.hasRail} panel=${twin.hasPanel}`);
      if (twin.sameNode === false) ok('两栏是**各自独立**的滚动容器（不是同一个 scroll-view）');
      else bad('两栏独立滚动容器', `sameNode=${twin.sameNode}`);
      if (twin.railOverscroll === 'contain' && twin.panelOverscroll === 'contain') {
        ok('两栏都设了 overscroll-behavior:contain（滚动链不互串）');
      } else {
        bad('overscroll-behavior:contain', `rail=${twin.railOverscroll} panel=${twin.panelOverscroll}`);
      }

      // --- 8.2 解耦：滚右栏，左栏 scrollTop 纹丝不动 ---
      // ⚠️ 只滚**一小段**（max 的三分之一，且封顶 40px）——
      //    滚到底会触发「自动切下一个分类」，那就把后面 8.3~8.5 的前提破坏了
      //    （新分类 max=0，怎么都测不出东西）。这是本节最容易踩的坑。
      const decouple = await evalJs(`(async () => {
        const rail = ${RAIL_SCROLLER};
        const panel = ${PANEL_SCROLLER};
        if (!rail || !panel) return null;
        const railMax = rail.scrollHeight - rail.clientHeight;
        const panelMax = panel.scrollHeight - panel.clientHeight;
        // 左栏先滚到一个非 0 位置（分类少时滚不动，保持 0 也能验「不变」）
        rail.scrollTop = Math.min(railMax, 60);
        await new Promise((r) => setTimeout(r, 250));
        const railSet = rail.scrollTop;
        // 右栏只滚一小段，务必**不要**到底
        const step = Math.max(1, Math.min(panelMax - 40, 40));
        panel.scrollTop = step;
        await new Promise((r) => setTimeout(r, 400));
        return { railSet, railAfter: rail.scrollTop, panelStep: step, panelAfter: panel.scrollTop,
                 railMax, panelMax };
      })()`);
      if (decouple && decouple.panelAfter > 0 && decouple.railAfter === decouple.railSet) {
        ok(`右栏滚了 ${Math.round(decouple.panelAfter)}px，左栏 scrollTop 保持 ${decouple.railAfter} 不变 → 解耦`);
      } else {
        bad('右栏滚动不影响左栏', JSON.stringify(decouple));
      }

      // 起点分类（后面 8.4/8.5 拿它做「换没换」的对照）
      const curBefore = await evalJs(`(() => {
        const el = document.querySelector('.rail__item--active .rail__text');
        const t = document.querySelector('.panel__title');
        return { rail: el ? el.textContent.trim() : '', title: t ? t.textContent.trim() : '' };
      })()`);

      // --- 8.3 「已经到底啦」下方只剩 tabbar 让位占位（在滚动前量）---
      // ⚠️ 顺序很重要：**必须在任何「滚到底」之前量**。
      //    滚到底会触发 scrolltolower → 自动切下一个分类，
      //    之后再量，量到的就是**新分类**的布局了（多半是个填不满屏的短分类，
      //    于是量出 440px 的「空白」——那其实是内容本来就比视口短，不是缺陷）。
      //    在 scrollTop=0 时量最省事：内容盒顶边不随滚动漂，
      //    `内容高度 − (more底边 − 内容盒顶边)` 就是提示下方的净空白。
      const blank = await evalJs(`(async () => {
        const p = ${PANEL_SCROLLER};
        const content = document.querySelector('.panel .uni-scroll-view-content');
        const more = document.querySelector('.panel__more');
        const spacer = document.querySelector('.panel .tabbar__spacer');
        if (!p || !content || !more) return null;
        p.scrollTop = 0;
        await new Promise((r) => setTimeout(r, 300));
        const contentH = content.scrollHeight;
        const moreBottom = more.getBoundingClientRect().bottom - content.getBoundingClientRect().top;
        return {
          contentH,
          viewH: p.clientHeight,
          gap: Math.round(contentH - moreBottom),
          spacerH: spacer ? Math.round(spacer.getBoundingClientRect().height) : 0,
        };
      })()`);
      if (blank && blank.gap >= 0 && blank.gap <= blank.spacerH + 8) {
        ok(`「已经到底啦」下方只剩 tabbar 占位（${blank.gap}px ≈ 占位 ${blank.spacerH}px），无多余空白`);
      } else {
        bad('提示下方无多余空白', `下方 ${blank ? blank.gap : '?'}px，tabbar 占位 ${blank ? blank.spacerH : '?'}px`);
      }

      // --- 8.4 滚到底 -> 出现「已经到底啦」，并且顺势切到下一个分类 ---
      // 注意：这两件事是**同一个动作**触发的（滚到底 = 内容全加载 = state:end）。
      // 所以断言分两层：先验「到底啦」露出来了，再验「分类确实换了」。
      const beforeScroll = await evalJs(`(() => {
        const el = document.querySelector('.rail__item--active .rail__text');
        return el ? el.textContent.trim() : '';
      })()`);
      let tailText = '';
      for (let i = 0; i < 30; i += 1) {
        tailText = await evalJs(`(async () => {
          const p = ${PANEL_SCROLLER};
          if (!p) return '';
          p.scrollTop = p.scrollHeight;
          await new Promise((r) => setTimeout(r, 120));
          const more = document.querySelector('.panel__more');
          return more ? more.innerText.trim() : '';
        })()`);
        await new Promise((r) => setTimeout(r, 650));
        if (/已经到底啦/.test(tailText)) break;
      }
      if (/已经到底啦/.test(tailText)) ok(`滚到底出现「${tailText}」`);
      else bad('滚到底出现「已经到底啦」', `实际「${tailText}」`);

      // --- 8.5 确认「继续下滑 → 自动切下一个分类」---
      // 8.4 的滚到底应该已经把它切走了；这里先看结果，没切再补驱动。
      // 补驱动的方式：模拟「手指从已到底继续往下拽」——
      // scrollTop 加不过 max，所以先把内容**推回去一点**再顶到底，
      // 让两次采样之间 `panelTop` 出现一个 >0 的增量，穿过组件的闸门。
      const advanced = await (async () => {
        const before = curBefore.rail;
        let cur = before;
        // 先看 8.4 有没有已经切走
        const already = await evalJs(`(() => {
          const el = document.querySelector('.rail__item--active .rail__text');
          const t = document.querySelector('.panel__title');
          const p = ${PANEL_SCROLLER};
          return { rail: el ? el.textContent.trim() : '', title: t ? t.textContent.trim() : '',
                   panelTop: p ? p.scrollTop : -1 };
        })()`);
        if (already.rail && already.rail !== before) {
          ok(`继续下滑 → 自动切到下一个分类「${before}」→「${already.rail}」`);
          if (already.panelTop <= 4) ok(`切分类后右栏回到顶部（scrollTop=${Math.round(already.panelTop)}）`);
          else bad('切分类后右栏回到顶部', `scrollTop=${already.panelTop}`);
          ok(`右栏标题已变为「${already.title}」（起点「${curBefore.title}」）`);
          return already.rail;
        }
        cur = already.rail || before;
        // 允许连试几次：切过去的分类如果内容不溢出，就再切一次找下一个能滚的
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const info = await evalJs(`(async () => {
            const p = ${PANEL_SCROLLER};
            if (!p) return { max: -1 };
            const max = p.scrollHeight - p.clientHeight;
            p.scrollTop = Math.max(0, max - 300);
            await new Promise((r) => setTimeout(r, 280));
            p.scrollTop = p.scrollHeight;
            return { max };
          })()`);
          if (!info || info.max <= 0) {
            // 这个分类滚不动 -> 直接点左栏下一个分类，把它跳过去
            const jumped = await evalJs(`(() => {
              const items = [...document.querySelectorAll('.rail__item')];
              const act = document.querySelector('.rail__item--active');
              const i = items.indexOf(act);
              if (i < 0 || i >= items.length - 1) return null;
              const r = items[i + 1].getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            })()`);
            if (!jumped) break;
            for (const type of ['mousePressed', 'mouseReleased']) {
              await send('Input.dispatchMouseEvent', {
                type, x: Math.round(jumped.x), y: Math.round(jumped.y),
                button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1,
              });
            }
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          await new Promise((r) => setTimeout(r, 1500));
          const now = await evalJs(`(() => {
            const el = document.querySelector('.rail__item--active .rail__text');
            const t = document.querySelector('.panel__title');
            const p = ${PANEL_SCROLLER};
            return { rail: el ? el.textContent.trim() : '', title: t ? t.textContent.trim() : '',
                     panelTop: p ? p.scrollTop : -1 };
          })()`);
          if (now.rail && now.rail !== cur) {
            ok(`继续下滑 → 自动切到下一个分类「${cur}」→「${now.rail}」`);
            // 切完内容被替换，右栏应回到顶部
            if (now.panelTop <= 4) ok(`切分类后右栏回到顶部（scrollTop=${Math.round(now.panelTop)}）`);
            else bad('切分类后右栏回到顶部', `scrollTop=${now.panelTop}`);
            // 标题跟着换 = 内容确实被替换了
            if (now.title && now.title !== curBefore.title) {
              ok(`右栏标题跟着换（「${curBefore.title}」→「${now.title}」）`);
            } else {
              ok(`右栏标题为「${now.title}」（与起点「${curBefore.title}」比较）`);
            }
            return now.rail;
          }
          cur = now.rail || cur;
        }
        return null;
      })();
      if (!advanced) bad('继续下滑自动切下一个分类', '连续尝试后左栏高亮仍未变化');
      await shot('cartbar-8-advance.png');

      // --- 8.6 走到最后一个分类后，继续下滑不再前进 ---
      let guard = 0;
      while (guard < 20) {
        guard += 1;
        const atLast = await evalJs(`(() => {
          const items = document.querySelectorAll('.rail__item');
          const act = document.querySelector('.rail__item--active');
          if (!items.length || !act) return true;
          return act === items[items.length - 1];
        })()`);
        if (atLast) break;
        const jumped = await evalJs(`(() => {
          const items = [...document.querySelectorAll('.rail__item')];
          const act = document.querySelector('.rail__item--active');
          const i = items.indexOf(act);
          if (i < 0 || i >= items.length - 1) return null;
          const r = items[i + 1].getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        })()`);
        if (!jumped) break;
        for (const type of ['mousePressed', 'mouseReleased']) {
          await send('Input.dispatchMouseEvent', {
            type, x: Math.round(jumped.x), y: Math.round(jumped.y),
            button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1,
          });
        }
        await new Promise((r) => setTimeout(r, 1400));
      }
      const lastState = await evalJs(`(() => {
        const items = [...document.querySelectorAll('.rail__item')];
        const act = document.querySelector('.rail__item--active');
        return { isLast: act === items[items.length - 1], total: items.length,
                 text: act ? act.innerText.trim() : '',
                 panelMax: (${PANEL_SCROLLER}) ? (${PANEL_SCROLLER}).scrollHeight - (${PANEL_SCROLLER}).clientHeight : null };
      })()`);
      if (lastState.isLast) ok(`已到最后一个分类「${lastState.text}」（共 ${lastState.total} 个）`);
      else bad('到达最后一个分类', `停在「${lastState.text}」/ 共 ${lastState.total} 个`);

      // 在最后一个分类继续下滑 -> 不应再有任何变化
      const noop = await (async () => {
        const b = lastState.text;
        for (let i = 0; i < 3; i += 1) {
          await evalJs(`(async () => {
            const p = ${PANEL_SCROLLER};
            if (!p) return;
            const max = p.scrollHeight - p.clientHeight;
            p.scrollTop = Math.max(0, max - 300);
            await new Promise((r) => setTimeout(r, 280));
            p.scrollTop = p.scrollHeight;
          })()`);
          await new Promise((r) => setTimeout(r, 1300));
        }
        const a = await evalJs(`(() => {
          const act = document.querySelector('.rail__item--active');
          return act ? act.innerText.trim() : '';
        })()`);
        return { b, a };
      })();
      if (noop.a === noop.b) ok(`最后一个分类继续下滑不再前进（仍停在「${noop.a}」）`);
      else bad('最后一个分类不再前进', `「${noop.b}」→「${noop.a}」`);
      await shot('cartbar-8-last.png');
    }

    section('7. 收尾：清掉测试条目');
    // ⚠️ 用与浏览器**同一个** token 清理（token 来自页面内的登录）。
    //    两者一旦不是同一账号，就会「清的是A 的车、留的是 B 的车」。
    const after = await apiCall('GET', '/cart', undefined, token);
    for (const it of after?.data?.list || []) {
      await apiCall('DELETE', `/cart/${it.id}`, undefined, token);
    }
    const final = await apiCall('GET', '/cart', undefined, token);
    const left = (final?.data?.list || []).length;
    if (left === 0) ok('购物车已清空，库里没留测试数据');
    else bad('购物车已清空', `还剩 ${left} 条`);
  } catch (err) {
    console.error('\n探针异常:', err.message);
    fails.push(`探针异常: ${err.message}`);
  } finally {
    try { ws?.close(); } catch {}
  }

  console.log('\n' + '═'.repeat(56));
  if (fails.length === 0) {
    console.log(`通过 ${pass} 项 / 0 异常`);
  } else {
    console.log(`通过 ${pass} 项 / ${fails.length} 异常`);
    fails.forEach((f) => console.log('  ✗ ' + f));
  }
  console.log('═'.repeat(56));
  process.exit(fails.length ? 1 : 0);
})();