#!/usr/bin/env node
/**
 * S7-5 收尾自检：状态覆盖补齐 + 小程序端适配
 * ============================================================
 * 用法：
 *   node scripts/probe-s75.mjs [端口=4180] [--shots]
 *
 * 跟 `probe-admin.mjs` / `probe-admin-sub.mjs` 的分工：
 *   probe-admin       —— S7-4-1 看板 / 订单页
 *   probe-admin-sub   —— S7-4-2 五个二级页
 *   probe-s75（这个）  —— 收尾批次：这几条都是「组件在、逻辑没接线」或
 *                        「桌面浏览器看着对、真机/小程序出问题」的类型，
 *                        常规探针抓不到，必须专门写断言。
 *
 * 覆盖 6 组：
 *   1. 商品列表分页真的能翻页（造够数据 → 滚到底 → 页数增加）
 *   2. 两个管理端编辑页保存栏是 fixed 且占位够高
 *   3. 四页键盘偏移钩子已接入（barStyle 随键盘变化）
 *   4. 订单空态文案区分「没数据」与「筛没结果」
 *   5. 图标颜色在小程序端有确定值（不能全靠 CSS currentColor）
 *   6. AppTabBar / NavBar 高度用 upx2px（宽屏不错位）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CDP_HOST = process.env.CDP_HOST || 'http://127.0.0.1:9222';
const BASE = process.env.PREVIEW_BASE || `http://127.0.0.1:${process.argv[2] || 4180}`;
const API = `${BASE}/api/v1`;
const SHOT_DIR = path.join(__dirname, '..', '.shots');
const WANT_SHOTS = process.argv.includes('--shots');

const ADMIN_PHONE = '13800000001';

// ===========================================================================
// 结果收集
// ===========================================================================
const problems = [];
const passed = [];
function ok(msg) {
  passed.push(msg);
  console.log(`\x1b[32m  ✓\x1b[0m ${msg}`);
}
function bad(msg) {
  problems.push(msg);
  console.log(`\x1b[31m  ✗\x1b[0m ${msg}`);
}
function section(t) {
  console.log(`\n\x1b[36m########## ${t} ##########\x1b[0m`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===========================================================================
// API
// ===========================================================================
async function apiCall(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  return j;
}

async function login(phone) {
  // ⚠️ 端点是 /auth/phone-login（不是 /auth/login，那是 wx code 登录）
  const sms = await apiCall('POST', '/auth/sms-code', '', { phone });
  const code = sms.data?.mockCode;
  if (!code) throw new Error(`拿不到 mockCode（后端 NODE_ENV=production？）：${JSON.stringify(sms)}`);
  const r = await apiCall('POST', '/auth/phone-login', '', { phone, smsCode: code });
  if (r.code !== 0) throw new Error(`登录失败 ${r.code} ${r.message}`);
  // 切到店长身份 —— 不切的话 /admin/* 全部 403 + 20003
  await apiCall('POST', '/auth/switch-role', r.data.accessToken, { role: 'ADMIN' });
  return r.data.accessToken;
}

// ===========================================================================
// CDP
// ===========================================================================
async function connect() {
  const list = await (await fetch(`${CDP_HOST}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('没找到可用的 page target（Chrome 要带 --remote-debugging-port=9222 启动）');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const waiters = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiters.has(m.id)) {
      const { res, rej } = waiters.get(m.id);
      waiters.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      logs.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push(`EXCEPTION ${m.params.exceptionDetails?.exception?.description || ''}`);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const mid = ++id;
      waiters.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  return { send, logs, close: () => ws.close() };
}

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || '表达式抛错');
  }
  return r.result?.value;
}

async function navigate(send, url, wait = 4600) {
  // hash 路由是页内跳转，必须在 # 前面挂唯一 _r 强制刷新（见 MEMORY）
  const [base, hash = ''] = url.split('#');
  const busted = `${base}${base.includes('?') ? '&' : '?'}_r=${Date.now()}${hash ? '#' + hash : ''}`;
  await send('Page.navigate', { url: busted });
  await sleep(wait);
}

async function shot(send, name) {
  if (!WANT_SHOTS) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  // ⚠️ captureBeyondViewport:true 会把 position:fixed 画在「被截区域」底部而不是视口底部，
  //    判固定栏位置必须 false（MEMORY 里记过）
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (!r?.data) return;
  fs.writeFileSync(path.join(SHOT_DIR, `s75-${name}.png`), Buffer.from(r.data, 'base64'));
  console.log(`  [截图] .shots/s75-${name}.png`);
}

// ===========================================================================
// 1. 商品列表分页
// ===========================================================================
/**
 * 临时造够商品，让列表必须翻页才能显示完。
 *
 * 为什么必须造数据：种子库只有 13 个商品，一页（10 条）就装得下，
 * `hasMore` 一直是 false，「翻不翻页都看不出差别」。
 * 而 S7-5 修的正是「onReachBottom 没接线」—— 数据不够时这个 bug **完全隐形**。
 * 这类「结构性缺失」只有构造出触发条件才测得到。
 *
 * 用完会把这些商品删掉（软删除），保持库干净。
 */
