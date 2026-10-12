/**
 * 诊断：量「图标 + 文字」组合的垂直对齐偏差
 *
 * 用法：先起 Chrome(9222) + serve-dist，然后
 *   node scripts/probe-align.mjs                 # 跑内置用例表
 *   node scripts/probe-align.mjs --json          # 只输出 JSON，便于机器判读
 *
 * 判读标准（对齐规范）：
 *   同行「图标 + 文字」→ 图标真实图形中心与文字真实墨迹中心偏差 |delta| < 1px
 *   「图标 + 多行文字」的提示条 → 图标中心对齐**第一行**文字中心（delta 同样 < 1px）
 *
 * 关键：文字中心用 document.createRange() 量**真实墨迹包围盒**，
 *       而不是 getBoundingClientRect() 的盒子 —— 盒子被 line-height 撑大后
 *       中心 ≠ 视觉中心，这正是「图标看着下沉」的根因。
 */
const CDP_HOST = process.env.CDP_HOST || 'http://127.0.0.1:9222';
const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:4180';
const JSON_ONLY = process.argv.includes('--json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws = null,
  id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

async function connect() {
  const list = await (await fetch(CDP_HOST + '/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('没找到 page target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  };
}

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(
      r.exceptionDetails.text + ' | ' + (r.exceptionDetails.exception?.description || ''),
    );
  }
  return r.result.value;
};

/** 在一个页面里量一组选择器 */
async function measureOn(route, cases) {
  await send('Page.navigate', { url: `${BASE}/?r=${Date.now()}#${route}` });
  await sleep(2600);
  const results = [];
  for (const c of cases) {
    const out = await evalJs(`(()=>{
      const host = document.querySelector(${JSON.stringify(c.sel)});
      if (!host) return { found: false };
      const icon = host.querySelector('.app-icon');
      const textEl = host.querySelector('text, uni-text');
      if (!icon) return { found: 'no-icon', html: host.outerHTML.slice(0, 160) };
      if (!textEl) return { found: 'no-text', html: host.outerHTML.slice(0, 160) };

      // 图标内部真实图形（跳过外层正方形盒子的留白）
      const inner = icon.querySelector('svg, .app-icon__img');
      const ib = (inner || icon).getBoundingClientRect();

      // 文字真实墨迹：range 取内容包围盒。
      // 过滤掉「零宽/零高」的空节点 rect（模板换行产生的空白文本节点会额外产 rect），
      // 再按 top 排序取**第一行**，对齐目标是首行中线。
      const rng = document.createRange();
      rng.selectNodeContents(textEl);
      const rects = Array.from(rng.getClientRects())
        .filter((r) => r.height > 0.5 && r.width > 0.5)
        .sort((a, b) => a.top - b.top || a.left - b.left);
      if (!rects.length) return { found: 'empty-text' };
      // 首行可能有多个相邻 rect（不同字号拼接），取首行组里最高/最左那个
      const topY = rects[0].top;
      const firstLineRects = rects.filter((r) => Math.abs(r.top - topY) < 1);
      const firstLine = firstLineRects.reduce((a, b) => (b.height > a.height ? b : a));
      const lineCount = new Set(rects.map((r) => Math.round(r.top))).size;

      const iCy = ib.top + ib.height / 2;
      const tCy = firstLine.top + firstLine.height / 2;
      const cs = getComputedStyle(host);
      const tcs = getComputedStyle(textEl);
      return {
        found: true,
        align: cs.alignItems,
        iconSize: +ib.height.toFixed(2),
        textFontSize: tcs.fontSize,
        textLineHeight: tcs.lineHeight,
        lineCount,
        iconCY: +iCy.toFixed(2),
        textCY: +tCy.toFixed(2),
        delta: +(iCy - tCy).toFixed(2),
      };
    })()`);
    results.push({ label: c.label, route, sel: c.sel, ...out });
  }
  return results;
}

const CASES = [
  {
    route: '/pages/mine/mine',
    cases: [
      { label: '我的 · 角色标签(顾客/店长)', sel: '.rolechip' },
      { label: '我的 · 「全部」入口', sel: '.card__more' },
      { label: '我的 · 未登录卡头', sel: '.card__head' },
    ],
  },
  {
    route: '/pages/home/home',
    cases: [
      { label: '首页 · 顶部角标(送到宿舍门口)', sel: '.hero__tag' },
      { label: '首页 · 「全部分类」', sel: '.block__more' },
      { label: '首页 · 品牌行', sel: '.hero__brand' },
      { label: '首页 · 搜索框', sel: '.hero__search' },
    ],
  },
  {
    route: '/pages/category/category',
    cases: [{ label: '分类页 · 顶部搜索', sel: '.navsearch' }],
  },
  {
    route: '/pages/product/list?categoryId=1',
    cases: [
      { label: '商品列表 · 排序「价格」(morphable)', sel: '.sortbar__item' },
      { label: '商品列表 · 重置条', sel: '.resultbar__reset' },
    ],
  },
  {
    route: '/pages/cart/cart',
    cases: [{ label: '购物车 · 清空栏', sel: '.toolbar__clear' }],
  },
  {
    route: '/pages/mine/profile',
    cases: [{ label: '个人资料 · 提示条(图标+多行)', sel: '.hint' }],
  },
  {
    route: '/pages/address/list',
    cases: [{ label: '地址列表 · 提示条(图标+多行)', sel: '.alist__tip' }],
  },
  {
    route: '/pages/admin/dashboard',
    cases: [{ label: '管理看板 · 警示条', sel: '.notice' }],
  },
  {
    route: '/pages/admin/manage',
    cases: [{ label: '管理首页 · 底部提示', sel: '.tip' }],
  },
];

async function main() {
  await connect();
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  // 登录预览账号
  await send('Page.navigate', { url: `${BASE}/#/pages/login/login` });
  await sleep(3000);
  await evalJs(
    `(()=>{const b=Array.from(document.querySelectorAll('.btn')).find(x=>x.textContent.includes('一键预览登录'));if(b)b.click();})()`,
  );
  await sleep(3500);

  const all = [];
  for (const g of CASES) {
    all.push(...(await measureOn(g.route, g.cases)));
  }

  if (JSON_ONLY) {
    console.log(JSON.stringify(all, null, 2));
  } else {
    let bad = 0;
    for (const r of all) {
      const ok = r.found === true && r.delta != null && Math.abs(r.delta) < 1;
      if (!ok) bad++;
      const mark = r.found !== true ? '?' : ok ? '✓' : '✗';
      const d = r.delta != null ? `${r.delta > 0 ? '+' : ''}${r.delta}px` : '-';
      console.log(
        `${mark} [${d}] ${r.label}  (icon ${r.iconSize ?? '-'} / font ${r.textFontSize ?? '-'} / lh ${r.textLineHeight ?? '-'} / ${r.lineCount ?? '-'} 行)`,
      );
      if (r.found !== true) console.log(`      ↳ ${r.found} ${r.html || ''}`);
    }
    console.log(`\n判读：delta = 图标视觉中心 − 文字首行视觉中心；|delta| < 1px 视为居中。`);
    console.log(`结果：${all.length - bad} ✓ / ${bad} ✗`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FAIL', e.message);
    process.exit(1);
  });
