/**
 * S7-4 管理端页面探针（开发自用，不参与打包）
 * ---------------------------------------------------------------------------
 * 为什么不用 probe.mjs 逐个跑：
 *   probe.mjs 每次调用都会 `Page.navigate`，没法在导航**之前**往 localStorage 写登录态。
 *   管理端三个页面的第一道门是 `isAdmin`，storage 空 → 直接停在守卫态，什么都测不到。
 *   所以这个脚本一次连上 CDP，先落到站点写 token，再逐页导航 + 求值。
 *
 * 前置：
 *   1. 后端在 3000
 *   2. `node scripts/serve-dist.mjs <端口>` 已起（自带 /api 反代）
 *   3. Chrome 带 --remote-debugging-port=9222 在跑
 *
 * 用法：
 *   node scripts/probe-admin.mjs <预览端口=4182>
 */
const PORT = Number(process.argv[2]) || 4182;
const BASE = `http://127.0.0.1:${PORT}`;
const API = 'http://127.0.0.1:3000/api/v1';
const CDP_HOST = process.env.CDP_HOST || 'http://127.0.0.1:9222';
const ADMIN_PHONE = '13800000001';
const CUSTOMER_PHONE = '13800000003';

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeClient(ws) {
  const pending = new Map();
  let seq = 0;
  const logs = [];

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
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

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { send, takeLogs: () => logs.splice(0) };
}

async function evaluate(send, expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    return { __error: res.exceptionDetails.exception?.description ?? JSON.stringify(res.exceptionDetails) };
  }
  // 返回值保持原样（多数表达式自带 JSON.stringify，调用方按字符串处理）
  return res.result?.value;
}

async function navigate(send, url, wait = 4500) {
  // ⚠️ uni-app 是 hash 路由：`/#/a` → `/#/b` 属于**页内跳转**，
  //    浏览器不会重新加载文档，App.vue 的 userStore.restore() 也就不会重跑，
  //    store 会残留上一次的登录态 → 探针结果全是假的。
  //    所以每次导航都在 `#` **前面**挂一个唯一的 `?_r=`，强制整页刷新。
  //    （这个坑在记忆里也记着：项目里所有带参页都得靠 _r 破缓存）
  const [base, hash = ''] = url.split('#');
  const busted = `${base}${base.includes('?') ? '&' : '?'}_r=${Date.now()}${hash ? '#' + hash : ''}`;
  await send('Page.navigate', { url: busted });
  await sleep(wait);
}

/** 手机号登录：先取验证码（开发环境接口会回传 mockCode），再换 token */
async function login(phone) {
  const smsRes = await fetch(`${API}/auth/sms-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const smsBody = await smsRes.json();
  if (smsBody.code !== 0) throw new Error(`取验证码失败 code=${smsBody.code} ${smsBody.message}`);
  const mockCode = smsBody.data?.mockCode;
  if (!mockCode) throw new Error('接口没回传 mockCode（后端 NODE_ENV=production？），无法自动登录');

  const res = await fetch(`${API}/auth/phone-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, smsCode: mockCode }),
  });
  const body = await res.json();
  if (body.code !== 0) throw new Error(`登录失败 code=${body.code} ${body.message}`);
  return body.data;
}