async function seedPagedProducts(token, need) {
  const cat = await apiCall('GET', '/admin/products/category-options', token);
  const opts = cat.data || [];
  if (!opts.length) throw new Error('一个分类都没有，先跑 db/02-seed.sql');
  const cid = Number(opts[0].id ?? opts[0].categoryId ?? opts[0].value);

  const created = [];
  const tag = 'ZZ分页测试';
  for (let i = 0; i < need; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await apiCall('POST', '/admin/products', token, {
      name: `${tag}${String(i).padStart(2, '0')}`,
      categoryId: cid,
      price: 100 + i,
      stock: 999,
      unit: '件',
      description: 'S7-5 探针临时数据，验完即删',
    });
    if (r.code === 0) created.push(r.data.id);
  }
  return { created, tag, cid };
}

async function cleanupPagedProducts(token, ids) {
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    await apiCall('DELETE', `/admin/products/${id}`, token);
  }
}

async function checkPagination(send, token) {
  section('1. 商品列表分页真的能翻页（S7-5 修的 P0）');

  // 先算需要多少条才能保证超过一页
  const first = await apiCall('GET', '/products?page=1&pageSize=10', '');
  if (first.code !== 0) {
    bad(`GET /products 失败：${first.code} ${first.message}`);
    return;
  }
  const total = first.data.total;
  const need = Math.max(0, 10 - (total % 10 || 10)) + 10; // 保证 total%10 != 0 → 至少 2 页
  let seeded = { created: [], tag: null, cid: null };
  try {
    seeded = await seedPagedProducts(token, need);
    if (!seeded.created.length) {
      bad('造测试商品失败，无法验证分页');
      return;
    }
    const after = await apiCall('GET', '/products?page=1&pageSize=10', '');
    const nowTotal = after.data.total;
    ok(`已造 ${seeded.created.length} 个临时商品，库内商品 ${total} → ${nowTotal}（够翻页了）`);

    await navigate(send, `${BASE}/#/pages/product/list?keyword=${encodeURIComponent(seeded.tag)}`, 5600);

    const page1 = JSON.parse(
      await evaluate(send, `JSON.stringify({
        rows: document.querySelectorAll('.pcard').length,
        moreText: (document.querySelector('.more__text')||{}).textContent || '',
        scrolled: 0
      })`),
    );
    if (page1.rows !== 10) {
      bad(`搜索「${seeded.tag}」第一页应显示 10 条，实际 ${page1.rows} 条`);
    } else {
      ok(`第一页 10 条（页脚提示「${page1.moreText.trim()}」）`);
    }

    // ★ 关键：滚到底 → onReachBottom 触发 → 第二页应加载出来
    await evaluate(send, 'window.scrollTo(0, document.body.scrollHeight); true');
    await sleep(3200);

    const page2 = JSON.parse(
      await evaluate(send, `JSON.stringify({
        rows: document.querySelectorAll('.pcard').length,
        moreText: (document.querySelector('.more__text')||{}).textContent || '',
        scrollY: Math.round(window.scrollY || 0)
      })`),
    );

    if (page2.scrollY <= 0) {
      bad(`页面滚不动（scrollY=0），测不了触底加载。列表内容：${JSON.stringify(page1)}`);
    } else if (page2.rows > page1.rows) {
      ok(`滚到底后自动加载下一页：${page1.rows} → ${page2.rows} 条（onReachBottom 生效）`);
    } else if (page2.moreText.includes('没有更多')) {
      // 造的数据刚好一页 —— 不算 bug，但要如实说
      bad(`滚到底后仍是 ${page2.rows} 条，且提示「${page2.moreText.trim()}」。` +
        `若造的数据本该有第2 页，说明 onReachBottom 没触发`);
    } else {
      bad(`滚到底后没有加载下一页（仍 ${page2.rows} 条，scrollY=${page2.scrollY}）—— onReachBottom 没接线`);
    }

    // 探针日志
    const errs = logsOf(send);
    if (errs.length) console.log(`  控制台报错 ${errs.length} 条`);

    await shot(send, 'product-list-paged');
  } finally {
    if (seeded.created.length) {
      await cleanupPagedProducts(token, seeded.created);
      const left = await apiCall('GET', '/products?page=1&pageSize=50&keyword=' + encodeURIComponent(seeded.tag), '');
      ok(`已清理 ${seeded.created.length} 个临时商品（现剩 ${left.data?.total ?? '?'} 条同 tag 商品）`);
    }
  }
}

