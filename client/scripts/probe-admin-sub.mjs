/**
 * S7-4-2 管理端二级页探针（开发自用，不参与打包）
 * ---------------------------------------------------------------------------
 * 覆盖 5 个二级页：
 *   admin/product/list   商品列表（横滑分类筛选 + 上下架开关）
 *   admin/product/edit   商品编辑（**价格输入用「元」，提交前 ×100 转「分」**）
 *   admin/category/list  分类树（拍平成 depth 数组 + 同级排序 + 删不掉提示）
 *   admin/category/edit  分类编辑（**防环**：自己和子孙不能当上级）
 *   admin/user/list      用户列表（**不能撤销自己的 ADMIN / 不能禁用自己 → 30004**）
 *
 * 前置：
 *   1. 后端在 3000
 *   2. `node scripts/serve-dist.mjs 4180` 已起（自带 /api 反代）
 *   3. Chrome 带 --remote-debugging-port=9222 在跑
 *
 * 用法：
 *   node scripts/probe-admin-sub.mjs [预览端口=4180] [--shots]
 *
 * 断言原则（踩过坑才这么定的）：
 *   · 数值一律**从 API 派生**，不许写死「第 1 条一定是 XXX」
 *   · 金额断言要比「分」：后端一律传分，页面上是元
 *   · 「按钮禁用」断言要读 class，不能只看颜色 —— pointer-events:none 才是真禁用
 */
const PORT = Number(process.argv[2]) || 4180;
const BASE = `http://127.0.0.1:${PORT}`;
const API = 'http://127.0.0.1:3000/api/v1';
const CDP_HOST = process.env.CDP_HOST || 'http://127.0.0.1:9222';
const ADMIN_PHONE = '13800000001';
const CUSTOMER_PHONE = '13800000003';
const TAKE_SHOTS = process.argv.includes('--shots');

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===========================================================================
// CDP 客户端
// ===========================================================================
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
  return res.result?.value;
}

async function navigate(send, url, wait = 4800) {
  // ⚠️ uni-app 是 hash 路由，`/#/a` → `/#/b` 是**页内跳转**：
  //    浏览器不重载文档 → App.vue 的 restore() 不重跑 → store 残留上次登录态，
  //    探针结果全是假的。所以每次导航都在 `#` **前面**挂唯一 `?_r=` 强制刷新。
  const [base, hash = ''] = url.split('#');
  const busted = `${base}${base.includes('?') ? '&' : '?'}_r=${Date.now()}${hash ? '#' + hash : ''}`;
  await send('Page.navigate', { url: busted });
  await sleep(wait);
}

// ===========================================================================
// 登录 / API 取基准数据
// ===========================================================================
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

async function apiGet(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  const body = await res.json();
  if (body.code !== 0) throw new Error(`GET ${path} code=${body.code} ${body.message}`);
  return body.data;
}

