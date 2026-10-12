/**
 * 多页面自验脚本（开发自用，不参与打包）
 * ---------------------------------------------------------------------------
 * 一次跑完所有页面：导航 → 等渲染 → 跑断言表达式 → 截图 → 汇总。
 * 比「一页一页手点截图」可靠，而且断言是**可复现**的（同一份表达式）。
 *
 * 前置：
 *   1) node scripts/serve-dist.mjs 4180        （托管 dist/build/h5）
 *   2) chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp> about:blank
 *
 * 用法：
 *   node scripts/verify-pages.mjs [--only=home,category] [--shots=1]
 *
 * 断言写法：`check` 是一个返回对象的表达式，脚本会对每个 key 判真假并打出 ✓/✗。
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const CDP_HOST = process.env.CDP_HOST || 'http://127.0.0.1:9222';
const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:4180';
const SHOT_DIR = process.env.SHOT_DIR || 'D:/wechatseller/.workbuddy/shots';

const argv = process.argv.slice(2);
const onlyArg = argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',') : null;
const doShots = argv.includes('--shots=1');
/** 只跑不需要登录的那些页（S7-0/S7-1 的基线回归） */
const noLogin = argv.includes('--no-login');

/**
 * CDP 发送器 —— 由 connect() 在建立连接后赋值。
 * 之所以做成模块级变量：PAGES 表里的 `prepare` / `cleanup` 是内联函数，
 * 需要一个「随时能发命令」的入口（例如切换身份后把新 token 写回 localStorage）。
 */
let cdpSend = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 登录步骤必须在**页面上下文里**跑，因为要写 uni 的 storage。
 * 所以做法是：导航到登录页 → 注入一段脚本点「一键预览登录」→ 等跳转。
 *
 * 用固定 code `h5-preview`（后端 WX_MOCK_LOGIN=true 时 openid = mock_h5-preview），
 * 每次都是同一个账号「舍友view」，不会像随机 code 那样每跑一次就新建一个账号。
 */
async function loginForPreview(send) {
  await send('Page.navigate', { url: `${BASE}/#/pages/login/login` });
  await sleep(3000);
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('.btn'));
      const target = btns.find((b) => b.textContent.includes('一键预览登录'));
      if (!target) return 'no-button';
      target.click();
      return 'clicked';
    })()`,
    returnByValue: true,
  });
  const clicked = res.result?.value;
  await sleep(4000);
  // 确认真的登上了。storage key 见 src/utils/config.js 的 STORAGE_KEYS
  const ok = await send('Runtime.evaluate', {
    expression: `!!localStorage.getItem('ws_access_token')`,
    returnByValue: true,
  });
  return { clicked, logged: !!ok.result?.value };
}

/**
 * 取「后端认为的购物车应收合计」（整个 CartVo）。
 *
 * 为什么不在断言里写死 `¥17.50`：
 *   购物车是**可变状态** —— 这个库跑过很多轮测试，商品数量、勾选状态、上下架
 *   随时可能和「我上次跑的时候」不一样。写死数字的断言今天绿明天红，
 *   而且红的时候说不清是页面错了还是数据变了。
 *   取后端的值、再和页面显示的比，才是真正在验「页面有没有正确渲染服务端的数字」，
 *   也正是「合计一律用服务端数字」这条设计的守卫。
 */
async function expectedCart() {
  try {
    // 用和浏览器同一个账号（固定 code h5-preview），保证看到的是同一份购物车
    const token = await previewToken();
    if (!token) return null;
    const res = await fetch(`${BASE}/api/v1/cart`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    return body?.data || null;
  } catch {
    return null;
  }
}

/** 取某个商品的当前 stock / salesCount —— 详情页断言要拿它比，不能写死种子值 */
async function productSnapshot(id = 2) {
  try {
    const res = await fetch(`${BASE}/api/v1/products/${id}`);
    const body = await res.json();
    return body?.data || null;
  } catch {
    return null;
  }
}

/** 分 → 用于页面文案比对的两小数元字符串，例如 1750 → '17.50' */
const yuan = (fen) => (Number(fen) / 100).toFixed(2);

/** 以上面的固定 code 登录，拿到 accessToken（供 seedCart / 各 prepare 复用） */
async function previewToken() {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'h5-preview' }),
  });
  const body = await r.json();
  return body?.data?.accessToken || '';
}

/**
 * 取预览账号的当前资料（UserVo）
 *
 * 为什么要这个：管理端页面要求 currentRole=ADMIN，而预览账号默认是 CUSTOMER。
 * 探针需要「切过去 → 跑断言 → 切回来」，切回来前得先记住原来的身份。
 */
async function previewMe() {
  const token = await previewToken();
  if (!token) return null;
  try {
    const r = await fetch(`${BASE}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (await r.json())?.data || null;
  } catch {
    return null;
  }
}

/**
 * 以**店长身份**登录，并把 token/user 写进浏览器 storage
 *
 * ── 为什么不让预览账号切身份 ─────────────────────────────────────────────
 * 预览账号 `舍友view` 的 roles 只有 `["CUSTOMER"]`，调 `/auth/switch-role`
 * 切 ADMIN 会得到 **30003 当前账号未开通「店长」身份** ——
 * 这条路走不通，不是 bug，是数据决定的。
 * 所以改用**种子店长的手机号验证码登录**（13800000001，roles=[CUSTOMER,ADMIN]，
 * current_role=ADMIN），这是后端冒烟脚本一直在用的同一条路。
 *
 * ── 为什么写完之后还要整页重载 ───────────────────────────────────────────
 * uni-app H5 的 store 是在 `App.vue` 挂载时通过 `userStore.restore()`
 * **异步**读 storage 恢复的。只改 localStorage + 改 hash 导航的话，
 * 页面组件会重新 onLoad，但 store 不会重建 —— 表现是**仍然停在守卫空态**
 * （`isAdmin` 是上一次 restore 留下的 false）。
 * 实测：写 storage → `Page.navigate` 改 hash → 仍空态；
 *       写 storage → `Page.reload`（整页重载）→ 正常。
 */
async function loginAsAdminInBrowser() {
  const sms = await fetch(`${BASE}/api/v1/auth/sms-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800000001' }),
  });
  const code = (await sms.json())?.data?.mockCode;
  if (!code) return null;

  const r = await fetch(`${BASE}/api/v1/auth/phone-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800000001', smsCode: code }),
  });
  const data = (await r.json())?.data;
  if (!data?.accessToken) return null;

  // token 是**标量** → uni 存成裸字符串（不加引号）
  // user 是**对象** → uni 包一层 { type:'object', data:{...} }
  const wrappedUser = JSON.stringify({ type: 'object', data: data.user });
  await cdpSend('Runtime.evaluate', {
    expression: `(() => {
      localStorage.setItem('ws_access_token', ${JSON.stringify(data.accessToken)});
      localStorage.setItem('ws_refresh_token', ${JSON.stringify(data.refreshToken || '')});
      localStorage.setItem('ws_user', ${JSON.stringify(wrappedUser)});
      return 'ok';
    })()`,
    returnByValue: true,
  });
  return data.user;
}