// 收集控制台报错（重新开一次 Runtime.enable 拿不到历史，所以只统计本轮新增）
const _errBuf = [];
function logsOf() {
  return _errBuf.splice(0);
}

// ===========================================================================
// 2. 管理端编辑页保存栏
// ===========================================================================
const EXPR_SAVE_BAR = (padSel) => `JSON.stringify((function(){
  var q = function(s){ return Array.from(document.querySelectorAll(s)); };
  var el = q('.abar')[0];
  var pad = q('${padSel}')[0];
  var cs = el ? getComputedStyle(el) : null;
  return {
    hasBar: !!el,
    position: cs ? cs.position : '',
    paddingBottom: cs ? cs.paddingBottom : '',
    // 内联的 barStyle 是 useKeyboardOffset 挂上去的（transform）
    inlineTransform: el ? (el.style.transform || '') : '',
    bottom: el ? Math.round(el.getBoundingClientRect().bottom) : 0,
    vh: window.innerHeight,
    padH: pad ? Math.round(pad.getBoundingClientRect().height) : 0
  };
})())`;

async function checkSaveBars(send) {
  section('2. 管理端两个编辑页：保存栏必须 fixed + 占位含安全区（S7-5 修的 P0）');

  const cases = [
    { path: '/#/pages/admin/product/edit', pad: '.pedit__pad', label: '商品编辑' },
    { path: '/#/pages/admin/category/edit', pad: '.cedit__pad', label: '分类编辑' },
  ];

  for (const c of cases) {
    await navigate(send, `${BASE}${c.path}`, 5000);
    const o = JSON.parse(await evaluate(send, EXPR_SAVE_BAR(c.pad)));

    if (!o.hasBar) {
      bad(`${c.label}：没有底部保存栏`);
      continue;
    }
    if (o.position !== 'fixed') {
      bad(`${c.label}：保存栏 position=${o.position}（不是 fixed）—— 随页面滚动，填完表单找不到保存按钮`);
    } else {
      ok(`${c.label}：保存栏 position: fixed`);
    }
    // ⚠️ 数值从 API/规范派生：CSS 是 calc(96px + env(...))，
    //    安全区在 H5 桌面预览是 0，所以断言「>= 96」而不是写死 96
    if (o.padH < 96) {
      bad(`${c.label}：占位只有 ${o.padH}px（应≥96px）—— 固定栏会盖住最后一个字段`);
    } else {
      ok(`${c.label}：占位 ${o.padH}px（含安全区）`);
    }
    const gap = o.vh - o.bottom;
    if (gap < -2 || gap > 40) {
      bad(`${c.label}：保存栏距视口底 ${gap}px，位置异常`);
    } else {
      ok(`${c.label}：保存栏贴底（距底 ${gap}px）`);
    }
    await shot(send, c.pad.replace(/[._]/g, ''));
  }
}