// ---------------------------------------------------------------- 探针表达式
// 类名必须和 pages/admin/*.vue、components/*.vue 里写死的完全一致
const EXPR = {
  dashboard: `JSON.stringify((() => {
    const q = (s) => Array.from(document.querySelectorAll(s));
    const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
    const tabs = q('.tabbar__item');
    return {
      route: location.hash,
      tabLabels: tabs.map(txt),
      activeTab: txt(tabs.find(function(t){return t.classList.contains('tabbar__item--active');})),
      guard: q('.empty').length > 0,
      guardTitle: txt(q('.empty__title')[0]),
      skeleton: q('.dash__skrow').length,
      revenue: txt(q('.rev__amount')[0]),
      revenueHint: txt(q('.rev__hint')[0]),
      mismatch: txt(q('.notice--warn .notice__text')[0]),
      metrics: q('.metric').map(function(m){
        var mm = m.className.match(/metric--([a-zA-Z]+)/);
        return {
          key: mm ? mm[1] : '',
          label: txt(m.querySelector('.metric__label')),
          value: txt(m.querySelector('.metric__value'))
        };
      }),
      pendingRows: q('.prow').length,
      pendingFirst: txt(q('.prow')[0]),
      pendingMore: txt(q('.more .more__text')[0]),
      hot: q('.hrow').map(txt),
      totals: q('.total').map(function(t){
        return { num: txt(t.querySelector('.total__num')), label: txt(t.querySelector('.total__label')) };
      }),
      icons: q('svg').length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight
    };
  })())`,

  orders: `JSON.stringify((() => {
    const q = (s) => Array.from(document.querySelectorAll(s));
    const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
    const tabs = q('.tabbar__item');
    const cards = q('.ocard');
    return {
      route: location.hash,
      tabLabels: tabs.map(txt),
      activeTab: txt(tabs.find(function(t){return t.classList.contains('tabbar__item--active');})),
      guard: q('.empty').length > 0,
      guardTitle: txt(q('.empty__title')[0]),
      segs: q('.tab').map(function(t){
        return {
          label: txt(t.querySelector('.tab__text')),
          count: txt(t.querySelector('.tab__count')),
          on: t.classList.contains('tab--on'),
          h: Math.round(t.getBoundingClientRect().height),
          textH: t.querySelector('.tab__text') ? Math.round(t.querySelector('.tab__text').getBoundingClientRect().height) : 0
        };
      }),
      inner: (function(){
        var el = q('.tabs__inner')[0];
        return el ? { scrollW: el.scrollWidth, clientW: el.clientWidth } : null;
      })(),
      chips: q('.chip').map(txt),
      cardCount: cards.length,
      cards: cards.slice(0, 6).map(function(c){
        var tg = c.querySelector('.tag');
        var vm = tg ? (tg.className.match(/tag--([a-zA-Z]+)/) || [])[1] : '';
        return {
          status: txt(c.querySelector('.tag__text')),
          tagVariant: vm,
          tagHasIcon: !!(c.querySelector('.tag__icon svg') || c.querySelector('.tag__icon image') || c.querySelector('.tag__icon uni-image')),
          who: txt(c.querySelector('.ocard__name')),
          phone: txt(c.querySelector('.ocard__phone')),
          goods: txt(c.querySelector('.ocard__goods')),
          meta: txt(c.querySelector('.ocard__meta')),
          btns: Array.prototype.map.call(c.querySelectorAll('.ocard__ops-main .btn'), function(b){
            return {
              label: txt(b),
              primary: b.classList.contains('btn--primary'),
              cls: b.className
            };
          }),
          done: txt(c.querySelector('.ocard__done')),
          moreBtn: !!c.querySelector('.ocard__more-btn')
        };
      }),
      rawPhoneLeak: Array.prototype.map.call(document.querySelectorAll('.ocard__phone'), txt)
        .filter(function(t){ return /^1[0-9]{10}$/.test(t); }),
      loadMore: txt(q('.more__text')[0]),
      icons: q('svg').length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight
    };
  })())`,

  manage: `JSON.stringify((() => {
    const q = (s) => Array.from(document.querySelectorAll(s));
    const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
    var tabs = q('.tabbar__item');
    return {
      route: location.hash,
      tabLabels: tabs.map(txt),
      activeTab: txt(tabs.find(function(t){return t.classList.contains('tabbar__item--active');})),
      guard: q('.empty').length > 0,
      who: {
        name: txt(q('.who__name')[0]),
        role: txt(q('.who__role')[0]),
        hasAvatar: !!q('.who__avatar')[0]
      },
      cells: q('.cell').map(function(c){
        return {
          label: txt(c.querySelector('.cell__label')),
          desc: txt(c.querySelector('.cell__desc')),
          iconCls: (c.querySelector('.cell__icon') ? c.querySelector('.cell__icon').className : '').trim(),
          hasIcon: !!(c.querySelector('.cell__icon svg') || c.querySelector('.cell__icon image'))
        };
      }),
      tip: txt(q('.tip__text')[0]),
      icons: q('svg').length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight
    };
  })())`,
};