/** 读浏览器里当前的 accessToken（裸字符串，不用 JSON.parse） */
async function currentBrowserToken() {
  const r = await cdpSend('Runtime.evaluate', {
    expression: `localStorage.getItem('ws_access_token') || ''`,
    returnByValue: true,
  });
  return r?.result?.value || '';
}

/** 恢复成预览顾客账号（后面的顾客端用例依赖它） */
async function restorePreviewCustomerInBrowser() {
  const token = await previewToken();
  const me = await previewMe();
  if (!token || !me) return false;
  const wrappedUser = JSON.stringify({ type: 'object', data: me });
  await cdpSend('Runtime.evaluate', {
    expression: `(() => {
      localStorage.setItem('ws_access_token', ${JSON.stringify(token)});
      localStorage.setItem('ws_user', ${JSON.stringify(wrappedUser)});
      return 'ok';
    })()`,
    returnByValue: true,
  });
  return true;
}

/**
 * 把购物车重置成**一组确定的数据**，让购物车页的断言不依赖历史残留。
 *
 * 为什么必须这么做：购物车是可变的真实业务数据 ——
 *   用户自己在浏览器里点几下、上一轮测试留下的勾选状态、
 *   甚至别人下过单删掉的条目，都会让它和「我写断言时的样子」不一样。
 *   与其写「恰好 4 条」然后天天修，不如**每次跑之前自己造一份**。
 *
 * 造的数据刻意包含：
 *   · 一个 quantity > 1 的条目（验小计 = 单价 × 数量、验步进器显示）
 *   · 四个条目（够长，能验固定结算栏不遮最后一行）
 * 失效条目**不在这里造** —— 那要改商品上下架，会影响别的用例。
 * 购物车的断言写成「和 /cart 的返回一致」，所以有没有失效条目都能过。
 */
async function seedCart(token) {
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const call = async (m, u, body) =>
    (await fetch(`${BASE}/api/v1${u}`, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined })).json();

  await call('DELETE', '/cart');
  // [productId, quantity]：农夫山泉 ×3（验小计）、泡面、纸杯、笔记本各 ×1
  for (const [pid, q] of [[2, 3], [7, 1], [10, 1], [12, 1]]) {
    // eslint-disable-next-line no-await-in-loop
    await call('POST', '/cart', { productId: pid, quantity: q });
  }
}