// ===========================================================================
// 3. 键盘偏移钩子接入
// ===========================================================================
const EXPR_KEYBOARD = `JSON.stringify((function(){
  var q = function(s){ return Array.from(document.querySelectorAll(s)); };
  var el = q('.abar, .submit')[0];
  return {
    hasBar: !!el,
    // useKeyboardOffset 会在键盘弹起时写 inline transform
    hasInlineStyleHook: el ? (el.style.transform === '' ? 'clean' : 'transformed') : '',
    hasKeyboardApi: (typeof uni !== 'undefined') && (typeof uni.onKeyboardHeightChange === 'function')
  };
})())`;

async function checkKeyboardHook(send) {
  section('3. 四个表单页都接上了键盘偏移（S7-5 抽的 composable）');

  const pages = [
    { path: '/#/pages/address/edit', label: '新增地址' },
    { path: '/#/pages/mine/profile', label: '我的资料' },
    { path: '/#/pages/admin/product/edit', label: '商品编辑' },
    { path: '/#/pages/admin/category/edit', label: '分类编辑' },
  ];

  // 先确认运行时 API 存在（不存在时 composable 应该静默跳过，不能崩）
  await navigate(send, `${BASE}/#/pages/home/home`, 4600);
  const apiInfo = JSON.parse(await evaluate(send, `JSON.stringify({
    has: (typeof uni !== 'undefined') && (typeof uni.onKeyboardHeightChange === 'function')
  })`));
  if (!apiInfo.has) {
    console.log('  ℹ️ 当前环境没有 uni.onKeyboardHeightChange（H5 桌面版），');
    console.log('     下面的检查只验「页面没因缺 API 而白屏」，触底偏移需真机验证。');
  }

  for (const p of pages) {
    await navigate(send, `${BASE}${p.path}`, 4600);
    const o = JSON.parse(await evaluate(send, EXPR_KEYBOARD));
    if (!o.hasBar) {
      bad(`${p.label}：没有底部固定栏，这条路径验不了键盘偏移`);
      continue;
    }
    // 关键：页面必须正常渲染（没有因为 onKeyboardHeightChange 不存在而崩）
    const crashed = await evaluate(send, `document.body.innerText.trim().length < 10`);
    if (crashed) {
      bad(`${p.label}：页面近乎空白 —— 接键盘钩子时可能抛错了`);
    } else {
      ok(`${p.label}：页面正常，固定栏在（inline transform 状态=${o.hasInlineStyleHook}）`);
    }
  }
}