// ===========================================================================
// 探针表达式
// ===========================================================================
const EXPR = {
  /** 商品列表：横滑分类条 + 行内纯 CSS 开关 + ··· */
  productList: `JSON.stringify((() => {
    const q = (s) => Array.from(document.querySelectorAll(s));
    const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
    const rows = q('.prow');
    return {
      route: location.hash,
      guard: q('.empty').length > 0,
      guardTitle: txt(q('.empty__title')[0]),
      skeleton: q('.skcard').length,
      hasSearch: !!q('.searchbox__input')[0],
      cats: q('.cat').map(function(c){
        return { text: txt(c.querySelector('.cat__text')), count: txt(c.querySelector('.cat__count')), on: c.classList.contains('cat--on') };
      }),
      catOverflow: (function(){
        var el = q('.cats__inner')[0];
        return el ? { scrollW: el.scrollWidth, clientW: el.clientWidth, items: q('.cat').length } : null;
      })(),
      chip: txt(q('.chip__text')[0]),
      rowCount: rows.length,
      rows: rows.slice(0, 5).map(function(r){
        var sw = r.querySelector('.switch');
        var knob = r.querySelector('.switch__knob');
        // 缩略图：即使没配图也必须有 52px 的字标方块（曾经被 v-if="coverImage" 挡掉过）
        var thumb = r.querySelector('.prow__thumb .pimg');
        var tb = thumb ? thumb.getBoundingClientRect() : null;
        return {
          name: txt(r.querySelector('.prow__name')),
          price: txt(r.querySelector('.prow__price')),
          origin: txt(r.querySelector('.prow__origin')),
          stock: txt(r.querySelector('.prow__stock')),
          meta: txt(r.querySelector('.prow__meta')),
          shelfTag: txt(r.querySelector('.prow__tag')),
          thumbW: tb ? Math.round(tb.width) : 0,
          thumbH: tb ? Math.round(tb.height) : 0,
          thumbMono: txt(r.querySelector('.prow__thumb .pimg__char')),
          hasSwitch: !!sw,
          switchOn: sw ? sw.classList.contains('switch--on') : null,
          knobTransform: knob ? getComputedStyle(knob).transform : '',
          hasMore: !!r.querySelector('.prow__more'),
          // 开关的热区（44px）与商品行是否重叠
          switchHit: (function(){
            var el = r.querySelector('.switchrow');
            return el ? Math.round(el.getBoundingClientRect().height) : 0;
          })(),
          firstText: txt(r)
        };
      }),
      fab: !!q('.fab')[0],
      loadMore: txt(q('.more__text')[0]),
      icons: q('svg').length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight
    };
  })())`,

  /** 商品编辑（新建态，无 id）：价格输入必须是「元」 */
  productEditNew: `JSON.stringify((() => {
    const q = (s) => Array.from(document.querySelectorAll(s));
    const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
    // ⚠️ uni-app H5 把 <input class="x"> 编译成 <uni-input class="x"><input class="uni-input">，
    //    .value 必须读**里面那个真 input**（选择器写成 '.x input'），直接读 .x 永远是 undefined。
    const val = (sel) => {
      var el = q(sel + ' input')[0] || q(sel)[0];
      return el ? (el.value !== undefined ? el.value : '') : null;
    };
    const labels = Array.prototype.map.call(q('.field__label'), txt);
    return {
      route: location.hash,
      guard: q('.empty').length > 0,
      skeleton: q('.skcard').length,
      fields: labels,
      name: val('.card:nth-of-type(1) .field:nth-of-type(1) .field__input'),
      price: val('.field__money'),
      unit: val('.field--last .field__input'),
      // 保存栏在不在（class 是 .abar，不是 .savebar）
      saveBar: !!q('.abar')[0],
      saveText: txt(q('.abar .btn')[0]),
      saveDisabled: !!q('.abar .btn[disabled]')[0],
      // 底部固定栏的位置必须真的贴底
      saveRect: (function(){
        var el = q('.abar')[0];
        if (!el) return null;
        var b = el.getBoundingClientRect();
        return { bottom: Math.round(b.bottom), vh: window.innerHeight, top: Math.round(b.top) };
      })(),
      /**
       * ⚠️ 光看 saveRect 贴底**抓不到「保存栏没固定」这个 bug。
       * S7-5 修过的正是这个：模板写了 class="abar" 但本页样式没定义它，
       * 按钮就成了普通流里的块 —— 首屏恰好在页面底部，所以「贴底」断言照样过，
       * 只有滚到中间往下滚、页面底部露出来时才发现按钮跟着跑了。
       * 所以必须单独探 position 这个 CSS 属性。
       */
      savePosition: (function(){
        var el = q('.abar')[0];
        return el ? getComputedStyle(el).position : '';
      })(),
      // 占位高度必须含安全区，否则刘海屏上固定栏会盖住最后一行
      padH: (function(){
        var el = q('.pedit__pad, .cedit__pad')[0];
        return el ? Math.round(el.getBoundingClientRect().height) : 0;
      })(),
      switchOn: !!q('.togglecard .checkbox--on')[0] || !!q('.togglecard .switch--on')[0],
      // ⚠️ 一进页面**不该**有校验红字（showErrors 默认 false）
      errHint: txt(q('.hint--err .hint__text')[0]),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight
    };
  })())`,

  /** 商品编辑（编辑态，带 id）：价格要**从分换算成元**显示 */
  productEditExisting: `JSON.stringify((() => {
    const q = (s) => Array.from(document.querySelectorAll(s));
    const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
    const val = (sel) => { var el = q(sel + ' input')[0] || q(sel)[0]; return el ? (el.value !== undefined ? el.value : '') : null; };
    // 售价 / 划线原价是两个 .field__money（每个里包一个真 input）
    var monies = Array.prototype.map.call(q('.field__money input'), function(el){ return el.value; });
    var plainInputs = Array.prototype.map.call(q('.field__input input'), function(el){ return el.value; });
    return {
      route: location.hash,
      guard: q('.empty').length > 0,
      skeleton: q('.skcard').length,
      // 顺序：商品名、副标题、单位、库存
      plainInputs: plainInputs,
      monies: monies,
      price: monies[0] === undefined ? null : monies[0],
      origin: monies[1] === undefined ? null : monies[1],
      stock: plainInputs[plainInputs.length - 1],
      categoryPicked: txt(q('.field__value')[0]),
      desc: (function(){ var el = q('.field__textarea')[0]; return el ? (el.value || '') : null; })(),
      saveText: txt(q('.abar .btn')[0]),
      savePosition: (function(){ var el = q('.abar')[0]; return el ? getComputedStyle(el).position : ''; })(),
      padH: (function(){ var el = q('.pedit__pad, .cedit__pad')[0]; return el ? Math.round(el.getBoundingClientRect().height) : 0; })(),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight
    };
  })())`,

  /** 分类树：拍平数组 + 层级缩进 + 排序可用性 */
  categoryList: `JSON.stringify((() => {
    const q = (s) => Array.from(document.querySelectorAll(s));
    const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
    const rows = q('.crow');
    return {
      route: location.hash,
      guard: q('.empty').length > 0,
      guardTitle: txt(q('.empty__title')[0]),
      skeleton: q('.skrow').length,
      rowCount: rows.length,
      rows: rows.slice(0, 8).map(function(r){
        var ops = Array.prototype.slice.call(r.querySelectorAll('.crow__op'));
        return {
          name: txt(r.querySelector('.crow__name')),
          isChild: r.classList.contains('crow--child'),
          left: Math.round(r.getBoundingClientRect().left),
          hasArrow: !!r.querySelector('.crow__arrow'),
          toggleW: (function(){ var e = r.querySelector('.crow__toggle'); return e ? Math.round(e.getBoundingClientRect().width) : 0; })(),
          opCount: ops.length,
          // 排序按钮的可用性：--off 是真禁用（pointer-events:none）
          sortCls: ops.slice(0, 2).map(function(o){ return o.className; }),
          sortClickable: ops.slice(0, 2).map(function(o){ return getComputedStyle(o).pointerEvents !== 'none'; }),
          offTag: txt(r.querySelector('.crow__off')),
          moreIcon: !!r.querySelector('.crow__op svg')
        };
      }),
      hint: Array.prototype.map.call(q('.hint__text'), txt),
      fab: !!q('.fab')[0],
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight
    };
  })())`,

  /** 分类编辑（新建）：上级候选必须是顶层分类 */
  categoryEditNew: `JSON.stringify((() => {
    const q = (s) => Array.from(document.querySelectorAll(s));
    const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
    const val = (sel) => { var el = q(sel + ' input')[0] || q(sel)[0]; return el ? (el.value !== undefined ? el.value : '') : null; };
    var plainInputs = Array.prototype.map.call(q('.field__input input'), function(el){ return el.value; });
    return {
      route: location.hash,
      guard: q('.empty').length > 0,
      skeleton: q('.skcard').length,
      fields: Array.prototype.map.call(q('.field__label'), txt),
      plainInputs: plainInputs,
      name: plainInputs[0],
      sortOrder: plainInputs[1],
      parentPicked: txt(q('.prow__value')[0]),
      // 一进页面不该有校验红字
      errHint: txt(q('.hint--err .hint__text')[0]),
      hint: Array.prototype.map.call(q('.hint:not(.hint--err) .hint__text'), txt),
      saveText: txt(q('.abar .btn')[0]),
      savePosition: (function(){ var el = q('.abar')[0]; return el ? getComputedStyle(el).position : ''; })(),
      padH: (function(){ var el = q('.cedit__pad, .pedit__pad')[0]; return el ? Math.round(el.getBoundingClientRect().height) : 0; })(),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight
    };
  })())`,

  /** 用户列表：自己那行的两个操作都必须禁用 */
  userList: `JSON.stringify((() => {
    const q = (s) => Array.from(document.querySelectorAll(s));
    const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
    const rows = q('.urow');
    return {
      route: location.hash,
      guard: q('.empty').length > 0,
      guardTitle: txt(q('.empty__title')[0]),
      skeleton: q('.skrow').length,
      hasSearch: !!q('.searchbox__input')[0],
      segs1: Array.prototype.map.call(q('.segbar')[0] ? q('.segbar')[0].querySelectorAll('.seg') : [], function(s){
        return { text: txt(s.querySelector('.seg__text')), on: s.classList.contains('seg--on') };
      }),
      segs2: Array.prototype.map.call(q('.segbar')[1] ? q('.segbar')[1].querySelectorAll('.seg') : [], function(s){
        return { text: txt(s.querySelector('.seg__text')), on: s.classList.contains('seg--on') };
      }),
      rowCount: rows.length,
      rows: rows.slice(0, 6).map(function(r){
        var op = r.querySelector('.opbtn');
        var sw = r.querySelector('.switch');
        var swRow = r.querySelector('.switchrow');
        // 副行截断检测：scrollWidth > clientWidth 说明文字被省略号切掉了。
        // 几何断言**管不住文字换行**，但管得住「省略号截断」—— 两者都要
        var sub = r.querySelector('.urow__sub');
        var subW = sub ? { sw: sub.scrollWidth, cw: sub.clientWidth } : null;
        return {
          name: txt(r.querySelector('.urow__name')),
          isMe: !!r.querySelector('.tag--me'),
          isAdmin: !!r.querySelector('.tag--admin'),
          isOff: !!r.querySelector('.tag--off'),
          offRow: r.classList.contains('urow--off'),
          sub: txt(r.querySelector('.urow__sub')),
          subClipped: subW ? subW.sw > subW.cw + 1 : false,
          subH: sub ? Math.round(sub.getBoundingClientRect().height) : 0,
          opText: txt(op),
          // 真禁用看 pointer-events，不看颜色
          opDisabled: op ? getComputedStyle(op).pointerEvents === 'none' : null,
          opCls: op ? op.className : '',
          switchOn: sw ? sw.classList.contains('switch--on') : null,
          swDisabled: swRow ? getComputedStyle(swRow).pointerEvents === 'none' : null,
          rowOpacity: getComputedStyle(r).opacity
        };
      }),
      // 手机号泄漏检查：列表里不能出现 11 位完整号码
      phoneLeak: Array.prototype.map.call(q('.urow__sub'), txt)
        .filter(function(t){ return /1[3-9][0-9]{9}/.test(t); }),
      hint: Array.prototype.map.call(q('.hint__text'), txt),
      loadMore: txt(q('.more__text')[0]),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight
    };
  })())`,
};