const EXPR_GUARD = `JSON.stringify((() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
  return {
    route: location.hash,
    tabLabels: q('.tabbar__item').map(txt),
    emptyTitle: txt(q('.empty__title')[0]),
    emptyDesc: txt(q('.empty__desc')[0]),
    emptyAction: txt(q('.empty__action')[0]),
    cardCount: q('.ocard').length,
    metrics: q('.metric').length,
    totals: q('.total').length,
    prows: q('.prow').length,
    tabs: q('.tab').length
  };
})())`;

/**
 * 点「待接单」页签后的卡片按钮层级断言。
 *
 * 为什么要单独探：默认「全部」页签里最新 3 条大概率是终态单（没有状态按钮），
 * 只探「全部」会**测不到接单/送达按钮的层级对不对** —— 而这正是 S7-4 最该验的设计。
 *
 * 期望（对照 docs/03-前端设计.md §8.4）：
 *   PENDING    → [接单(描边 secondary)] + [确认送达(primary)] + ···
 *   DELIVERING → [确认送达(primary)]（占满）+ ···
 *   终态       → 无状态按钮，只有一行 .ocard__done 文案 + ···
 */
const EXPR_AFTER_TAB = `JSON.stringify((() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
  const cards = q('.ocard');
  const rows = cards.map(function(c) {
    var btns = Array.prototype.map.call(c.querySelectorAll('.ocard__ops-main .btn'), function(b) {
      return {
        label: txt(b),
        primary: b.classList.contains('btn--primary'),
        secondary: b.classList.contains('btn--secondary')
      };
    });
    return {
      status: txt(c.querySelector('.tag__text')),
      btns: btns,
      done: txt(c.querySelector('.ocard__done')),
      moreBtn: !!c.querySelector('.ocard__more-btn'),
      hasCancelInMain: Array.prototype.some.call(btns, function(b) { return b.label.indexOf('取消') >= 0; })
    };
  });
  return {
    // ⚠️ q() 返回的是**数组**，必须取 [0]，否则 txt() 读到 undefined 会返回空串，
    //    让人误判成「高亮丢了」
    activeSeg: txt(q('.tab--on')[0]),
    activeSegCount: q('.tab--on').length,
    activeBarCount: q('.tab__bar').length,
    cardCount: cards.length,
    rows: rows,
    // 汇总：这一批卡片里有没有违反期望的
    bad: rows.filter(function(r) {
      if (r.status === '待接单') {
        var names = r.btns.map(function(b) { return b.label; });
        // 必须有 接单(secondary) + 确认送达(primary)
        if (names.indexOf('接单') < 0) return true;
        if (names.indexOf('确认送达') < 0) return true;
        var accept = r.btns.find(function(b) { return b.label === '接单'; });
        var deliver = r.btns.find(function(b) { return b.label === '确认送达'; });
        if (!accept.secondary) return true;
        if (!deliver.primary) return true;
        return false;
      }
      if (r.status === '处理中' || r.status === '配送中') {
        var d = r.btns.filter(function(b) { return b.label === '确认送达'; });
        if (d.length !== 1) return true;
        if (!d[0].primary) return true;
        if (r.btns.length !== 1) return true;
        return false;
      }
      // 终态：不该有任何状态按钮，也该有 done 文案
      if (r.btns.length > 0) return true;
      if (!r.done) return true;
      return false;
    }).map(function(r) { return r.status + ' -> ' + JSON.stringify(r.btns) + ' done=' + r.done; }),
    // 取消绝不能出现在卡片主区，只能收在 ··· 里
    cancelLeak: rows.filter(function(r) { return r.hasCancelInMain; }).length
  };
})())`;