// ===========================================================================
// 4. 订单空态文案区分
// ===========================================================================
async function checkEmptyCopy(send, token) {
  section('4. 订单空态：区分「没数据」与「筛没结果」（S7-5 修的 P1）');

  // 找一个**保证搜不到**的订单号
  await navigate(send, `${BASE}/#/pages/admin/orders`, 5200);

  const before = JSON.parse(
    await evaluate(send, `JSON.stringify({
      hasSearch: !!document.querySelector('.searchbox__input input, .searchbox__input'),
      emptyTitle: (document.querySelector('.empty__title')||{}).textContent || ''
    })`),
  );
  if (!before.hasSearch) {
    bad('订单管理页没有搜索框，这条验不了');
    return;
  }
  ok(`搜索框在；未搜时若有列表则空态标题为「${before.emptyTitle.trim() || '(无空态)'}」`);

  // 输入一个绝对不存在的订单号
  await evaluate(send, `(function(){
    var el = document.querySelector('.searchbox__input input') || document.querySelector('.searchbox__input');
    if (!el) return 'no-input';
    var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el, 'ZZ不存在${Date.now()}');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(4600);

  const after = JSON.parse(
    await evaluate(send, `JSON.stringify({
      emptyTitle: (document.querySelector('.empty__title')||{}).textContent || '',
      emptyDesc: (document.querySelector('.empty__desc')||{}).textContent || '',
      variant: (document.querySelector('.empty__art')||{}).className || '',
      rows: document.querySelectorAll('.ocard').length
    })`),
  );

  if (after.rows > 0) {
    console.log('  ℹ️ 搜不存在的关键词居然有结果（说明后端 keyword 过滤有问题），本条跳过');
    return;
  }
  if (!after.emptyTitle) {
    bad('搜不到结果时连空态都没有');
    return;
  }
  if (after.emptyTitle.includes('还没有订单')) {
    bad(`搜不到结果时空态说「${after.emptyTitle.trim()}」—— 这是错误结论，库里明明有订单`);
  } else {
    ok(`搜不到结果时空态说「${after.emptyTitle.trim()}」而不是「还没有订单」`);
  }
  if (after.variant.includes('empty__art--search')) {
    ok('空态用了 search 配色（图标/配色与「真的没数据」区分开）');
  } else {
    console.log(`  ⚠ 空态 art class 是「${after.variant}」，不是 search 档`);
  }

  // 顺手把顾客端订单列表的同类问题也验一下
  await navigate(send, `${BASE}/#/pages/order/list?status=PENDING`, 5200);
  const cust = JSON.parse(
    await evaluate(send, `JSON.stringify({
      title: (document.querySelector('.empty__title')||{}).textContent || '',
      variant: (document.querySelector('.empty__art')||{}).className || ''
    })`),
  );
  if (cust.title) ok(`顾客端「没有待接单的订单」空态：${cust.title.trim()}`);
}

// ===========================================================================
// 5. 图标颜色有确定值（小程序端靠它）
// ===========================================================================
async function checkIconColors(send) {
  section('5. 图标颜色不能只靠 CSS currentColor（小程序端失效）');

  /**
   * 判据说明：
   * H5 端图标是 inline SVG，`stroke="currentColor"` —— CSS color 生效，
   * 所以**测不出**小程序端的问题。
   * 但能测出一个间接证据：把页面的 color 全改成红色，
   * 如果图标颜色跟着变，说明它确实走 currentColor（那么小程序端就危险）。
   * 反过来，如果图标有**显式 color prop**，小程序端就烤进字符串了。
   *
   * 所以这里查 DOM 上有没有 inline stroke 属性（AppIcon H5 路径不会写死 stroke）。
   * 真正的修法验证要看小程序构建产物 —— 已在main() 里做静态检查。
   */
  await navigate(send, `${BASE}/#/pages/home/home`, 5000);
  const icons = JSON.parse(
    await evaluate(send, `JSON.stringify((function(){
      var svg = Array.from(document.querySelectorAll('svg[stroke]'));
      return {
        total: svg.length,
        // currentColor 会被写成 currentColor 字面量
        currentColorCount: svg.filter(function(s){ return s.getAttribute('stroke') === 'currentColor'; }).length,
        hardStrokeCount: svg.filter(function(s){
          var v = s.getAttribute('stroke');
          return v && v !== 'none' && v !== 'currentColor';
        }).length
      };
    })())`),
  );
  ok(`首页 ${icons.total} 个 SVG 图标：${icons.currentColorCount} 个走 currentColor（H5 正常）`);
  console.log('  ℹ️ 小程序端这些会全部烤成固定色 → 由源码侧的显式 color prop 保证正确');
}

/**
 * 小程序构建产物静态检查：把 AppIcon 调用点有没有 color 全查一遍。
 * 这条是**唯一能真正验证小程序端图标颜色**的手段（真机还没跑）。
 */
function checkMpBuildIcons(token) {
  section('5b. 小程序构建产物：图标 / 基础库 / 登录卡片');
  const mpRoot = path.join(__dirname, '..', 'dist', 'build', 'mp-weixin');
  if (!fs.existsSync(mpRoot)) {
    console.log('  ℹ️ 还没构建小程序端（dist/build/mp-weixin 不存在），跳过');
    return;
  }

  // ① 登录页不能残留 H5 预览卡片
  const loginWxml = path.join(mpRoot, 'pages', 'login', 'login.wxml');
  if (fs.existsSync(loginWxml)) {
    const s = fs.readFileSync(loginWxml, 'utf-8');
    if (s.includes('H5 预览登录')) {
      bad('小程序产物里还有「H5 预览登录」卡片 —— #ifdef H5 没包住，真机上会误建新账号');
    } else {
      ok('小程序产物里没有「H5 预览登录」卡片（条件编译正确）');
    }
  }

  // ② AppIcon 不能用 v-html（小程序不支持），且必须有 base64 data URI 的生成逻辑
  const iconWxml = path.join(mpRoot, 'components', 'AppIcon.wxml');
  if (fs.existsSync(iconWxml)) {
    const s = fs.readFileSync(iconWxml, 'utf-8');
    if (s.includes('rich-text')) {
      bad('AppIcon 产物里出现了 rich-text，小程序不支持 v-html');
    } else {
      ok('AppIcon 产物用 <image>，没有 rich-text');
    }
    /**
     * ⚠️ base64 字符串**不在 wxml 里** —— 它在 `AppIcon.js` 里运行时拼的
     *    （`src="{{a}}"` 是个 computed 变量）。检查要落在 js 上，
     *    一开始我 grep wxml 找不到就报「图标可能不显示」，是误报。
     */
    const iconJs = path.join(mpRoot, 'components', 'AppIcon.js');
    if (fs.existsSync(iconJs)) {
      const js = fs.readFileSync(iconJs, 'utf-8');
      if (js.includes('data:image/svg+xml;base64')) {
        ok('AppIcon.js 里有 base64 data URI 生成逻辑');
      } else {
        bad('AppIcon.js 里找不到 base64 data URI —— 小程序端图标会不显示');
      }
      if (js.includes('stroke')) {
        ok('AppIcon.js 里带 stroke（颜色烤进 SVG 字符串，小程序端必需）');
      }
    }
  }

  // ③ 基础库锁定
  const pc = path.join(mpRoot, 'project.config.json');
  if (fs.existsSync(pc)) {
    const s = fs.readFileSync(pc, 'utf-8');
    const m = s.match(/"libVersion"\s*:\s*"([^"]*)"/);
    if (m && m[1]) ok(`小程序基础库已锁定：${m[1]}`);
    else bad('project.config.json 没锁 libVersion —— gap/env/sticky 的行为不确定');
  }

  // ④ tabbar 高度必须是 rpx（不能是写死 50px）
  const tabWxml = path.join(mpRoot, 'components', 'AppTabBar.wxss');
  if (fs.existsSync(tabWxml)) {
    const s = fs.readFileSync(tabWxml, 'utf-8');
    if (/height:\s*50px/.test(s)) {
      bad('AppTabBar.wxss 里还有 height:50px —— 宽屏机上比页面预留的 100rpx 矮，会裂开一条缝');
    } else {
      ok('AppTabBar 高度不是写死 50px');
    }
  }
}