/** 守卫反例：只读守卫态 + 有没有业务内容 */
const EXPR_GUARD = `JSON.stringify((() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
  return {
    route: location.hash,
    emptyTitle: txt(q('.empty__title')[0]),
    emptyDesc: txt(q('.empty__desc')[0]),
    emptyAction: txt(q('.empty__action')[0]),
    prows: q('.prow').length,
    crows: q('.crow').length,
    urows: q('.urow').length,
    fields: q('.field').length,
    abars: q('.abar').length,
    // 骨架屏也算「渲染了内容」—— 顾客不该看到任何一种
    skeletons: q('.skcard, .skrow').length
  };
})())`;

/**
 * 在搜索框里输入并触发 Vue 的 v-model 更新。
 *
 * ⚠️ 必须走原生 setter + 手动 dispatch `input` 事件：
 *    直接 `el.value = x` 不会被 Vue 的 @input 捕获（Vue 记的是它自己那次赋值的 vnode）。
 * ⚠️ 选择器是 `.searchbox__input input` —— uni-app 把 <input> 编译成
 *    <uni-input class="searchbox__input"><input class="uni-input">，
 *    前者是 wrapper，直接对它设 value 设不到真 input 上。
 */
async function typeSearch(send, text) {
  return evaluate(
    send,
    `(function(){
      var el = document.querySelector('.searchbox__input input') || document.querySelector('.searchbox__input');
      if (!el) return 'no-input';
      var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`,
  );
}

/** 「我」那一行的完整信息（供 verifySelfRow 用） */
const EXPR_SELF_ROW = `JSON.stringify((() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
  const pick = (r) => {
    var op = r.querySelector('.opbtn');
    var sw = r.querySelector('.switch');
    var swRow = r.querySelector('.switchrow');
    return {
      name: txt(r.querySelector('.urow__name')),
      isMe: !!r.querySelector('.tag--me'),
      isAdmin: !!r.querySelector('.tag--admin'),
      isOff: !!r.querySelector('.tag--off'),
      sub: txt(r.querySelector('.urow__sub')),
      opText: txt(op),
      opDisabled: op ? getComputedStyle(op).pointerEvents === 'none' : null,
      opCls: op ? op.className : '',
      switchOn: sw ? sw.classList.contains('switch--on') : null,
      swDisabled: swRow ? getComputedStyle(swRow).pointerEvents === 'none' : null,
      rowOpacity: getComputedStyle(r).opacity
    };
  };
  const rows = q('.urow');
  return {
    rowCount: rows.length,
    names: rows.map(function(r){ return txt(r.querySelector('.urow__name')); }),
    self: (function(){
      var hit = rows.filter(function(r){ return !!r.querySelector('.tag--me'); })[0];
      return hit ? pick(hit) : null;
    })(),
    first: rows[0] ? pick(rows[0]) : null
  };
})())`;

/** 取某元素的中心坐标（真实鼠标事件用） */
const EXPR_POINT = (selector) => `JSON.stringify((function(){
  var els = document.querySelectorAll(${JSON.stringify(selector)});
  for (var i = 0; i < els.length; i++) {
    var e = els[i];
    var b = e.getBoundingClientRect();
    if (b.width > 0 && b.height > 0 && b.top >= 0 && b.top < window.innerHeight) {
      return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
    }
  }
  return null;
})())`;

/** 取某个文本的筛选项的中心坐标（真实鼠标事件用） */
const EXPR_POINT_BY_TEXT = (selector, label) => `JSON.stringify((function(){
  var els = document.querySelectorAll(${JSON.stringify(selector)});
  for (var i = 0; i < els.length; i++) {
    var t = els[i].querySelector('.seg__text') || els[i];
    if ((t.textContent || '').trim() === ${JSON.stringify(label)}) {
      var b = els[i].getBoundingClientRect();
      return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
    }
  }
  return null;
})())`;

/**
 * 真实鼠标点击。
 * ⚠️ 必须用 CDP 派发事件而不是 element.click() —— uni-app 的 `<view>` 上
 *    element.click() 不触发 Vue 的事件绑定（探过：数据变了但 class 没变）。
 * ⚠️ Input.dispatchMouseEvent 的 buttons 是**必填**位掩码（按下 1 / 松开 0）。
 */