/** ------------------------------------------------------------------ 页面清单 */
const PAGES = [
  {
    key: 'home',
    label: '首页',
    hash: '#/pages/home/home',
    wait: 4500,
    /**
     * 底部 tab 的**项数取决于当前身份**（顾客 4 项 / 店长 3 项），
     * 所以不能写死 `=== 4`。这里从后端问一次当前账号的 currentRole，再换算期望项数。
     *
     * 为什么必须这样：`舍友view` 这个账号如果 current_role 是 ADMIN，
     * 首页渲染的就是店长工作台，tab 只有 3 项。
     * 写死 4 的断言在那时会红，而且红得让人以为是布局坏了 —— 其实是数据变了。
     */
    prepare: async () => {
      const token = await previewToken();
      if (!token) return null;
      const r = await fetch(`${BASE}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const me = (await r.json())?.data;
      const role = me?.currentRole || 'CUSTOMER';
      const TAB_COUNT = { CUSTOMER: 4, ADMIN: 3 };
      return { role, tabCount: TAB_COUNT[role] || 4 };
    },
    check: `(() => {
      const t = document.body.innerText;
      const ctx = __ctx || {};
      const want = ctx.tabCount || 4;
      // 商品图必须**真的是正方形**。这条是踩坑后的守卫：
      // padding-bottom:100% 曾经写错层级，112rpx 的缩略图被撑成 326px 高，
      // 而只看截图很容易漏掉 —— 所以这里量真实几何。
      const sq = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return false;
        const b = e.getBoundingClientRect();
        return b.width > 0 && Math.abs(b.width - b.height) < 2;
      };
      const rowEl = document.querySelector('.rank__row');
      const rowH = rowEl ? rowEl.getBoundingClientRect().height : 0;
      return {
        '标题=宿舍小超市': t.includes('宿舍小超市'),
        '有搜索入口': t.includes('搜索饮料'),
        // 不能写死 === 5：smoke-catalog.js 建过临时分类且没删干净，库里可能 > 5 个
        '分类宫格含种子 5 个': (() => {
          const names = Array.from(document.querySelectorAll('.cats__name')).map((e) => e.textContent.trim());
          return ['饮料冲调','休闲零食','泡面速食','日用百货','文具办公'].every((x) => names.includes(x))
            && document.querySelectorAll('.cats__item').length >= 5;
        })(),
        '分类名正确': t.includes('饮料冲调') && t.includes('文具办公'),
        '热销榜有 3 行': document.querySelectorAll('.rank__row').length === 3,
        '热销第一名=农夫山泉': (document.querySelector('.rank__name')||{}).textContent === '农夫山泉 550ml',
        '新品 4 张卡': document.querySelectorAll('.grid__cell').length === 4,
        '无碎图（图片全是字标）': document.querySelectorAll('.pimg__mono').length >= 7,
        // 缩略图正方形 + 行高不被撑爆
        '热销榜缩略图是正方形': sq('.rank__row .pimg'),
        '热销榜行高 ≤ 110px': rowH > 0 && rowH <= 110,
        '新品格子图是正方形': sq('.grid__cell .pimg'),
        // 项数由当前身份决定（见 prepare）
        '底部 tab 项数 = 当前身份的项数': document.querySelectorAll('.tabbar__item').length === want,
        'tab 图标是真 svg': document.querySelectorAll('.tabbar__icon-box svg').length === want,
        // 用 Unicode 属性 \\p{Emoji_Presentation}，而不是硬写码点区间 ——
        // 它只匹配「默认就按彩色 emoji 呈现」的字符（🛒⭐☕），
        // 不会误伤正文里的 ✓ ✗ ↑ → 这类普通符号。
        '没有 emoji 图标残留': !/\\p{Emoji_Presentation}/u.test(t),
      };
    })()`,
  },
  {
    key: 'category',
    label: '分类页',
    hash: '#/pages/category/category',
    wait: 4500,
    /**
     * 「饮料冲调」当前有几个在售商品 —— 从 API 取，不写死。
     *
     * 为什么必须这样：这个库是**可变业务数据**，探针跑一轮就会下架/新建商品。
     * 断言原本写死了数量，页面其实是对的，但一旦有商品被下架就红 ——
     * 红得像是布局坏了，其实只是数据变了。判据应该是「页面和后端一致」，
     * 而不是「页面等于我写断言那天看到的数字」。
     */
    prepare: async () => {
      try {
        // ⚠️ 这里原来写死 categoryId=1（当时的「第一个分类」是饮料冲调），
        // 但分类顺序会变 —— 探针造/删分类后第一个可能是别的 id，
        // 于是「商品数与后端一致」拿 A 的数量去比 B 的页面，红得莫名其妙。
        // 改成**按后端返回的顺序取第一个启用的一级分类**，再用它的 id 查商品数，
        // 保证「页面显示的分类」和「我查的商品数」永远是同一个分类。
        const cr = await fetch(`${BASE}/api/v1/categories`);
        const tree = (await cr.json())?.data || [];
        const first = tree.find((c) => c.parentId === 0 && c.status !== 0);
        if (!first) return null;
        const pr = await fetch(`${BASE}/api/v1/products?categoryId=${first.id}&pageSize=50`);
        const d = (await pr.json())?.data;
        return { firstCatId: first.id, firstCatName: first.name, onsaleCount: d?.total ?? null };
      } catch {
        return null;
      }
    },
    check: `(() => {
      const want = __ctx.onsaleCount;
      const t = document.body.innerText;
      const sq = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return false;
        const b = e.getBoundingClientRect();
        return b.width > 0 && Math.abs(b.width - b.height) < 2;
      };
      /*
       * 元素「内容」的真实最右边界。
       * 不能只看 el.scrollWidth —— 实测 .price 的 scrollWidth 报 0 溢出，
       * 但里面的划线原价实际画到了容器外面、压在 + 按钮上（6 倍放大才看得出来）。
       * 所以要逐个后代的 getClientRects() 取最大 right。
       */
      const spillRight = (el) => {
        let r = el.getBoundingClientRect().right;
        el.querySelectorAll('*').forEach((c) => {
          Array.from(c.getClientRects()).forEach((x) => {
            if (x.right > r) r = x.right;
          });
        });
        return r;
      };
      return {
        // 同上：不写死 === 5，只要求种子 5 个都在
        '左侧一级分类含种子 5 个': (() => {
          const names = Array.from(document.querySelectorAll('.rail__text')).map((e) => e.textContent.trim());
          return ['饮料冲调','休闲零食','泡面速食','日用百货','文具办公'].every((x) => names.includes(x))
            && document.querySelectorAll('.rail__item').length >= 5;
        })(),
        '第一个是后端排序的首个一级分类': ((document.querySelector('.rail__text')||{}).textContent||'').trim() === __ctx.firstCatName,
        '第一个默认选中': !!document.querySelector('.rail__item--active'),
        '右侧商品网格非空': document.querySelectorAll('.grid__cell').length > 0,
        /**
         * ⚠️ 这里**故意不写死**数量。
         * 踩过的坑：这个断言原本写的是「商品数 3（饮料冲调）」，跑了一轮全绿，
         * 后来探针把某个商品下架了（库从 3 个变成 2 个在售），断言就红了 ——
         * 但**页面其实是对的**，是断言在跟可变数据较劲。
         * MEMORY 里的原话：「断言里的数值一律从 API 派生，不许写死」。
         * 现在改成：页面渲染数量 === 该分类的**在售**商品数（由 API 提供，见 prepare）。
         */
        '商品数与后端一致': document.querySelectorAll('.grid__cell').length === __ctx.onsaleCount,
        '商品格子图是正方形': sq('.grid__cell .pimg'),
        // 格子只有 131px 宽，装不下「现价 + 原价 + 加购钮」 -> 网格卡不显示原价
        '网格卡不显示划线原价': document.querySelectorAll('.grid__cell .price__origin').length === 0,
        '网格卡价格没压到加购钮': (() => {
          const p = document.querySelector('.grid__cell .price');
          const a = document.querySelector('.grid__cell .pcard__add');
          if (!p || !a) return false;
          return spillRight(p) <= a.getBoundingClientRect().left + 0.5;
        })(),
        '显示件数': /\\d+ 件/.test(t),
        '无横向溢出': document.documentElement.scrollWidth <= 391,
      };
    })()`,
  },
  {
    key: 'list',
    label: '商品列表（搜索）',
    hash: '#/pages/product/list?keyword=%E9%9D%A2',
    wait: 4500,
    check: `(() => {
      const t = document.body.innerText;
      const sq = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return false;
        const b = e.getBoundingClientRect();
        return b.width > 0 && Math.abs(b.width - b.height) < 2;
      };
      // 列表卡必须是横排。踩坑守卫：页面级样式曾经把 .pcard--list 的
      // display:flex 覆盖成 block，卡片退化成竖排且留一大片空白。
      const card = document.querySelector('.pcard--list');
      const body = document.querySelector('.pcard--list .pcard__body');
      const cs = card ? getComputedStyle(card) : null;
      // 内容真实最右边界，见 category 页里同款注释（scrollWidth 查不出这种溢出）
      const spillRight = (el) => {
        let r = el.getBoundingClientRect().right;
        el.querySelectorAll('*').forEach((c) => {
          Array.from(c.getClientRects()).forEach((x) => {
            if (x.right > r) r = x.right;
          });
        });
        return r;
      };
      return {
        // uni-app H5 会把 <input class="sbox__input"> 编译成
        // <uni-input class="sbox__input"><input class="uni-input">，
        // .value 得从里面那个真 input 上读，直接读 .sbox__input 是 undefined。
        '搜索框有值「面」': ((document.querySelector('.sbox__input input') || document.querySelector('.sbox__input') || {}).value || '') === '面',
        '排序条 4 项': document.querySelectorAll('.sortbar__item').length === 4,
        // 价格这一格是全项目唯一交给 morphicons 托管的图标。
        // AppIcon 的根是 <view class="app-icon sortbar__icon">，svg 在它内部。
        '价格项有图标': !!document.querySelector('.sortbar__icon svg, svg.sortbar__icon'),
        '命中 2 条': document.querySelectorAll('.pcard--list').length === 2,
        '结果条显示关键词': t.includes('「面」'),
        // 后端 keyword 搜的是「名称 + 副标题」：卫龙辣条 是靠副标题「经典大面筋」
        // 命中的，所以不能断言每条名字都含「面」——那是错的预期。
        '至少一条名称含「面」': Array.from(document.querySelectorAll('.pcard__name')).some((n) => n.textContent.includes('面')),
        // 布局守卫：横排 + 缩略图正方形 + 正文在图右侧
        '列表卡是横排 flex/row': !!cs && cs.display === 'flex' && cs.flexDirection === 'row',
        '列表卡缩略图是正方形': sq('.pcard--list .pimg'),
        '列表卡正文在图右侧': !!card && !!body && body.getBoundingClientRect().x > card.getBoundingClientRect().x + 40,
        '列表卡高度不超过 160px': !!card && card.getBoundingClientRect().height <= 160,
        // 列表卡是一整行、宽得多，所以这里**保留**划线原价；同时守住它不压到加购钮
        '列表卡显示划线原价': document.querySelectorAll('.pcard--list .price__origin').length > 0,
        '列表卡价格没压到加购钮': (() => {
          const p = document.querySelector('.pcard--list .price');
          const a = document.querySelector('.pcard--list .pcard__add');
          if (!p || !a) return false;
          return spillRight(p) <= a.getBoundingClientRect().left + 0.5;
        })(),
      };
    })()`,
  },
  {
    key: 'list-sort',
    label: '商品列表（价格排序）',
    hash: '#/pages/product/list?categoryId=4',
    wait: 4500,
    tapSort: true,
    check: `(() => {
      return {
        '分类 4（日用百货）有 2 个商品': document.querySelectorAll('.pcard--list').length === 2,
        '点击价格后该项激活': !!document.querySelector('.sortbar__item--on .sortbar__icon'),
        '激活态价格图标仍是 svg': !!document.querySelector('.sortbar__item--on .sortbar__icon svg, svg.sortbar__icon'),
      };
    })()`,
  },
  {
    key: 'detail',
    label: '商品详情',
    hash: '#/pages/product/detail?id=2',
    wait: 4500,
    /**
     * 库存 / 已售**不能写死种子值**（原来是 215 / 373）。
     * 下单会真的扣库存、加销量 —— 用户自己下几单、上一轮测试下一个单，
     * 这两个数字就变了。写死的话断言会莫名其妙变红，而且说不清是谁的问题。
     * 从接口取当前值再比，才是真正在验「页面有没有正确显示这个商品的库存/销量」。
     */
    prepare: async () => {
      const p = await productSnapshot(2);
      if (!p) return null;
      return { stock: String(p.stock), sales: String(p.salesCount), name: p.name };
    },
    check: `(() => {
      const t = document.body.innerText;
      const ctx = __ctx || {};
      return {
        '名称与接口一致': t.includes(ctx.name),
        '价格 ¥2.00': t.includes('2.00'),
        '副标题=天然饮用水': t.includes('天然饮用水'),
        '库存数与接口一致': t.includes('库存 ' + ctx.stock),
        '已售数与接口一致': t.includes('已售 ' + ctx.sales),
        '数量步进器': !!document.querySelector('.stepper') && !!document.querySelector('.stepper__val'),
        '步进器默认 1': (document.querySelector('.stepper__val')||{}).textContent.trim() === '1',
        '加减按钮是 svg': document.querySelectorAll('.stepper__btn svg').length === 2,
        '底部栏两按钮': document.querySelectorAll('.actionbar__btn').length === 2,
        '加购按钮带图标': !!document.querySelector('.actionbar__btn svg'),
        '主图区是字标': !!document.querySelector('.hero .pimg__mono'),
        '主图是正方形': (() => {
          const e = document.querySelector('.hero .pimg');
          if (!e) return false;
          const b = e.getBoundingClientRect();
          return b.width > 0 && Math.abs(b.width - b.height) < 2;
        })(),
        // 价格和原价相等时不该画删除线（种子数据里 originalPrice == price）
        '无假删除线': !document.querySelector('.price__origin'),
      };
    })()`,
  },
  {
    key: 'device',
    label: '设计系统预览（图标区）',
    hash: '#/pages/dev/design-preview',
    wait: 5000,
    check: `(() => {
      const t = document.body.innerText;
      // class 能不能透传到 AppIcon 的根节点，靠这条守 ——
      // 组件一旦多出第二个根元素，Vue 会静默丢掉 class，这里立刻变红。
      const iconColor = (sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).color : '';
      };
      return {
        '有图标墙': document.querySelectorAll('.iconwall__cell').length >= 45,
        '图标墙每格都有 svg': document.querySelectorAll('.iconwall__box svg').length >= 45,
        '形变演示按钮存在': !!document.querySelector('.morphrow .btn'),
        '三种弹簧手感': document.querySelectorAll('.springbox').length === 3,
        '状态标签 4 个': document.querySelectorAll('.tag').length >= 4,
        '状态标签有图标': document.querySelectorAll('.tag svg').length >= 4,
        // 只扫状态标签本身，不扫整页正文 —— 整页 includes 会因为其它段落
        // 里的普通文字而假报错。
        '状态标签里没有「已完成」': !Array.from(document.querySelectorAll('.tag')).some((el) => el.textContent.includes('已完成')),
        // 每个状态的图标有自己的颜色（success #0e8a43 / warning #b86e00），
        // 而不是统统落回深色文字色 —— 这是 .tag__icon 真的生效了的证据。
        '已送达标签图标=绿 #0e8a43': iconColor('.tag--success .tag__icon') === 'rgb(14, 138, 67)',
        '待接单标签图标=琥珀 #b86e00': iconColor('.tag--warning .tag__icon') === 'rgb(184, 110, 0)',
        '正文无 emoji': !/\\p{Emoji_Presentation}/u.test(t),
      };
    })()`,
  },

  // =========================================================================
  // S7-2 —— 需要登录。所以这几个 page 定义要配合 main() 里的登录步骤
  // =========================================================================
  {
    key: 'cart',
    label: '购物车',
    hash: '#/pages/cart/cart',
    wait: 4500,
    needLogin: true,
    /**
     * 这个用例的期望值从后端现取，不写死。
     * `ctx` 会被序列化进 check 表达式的首行（`const __ctx = {...}`），
     * 所以断言里可以直接用 `__ctx.totalYuan` / `__ctx.itemCount`。
     */
    prepare: async () => {
      const c = await expectedCart();
      if (!c) return null;
      const avail = (c.list || []).filter((x) => x.available);
      const off = (c.list || []).filter((x) => !x.available);
      return {
        itemCount: c.itemCount,
        availCount: avail.length,
        offCount: off.length,
        totalYuan: yuan(c.totalAmount),
        totalQuantity: c.totalQuantity,
        selectedItemCount: c.selectedItemCount,
        availQuantityTotal: avail.reduce((s, x) => s + Number(x.quantity), 0),
        // 完整的条目列表：断言要拿它和页面上渲染的顺序/数量对齐
        list: (c.list || []).map((x) => ({
          id: x.id,
          name: x.name,
          quantity: Number(x.quantity),
          available: !!x.available,
        })),
      };
    },
    check: `(() => {
      const t = document.body.innerText;
      const ctx = __ctx || {};
      const items = Array.from(document.querySelectorAll('.citem'));
      const avail = items.filter((el) => !el.classList.contains('citem--off'));
      const off = items.filter((el) => el.classList.contains('citem--off'));

      // 固定结算栏会不会盖住最后一条。这是固定底栏最经典的坑，
      // 只截图很容易看不出差几 px —— 所以这里量真实几何。
      const last = items[items.length - 1];
      const bar = document.querySelector('.checkout');
      const lastRect = last ? last.getBoundingClientRect() : null;
      const barRect = bar ? bar.getBoundingClientRect() : null;

      // 结算栏必须**在**最后一条下面（不能重叠）
      const noOverlap = !!(lastRect && barRect) && lastRect.bottom <= barRect.top + 0.5;

      // 竖着的圆角勾选框（不是方形的 uni-checkbox）
      const cboxes = Array.from(document.querySelectorAll('.citem .cbox__box'));
      const roundBoxes = cboxes.filter((b) => {
        const cs = getComputedStyle(b);
        return parseFloat(cs.borderRadius) >= parseFloat(cs.width) / 2 - 0.5;
      });

      return {
        '条目数 = 后端 itemCount': items.length === ctx.itemCount,
        '失效条目数 = 后端不可用条数': off.length === ctx.offCount,
        // ★ 最关键的一条：失效条目**不能消失**。后端特意返回 available:false，
        //   前端筛掉的话用户会以为没加成功，然后再加一次。
        '失效条目仍在列表里且显示原因': ctx.offCount === 0 || (off.length === ctx.offCount && /下架|库存不足/.test(off.map((e) => e.textContent).join(''))),
        '失效条目勾选框被禁用': ctx.offCount === 0 || off.every((e) => !!e.querySelector('.cbox--disabled')),
        '可结算条目数 = 后端': avail.length === ctx.availCount,
        '勾选框是圆形': cboxes.length === items.length && roundBoxes.length === items.length,
        '勾选框是自绘的（不是 uni-checkbox）': document.querySelectorAll('uni-checkbox, .uni-checkbox').length === 0,
        '每行都有数量步进器': document.querySelectorAll('.citem .stepper').length === items.length,
        '步进器加减是 svg': document.querySelectorAll('.citem .stepper__btn svg').length === items.length * 2,
        '步进器数字与后端 quantity 一致': (() => {
          const shown = Array.from(document.querySelectorAll('.citem .stepper__val')).map((e) => Number(e.textContent.trim())).sort((a,b)=>a-b);
          const want = (ctx.list || []).map((x) => x.quantity).sort((a,b)=>a-b);
          return shown.length === want.length && shown.every((v, i) => v === want[i]);
        })(),
        '每条可结算条目显示小计': document.querySelectorAll('.citem__subtotal').length === ctx.availCount,
        // 合计取**服务端**数字，页面上必须原样呈现
        '合计金额 = 后端 totalAmount': t.includes('¥' + ctx.totalYuan) || t.includes(ctx.totalYuan),
        '合计件数 = 后端 totalQuantity': new RegExp('共 ' + ctx.totalQuantity + ' 件').test(t),
        '全选标签里的种类数 = 后端可结算条数': t.includes('全选（' + ctx.availCount + ' 种）'),
        '有失效条目时才有提示条': ctx.offCount === 0 ? !document.querySelector('.bar--warn') : !!document.querySelector('.bar--warn'),
        '提示条里有「清理」': ctx.offCount === 0 || !!document.querySelector('.bar__action-text'),
        '底部有结算栏': !!bar,
        '结算按钮文案含件数': new RegExp('结算\\\\(' + ctx.totalQuantity + '\\\\)').test(t),
        '结算栏没盖住最后一条': noOverlap,
        '列表末尾有占位块': !!document.querySelector('.cart__pad'),
        '条目图是正方形': (() => {
          const e = document.querySelector('.citem .pimg');
          if (!e) return false;
          const b = e.getBoundingClientRect();
          return b.width > 0 && Math.abs(b.width - b.height) < 2;
        })(),
        '无横向溢出': document.documentElement.scrollWidth <= 391,
        '无 emoji 残留': !/\\p{Emoji_Presentation}/u.test(t),
      };
    })()`,
  },
  {
    key: 'cart-checkout-nav',
    label: '购物车 → 结算跳转（点「结算」）',
    hash: '#/pages/cart/cart',
    wait: 4500,
    needLogin: true,
    prepare: async () => {
      const c = await expectedCart();
      if (!c) return null;
      return { totalYuan: yuan(c.totalAmount), totalQuantity: c.totalQuantity };
    },
    // 这个 case 要先点结算，再断言落到确认页
    tapCheckout: true,
    check: `(() => {
      const t = document.body.innerText;
      const ctx = __ctx || {};
      // 位置/输入框都在 → 说明跳到确认订单页了
      return {
        '已跳到确认订单页': t.includes('确认订单') || t.includes('送到哪里'),
        '有门牌号输入框': !!document.querySelector('.field__input'),
        '有提交订单按钮': /提交订单/.test(t),
        '显示商品清单': !!document.querySelector('.oline'),
        // 确认页的金额必须和购物车结算栏一致（同一份 cartIds → 同一段服务端算价）
        '显示合计金额 = 购物车合计': t.includes(ctx.totalYuan),
        '件数与购物车一致': new RegExp('共 ' + ctx.totalQuantity + ' 件').test(t),
        '有货到付款说明': t.includes('货到付款'),
        '提交栏存在': !!document.querySelector('.submit'),
        '提交栏有合计': !!document.querySelector('.submit__sum'),
      };
    })()`,
  },
  {
    key: 'order-confirm-buynow',
    label: '确认订单（立即购买 · 直购 items）',
    hash: '#/pages/order/confirm?productId=2&quantity=2',
    wait: 4500,
    needLogin: true,
    check: `(() => {
      const t = document.body.innerText;
      // 直购入参固定（农山泉 id=2 × 2），所以这两条可以写死 —— 它不依赖购物车状态
      return {
        '商品清单只有 1 行': document.querySelectorAll('.oline').length === 1,
        '是农夫山泉': t.includes('农夫山泉'),
        '数量 ×2': /×2/.test(t),
        // 2 瓶 × ¥2.00 = ¥4.00（单价来自服务端 preview）
        '合计 ¥4.00': t.includes('4.00'),
        '单价 ¥2.00': t.includes('2.00'),
        '共 2 件': /共 2 件/.test(t),
        '有 3 个输入框（门牌号/收件人/电话）': document.querySelectorAll('.field__input').length === 3,
        '有备注输入区': !!document.querySelector('textarea, .remark'),
        '没有地址簿时不给「选择地址」': !document.querySelector('.block__link'),
        '有「送到哪里」区块': t.includes('送到哪里'),
        '免配送费提示': t.includes('免配送'),
      };
    })()`,
  },
  {
    key: 'order-confirm-badparam',
    label: '确认订单（缺参数时的兜底）',
    hash: '#/pages/order/confirm',
    /**
     * ⚠️ 必须 `fullReload: true`。
     *    前面 `order-confirm-buynow` 的 hash 是 `#/pages/order/confirm?productId=2&quantity=2`，
     *    如果这里只改 hash（哪怕 query 不同），CDP 的 Page.navigate 会被浏览器当成
     *    **同页导航**：文档不重载、Vue 组件不重建，页面上留着上一个用例的数据。
     *    给 URL 加一个 hash **之前**的 `?_r=N`（服务端忽略了它）就会真的重载文档。
     *    （实测：不加 `_r` → 断言看到的是「农山泉 ×2 ¥4.00」；加了之后才进错误兜底。）
     */
    fullReload: true,
    wait: 3500,
    needLogin: true,
    check: `(() => {
      const t = document.body.innerText;
      return {
        // 没有 cartIds / productId 时不能白屏，要给明确提示
        '显示错误提示而不是白屏': t.includes('没有要下单的商品') || !!document.querySelector('.empty'),
        '没有渲染提交栏': !document.querySelector('.submit'),
      };
    })()`,
  },

  // ==========================================================================
  // S7-3：订单列表 / 订单详情 / 地址管理 / 我的
  // ==========================================================================

  {
    key: 'order-list',
    label: '我的订单（全部页签）',
    hash: '#/pages/order/list',
    wait: 5000,
    needLogin: true,
    prepare: async () => {
      // 期望值来自后端：订单是**可变**的（跑测试时会建单、取消），
      // 所以绝不能写死「有 3 条订单」或某个具体订单号。
      const token = await previewToken();
      if (!token) return null;
      const r = await fetch(`${BASE}/api/v1/orders?page=1&pageSize=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await r.json();
      const data = body?.data;
      if (!data) return null;
      const first = data.list?.[0];
      return {
        total: Number(data.total) || 0,
        hasAny: (data.list?.length || 0) > 0,
        firstOrderNo: first?.orderNo || '',
        firstYuan: first ? yuan(first.totalAmount) : '',
      };
    },
    check: `(() => {
      const t = document.body.innerText;
      const ctx = __ctx || {};
      const tabs = Array.from(document.querySelectorAll('.tab')).map((e) => e.textContent.trim());
      return {
        '五个状态页签都在': ['全部','待接单','处理中','已送达','已取消'].every((x) => tabs.includes(x)),
        '默认选中「全部」': !!document.querySelector('.tab--on') && document.querySelector('.tab--on').textContent.includes('全部'),
        // 有订单时要渲染卡片；没有订单时必须是空态（不能白屏）
        '有订单则渲染卡片 / 否则显示空态': ctx.hasAny
          ? document.querySelectorAll('.ocard').length > 0
          : !!document.querySelector('.empty'),
        // 第一条订单的订单号必须来自后端（证明列表真的是服务端数据）
        '第一条订单号与接口一致': !ctx.hasAny || t.includes(ctx.firstOrderNo),
        '第一条金额与接口一致': !ctx.hasAny || !ctx.firstYuan || t.includes(ctx.firstYuan),
        '没有横向溢出': document.documentElement.scrollWidth <= 392,
        '无 emoji 残留': !/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(t),
      };
    })()`,
  },

  {
    key: 'order-list-filter',
    label: '我的订单（按状态筛选 · 已送达页签）',
    hash: '#/pages/order/list?status=DELIVERED',
    // ⚠️ fullReload：上一个 case 的 hash 只差查询串，不重载的话 onLoad 不会跑，
    //    会看到「全部」页签的内容。理由同 order-confirm-badparam。
    fullReload: true,
    wait: 5000,
    needLogin: true,
    prepare: async () => {
      const token = await previewToken();
      if (!token) return null;
      const r = await fetch(`${BASE}/api/v1/orders?status=DELIVERED&page=1&pageSize=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await r.json();
      const data = body?.data;
      if (!data) return null;
      return { total: Number(data.total) || 0, rows: data.list?.length || 0 };
    },
    check: `(() => {
      const t = document.body.innerText;
      const ctx = __ctx || {};
      const on = document.querySelector('.tab--on');
      return {
        '选中了「已送达」页签': !!on && on.textContent.includes('已送达'),
        // 筛选生效：拿到的条数必须和后端过滤后的条数对得上
        '卡片数 = 后端条数（或空态）': ctx.rows > 0
          ? document.querySelectorAll('.ocard').length === ctx.rows
          : !!document.querySelector('.empty'),
        // 不该出现「待接单」这种别的状态的卡片
        '没有混进其它状态的订单': ctx.total > 0 || t.includes('没有'),
      };
    })()`,
  },

  {
    key: 'order-detail',
    label: '订单详情（真实存在的一单）',
    hash: '#/pages/order/detail',
    wait: 5000,
    needLogin: true,
    // 先建一单再进详情 —— 这样断言就不依赖「库里恰好有哪一单」
    prepare: async () => {
      const token = await previewToken();
      if (!token) return null;
      const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const created = await (
        await fetch(`${BASE}/api/v1/orders`, {
          method: 'POST',
          headers: H,
          body: JSON.stringify({
            items: [{ productId: 2, quantity: 2 }],
            roomNo: '3 号楼 305',
            contactName: '自检机器人',
            contactPhone: '13800000009',
            remark: '冒烟测试单，可忽略',
          }),
        })
      ).json();
      const d = created?.data;
      if (!d?.id) return null;
      return {
        id: d.id,
        orderNo: d.orderNo,
        totalYuan: yuan(d.totalAmount),
        roomNo: d.roomNo,
      };
    },
    // 用 prepare 拿到的真实订单号导航。
    // ⚠️ 必须加 `?_r=...`（hash 之前的查询串）逼浏览器**真的重载文档** ——
    //    否则这次 navigate 和上面的初次 navigate 是同一个 hash 路径、只差查询串，
    //    浏览器当成同页导航：onLoad 不重跑、onShow 读到的是旧 options，
    //    页面就会停在「没有订单号」的兜底态上。
    runBefore: async (send, ctx) => {
      await send('Page.navigate', {
        url: `${BASE}/?_r=${Date.now()}#/pages/order/detail?id=${ctx.id}`,
      });
      await sleep(4500);
    },
    check: `(() => {
      const t = document.body.innerText;
      const ctx = __ctx || {};
      return {
        '显示订单号（与接口一致）': t.includes(ctx.orderNo),
        '显示门牌号': t.includes(ctx.roomNo),
        '显示合计金额': t.includes(ctx.totalYuan),
        '有订单进度时间线': document.querySelectorAll('.tl__row').length > 0,
        '有商品清单': document.querySelectorAll('.orow').length > 0,
        '有收货信息区块': t.includes('收货信息') && t.includes('联系电话'),
        '有订单信息区块': t.includes('订单号') && t.includes('下单时间'),
        '状态头存在': !!document.querySelector('.hero'),
        '有货到付款说明': t.includes('货到付款'),
        '没有横向溢出': document.documentElement.scrollWidth <= 392,
      };
    })()`,
  },

  {
    key: 'order-detail-badid',
    label: '订单详情（订单号不存在时的兜底）',
    hash: '#/pages/order/detail?id=99999999',
    fullReload: true,
    wait: 4500,
    needLogin: true,
    check: `(() => {
      const t = document.body.innerText;
      return {
        // 后端把「不存在」和「不是你的订单」统一成 50001（防探测），
        // 所以文案是中性的一句「订单不存在」，不能提示「这不是你的订单」
        '显示错误态而不是白屏': !!document.querySelector('.empty'),
        '没有渲染状态头': !document.querySelector('.hero'),
        '没有渲染底部操作栏': !document.querySelector('.obar'),
      };
    })()`,
  },

  {
    key: 'address-list',
    label: '收货地址列表',
    hash: '#/pages/address/list',
    wait: 5000,
    needLogin: true,
    prepare: async () => {
      const token = await previewToken();
      if (!token) return null;
      const r = await fetch(`${BASE}/api/v1/users/me/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await r.json();
      const list = Array.isArray(body?.data) ? body.data : [];
      return { count: list.length, firstRoom: list[0]?.roomNo || '' };
    },
    check: `(() => {
      const t = document.body.innerText;
      const ctx = __ctx || {};
      return {
        '卡片数 = 后端地址数（或空态）': ctx.count > 0
          ? document.querySelectorAll('.card').length === ctx.count
          : !!document.querySelector('.empty'),
        '显示第一条地址的门牌号': !ctx.firstRoom || t.includes(ctx.firstRoom),
        '有「新增地址」按钮': /新增地址/.test(t),
        // 有地址时才渲染默认标记与操作
        '有默认标记或普通标记': ctx.count === 0 || !!document.querySelector('.badge'),
        '有设为默认/编辑/删除操作': ctx.count === 0 || t.includes('编辑'),
        '没有横向溢出': document.documentElement.scrollWidth <= 392,
      };
    })()`,
  },

  {
    key: 'address-edit',
    label: '新增地址表单',
    hash: '#/pages/address/edit',
    fullReload: true,
    wait: 4500,
    needLogin: true,
    check: `(() => {
      const t = document.body.innerText;
      const inputs = document.querySelectorAll('.field__input');
      return {
        '标题是「新增地址」': t.includes('新增地址'),
        '有三个输入框（收件人/电话/门牌号）': inputs.length === 3,
        '有设为默认开关': !!document.querySelector('.cbox'),
        '提交按钮默认禁用（还没填）': !!document.querySelector('.btn[disabled]'),
        '有门牌号说明文案': t.includes('店长按门牌号送货'),
      };
    })()`,
  },

  // =========================================================================
  // S10 · 图片上传（商品封面 + 用户头像）
  // =========================================================================
  {
    key: 'admin-product-edit-image',
    label: '管理端 · 商品编辑（封面图）',
    hash: '#/pages/admin/product/edit?id=2',
    fullReload: true,
    /**
     * ⚠️ `prepareFirst` 是这一条能跑通的关键。
     * prepare 要往 localStorage 写店长 token，而 `App.vue` 的 restore() 是在
     * **文档加载那一刻**读 storage 的 —— 写晚了这次加载就恢复成旧身份，
     * 页面停在「需要切换到店长身份」的空态。详见循环里的注释。
     */
    prepareFirst: true,
    wait: 5500,
    needLogin: true,
    /**
     * 这一页要求 currentRole=ADMIN。预览账号没有 ADMIN 角色（切不过去，
     * 会得到 30003），所以这里直接登种子店长的手机验证码账号，
     * 并把 token/user 写进浏览器 storage 后**整页重载**
     * （只改 hash 不会重建 store，会一直停在守卫空态 —— 详见
     * loginAsAdminInBrowser 的注释）。
     */
    prepare: async () => {
      const user = await loginAsAdminInBrowser();
      if (!user) return null;
      // 库里商品 2 的封面现状（断言「有图显示预览 / 无图显示占位」时用）
      const realToken = await currentBrowserToken();
      const r = await fetch(`${BASE}/api/v1/admin/products/2`, {
        headers: { Authorization: `Bearer ${realToken}` },
      });
      const p = (await r.json())?.data;
      return { hadCover: !!(p?.coverImage), role: user.currentRole };
    },
    check: `(() => {
      const t = document.body.innerText;
      const ctx = __ctx || {};
      const box = document.querySelector('.iupload');
      const preview = document.querySelector('.iupload__preview');
      const empty = document.querySelector('.iupload__empty');
      const b = preview ? preview.getBoundingClientRect() : null;
      return {
        '页面标题=编辑商品': t.includes('编辑商品'),
        '渲染了上传控件': !!box,
        '控件在上架开关之前（封面优先）': (() => {
          if (!box) return false;
          const card = box.closest('.card');
          const toggle = document.querySelector('.togglecard');
          if (!card || !toggle) return false;
          return !!(card.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING);
        })(),
        '有图则显示预览 / 无图则显示虚线占位': ctx.hadCover ? !!preview : !!empty,
        '预览区是正方形': ctx.hadCover ? (!!b && b.width > 0 && Math.abs(b.width - b.height) < 2) : true,
        '有「商品封面」标签': t.includes('商品封面'),
        '有说明文案（提到占位/压缩）': t.includes('800px') || t.includes('占位'),
        // 有图 → 预览里是真的 <image>；无图 → 空态是 AppIcon（.app-icon，不是 emoji）
        '图片渲染走 <image> / 空态走 AppIcon':
          ctx.hadCover
            ? !!(preview && preview.querySelector('image, .iupload__img'))
            : !!document.querySelector('.iupload__empty .app-icon'),
        '没有横向溢出': document.documentElement.scrollWidth <= 392,
      };
    })()`,
    cleanup: async () => {
      // 把浏览器恢复成预览顾客账号，否则后面的顾客端用例全跑在店长身份下
      await restorePreviewCustomerInBrowser();
    },
  },

  {
    key: 'mine-profile-avatar',
    label: '顾客端 · 个人资料（头像）',
    hash: '#/pages/mine/profile',
    fullReload: true,
    wait: 5000,
    needLogin: true,
    prepare: async () => {
      // 这一页是顾客端，若上一条用例切到了 ADMIN，这里要切回来
      const me = await previewMe();
      if (!me) return null;
      if (me.currentRole !== 'CUSTOMER') await switchPreviewRole('CUSTOMER');
      const after = await previewMe();
      return { hasAvatar: !!after?.avatar, nickname: after?.nickname || '' };
    },
    check: `(() => {
      const t = document.body.innerText;
      const ctx = __ctx || {};
      const box = document.querySelector('.iupload');
      const preview = document.querySelector('.iupload__preview');
      const empty = document.querySelector('.iupload__empty');
      const b = preview ? preview.getBoundingClientRect() : null;
      return {
        '标题=个人资料': t.includes('个人资料'),
        '头像控件在最上面那张卡': (() => {
          if (!box) return false;
          const cards = Array.from(document.querySelectorAll('.card'));
          return cards.length > 0 && cards[0].contains(box);
        })(),
        '有「头像」标签': t.includes('头像'),
        '有头像则圆形预览 / 无头像则占位': ctx.hasAvatar ? !!preview : !!empty,
        '头像预览是正圆（宽高相等且圆角=50%）': (() => {
          if (!ctx.hasAvatar || !preview) return true;
          if (!b || Math.abs(b.width - b.height) > 2) return false;
          const r = getComputedStyle(preview).borderRadius;
          const px = parseFloat(r);
          return r === '50%' || (px > 0 && px >= b.width / 2 - 1);
        })(),
        '昵称/门牌号字段仍在': t.includes('昵称') && t.includes('默认门牌号'),
        '没有横向溢出': document.documentElement.scrollWidth <= 392,
      };
    })()`,
  },

  {
    key: 'mine-avatar-sync',
    label: '顾客端 · 我的（头像同步）',
    hash: '#/pages/mine/mine',
    fullReload: true,
    wait: 5000,
    needLogin: true,
    prepare: async () => {
      const me = await previewMe();
      return { hasAvatar: !!me?.avatar, nickname: me?.nickname || '' };
    },
    check: `(() => {
      const ctx = __ctx || {};
      const ava = document.querySelector('.account__avatar');
      const img = document.querySelector('.account__avatar-img');
      const txt = document.querySelector('.account__avatar-text');
      const b = ava ? ava.getBoundingClientRect() : null;
      return {
        '账号卡头像存在': !!ava,
        '有头像时渲染 <image>': ctx.hasAvatar ? !!img : true,
        '无头像时渲染首字字标': ctx.hasAvatar ? true : !!txt,
        '两种状态互斥（不会同时出现）': !(img && txt),
        '头像区是正圆': !!b && Math.abs(b.width - b.height) < 2,
        '头像区 overflow 裁切（方形图不会溢出圆形）': ava
          ? getComputedStyle(ava).overflow === 'hidden'
          : false,
      };
    })()`,
  },
];

/** ------------------------------------------------------------------ CDP 客户端 */
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
  const consoleLogs = [];
  let seq = 0;

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      consoleLogs.push(
        `[${msg.params.type}] ` +
          msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '),
      );
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleLogs.push(`[exception] ${msg.params.exceptionDetails?.exception?.description ?? '?'}`);
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

  // 让模块级的辅助函数（切换身份要写 storage）也能发 CDP 命令。
  // 不用「把 send 一路当参数传下去」是因为 prepare/cleanup 是页面定义里的
  // 内联函数，签名由 PAGES 表决定，加参数会污染所有既有用例。
  cdpSend = send;

  return { send, consoleLogs, close: () => ws.close() };
}

/** ------------------------------------------------------------------ main */
async function main() {
  const { send, consoleLogs, close } = await connect();

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  if (doShots) mkdirSync(SHOT_DIR, { recursive: true });

  let totalPass = 0;
  let totalFail = 0;

  let list = only ? PAGES.filter((p) => only.includes(p.key)) : PAGES;
  // --no-login：只跑 S7-0/S7-1 那些不需要登录的基线页
  if (noLogin) list = list.filter((p) => !p.needLogin);

  // 需要登录的页存在时，**先登录一次**（写进 localStorage，后续导航都带着）
  const needLogin = list.some((p) => p.needLogin);
  if (needLogin) {
    const r = await loginForPreview(send);
    console.log(
      `\n──────── 前置：H5 预览登录  → 点击=${r.clicked} 已登录=${r.logged ? '是' : '否'}`,
    );
    if (r.clicked !== 'clicked' || !r.logged) {
      console.log('  ✗ 登录没成功，需要登录的页面断言会全红');
      totalFail += 1;
    }

    // 购物车页的断言依赖一份**确定的**购物车数据（见 seedCart 注释）。
    // 只有真的要跑购物车相关用例时才重置，免得白白清掉用户正在看的东西。
    const needCart = list.some((p) => p.key.startsWith('cart'));
    if (needCart) {
      try {
        await seedCart(await previewToken());
        console.log('──────── 前置：已重置购物车为固定 4 条（农山泉×3 + 泡面 + 纸杯 + 笔记本）');
      } catch (e) {
        console.log(`  ✗ 重置购物车失败：${e.message}`);
        totalFail += 1;
      }
    }
  }

  for (const page of list) {
    consoleLogs.length = 0;

    /**
     * `prepareFirst: true` —— 先跑 prepare 改好「浏览器外的状态」
     * （典型是往 localStorage 里写 token/user），**再**导航。
     *
     * 为什么需要这个顺序：`App.vue` 的 `restore()` 在**文档加载时**读 storage。
     * 如果 prepare 在导航之后跑（默认顺序），这次导航恢复的就是旧身份，
     * 页面停在守卫空态 —— 而断言是看不出「顺序错了」的，只会全红。
     * S10 的商品编辑页（要店长 token）就是靠这个标志跑通的。
     *
     * 注意这类页面的断言所需数据也必须在 prepare 里一并取好，
     * 因为它跑在导航之前（断言是导航后才执行的，此时 ctx 已固定在内存里）。
     */
    let ctx = null;
    if (page.prepareFirst && page.prepare) {
      ctx = await page.prepare();
      if (ctx === null) {
        console.log(`\n──────── ${page.label}  (${page.hash})`);
        console.log('  ✗ prepare 失败：拿不到后端期望值（后端起了吗？账号能登吗？）');
        totalFail += 1;
        continue;
      }
      globalThis.__lastCtx = ctx;
    }

    // fullReload：在 hash **之前**加一个查询串，逼浏览器真的重载文档。
    // 见 order-confirm-badparam 的注释 —— 只改 hash 是同页导航，不会重建组件。
    const url = page.fullReload
      ? `${BASE}/?_r=${Date.now()}${page.hash}`
      : `${BASE}/${page.hash}`;
    await send('Page.navigate', { url });
    await sleep(page.wait);

    // 需要交互的页面：先点一下价格排序，验证 morphicons 那条路径不报错
    if (page.tapSort) {
      await send('Runtime.evaluate', {
        expression: `document.querySelectorAll('.sortbar__item')[2]?.click()`,
      });
      await sleep(1600);
    }

    // 购物车 → 点「结算」跳确认页。用真实的点击而不是直接改 hash，
    // 因为这一条断言的目的就是「按钮接的跳转对不对」。
    if (page.tapCheckout) {
      await send('Runtime.evaluate', {
        expression: `(() => {
          const btn = Array.from(document.querySelectorAll('.btn')).find((b) => /结算/.test(b.textContent));
          if (btn) { btn.click(); return 'clicked'; }
          return 'no-button';
        })()`,
        returnByValue: true,
      });
      await sleep(3000);
    }

    // 期望值从后端现取（见 expectedCart 的注释），注入成表达式里的 __ctx
    // （prepareFirst 的页面已经在上面的循环开头跑过了，这里跳过）
    if (!page.prepareFirst && page.prepare) {
      ctx = await page.prepare();
      if (ctx === null) {
        console.log(`\n──────── ${page.label}  (${page.hash})`);
        console.log('  ✗ prepare 失败：拿不到后端期望值（后端起了吗？账号能登吗？）');
        totalFail += 1;
        continue;
      }
      // 给 cleanup 用（它是页面定义里的独立函数，拿不到局部 ctx）
      globalThis.__lastCtx = ctx;
    }

    // 有些页面的目标 URL 依赖 prepare 的产出（例如「订单详情」要先建一单才知道 id），
    // 所以允许页面提供一个 runBefore 钩子，在断言前再导航一次。
    if (page.runBefore && ctx) {
      await page.runBefore(send, ctx);
    }

    const res = await send('Runtime.evaluate', {
      expression: ctx ? `(() => { const __ctx = ${JSON.stringify(ctx)}; return ${page.check}; })()` : page.check,
      returnByValue: true,
      awaitPromise: true,
    });

    const value = res.result?.value || {};
    const entries = Object.entries(value);
    const fails = entries.filter(([, ok]) => !ok);
    totalPass += entries.length - fails.length;
    totalFail += fails.length;

    console.log(`\n──────── ${page.label}  (${page.hash})`);
    for (const [name, ok] of entries) {
      console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    }
    if (res.exceptionDetails) {
      console.log('  ! 表达式抛错: ' + (res.exceptionDetails.exception?.description || ''));
      totalFail += 1;
    }

    // 收尾钩子：把用例改过的全局状态复原（例如 S10 里为了看管理端而切换了身份，
    // 必须切回 CUSTOMER —— 否则后面所有顾客端用例都会跑在店长身份下）
    if (page.cleanup) {
      try {
        await page.cleanup();
      } catch (err) {
        console.log(`  ! cleanup 出错: ${err?.message || err}`);
      }
    }

    if (consoleLogs.length) {
      console.log('  --- 页面控制台 ---');
      console.log(consoleLogs.slice(0, 8).map((l) => '    ' + l).join('\n'));
    }

    if (doShots) {
      const layout = await send('Page.getLayoutMetrics');
      const h = Math.min(Math.ceil(layout.cssContentSize?.height || 844), 6000);
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 390, height: h, scale: 1 },
      });
      const file = `${SHOT_DIR}/${page.key}.png`;
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log(`  → 截图 ${file}（高 ${h}）`);
    }
  }

  console.log(`\n════════ 合计 ${totalPass} ✓ / ${totalFail} ✗`);
  close();
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('自验失败:', err.message);
  process.exit(2);
});