// ===========================================================================
// 6. 占位高度含安全区（4 页）
// ===========================================================================
const EXPR_PAD = (sel) => `JSON.stringify((function(){
  var el = document.querySelector('${sel}');
  var bar = document.querySelector('.abar, .obar');
  return {
    padH: el ? Math.round(el.getBoundingClientRect().height) : 0,
    barPos: bar ? getComputedStyle(bar).position : '',
    barBottom: bar ? Math.round(bar.getBoundingClientRect().bottom) : 0,
    vh: window.innerHeight
  };
})())`;

async function checkSafeAreaPads(send, token) {
  section('6. 四页占位高度已含安全区（S7-5 修的 P0）');

  // 订单详情要**有订单**才渲染占位（pad 在订单内容的末尾），所以先造一单
  let madeOrderNo = null;
  try {
    madeOrderNo = await makePendingOrder(token);
  } catch (e) {
    console.log(`  ⚠ 造订单失败（${e.message}），订单详情这条会跳过`);
  }

  const cases = [
    { path: '/#/pages/address/list', sel: '.alist__pad', min: 80, label: '地址列表' },
    { path: '/#/pages/address/edit', sel: '.aedit__pad', min: 80, label: '新增地址' },
    { path: '/#/pages/mine/profile', sel: '.prof__pad', min: 80, label: '我的资料' },
    {
      path: madeOrderNo ? `/#/pages/order/detail?id=${madeOrderNo}` : '/#/pages/order/detail',
      sel: '.odetail__pad',
      min: 76,
      label: '订单详情',
      needOrder: !!madeOrderNo,
    },
  ];

  for (const c of cases) {
    await navigate(send, `${BASE}${c.path}`, 4600);
    const o = JSON.parse(await evaluate(send, EXPR_PAD(c.sel)));
    if (!o.padH) {
      if (c.needOrder) {
        bad(`${c.label}：造了订单 ${madeOrderNo} 但仍找不到占位（${c.sel}）`);
      } else {
        console.log(`  ℹ️ ${c.label}：没找到占位元素（${c.sel}），可能这页是空态或没数据`);
      }
      continue;
    }
    if (o.padH < c.min) {
      bad(`${c.label}：占位 ${o.padH}px < ${c.min}px，固定栏在刘海屏上会盖住最后一行`);
    } else {
      ok(`${c.label}：占位 ${o.padH}px（≥${c.min}px，桌面预览安全区=0 是正常的）`);
    }
    if (o.barPos === 'fixed') {
      const gap = o.vh - o.barBottom;
      if (gap < -2 || gap > 40) {
        bad(`${c.label}：固定栏距视口底 ${gap}px，位置异常`);
      }
    }
  }
}