async function realClick(send, selector, byText) {
  const found = await evaluate(
    send,
    byText ? EXPR_POINT_BY_TEXT(selector, byText) : EXPR_POINT(selector),
  );
  if (!found || found === 'null') return `not-found:${byText || selector}`;
  // ⚠️ 表达式自带 JSON.stringify + returnByValue = 双层编码，要 parse 两次
  let pos = JSON.parse(found);
  if (typeof pos === 'string') pos = JSON.parse(pos);
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return `bad-coord:${JSON.stringify(pos)}`;
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', buttons: 1, clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', buttons: 0, clickCount: 1,
  });
  return 'clicked';
}

// ===========================================================================
// 断言
// ===========================================================================
const failures = [];
function bad(msg) {
  failures.push(msg);
  console.log(`  ✗ ${msg}`);
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

/** 通用：解析表达式 + 打印 + 兜住抛错 */
async function probe(send, key) {
  const out = await evaluate(send, EXPR[key]);
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
  if (out && out.__error) {
    bad(`${key} 表达式抛错: ${out.__error}`);
    return null;
  }
  return JSON.parse(out);
}

const PAGES = {
  productList: '/#/pages/admin/product/list',
  productEditNew: '/#/pages/admin/product/edit',
  categoryList: '/#/pages/admin/category/list',
  categoryEditNew: '/#/pages/admin/category/edit',
  userList: '/#/pages/admin/user/list',
};

/**
 * 「自己那行的两个操作都必须禁用」—— 这是 S7-4-2 最该验的一条。
 *
 * 为什么必须单独抽成函数：店长（id=1）在列表里排在最后（列表按 id 倒序），
 * 第一页根本看不到他，光扫第一页会让这条断言**永远处于「跳过」状态**，
 * 看起来绿了其实没测。所以后面会用搜索把他捞到第一页再来验一次。
 *
 * 判断「禁用」看 pointer-events，不看颜色 ——
 * 只改颜色的话按钮看着灰的但点得动，点了没反应比直接不可点更让人困惑。
 */
function verifySelfRow(me, where) {
  ok(`找到自己（${where}）：${me.name}`);
  if (!me.isMe) bad(`（${where}）标了「我」的行 isMe 标记与名字对不上`);
  if (me.opDisabled !== true) {
    bad(`（${where}）自己那行的「${me.opText}」**没有禁用**（后端会回 30004）`);
  } else {
    ok(`（${where}）自己那行的「${me.opText}」已禁用（pointer-events:none）`);
  }
  if (me.swDisabled !== true) {
    bad(`（${where}）自己那行的启停开关**没有禁用**（后端会回 30004）`);
  } else {
    ok(`（${where}）自己那行的启停开关已禁用`);
  }
  if (!me.isAdmin) bad(`（${where}）自己那行没有「店长」标签 —— 身份可能被误撤销过`);
  if (me.switchOn !== true) bad(`（${where}）自己那行开关是关的 —— 自己被禁用了？`);
}

// ===========================================================================
// main
// ===========================================================================
async function main() {
  const admin = await login(ADMIN_PHONE);
  const adminId = admin.user?.id;
  console.log(`=== 店长登录 === phone=${ADMIN_PHONE} id=${adminId} roles=${JSON.stringify(admin.user?.roles)}`);

  let customer = null;
  try {
    customer = await login(CUSTOMER_PHONE);
    console.log(`=== 顾客登录 === role=${customer.user?.currentRole}`);
  } catch (err) {
    console.log(`=== 顾客登录失败（守卫反例跳过）: ${err.message}`);
  }

  // ---- 从 API 派生基准数据（一律不写死）
  const catTree = await apiGet(admin.accessToken, '/admin/categories');
  const catOptions = await apiGet(admin.accessToken, '/admin/products/category-options');
  const prodPage = await apiGet(admin.accessToken, '/admin/products?page=1&pageSize=5');
  const userPage = await apiGet(admin.accessToken, '/admin/users?page=1&pageSize=5');
  console.log(`=== API 基准 === 分类=${catTree.length} 分类选项=${catOptions.length} ` +
    `商品 total=${prodPage.total} 用户 total=${userPage.total}`);

  /**
   * 编辑页「所属分类」下拉**能选的 id 集合** —— 就是 `category-options` 这份数据。
   * ⚠️ 它不等于库里所有分类：探针跑过很多轮，库里多了 6 个「Txxxxx临时父类」，
   * 但它们没有商品、也没被前台配置成可选项，编辑页的下拉里根本不出现。
   * 拿它当「合法分类集合」来筛探针目标，理由充分且不用写死任何 id。
   */
  const optionCategoryIds = (Array.isArray(catOptions) ? catOptions : []).map((o) =>
    Number(o.id ?? o.categoryId ?? o.value),
  );
  const seedCategoryIds = optionCategoryIds.filter((n) => Number.isFinite(n) && n > 0);

  // 编辑态要挑一个**真的有原价和描述**的商品，才能验「分→元」换算
  //
  // ⚠️ 两个筛选条件都不能少（都是被实测数据教会的）：
  //   ① `originalPrice` —— 否则验不了划线原价换算
  //   ② **`categoryId` 必须是真实存在的分类** —— 之前没加这个条件，
  //      探针挑中了库里后来新建的临时分类下的商品（id=15~19，分类 10/12/14/16/18），
  //      而编辑页的分类下拉**只列种子分类**（1~5），于是回填时找不到对应项，
  //      显示「请选择分类」→ 报「所属分类没回填」。
  //      页面没 bug，是探针挑目标时没考虑目标必须落在页面的可选集合内。
  //   （教训跟 MEMORY 里那条一样：别假设「第 1 页一定有某条满足条件的记录」。）
  const candidates = prodPage.list || [];
  const withOrigin = candidates.find(
    (p) => p.originalPrice && seedCategoryIds.includes(Number(p.categoryId)),
  );
  const editTarget = withOrigin || candidates[0];
  if (!editTarget) {
    bad('前 5 个商品里一个都没有，探针无法验证编辑态（后端数据异常？）');
  }
  const editExpect = {
    id: editTarget.id,
    name: editTarget.name,
    price: editTarget.price,
    originalPrice: editTarget.originalPrice,
    stock: editTarget.stock,
    unit: editTarget.unit,
    categoryId: editTarget.categoryId,
    categoryName: editTarget.categoryName,
  };
  console.log(`=== 编辑态目标商品 === ${JSON.stringify(editExpect)}`);

  // ---- 连 CDP
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
      adminHits.push({
        url: m.params.request.url.replace(/^https?:\/\/[^/]+/, '').replace(/_r=\d+/g, '_r=…'),
        method: m.params.request.method,
      });
    }
  });

  const seed = (data) => `
    localStorage.setItem('ws_access_token', ${JSON.stringify(data.accessToken)});
    localStorage.setItem('ws_refresh_token', ${JSON.stringify(data.refreshToken)});
    localStorage.setItem('ws_user', ${JSON.stringify(JSON.stringify(data.user))});
    'ok';
  `;

  await navigate(send, `${BASE}/`, 2500);
  await evaluate(send, seed(admin));

  // =======================================================================
  // 1. 商品列表
  // =======================================================================
  console.log('\n\n########## [店长] 商品列表 ##########');
  takeLogs();
  await navigate(send, `${BASE}${PAGES.productList}`, 5600);
  {
    const o = await probe(send, 'productList');
    if (o) {
      if (o.guard) bad(`商品列表停在守卫态: ${o.guardTitle}`);
      if (o.overflowX > 2) bad(`商品列表横向溢出 ${o.overflowX}px`);
      if (!o.hasSearch) bad('商品列表没有搜索框');
      if (!o.rowCount) bad('商品列表一条都没有');
      // 分类横滑条：项数 = 1（全部）+ 后端给的选项数
      if (o.cats.length !== catOptions.length + 1) {
        bad(`分类条项数 ${o.cats.length} ≠ 1 + ${catOptions.length}`);
      } else ok(`分类条 ${o.cats.length} 项 = 全部 + ${catOptions.length} 个分类`);
      if (o.cats.length && !o.cats[0].on) bad('分类条第一项「全部」默认没高亮');
      // 行内开关：必须真的有，且轨道/滑块都用 CSS 画出来
      const withSwitch = o.rows.filter((r) => r.hasSwitch);
      if (!withSwitch.length) bad('商品行里没有上下架开关');
      else {
        /**
         * ⚠️ 断言要**按开关状态分别判**，不能一刀切「都要有 transform」。
         * 页面的 CSS 是 `.switch--on .switch__knob { transform: translateX(16px) }` ——
         * 只有**开着的**开关滑块才该有 transform，关着的本来就没有（`none`）。
         * 之前写成「所有行都要有 transform」，探针跑到「前 5 条里有一条已下架」时就红了，
         * 红得像是开关坏了，其实 CSS 行为完全正确。
         * 正确判据：**开着的必须有 transform，关着的必须没有**，两头都要覆盖。
         */
        const onRows = withSwitch.filter((r) => r.switchOn);
        const offRows = withSwitch.filter((r) => !r.switchOn);
        const badOn = onRows.filter((r) => !r.knobTransform || r.knobTransform === 'none');
        const badOff = offRows.filter((r) => r.knobTransform && r.knobTransform !== 'none');
        if (badOn.length) {
          bad(`${badOn.length} 行「已上架」的开关滑块没有位移（transform=${badOn[0].knobTransform}）`);
        }
        if (badOff.length) {
          bad(`${badOff.length} 行「已下架」的开关滑块却有位移（transform=${badOff[0].knobTransform}）`);
        }
        if (!badOn.length && !badOff.length) {
          ok(`${withSwitch.length} 行开关状态与滑块位移一致（开 ${onRows.length} / 关 ${offRows.length}）`);
        }
        const smallHit = withSwitch.filter((r) => r.switchHit && r.switchHit < 30);
        if (smallHit.length) bad(`${smallHit.length} 行开关热区不足 30px（${smallHit[0].switchHit}px）`);
        else ok(`开关热区 ${withSwitch[0].switchHit}px`);
      }
      if (!o.fab) bad('商品列表没有「+」浮动按钮');
      // 缩略图：没配图也必须有 52px 字标方块（曾经被 v-if="coverImage" 挡成空白）
      const noThumb = o.rows.filter((r) => !r.thumbW || r.thumbW < 40 || r.thumbH < 40);
      if (noThumb.length) bad(`${noThumb.length} 行没有可见缩略图（${noThumb[0].thumbW}×${noThumb[0].thumbH}）`);
      else ok(`${o.rows.length} 行都有 ${o.rows[0].thumbW}px 缩略图（字标「${o.rows[0].thumbMono}」）`);
      const noMono = o.rows.filter((r) => !r.thumbMono && !r.thumbW);
      if (noMono.length) bad(`${noMono.length} 行缩略图里连字标都没有`);
      // 名称不能是空的
      const emptyName = o.rows.filter((r) => !r.name);
      if (emptyName.length) bad(`${emptyName.length} 行商品名为空`);
    }
  }
  const logs1 = takeLogs();
  if (logs1.length) console.log(`--- 控制台 ---\n${logs1.slice(0, 8).join('\n')}`);

  // =======================================================================
  // 2. 商品编辑（新建）
  // =======================================================================
  console.log('\n\n########## [店长] 商品编辑（新建）##########');
  takeLogs();
  await navigate(send, `${BASE}${PAGES.productEditNew}`, 5200);
  {
    const o = await probe(send, 'productEditNew');
    if (o) {
      if (o.guard) bad('商品编辑（新建）停在守卫态');
      if (o.overflowX > 2) bad(`商品编辑（新建）横向溢出 ${o.overflowX}px`);
      for (const f of ['商品名', '售价', '库存', '单位']) {
        if (!o.fields.some((t) => t.includes(f))) bad(`商品编辑（新建）缺字段：${f}`);
      }
      // 新建态：售价必须是空的（不能带 0 进来）
      if (o.price) bad(`商品编辑（新建）售价默认值应为空，实际 "${o.price}"`);
      // ★ 一进页面不能有校验红字（showErrors 默认 false）
      if (o.errHint) bad(`商品编辑（新建）一进来就显示校验错误「${o.errHint}」（应该点保存后才显示）`);
      else ok('新建页首屏无校验红字');
      if (o.saveDisabled) bad('商品编辑（新建）保存按钮是 disabled（店长点不动也不知道为什么）');
      if (!o.saveBar) bad('商品编辑（新建）没有底部保存栏');
      if (o.saveRect) {
        const gap = o.saveRect.vh - o.saveRect.bottom;
        if (gap < -2 || gap > 40) bad(`保存栏位置异常：距视口底 ${gap}px`);
        else ok(`保存栏贴底（距底 ${gap}px）`);
      }
      // ★ S7-5：保存栏必须是 fixed（贴底断言抓不到这个，见表达式里的注释）
      if (o.savePosition !== 'fixed') {
        bad(`商品编辑（新建）保存栏 position=${o.savePosition || '(无)' }，应为 fixed —— 随页面滚动就找不到保存按钮了`);
      } else ok('保存栏 position: fixed');
      // ★ 占位必须够高（96px + 安全区），否则固定栏会盖住最后一个字段
      if (o.padH < 90) bad(`占位高度只有 ${o.padH}px，固定保存栏会盖住表单最后一项`);
      else ok(`占位高度 ${o.padH}px（够放固定栏）`);
    }
  }
  const logs2 = takeLogs();
  if (logs2.length) console.log(`--- 控制台 ---\n${logs2.slice(0, 8).join('\n')}`);

  // =======================================================================
  // 3. 商品编辑（编辑态）—— **金额 分→元** 换算
  // =======================================================================
  console.log('\n\n########## [店长] 商品编辑（编辑态 · 分→元）##########');
  takeLogs();
  await navigate(send, `${BASE}${PAGES.productEditNew}?id=${editExpect.id}`, 5600);
  {
    const o = await probe(send, 'productEditExisting');
    if (o) {
      if (o.guard) bad('商品编辑（编辑态）停在守卫态');
      if (o.overflowX > 2) bad(`商品编辑（编辑态）横向溢出 ${o.overflowX}px`);
      // ★ S7-5：编辑态也要验fixed（新建态过了不代表编辑态过，两页各自独立渲染）
      if (o.savePosition !== 'fixed') {
        bad(`商品编辑（编辑态）保存栏 position=${o.savePosition || '(无)' }，应为 fixed`);
      } else ok('保存栏 position: fixed');
      if (o.padH < 90) bad(`商品编辑（编辑态）占位只有 ${o.padH}px，固定栏会盖住最后一项`);
      /**
       * ★ 这条才是真正能抓住「保存栏不固定」的断言：滚到页面中部再测。
       * 只看首屏的话，按钮恰好在文档流末尾 → getBoundingClientRect 也贴底，
       * position 探针是唯一的兜底，而它依赖我写对了选择器。
       * 「滚下去再看它还贴不贴底」是纯几何事实，不依赖任何选择器，最可靠。
       */
      const scrolled = await evaluate(send, `JSON.stringify((function(){
        window.scrollTo(0, document.body.scrollHeight);   // 滚到底
        var el = document.querySelector('.abar');
        if (!el) return { err: 'no-abar' };
        var b = el.getBoundingClientRect();
        return {
          atBottom: Math.round(b.bottom), vh: window.innerHeight,
          pos: getComputedStyle(el).position,
          scrollY: Math.round(window.scrollY || document.documentElement.scrollTop)
        };
      })())`);
      {
        const so = typeof scrolled === 'string' ? JSON.parse(scrolled) : scrolled;
        if (so?.err) {
          bad('商品编辑（编辑态）滚到底后找不到保存栏');
        } else if (so.scrollY <= 0) {
          ok('页面本来就一屏高，无需滚动（fixed 断言已覆盖）');
        } else {
          const gap = so.vh - so.atBottom;
          if (gap < -2 || gap > 40) {
            bad(`滚动到底后保存栏距视口底 ${gap}px（position=${so.pos}）—— fixed 没生效，保存按钮会跟着页面滚走`);
          } else {
            ok(`滚动到底（scrollY=${so.scrollY}）后保存栏仍贴底（距底 ${gap}px）`);
          }
        }
      }
      const inputs = o.plainInputs || [];
      // 顺序：商品名、副标题、单位、库存（卡片里的普通 input）
      const nameV = inputs[0];
      if (nameV !== editExpect.name) bad(`商品名回填错：页面 "${nameV}" ≠ API "${editExpect.name}"`);
      else ok(`商品名回填正确：${nameV}`);

      // 核心断言：页面显示「元」，API 给的是「分」
      const monies = o.monies || [];
      const expectYuan = (editExpect.price / 100).toFixed(2);
      if (monies[0] !== expectYuan) {
        bad(`售价换算错：页面 "${monies[0]}" 元 ≠ 期望 "${expectYuan}" 元（API ${editExpect.price} 分）`);
      } else ok(`售价 ${editExpect.price} 分 → 页面显示 ${monies[0]} 元`);

      if (editExpect.originalPrice) {
        const expectOrigin = (editExpect.originalPrice / 100).toFixed(2);
        if (monies[1] !== expectOrigin) bad(`划线原价换算错：页面 "${monies[1]}" ≠ 期望 "${expectOrigin}"`);
        else ok(`划线原价 ${editExpect.originalPrice} 分 → 页面显示 ${monies[1]} 元`);
      } else {
        ok(`该商品没有划线原价（originalPrice=${editExpect.originalPrice}），跳过`);
      }

      const stockV = inputs[inputs.length - 1];
      if (String(stockV) !== String(editExpect.stock)) bad(`库存回填错：页面 "${stockV}" ≠ API "${editExpect.stock}"`);
      else ok(`库存回填 ${stockV}`);
      // 单位是倒数第二个（库存是最后一个）
      const unitV = inputs[inputs.length - 2];
      if (editExpect.unit && unitV !== editExpect.unit) bad(`单位回填错：页面 "${unitV}" ≠ API "${editExpect.unit}"`);
      else ok(`单位回填 ${unitV}`);
      if (!o.categoryPicked || o.categoryPicked === '请选择分类') {
        bad(`所属分类没回填（显示 "${o.categoryPicked}"）`);
      } else ok(`所属分类回填 ${o.categoryPicked}`);
    }
  }
  const logs3 = takeLogs();
  if (logs3.length) console.log(`--- 控制台 ---\n${logs3.slice(0, 8).join('\n')}`);

  // =======================================================================
  // 4. 分类树
  // =======================================================================
  console.log('\n\n########## [店长] 分类树 ##########');
  takeLogs();
  await navigate(send, `${BASE}${PAGES.categoryList}`, 5400);
  {
    const o = await probe(send, 'categoryList');
    if (o) {
      if (o.guard) bad(`分类树停在守卫态: ${o.guardTitle}`);
      if (o.overflowX > 2) bad(`分类树横向溢出 ${o.overflowX}px`);
      // ⚠️ 不能写死行数 = 分类数（树是展开后才全出来）。只断言「至少每个父节点一行」
      const parentCount = catTree.length;
      if (o.rowCount < parentCount) bad(`分类树只渲染 ${o.rowCount} 行，父分类就有 ${parentCount} 个`);
      else ok(`分类树 ${o.rowCount} 行（父分类 ${parentCount} 个${catTree.some((c) => (c.children || []).length) ? '，含已展开的子分类' : '，当前库只有一层'}）`);

      // 排序按钮：同层首尾必须有一个是禁用的（pointer-events:none）
      const topRows = o.rows.filter((r) => !r.isChild);
      if (topRows.length >= 2) {
        const firstUpOff = topRows[0].sortClickable[0] === false;
        const lastDownOff = topRows[topRows.length - 1].sortClickable[1] === false;
        if (!firstUpOff) bad('分类树第一行的「上移」没禁用（已经到顶了）');
        if (!lastDownOff) bad('分类树最后一行的「下移」没禁用（已经到底了）');
        if (firstUpOff && lastDownOff) ok('同级排序首尾禁用正确');
      }
      // 展开箭头：没子节点的行，箭头区要留位但不显示图标
      const leafNoArrow = o.rows.filter((r) => !r.hasArrow && r.toggleW > 0);
      if (!leafNoArrow.length) bad('所有行都有箭头，但种子里父_id 全是 0（不该有子节点）');
      else ok(`${leafNoArrow.length} 行无子节点，箭头区留位 ${leafNoArrow[0].toggleW}px 保持文字对齐`);
      if (!o.fab) bad('分类树没有「+」浮动按钮');
      if (o.hint.length < 2) bad('分类树的底部说明少于 2 条');
    }
  }
  const logs4 = takeLogs();
  if (logs4.length) console.log(`--- 控制台 ---\n${logs4.slice(0, 8).join('\n')}`);

  // =======================================================================
  // 5. 分类编辑（新建）
  // =======================================================================
  console.log('\n\n########## [店长] 分类编辑（新建）##########');
  takeLogs();
  await navigate(send, `${BASE}${PAGES.categoryEditNew}`, 5200);
  {
    const o = await probe(send, 'categoryEditNew');
    if (o) {
      if (o.guard) bad('分类编辑（新建）停在守卫态');
      if (o.overflowX > 2) bad(`分类编辑（新建）横向溢出 ${o.overflowX}px`);
      if (o.name) bad(`分类编辑（新建）名称默认值应为空，实际 "${o.name}"`);
      if (!o.saveText) bad('分类编辑（新建）没有保存按钮');
      if (o.errHint) bad(`分类编辑（新建）一进来就显示校验错误「${o.errHint}」`);
      if (!o.hint.length) bad('分类编辑（新建）没有底部提示（新建页要说明「有子分类/商品时删不掉」）');
      // ★ S7-5：保存栏 fixed + 占位够高（两个管理端编辑页同一个坑，一起验）
      if (o.savePosition !== 'fixed') {
        bad(`分类编辑（新建）保存栏 position=${o.savePosition || '(无)' }，应为 fixed`);
      } else ok('保存栏 position: fixed');
      if (o.padH < 90) bad(`占位高度只有 ${o.padH}px，固定保存栏会盖住表单最后一项`);
      else ok(`占位高度 ${o.padH}px`);
    }
  }
  const logs5 = takeLogs();
  if (logs5.length) console.log(`--- 控制台 ---\n${logs5.slice(0, 8).join('\n')}`);

  // =======================================================================
  // 6. 用户列表
  // =======================================================================
  console.log('\n\n########## [店长] 用户列表 ##########');
  takeLogs();
  await navigate(send, `${BASE}${PAGES.userList}`, 5600);
  {
    const o = await probe(send, 'userList');
    if (o) {
      if (o.guard) bad(`用户列表停在守卫态: ${o.guardTitle}`);
      if (o.overflowX > 2) bad(`用户列表横向溢出 ${o.overflowX}px`);
      if (!o.hasSearch) bad('用户列表没有搜索框');
      if (!o.rowCount) bad('用户列表一条都没有');
      // 筛选：身份 3 项 + 状态 3 项，第一项都默认选中
      if (o.segs1.length !== 3) bad(`身份筛选项 ${o.segs1.length} 个，应为 3`);
      if (o.segs2.length !== 3) bad(`状态筛选项 ${o.segs2.length} 个，应为 3`);
      if (o.segs1.length && !o.segs1[0].on) bad('身份筛选第一项没默认选中');
      if (o.segs2.length && !o.segs2[0].on) bad('状态筛选第一项没默认选中');

      // 手机号不能整条显示
      if (o.phoneLeak.length) bad(`列表里泄漏了完整手机号 ×${o.phoneLeak.length}：${o.phoneLeak[0]}`);

      // 副行不许被省略号切掉（右侧「设为店长」占了 4 个字宽，很容易把时间挤没）
      const clipped = o.rows.filter((r) => r.subClipped);
      if (clipped.length) bad(`${clipped.length} 行的副行被截断：「${clipped[0].sub}」`);
      else ok(`${o.rows.length} 行副行完整显示（「${o.rows[0]?.sub}」）`);
      // 副行必须单行（height 超过 ~20px 就是换行了）
      const wrapped = o.rows.filter((r) => r.subH && r.subH > 20);
      if (wrapped.length) bad(`${wrapped.length} 行副行换行了（高 ${wrapped[0].subH}px）`);

      // ★ 核心断言：自己那行两个操作都必须禁用。
      //   店长（id=1）不一定在第一页（列表按 id 倒序，测试账号都比他新），
      //   所以下面会用搜索把他捞出来**单独验一次** —— 这条断言不允许「跳过就算过」。
      const me = o.rows.find((r) => r.isMe);
      if (me) verifySelfRow(me, '第一页');
      else console.log(`  · 店长（id=${adminId}）不在第一页，稍后用搜索单独验`);

      // 非自己的行：按钮必须可点，文案要区分授予/撤销
      const others = o.rows.filter((r) => !r.isMe);
      const wrongLabel = others.filter((r) => (r.isAdmin && r.opText !== '撤销') || (!r.isAdmin && r.opText !== '设为店长'));
      if (wrongLabel.length) bad(`${wrongLabel.length} 行身份按钮文案与身份不符：${wrongLabel[0].name} isAdmin=${wrongLabel[0].isAdmin} 文案="${wrongLabel[0].opText}"`);
      else if (others.length) ok(`${others.length} 行非自己：按钮文案与身份一致且可点`);

      // 被禁用的人：整行压低 + 有「已禁用」标签
      const off = o.rows.filter((r) => r.isOff);
      if (off.length) {
        const notDim = off.filter((r) => Number(r.rowOpacity) >= 1);
        if (notDim.length) bad(`${notDim.length} 行标了已禁用但整行没压低（opacity=${notDim[0].rowOpacity}）`);
        else ok(`${off.length} 行已禁用，整行压低到 opacity=${off[0].rowOpacity}`);
      } else {
        console.log('  · 当前页没有已禁用账号，跳过压低断言');
      }
    }
  }
  const logs6 = takeLogs();
  if (logs6.length) console.log(`--- 控制台 ---\n${logs6.slice(0, 8).join('\n')}`);

  // =======================================================================
  // 6b. 搜索自己的昵称 —— 把店长（id=1）捞到第一页，验「自己那行禁用」
  //   列表按 id 倒序，店长是最老的账号，默认排在最后一页。
  //   这条是 S7-4-2 的核心设计（前端拦 30004），绝不能因为「第一页看不到」就跳过。
  // =======================================================================
  console.log('\n\n########## 用户列表 · 搜自己的昵称，验「我」那行禁用 ##########');
  {
    const kw = admin.user?.nickname || '';
    if (!kw) {
      bad('店长没有昵称，无法搜索自己');
    } else {
      await typeSearch(send, kw);
      await sleep(4200);
      const out = await evaluate(send, EXPR_SELF_ROW);
      console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
      if (out && !out.__error) {
        const o = JSON.parse(out);
        if (!o.rowCount) {
          bad(`搜「${kw}」一条都没有 —— 搜索本身失效了`);
        } else if (!o.self) {
          bad(`搜「${kw}」有 ${o.rowCount} 行，但没有一行标了「我」（isMe 全 false）`);
        } else {
          verifySelfRow(o.self, `搜索「${kw}」`);
        }
      }
    }
    const l = takeLogs();
    if (l.length) console.log(`--- 控制台 ---\n${l.slice(0, 8).join('\n')}`);
  }

  // =======================================================================
  // 7. 筛选真实生效（点「店长」身份筛选 → 每一行都得有店长标签）
  // =======================================================================
  console.log('\n\n########## 用户列表 · 点「店长」筛选后 ##########');
  {
    // 先输入一个店长昵称关键词，保证筛选后**一定有数据**（库里可能一个店长都没有）
    await typeSearch(send, admin.user?.nickname || '店长');
    await sleep(600);
    // ⚠️ 要点的是**第 2 项「店长」**，不是第 1 项「全部身份」——
    //    点第 1 项等于没筛，会让断言看起来像「筛选没生效」
    const clicked = await realClick(send, '.seg', '店长');
    console.log(`  点「店长」筛选项 → ${clicked}`);
    await sleep(4000);
    const after = await evaluate(
      send,
      `JSON.stringify((function(){
        var q = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };
        var rows = q('.urow');
        return {
          onSeg: (function(){ var e = q('.seg--on')[0]; return e ? (e.textContent||'').trim() : ''; })(),
          rowCount: rows.length,
          names: rows.map(function(r){ return (r.querySelector('.urow__name')||{}).textContent || ''; }),
          allAdmin: rows.every(function(r){ return !!r.querySelector('.tag--admin'); }),
          hasOff: rows.some(function(r){ return !!r.querySelector('.tag--off'); }),
          chip: (function(){ var e = q('.chip__text')[0]; return e ? e.textContent.trim() : ''; })()
        };
      })())`,
    );
    console.log(after);
    if (after && !after.__error) {
      const a = JSON.parse(after);
      if (!a.onSeg) bad('点了身份筛选但没有高亮项');
      if (a.onSeg !== '店长') bad(`点了「店长」但高亮的是「${a.onSeg}」`);
      if (a.onSeg === '店长') {
        if (!a.rowCount) bad(`筛「店长」后一条都没有（关键词「${admin.user.nickname}」匹配不到？）`);
        else if (!a.allAdmin) bad(`筛「店长」后仍有 ${a.rowCount} 行里有的不是店长`);
        else ok(`筛「店长」后 ${a.rowCount} 行全部带店长标签${a.hasOff ? '（含已禁用账号）' : ''}`);
      }
    }
  }
  const logs7 = takeLogs();
  if (logs7.length) console.log(`--- 控制台 ---\n${logs7.slice(0, 8).join('\n')}`);

  // =======================================================================
  // 8. 顾客身份反例：5 个页面全部守卫 + 零 /admin 请求
  // =======================================================================
  if (customer) {
    console.log('\n\n########## [顾客] 5 个二级页守卫反例 ##########');
    await navigate(send, `${BASE}/`, 1500);
    await evaluate(send, seed(customer));
    const guardKeys = [
      ['productList', PAGES.productList],
      ['productEditNew', PAGES.productEditNew],
      ['categoryList', PAGES.categoryList],
      ['categoryEditNew', PAGES.categoryEditNew],
      ['userList', PAGES.userList],
    ];
    for (const [key, path] of guardKeys) {
      adminHits.length = 0;
      await navigate(send, `${BASE}${path}`, 4600);
      const out = await evaluate(send, EXPR_GUARD);
      console.log(`\n=== [顾客] ${key} ===`);
      console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
      console.log(`--- /admin 请求数: ${adminHits.length}${adminHits.length ? '  ← 不该有！' : ''}`);
      const o = typeof out === 'string' ? JSON.parse(out) : out;
      if (!o.emptyTitle) bad(`[顾客] ${key} 没有守卫空态`);
      if (o.prows || o.crows || o.urows || o.fields || o.abars) {
        bad(`[顾客] ${key} 守卫态仍渲染了业务内容 ${JSON.stringify({ prows: o.prows, crows: o.crows, urows: o.urows, fields: o.fields, abars: o.abars })}`);
      }
      if (o.skeletons) bad(`[顾客] ${key} 停在骨架屏（${o.skeletons} 个骨架块），点不到「去切换身份」`);
      if (adminHits.length) bad(`[顾客] ${key} 发了 ${adminHits.length} 个 /admin 请求：${adminHits[0]?.url}`);
    }
    await navigate(send, `${BASE}/`, 1500);
    await evaluate(send, seed(admin));
    console.log('\n（已把浏览器登录态复原为店长）');
  }

  // =======================================================================
  // 汇总
  // =======================================================================
  console.log('\n\n=== 汇总 ===');
  if (failures.length) {
    console.log(`✗ ${failures.length} 项异常:`);
    failures.forEach((f) => console.log(`  · ${f}`));
  } else {
    console.log('✓ 二级页探针未发现异常');
  }

  if (TAKE_SHOTS) {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '.shots');
    mkdirSync(dir, { recursive: true });
    const shots = [
      ['product-list', `${PAGES.productList}`],
      ['product-edit', `${PAGES.productEditNew}?id=${editExpect.id}`],
      ['category-list', PAGES.categoryList],
      ['category-edit', PAGES.categoryEditNew],
      ['user-list', PAGES.userList],
    ];
    for (const [name, path] of shots) {
      await navigate(send, `${BASE}${path}`, 5600);
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        // ⚠️ false：captureBeyondViewport:true 会把 position:fixed 画在「被截区域」底部，
        //    判固定栏位置会得到假象（见记忆）。这里要的是真实视口。
        captureBeyondViewport: false,
      });
      const out = join(dir, `admin-${name}.png`);
      writeFileSync(out, Buffer.from(shot.data, 'base64'));
      console.log(`  截图 -> ${out}`);
    }
  }

  ws.close();
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error('探针失败:', err.message);
  process.exit(1);
});