/** 切到指定状态页签（真实点击，模拟店长手指） */
const clickTab = (label) => `JSON.stringify((function(){
  var q = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var hit = q('.tab').find(function(t) {
    var el = t.querySelector('.tab__text');
    return el && (el.textContent || '').trim() === ${JSON.stringify(label)};
  });
  if (!hit) return 'no-tab';
  hit.click();
  return 'clicked';
})())`;

const PAGES = [
  ['dashboard', '/#/pages/admin/dashboard'],
  ['orders', '/#/pages/admin/orders'],
  ['manage', '/#/pages/admin/manage'],
];

/** 切到指定状态页签 —— 用 CDP 派发**真实鼠标事件** */
async function realClickTab(send, label) {
  const found = await evaluate(
    send,
    `JSON.stringify((function(){
      var els = document.querySelectorAll('.tab');
      for (var i = 0; i < els.length; i++) {
        var t = els[i].querySelector('.tab__text');
        if (t && (t.textContent || '').trim() === ${JSON.stringify(label)}) {
          var b = els[i].getBoundingClientRect();
          return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
        }
      }
      return null;
    })())`,
  );
  if (!found || found === 'null') return 'no-tab';
  // ⚠️ evaluate 已经 returnByValue，字符串会被再 JSON.stringify 一次 → 双层编码
  //    （"{\"x\":105.25}"），所以这里 parse 两次才对。
  let pos = JSON.parse(found);
  if (typeof pos === 'string') pos = JSON.parse(pos);
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
    return `bad-coord:${JSON.stringify(pos)}`;
  }
  console.log(`  [坐标] x=${pos.x} y=${pos.y}`);
  // ⚠️ CDP 的 Input.dispatchMouseEvent 参数是**变长**的：
  //    mousePressed 必须带 buttons（按下的按钮位掩码），mouseReleased 要带 0。
  //    只给 button/clickCount 会报 "mandatory field missing"。
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', buttons: 1, clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', buttons: 0, clickCount: 1,
  });
  return 'clicked';
}