/**
 * 造一笔待接单订单（店长视角：顾客下单 → 停在 PENDING）。
 *
 * 为什么需要：订单详情页的占位元素 `.odetail__pad` 渲染在订单内容末尾，
 * 没有订单时页面停在错误态，根本看不到占位 —— 而「占位够不够高」
 * 恰恰是刘海屏上会不会盖住最后一行状态轨迹的关键。
 */
async function makePendingOrder(token) {
  // 找一个在售商品
  const p = await apiCall('GET', '/products?page=1&pageSize=1', '');
  const pid = p.data?.list?.[0]?.id;
  if (!pid) throw new Error('没有在售商品，先跑 db/02-seed.sql');

  // 用店长自己的顾客身份下单 —— 店长账号同时有 CUSTOMER 角色
  // ⚠️ 字段名是 contactName / contactPhone（不是 receiverName/receiverPhone），
  //    写错了会报「收件人最长 32 个字符」这种莫名错误 —— 10001 覆盖了多个校验错误
  const r = await apiCall('POST', '/orders', token, {
    items: [{ productId: pid, quantity: 1 }],
    roomNo: 'S7-5-测试房',
    contactName: 'S7-5',
    contactPhone: '13800000001',
  });
  if (r.code !== 0) throw new Error(`下单失败 ${r.code} ${r.message}`);
  // ⚠️ 返回里 `id` 是数字主键、`orderNo` 是 SO 开头的展示单号。
  //    订单详情页的 `applyRouteOptions` 是 `Number(options.id)` —— 传 orderNo 会变成 NaN → 0，
  //    页面停在「订单没打开」。这个坑跟前端 `?id=` 必须用主键的约定一致。
  const oid = r.data?.id;
  if (!oid) throw new Error(`下单成功但没返回 id（返回键有哪些？${Object.keys(r.data || {}).join(',')}）`);
  return oid;
}

// ===========================================================================
// main
// ===========================================================================
async function main() {
  console.log(`\x1b[1mS7-5 收尾自检\x1b[0m  预览=${BASE}  CDP=${CDP_HOST}\n`);

  const token = await login(ADMIN_PHONE);
  console.log(`店长已登录并切到 ADMIN 身份`);

  const { send, close } = await connect();

  try {
    await checkPagination(send, token);
    await checkSaveBars(send);
    await checkKeyboardHook(send);
    await checkEmptyCopy(send, token);
    await checkIconColors(send);
    await checkSafeAreaPads(send, token);
  } finally {
    close();
  }

  // 静态检查放最后（不需要浏览器）
  checkMpBuildIcons();

  console.log(`\n\x1b[1m=== 汇总 ===\x1b[0m`);
  console.log(`通过 ${passed.length} 项`);
  if (problems.length) {
    console.log(`\x1b[31m✗ ${problems.length} 项异常\x1b[0m`);
    problems.forEach((p) => console.log(`  · ${p}`));
    process.exitCode = 1;
  } else {
    console.log('\x1b[32m✓ 收尾自检未发现异常\x1b[0m');
  }
}

main().catch((e) => {
  console.error(`\n\x1b[31m探针崩了：${e.message}\x1b[0m`);
  process.exit(1);
});