async function main() {
  const admin = await login(ADMIN_PHONE);
  console.log(`=== 店长登录 === phone=${ADMIN_PHONE} role=${admin.user?.currentRole} roles=${JSON.stringify(admin.user?.roles)}`);

  let customer = null;
  try {
    customer = await login(CUSTOMER_PHONE);
    console.log(`=== 顾客登录 === role=${customer.user?.currentRole} roles=${JSON.stringify(customer.user?.roles)}`);
  } catch (err) {
    console.log(`=== 顾客登录失败（守卫反例跳过）: ${err.message}`);
  }

  let targets;
  for (let i = 0; i < 30; i += 1) {
    try {
      targets = await (await fetch(`${CDP_HOST}/json/list`)).json();
      if (targets.length) break;
    } catch { /* 等 Chrome */ }
    await sleep(300);
  }
  const page = targets?.find((t) => t.type === 'page');
  if (!page) throw new Error('没找到可用的 page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const { send, takeLogs } = makeClient(ws);

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });

  const adminHits = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.requestWillBeSent' && /\/api\/v1\/admin\//.test(m.params.request.url)) {
      adminHits.push(m.params.request.url.replace(/^https?:\/\/[^/]+/, ''));
    }
  });

  await navigate(send, `${BASE}/`, 2500);

  const seed = (data) => `
    localStorage.setItem('ws_access_token', ${JSON.stringify(data.accessToken)});
    localStorage.setItem('ws_refresh_token', ${JSON.stringify(data.refreshToken)});
    localStorage.setItem('ws_user', ${JSON.stringify(JSON.stringify(data.user))});
    'ok';
  `;
  await evaluate(send, seed(admin));

  const failures = [];

  for (const [key, path] of PAGES) {
    takeLogs();
    await navigate(send, `${BASE}${path}`, 5200);
    const out = await evaluate(send, EXPR[key]);
    console.log(`\n=== [店长] ${key} ===`);
    console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
    const logs = takeLogs();
    if (logs.length) console.log(`--- 控制台 ---\n${logs.slice(0, 12).join('\n')}`);
    if (out && out.__error) failures.push(`${key} 表达式抛错: ${out.__error}`);
    else {
      const o = JSON.parse(out);
      if (o.guard) failures.push(`[店长] ${key} 停在守卫态: ${o.guardTitle}`);
      if (o.overflowX > 2) failures.push(`[店长] ${key} 横向溢出 ${o.overflowX}px`);
    }
  }

  // 按钮层级：切到「待接单」页签真实点一下，看卡片按钮对不对
  takeLogs();
  await navigate(send, `${BASE}${PAGES[1][1]}`, 5200);
  const clicked = await realClickTab(send, '待接单');
  console.log(`\n=== 切「待接单」页签（真实鼠标事件） === click=${clicked}`);
  if (clicked === 'no-tab') {
    failures.push('订单页找不到「待接单」页签');
  } else {
    await sleep(4200);
    const out = await evaluate(send, EXPR_AFTER_TAB);
    console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
    if (out && out.__error) failures.push(`按钮层级表达式抛错: ${out.__error}`);
    else {
      const o = JSON.parse(out);
      if (!o.activeSeg) failures.push('点了「待接单」但页签没有高亮（.tab--on 为空）');
      if (!o.cardCount) failures.push('「待接单」页签一条单都没有（库里没待接单单，先造一单再验）');
      o.bad.forEach((b) => failures.push(`按钮层级不符: ${b}`));
      if (o.cancelLeak) failures.push(`卡片主区出现「取消」按钮 ×${o.cancelLeak}（取消只该在 ··· 里）`);
      if (o.cardCount && !o.bad.length) console.log(`✓ ${o.cardCount} 张待接单卡片的按钮层级全部符合设计`);
    }
  }
  const tabLogs = takeLogs();
  if (tabLogs.length) console.log(`--- 控制台 ---\n${tabLogs.slice(0, 10).join('\n')}`);

  // 顾客身份反例：必须守卫、且不产生任何 /admin 请求
  if (customer) {
    await navigate(send, `${BASE}/`, 1500);
    await evaluate(send, seed(customer));
    for (const [key, path] of PAGES) {
      adminHits.length = 0;
      await navigate(send, `${BASE}${path}`, 4500);
      const out = await evaluate(send, EXPR_GUARD);
      console.log(`\n=== [顾客] ${key} ===`);
      console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
      console.log(`--- /admin 请求数: ${adminHits.length}${adminHits.length ? '  ← 不该有！' : ''}`);
      const o = typeof out === 'string' ? JSON.parse(out) : out;
      if (!o.emptyTitle) failures.push(`[顾客] ${key} 没有守卫空态`);
      if (o.cardCount || o.metrics || o.totals || o.prows) {
        failures.push(`[顾客] ${key} 守卫态仍渲染了业务内容`);
      }
      if (adminHits.length) failures.push(`[顾客] ${key} 发了 ${adminHits.length} 个 /admin 请求`);
    }
    await navigate(send, `${BASE}/`, 1500);
    await evaluate(send, seed(admin));
    console.log('\n（已把浏览器登录态复原为店长）');
  }

  console.log('\n=== 汇总 ===');
  if (failures.length) {
    console.log(`✗ ${failures.length} 项异常:`);
    failures.forEach((f) => console.log(`  · ${f}`));
  } else {
    console.log('✓ 探针未发现异常');
  }

  // --shots=1：额外给三个页面各截一张图（每页都要人肉看一眼，探针管不了文字换行）
  if (process.argv.includes('--shots')) {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '.shots');
    mkdirSync(dir, { recursive: true });
    for (const [key, path] of PAGES) {
      await navigate(send, `${BASE}${path}`, 5200);
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      const out = join(dir, `admin-${key}.png`);
      writeFileSync(out, Buffer.from(shot.data, 'base64'));
      console.log(`  截图 -> ${out}`);
    }
  }

  ws.close();
}

main().catch((err) => {
  console.error('探针失败:', err.message);
  process.exit(1);
});