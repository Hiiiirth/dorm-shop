/**
 * S6 管理端 冒烟测试
 *
 * 前置：数据库已导入种子数据 + 后端已启动
 * 运行： node scripts/smoke-admin.js   （或 BASE_URL=http://127.0.0.1:3100/api/v1 node scripts/smoke-admin.js）
 *
 * 覆盖：
 *   权限（未登录 401 / 顾客身份 403）
 *   路由顺序（静态段 /products/category-options 不被 /products/:id 吞掉）
 *   IntParamPipe（:id 非数字 -> 10001 而不是 Nest 默认的 400）
 *   分类：树（含停用）/ 新建 / 改名 / 换父级 / 环检测 / 删除保护（有子分类、有商品）
 *   商品：列表（含下架）/ 分类下拉 / 详情 / 新建 / 改价 / 上下架 / 删除保护（有在办订单）
 *   订单：多条件筛选 / 状态字典 / 详情 / 接单 / 确认送达 / 强制取消 + 状态轨迹
 *   用户：列表 / 详情 / 授予撤销身份 / 不能撤销自己的 ADMIN / 禁用启用 / 不能禁用自己
 *   经营看板：结构与数值自洽
 *
 * 数据来源：脚本自己造数据 —— 临时分类、临时商品、一个顾客账号 + 一单订单。
 * 跑完会把临时分类/商品删掉（订单历史保留，这是刻意的）。
 *
 * 注意：脚本需要一个「当前身份是 ADMIN」的 token。种子里 admin(13800000001) 是
 * roles=[CUSTOMER,ADMIN] current_role=ADMIN，手机号验证码登录即可。
 * 如果这个账号的 current_role 被改成别的，本脚本第 3 节会直接报错并退出。
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0;
let fail = 0;
let dbSkipped = false;

const ADMIN_PHONE = '13800000001'; // 种子「店长」
const ADMIN_ID = 1;

// ---------------------------------------------------------------------------
// 直连数据库（可选）：交叉核验状态流转在库里留下的痕迹
// ---------------------------------------------------------------------------
function loadDbConfig() {
  try {
    const text = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const cfg = { host: '127.0.0.1', port: '3306', user: 'root', password: '', database: 'dorm_shop' };
    for (const raw of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(raw);
      if (!m) continue;
      const key = m[1];
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'DB_HOST') cfg.host = val;
      else if (key === 'DB_PORT') cfg.port = val;
      else if (key === 'DB_USER') cfg.user = val;
      else if (key === 'DB_PASSWORD') cfg.password = val;
      else if (key === 'DB_DATABASE') cfg.database = val;
    }
    return cfg;
  } catch {
    return null;
  }
}

function queryDb(sql) {
  if (dbSkipped) return null;
  const cfg = loadDbConfig();
  if (!cfg) {
    dbSkipped = true;
    return null;
  }
  try {
    const out = execFileSync(
      'mysql',
      ['-h', cfg.host, '-P', cfg.port, '-u', cfg.user, `-p${cfg.password}`, cfg.database,
        '--default-character-set=utf8mb4', '--batch', '--skip-column-names', '-e', sql],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    return out.trim().split(/\r?\n/).filter((l) => l.length > 0).map((l) => l.split('\t'));
  } catch {
    dbSkipped = true;
    return null;
  }
}

// ---------------------------------------------------------------------------
async function call(method, path, { body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Request-Id': `adm-${Math.random().toString(16).slice(2, 8)}`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { http: res.status, body: await res.json() };
}

function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}`);
    console.log(`       ${JSON.stringify(detail)?.slice(0, 360)}`);
  }
}

function note(label, value) {
  console.log(`  info ${label}: ${JSON.stringify(value)}`);
}

function line(t) {
  console.log(`\n${t}`);
}

async function loginByPhone(phone) {
  const sms = await call('POST', '/auth/sms-code', { body: { phone } });
  const code = sms.body.data?.mockCode;
  if (!code) return { token: null, sms };
  const login = await call('POST', '/auth/phone-login', { body: { phone, smsCode: code } });
  return { token: login.body.data?.accessToken, login, sms };
}

async function loginCustomer(code) {
  const r = await call('POST', '/auth/login', { body: { code } });
  return { token: r.body.data?.accessToken, res: r };
}

// ---------------------------------------------------------------------------
async function main() {
  const stamp = Date.now().toString().slice(-8);
  const tag = `T${stamp.slice(-5)}`; // 给临时分类/商品起个能认出来的名字，方便事后清理

  // =========================================================================
  line('1. 权限：未登录访问管理端');
  {
    const r = await call('GET', '/admin/categories');
    check('HTTP 401', r.http === 401, r);
    check('code = 20001', r.body.code === 20001, r.body);

    const s = await call('GET', '/admin/statistics');
    check('统计接口同样 401', s.http === 401 && s.body.code === 20001, s.body);
  }

  const { token: tokenCustomer, res: custLogin } = await loginCustomer(`s6a${stamp}`);
  check('顾客账号登录成功', !!tokenCustomer && custLogin.body.code === 0, custLogin.body?.message);

  line('2. 权限：顾客身份打管理端 -> 403');
  {
    const r = await call('GET', '/admin/orders', { token: tokenCustomer });
    check('HTTP 403', r.http === 403, r);
    check('code = 20003', r.body.code === 20003, r.body);

    const w = await call('POST', '/admin/categories', {
      token: tokenCustomer,
      body: { name: '偷偷建个分类' },
    });
    check('写接口也 403（守卫在控制器之前）', w.http === 403 && w.body.code === 20003, w.body);
  }

  line('3. 手机号 + 验证码登录管理员（种子店长）');
  let tokenAdmin = null;
  {
    const bad = await call('POST', '/auth/phone-login', {
      body: { phone: ADMIN_PHONE, smsCode: '000000' },
    });
    check('错误验证码 -> 10001', bad.body.code === 10001, bad.body);

    const r = await loginByPhone(ADMIN_PHONE);
    check('管理员登录 code = 0', r.login?.body?.code === 0, r.login?.body);
    const me = r.login?.body?.data?.user;
    check('登录到的是种子管理员 id=1', me?.id === ADMIN_ID, me);
    check('currentRole = ADMIN', me?.currentRole === 'ADMIN', me?.currentRole);
    check('roles 含 ADMIN', (me?.roles ?? []).includes('ADMIN'), me?.roles);
    tokenAdmin = r.token;

    if (me?.currentRole !== 'ADMIN') {
      throw new Error(
        `种子管理员 #${ADMIN_ID} 的 current_role 是 ${me?.currentRole}，不是 ADMIN。` +
          '请先执行：UPDATE `user` SET current_role = \'ADMIN\' WHERE id = 1;',
      );
    }
  }

  // =========================================================================
  line('4. 路由顺序 + 路径参数校验');
  {
    // 如果 products/:id 声明在 products/category-options 之前，
    // 这一条会返回「路径参数必须是数字」
    const opt = await call('GET', '/admin/products/category-options', { token: tokenAdmin });
    check('category-options 没被 :id 吞掉', opt.body.code === 0 && Array.isArray(opt.body.data), opt.body);

    const so = await call('GET', '/admin/orders/status-options', { token: tokenAdmin });
    check('status-options 没被 :id 吞掉', so.body.code === 0 && Array.isArray(so.body.data), so.body);

    // 派单端已下线。这个静态段不再有专门的路由，会落到 orders/:id 上，
// 而 IntParamPipe 会把非数字 id 挡成 10001 —— 说明「没有这个接口」而不是「真有一个叫
// dispatcher-candidates 的接口」。真正的 /dispatch/* 是整个控制器删掉了，返回 404（见 19b）。
const dc = await call('GET', '/admin/orders/dispatcher-candidates', { token: tokenAdmin });
check('dispatcher-candidates 落到 :id 上 -> 10001（无此专用路由）', dc.body.code === 10001, dc.body);

    // Nest 内置 ParseIntPipe 会抛 HTTP 400，破坏统一响应体；IntParamPipe 改成 200 + 10001
    const badId = await call('GET', '/admin/products/abc', { token: tokenAdmin });
    check(':id 非数字 -> HTTP 200', badId.http === 200, badId.http);
    check(':id 非数字 -> code 10001', badId.body.code === 10001, badId.body);
    check('提示是「路径参数必须是数字」', /路径参数/.test(badId.body.message ?? ''), badId.body.message);

    const nf = await call('GET', '/admin/orders/99999999', { token: tokenAdmin });
    check('订单不存在 -> 50001', nf.body.code === 50001, nf.body);

    const pnf = await call('GET', '/admin/products/99999999', { token: tokenAdmin });
    check('商品不存在 -> 40001', pnf.body.code === 40001, pnf.body);
  }

  // =========================================================================
  line('5. 分类：完整树（含停用）');
  let seedCategoryId = null;
  {
    const r = await call('GET', '/admin/categories', { token: tokenAdmin });
    check('code = 0', r.body.code === 0, r.body);
    check('返回数组', Array.isArray(r.body.data), r.body.data);
    check('种子里有 5 个一级分类', (r.body.data ?? []).length >= 5, r.body.data?.length);

    const first = (r.body.data ?? [])[0];
    check('节点含 id/name/parentId/status', !!first && 'id' in first && 'name' in first && 'parentId' in first && 'status' in first, first);
    check('管理端树带 status（顾客端不带）', typeof first?.status === 'number', first?.status);
    seedCategoryId = first?.id ?? null;
  }

  line('6. 分类：新建 / 改名 / 停用');
  let catParent = null;
  let catChild = null;
  {
    const c = await call('POST', '/admin/categories', {
      token: tokenAdmin,
      body: { name: `${tag}临时父类`, sortOrder: 900, icon: '🧪' },
    });
    check('新建一级分类 code = 0', c.body.code === 0, c.body);
    catParent = c.body.data;
    check('parentId 默认 0', catParent?.parentId === 0, catParent);
    check('status 默认 1（启用）', catParent?.status === 1, catParent);
    check('回传了 sortOrder', catParent?.sortOrder === 900, catParent?.sortOrder);

    const n = await call('POST', '/admin/categories', {
      token: tokenAdmin,
      body: { name: `${tag}临时子类`, parentId: catParent.id },
    });
    check('新建子分类 code = 0', n.body.code === 0, n.body);
    catChild = n.body.data;
    check('子分类 parentId 正确', catChild?.parentId === catParent.id, catChild);

    const u = await call('PUT', `/admin/categories/${catChild.id}`, {
      token: tokenAdmin,
      body: { name: `  ${tag}临时子类改名  `, status: 0 },
    });
    check('改名 + 停用 code = 0', u.body.code === 0, u.body);
    check('名字已改且首尾空白被去掉', u.body.data?.name === `${tag}临时子类改名`, u.body.data?.name);
    check('status 已改为 0', u.body.data?.status === 0, u.body.data?.status);

    // 停用的分类也要出现在管理端树里，否则它永远无法被重新启用
    const t = await call('GET', '/admin/categories', { token: tokenAdmin });
    const foundCat = (t.body.data ?? []).find((n2) => n2.id === catParent.id);
    check('停用的子分类仍在管理端树里', (foundCat?.children ?? []).some((c2) => c2.id === catChild.id), foundCat);

    const empty = await call('POST', '/admin/categories', { token: tokenAdmin, body: { name: '  ' } });
    check('空名字 -> 10001', empty.body.code === 10001, empty.body);

    const ghost = await call('PUT', '/admin/categories/99999999', {
      token: tokenAdmin,
      body: { name: '不存在' },
    });
    check('改不存在的分类 -> 40004', ghost.body.code === 40004, ghost.body);
  }

  line('7. 分类：环检测');
  {
    const self = await call('PUT', `/admin/categories/${catParent.id}`, {
      token: tokenAdmin,
      body: { parentId: catParent.id },
    });
    check('挂到自己下面 -> 10001', self.body.code === 10001, self.body);

    // 父类挂到子类下面 = 形成环，之后整条链都会变成孤儿节点
    const cycle = await call('PUT', `/admin/categories/${catParent.id}`, {
      token: tokenAdmin,
      body: { parentId: catChild.id },
    });
    check('父类挂到子类下面 -> 10001', cycle.body.code === 10001, cycle.body);
    check('提示说明了「会形成环」', /环/.test(cycle.body.message ?? ''), cycle.body.message);
  }

  line('8. 分类：删除保护');
  {
    const hasChild = await call('DELETE', `/admin/categories/${catParent.id}`, { token: tokenAdmin });
    check('还有子分类时删除 -> 40005', hasChild.body.code === 40005, hasChild.body);
    check('提示里说了有几个子分类', /子分类/.test(hasChild.body.message ?? ''), hasChild.body.message);
  }

  // =========================================================================
  line('9. 商品：列表 / 分类下拉 / 筛选排序');
  {
    const r = await call('GET', '/admin/products?pageSize=5', { token: tokenAdmin });
    check('code = 0', r.body.code === 0, r.body);
    const d = r.body.data ?? {};
    check('信封含 list/page/pageSize/total/hasMore', ['list', 'page', 'pageSize', 'total', 'hasMore'].every((k) => k in d), d);
    check('total >= 12（种子 12 个商品）', d.total >= 12, d.total);

    const item = (d.list ?? [])[0];
    check('列表项带 status 字段（管理端要看得到下架商品）', typeof item?.status === 'number', item?.status);
    check('价格是「分」整数', Number.isInteger(item?.price), item?.price);
    check('列表项不带 description 大字段', !('description' in (item ?? {})), Object.keys(item ?? {}));

    const kw = await call('GET', '/admin/products?keyword=可乐', { token: tokenAdmin });
    check('关键词能搜到', kw.body.code === 0, kw.body);
    check('搜出来的都含关键词', (kw.body.data?.list ?? []).every((p) => p.name.includes('可乐')), kw.body.data?.list?.map((p) => p.name));

    const asc = await call('GET', '/admin/products?sortBy=price_asc&pageSize=20', { token: tokenAdmin });
    const prices = (asc.body.data?.list ?? []).map((p) => p.price);
    check('price_asc 升序生效', prices.every((v, i) => i === 0 || prices[i - 1] <= v), prices.slice(0, 8));

    const desc = await call('GET', '/admin/products?sortBy=price_desc&pageSize=20', { token: tokenAdmin });
    const prices2 = (desc.body.data?.list ?? []).map((p) => p.price);
    check('price_desc 降序生效', prices2.every((v, i) => i === 0 || prices2[i - 1] >= v), prices2.slice(0, 8));

    const stockAsc = await call('GET', '/admin/products?sortBy=stock_asc&pageSize=20', { token: tokenAdmin });
    const stocks = (stockAsc.body.data?.list ?? []).map((p) => p.stock);
    check('stock_asc 升序生效', stocks.every((v, i) => i === 0 || stocks[i - 1] <= v), stocks.slice(0, 8));

    const badSort = await call('GET', '/admin/products?sortBy=hack', { token: tokenAdmin });
    check('非法 sortBy -> 10001', badSort.body.code === 10001, badSort.body);

    // 布尔型 query 参数会把 "false" 当成 true，所以只接受 0/1
    const badStatus = await call('GET', '/admin/products?status=false', { token: tokenAdmin });
    check('status=false -> 10001（不静默当成 true）', badStatus.body.code === 10001, badStatus.body);

    const opt = await call('GET', '/admin/products/category-options', { token: tokenAdmin });
    check('分类下拉 code = 0', opt.body.code === 0, opt.body);
    const optItem = (opt.body.data ?? [])[0];
    check('下拉项含 productCount', !!optItem && 'productCount' in optItem, optItem);
  }

  line('10. 商品：新建 / 改价 / 上下架');
  let tempProduct = null;
  {
    const c = await call('POST', '/admin/products', {
      token: tokenAdmin,
      body: {
        categoryId: catParent.id,
        name: `${tag}测试商品`,
        subtitle: '仅用于冒烟测试',
        price: 350, // 3.50 元
        originalPrice: 500, // 5.00 元
        stock: 50,
        unit: '瓶',
        description: '脚本自动创建，跑完会删掉',
      },
    });
    check('新建商品 code = 0', c.body.code === 0, c.body);
    tempProduct = c.body.data;
    check('价格回传是「分」', tempProduct?.price === 350, tempProduct?.price);
    check('划线价回传是「分」', tempProduct?.originalPrice === 500, tempProduct?.originalPrice);
    check('status 默认 1（上架）', tempProduct?.status === 1, tempProduct?.status);
    check('库存写入正确', tempProduct?.stock === 50, tempProduct?.stock);

    const u = await call('PUT', `/admin/products/${tempProduct.id}`, {
      token: tokenAdmin,
      body: { price: 400, stock: 60, status: 0 },
    });
    check('改价 + 改库存 + 下架 code = 0', u.body.code === 0, u.body);
    check('price 已改为 400 分', u.body.data?.price === 400, u.body.data?.price);
    check('stock 已改为 60', u.body.data?.stock === 60, u.body.data?.stock);
    check('status 已下架', u.body.data?.status === 0, u.body.data?.status);

    const list = await call('GET', `/admin/products?categoryId=${catParent.id}&status=0`, { token: tokenAdmin });
    check('管理端能看到已下架的商品', (list.body.data?.list ?? []).some((p) => p.id === tempProduct.id), list.body.data?.list);

    const badCat = await call('POST', '/admin/products', {
      token: tokenAdmin,
      body: { categoryId: 99999999, name: '挂在不存在分类下', price: 100, stock: 1 },
    });
    check('分类不存在 -> 40004', badCat.body.code === 40004, badCat.body);

    const negPrice = await call('POST', '/admin/products', {
      token: tokenAdmin,
      body: { categoryId: catParent.id, name: '负价', price: -1, stock: 1 },
    });
    check('负价 -> 10001', negPrice.body.code === 10001, negPrice.body);

    const floatPrice = await call('POST', '/admin/products', {
      token: tokenAdmin,
      body: { categoryId: catParent.id, name: '小数价', price: 3.5, stock: 1 },
    });
    check('小数价 -> 10001（对外只认「分」整数）', floatPrice.body.code === 10001, floatPrice.body);
  }

  line('11. 分类删除保护升级：有商品时 -> 40006');
  {
    // 先把空的子分类删掉，否则会先命中「还有子分类」的 40005，
    // 掩盖掉「还有商品」这一道闸
    const dc = await call('DELETE', `/admin/categories/${catChild.id}`, { token: tokenAdmin });
    check('删掉空的子分类 code = 0', dc.body.code === 0, dc.body);
    check('返回 deleted = true', dc.body.data?.deleted === true, dc.body.data);

    const r = await call('DELETE', `/admin/categories/${catParent.id}`, { token: tokenAdmin });
    check('子分类已删，但还有商品 -> 40006', r.body.code === 40006, r.body);
    check('提示里说了有几个商品', /商品/.test(r.body.message ?? ''), r.body.message);
  }

  // =========================================================================
  line('12. 造一单：用临时商品下单（商品得先上架）');
  let orderId = null;
  let orderNo = null;
  {
    await call('PUT', `/admin/products/${tempProduct.id}`, {
      token: tokenAdmin,
      body: { status: 1, stock: 100 },
    });

    const r = await call('POST', '/orders', {
      token: tokenCustomer,
      body: {
        contactName: '阿伟',
        contactPhone: '13800001234',
        roomNo: `Z-${stamp.slice(-4)}`,
        remark: '管理端冒烟测试单',
        items: [{ productId: tempProduct.id, quantity: 2 }],
      },
    });
    check('顾客下单 code = 0', r.body.code === 0, r.body);
    orderId = r.body.data?.id;
    orderNo = r.body.data?.orderNo;
    check('下单后订单号非空', !!orderNo, orderNo);
    note('测试订单', { orderId, orderNo, status: r.body.data?.status });
  }

  line('13. 商品删除保护：还有在办订单 -> 40007');
  {
    const r = await call('DELETE', `/admin/products/${tempProduct.id}`, { token: tokenAdmin });
    check('有在办订单时删除 -> 40007', r.body.code === 40007, r.body);
    check('提示建议改用「下架」', /下架/.test(r.body.message ?? ''), r.body.message);
  }

  // =========================================================================
  line('14. 订单列表：信封 + 多条件筛选');
  {
    const r = await call('GET', '/admin/orders?pageSize=5', { token: tokenAdmin });
    check('code = 0', r.body.code === 0, r.body);
    const d = r.body.data ?? {};
    check('信封含 list/page/pageSize/total/hasMore', ['list', 'page', 'pageSize', 'total', 'hasMore'].every((k) => k in d), d);

    const item = (d.list ?? [])[0];
    check('列表项带下单人 userId', typeof item?.userId === 'number', item?.userId);
    check('列表项带 customer 摘要', !!item?.customer && 'nickname' in item.customer, item?.customer);
    check('列表项不再有 dispatcherId 字段', !('dispatcherId' in (item ?? {})), Object.keys(item ?? {}));
    check('列表项不再有 dispatcher 字段', !('dispatcher' in (item ?? {})), Object.keys(item ?? {}));
    check('列表项带 items 明细', Array.isArray(item?.items), item?.items);
    check('金额是「分」整数', Number.isInteger(item?.totalAmount), item?.totalAmount);

    const mine = await call('GET', '/admin/orders?keyword=' + encodeURIComponent(orderNo), { token: tokenAdmin });
    check('按订单号搜到刚造的单', (mine.body.data?.list ?? []).some((o) => o.id === orderId), mine.body.data?.list?.map((o) => o.orderNo));

    const byRoom = await call('GET', `/admin/orders?keyword=${encodeURIComponent(`Z-${stamp.slice(-4)}`)}`, { token: tokenAdmin });
    check('按门牌号模糊搜到', (byRoom.body.data?.list ?? []).some((o) => o.id === orderId), byRoom.body.data?.list?.map((o) => o.roomNo));

    const byUser = await call('GET', `/admin/orders?userId=${custLogin.body.data.user.id}`, { token: tokenAdmin });
    check('按 userId 过滤生效', (byUser.body.data?.list ?? []).every((o) => o.userId === custLogin.body.data.user.id), byUser.body.data?.list?.map((o) => o.userId));

    const badDate = await call('GET', '/admin/orders?dateFrom=2026/01/01', { token: tokenAdmin });
    check('日期格式不对 -> 10001', badDate.body.code === 10001, badDate.body);

    // 「今天」必须和数据库会话时区一致：
    //   ❌ 不能用 new Date().toISOString() —— 那是 UTC，本地 00:00~08:00 之间会算成「前一天」，
    //      而列表是按 DB 的 CURDATE()（会话时区 +08:00）过滤的，两边会错开一整天。
    //   ✅ 优先直接问数据库 CURDATE()；查不到数据库才退回本地日期拼装。
    const todayRows = queryDb('SELECT CURDATE()');
    const todayFromDb = todayRows && todayRows[0] ? todayRows[0][0] : null;
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const today = todayFromDb ?? `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const byDate = await call('GET', `/admin/orders?dateFrom=${today}&dateTo=${today}`, { token: tokenAdmin });
    check('按今天过滤能包含刚造的单', (byDate.body.data?.list ?? []).some((o) => o.id === orderId), {
      today,
      来源: todayFromDb ? 'DB CURDATE()' : '本地日期兜底',
      total: byDate.body.data?.total,
    });

    // 排序固定 id DESC，最新的在前
    const ids = (d.list ?? []).map((o) => o.id);
    check('列表按 id 倒序（最新在前）', ids.every((v, i) => i === 0 || ids[i - 1] >= v), ids.slice(0, 6));

    const badStatus = await call('GET', '/admin/orders?status=COMPLETED', { token: tokenAdmin });
    check('status=COMPLETED 不合法 -> 10001（没有这个状态）', badStatus.body.code === 10001, badStatus.body);
  }

  line('15. 订单：状态字典');
  {
    const so = await call('GET', '/admin/orders/status-options', { token: tokenAdmin });
    const vals = (so.body.data ?? []).map((o) => o.value);
    check('状态字典含 4 个状态', vals.length === 4, vals);
    check('没有 COMPLETED', !vals.includes('COMPLETED'), vals);
    check('没有 DISPATCHED（派单端已下线）', !vals.includes('DISPATCHED'), vals);
    check(
      '字典 = PENDING / DELIVERING / DELIVERED / CANCELLED',
      ['PENDING', 'DELIVERING', 'DELIVERED', 'CANCELLED'].every((s) => vals.includes(s)),
      vals,
    );
    check('字典项带中文 label', (so.body.data ?? []).every((o) => typeof o.label === 'string' && o.label.length > 0), so.body.data);
  }

  line('16. 订单详情（管理端比顾客端多一点东西）');
  {
    const r = await call('GET', `/admin/orders/${orderId}`, { token: tokenAdmin });
    check('code = 0', r.body.code === 0, r.body);
    const d = r.body.data ?? {};
    check('orderNo 一致', d.orderNo === orderNo, d.orderNo);
    check('带 customer 摘要', !!d.customer && 'nickname' in d.customer, d.customer);
    check('带 payType / payStatus', 'payType' in d && 'payStatus' in d, { payType: d.payType, payStatus: d.payStatus });
    check('带 statusLogs 轨迹', Array.isArray(d.statusLogs) && d.statusLogs.length >= 1, d.statusLogs);
    check('轨迹第一条是提交订单', d.statusLogs?.[0]?.toStatus === 'PENDING', d.statusLogs?.[0]);
    check('带备注', d.remark === '管理端冒烟测试单', d.remark);
    check('带商品明细 2 件', d.totalQuantity === 2, { totalQuantity: d.totalQuantity, items: d.items });
  }

  // =========================================================================
  line('17. 店长接单：PENDING → DELIVERING');
  {
    const before = await call('GET', `/admin/orders/${orderId}`, { token: tokenAdmin });
    check('接单前状态 = PENDING', before.body.data?.status === 'PENDING', before.body.data?.status);
    check('接单前 deliveredAt 为空', before.body.data?.deliveredAt === null, before.body.data?.deliveredAt);

    const a = await call('POST', `/admin/orders/${orderId}/accept`, { token: tokenAdmin });
    check('接单 code = 0', a.body.code === 0, a.body);
    check('状态 = DELIVERING', a.body.data?.status === 'DELIVERING', a.body.data?.status);
    check('statusText = 配送中', a.body.data?.statusText === '配送中', a.body.data?.statusText);

    const logs = a.body.data?.statusLogs ?? [];
    const hop = logs[logs.length - 1];
    check('轨迹新增一条 PENDING -> DELIVERING', hop?.fromStatus === 'PENDING' && hop?.toStatus === 'DELIVERING', hop);
    check('接单那条的操作者是 ADMIN', hop?.operatorRole === 'ADMIN', hop);

    const again = await call('POST', `/admin/orders/${orderId}/accept`, { token: tokenAdmin });
    check('重复接单 -> 50002', again.body.code === 50002, again.body);
    check('提示「已经在处理中」', /处理中/.test(again.body.message ?? ''), again.body.message);
  }

  line('18. 店长确认送达：DELIVERING → DELIVERED（终态）');
  {
    const d = await call('POST', `/admin/orders/${orderId}/deliver`, { token: tokenAdmin });
    check('确认送达 code = 0', d.body.code === 0, d.body);
    check('状态 = DELIVERED', d.body.data?.status === 'DELIVERED', d.body.data?.status);
    check('deliveredAt 已写入', !!d.body.data?.deliveredAt, d.body.data?.deliveredAt);

    const logs = d.body.data?.statusLogs ?? [];
    const hop = logs[logs.length - 1];
    check('轨迹新增一条 DELIVERING -> DELIVERED', hop?.fromStatus === 'DELIVERING' && hop?.toStatus === 'DELIVERED', hop);
    check('送达那条的备注是店长确认', /确认送达/.test(hop?.remark ?? ''), hop?.remark);

    const again = await call('POST', `/admin/orders/${orderId}/deliver`, { token: tokenAdmin });
    check('重复送达 -> 50002', again.body.code === 50002, again.body);
    check('提示「已送达，别重复点」', /别重复点/.test(again.body.message ?? ''), again.body.message);

    // DELIVERED 是终态：接单和取消都不允许
    const reAccept = await call('POST', `/admin/orders/${orderId}/accept`, { token: tokenAdmin });
    check('已送达后接单 -> 50002', reAccept.body.code === 50002, reAccept.body);

    const reCancel = await call('POST', `/admin/orders/${orderId}/cancel`, {
      token: tokenAdmin,
      body: { reason: '店长反悔' },
    });
    check('已送达后取消 -> 50002', reCancel.body.code === 50002, reCancel.body);
    check('提示「已送达，不能取消」', /已送达/.test(reCancel.body.message ?? ''), reCancel.body.message);

    if (!dbSkipped) {
      const rows = queryDb(`SELECT status, delivered_at IS NOT NULL FROM \`order\` WHERE id = ${orderId}`);
      if (rows && rows.length === 1) {
        check(`库里状态也是 DELIVERED（实际 ${rows[0][0]}）`, rows[0][0] === 'DELIVERED', rows[0][0]);
        check('库里 delivered_at 已写入', rows[0][1] === '1', rows[0][1]);
      } else {
        note('（mysql 不可用，跳过状态交叉核验）', null);
      }
    }
  }

  line('18b. PENDING 可以直接送达（不必先接单）');
  {
    const r = await call('POST', '/orders', {
      token: tokenCustomer,
      body: {
        roomNo: '305',
        contactName: '阿伟',
        contactPhone: '13800000003',
        remark: '直接送达测试',
        items: [{ productId: tempProduct.id, quantity: 1 }],
      },
    });
    check('顾客下单 code = 0', r.body.code === 0, r.body);
    const directId = r.body.data?.id;
    check('新单状态 = PENDING', r.body.data?.status === 'PENDING', r.body.data?.status);

    const d = await call('POST', `/admin/orders/${directId}/deliver`, { token: tokenAdmin });
    check('PENDING 直接送达 code = 0', d.body.code === 0, d.body);
    check('状态直达 DELIVERED', d.body.data?.status === 'DELIVERED', d.body.data?.status);
    check('deliveredAt 已写入', !!d.body.data?.deliveredAt, d.body.data?.deliveredAt);

    // 清理：把这单取消掉会失败（已送达），留着即可 —— 它是终态，不影响后续断言
    note('直接送达测试单已终态，保留', { id: directId });
  }

  line('18c. 已取消的单不能再送达');
  {
    const r = await call('POST', '/orders', {
      token: tokenCustomer,
      body: {
        roomNo: '305',
        contactName: '阿伟',
        contactPhone: '13800000003',
        remark: '取消后送达测试',
        items: [{ productId: tempProduct.id, quantity: 1 }],
      },
    });
    const cancelId = r.body.data?.id;
    const c = await call('POST', `/orders/${cancelId}/cancel`, {
      token: tokenCustomer,
      body: { reason: '顾客不要了' },
    });
    check('顾客取消 code = 0', c.body.code === 0, c.body);
    check('状态 = CANCELLED', c.body.data?.status === 'CANCELLED', c.body.data?.status);

    const d = await call('POST', `/admin/orders/${cancelId}/deliver`, { token: tokenAdmin });
    check('已取消后送达 -> 50002', d.body.code === 50002, d.body);
    check('提示「已被取消，无法送达」', /已被取消/.test(d.body.message ?? ''), d.body.message);

    const a = await call('POST', `/admin/orders/${cancelId}/accept`, { token: tokenAdmin });
    check('已取消后接单 -> 50002', a.body.code === 50002, a.body);
  }

  // =========================================================================
  line('19. 顾客端在 DELIVERING 也能取消（未送达都允许）');
  {
    const r = await call('POST', '/orders', {
      token: tokenCustomer,
      body: {
        roomNo: '305',
        contactName: '阿伟',
        contactPhone: '13800000003',
        remark: '配送中取消测试',
        items: [{ productId: tempProduct.id, quantity: 1 }],
      },
    });
    const id = r.body.data?.id;
    await call('POST', `/admin/orders/${id}/accept`, { token: tokenAdmin });
    const cur = await call('GET', `/admin/orders/${id}`, { token: tokenAdmin });
    check('已接单，状态 = DELIVERING', cur.body.data?.status === 'DELIVERING', cur.body.data?.status);

    const custTry = await call('POST', `/orders/${id}/cancel`, {
      token: tokenCustomer,
      body: { reason: '顾客临时不要了' },
    });
    check('顾客端 DELIVERING 取消 code = 0', custTry.body.code === 0, custTry.body);
    check('状态 = CANCELLED', custTry.body.data?.status === 'CANCELLED', custTry.body.data?.status);
    check('cancelReason 已记录', /临时不要了/.test(custTry.body.data?.cancelReason ?? ''), custTry.body.data?.cancelReason);

    // 已送达的单顾客端不能取消（终态）
    const d2 = await call('POST', '/orders', {
      token: tokenCustomer,
      body: {
        roomNo: '305',
        contactName: '阿伟',
        contactPhone: '13800000003',
        remark: '已送达不可取消',
        items: [{ productId: tempProduct.id, quantity: 1 }],
      },
    });
    const doneId = d2.body.data?.id;
    await call('POST', `/admin/orders/${doneId}/deliver`, { token: tokenAdmin });
    const no = await call('POST', `/orders/${doneId}/cancel`, { token: tokenCustomer, body: { reason: '反悔' } });
    check('已送达后顾客取消 -> 50002', no.body.code === 50002, no.body);
    check('提示「已送达，无法取消」', /已送达/.test(no.body.message ?? ''), no.body.message);
  }

  line('19b. 派单端接口已全部下线');
  {
    const login = await loginByPhone(ADMIN_PHONE);
    for (const p of ['/dispatch/orders', '/dispatch/statistics', '/dispatch/orders/1', '/dispatch/orders/1/accept']) {
      const r = await call('GET', p, { token: tokenAdmin });
      check(`GET ${p} -> 404`, r.http === 404, r.http);
    }
    const assign = await call('POST', `/admin/orders/${orderId}/assign`, {
      token: tokenAdmin,
      body: { dispatcherId: 2 },
    });
    check('POST /admin/orders/:id/assign -> 404', assign.http === 404, assign.http);
    const apply = await call('POST', '/users/me/apply-dispatcher', { token: tokenAdmin });
    check('POST /users/me/apply-dispatcher -> 404', apply.http === 404, apply.http);
    note('派单端已下线，以上接口应全部 404', { token: !!login.token });
  }

  line('20. 取消后商品就能删了（40007 闸门解除）');
  {
    // 本节需要一个「非终态」的订单占着 40007 闸门，所以现造一单再取消
    const r = await call('POST', '/orders', {
      token: tokenCustomer,
      body: {
        roomNo: '305',
        contactName: '阿伟',
        contactPhone: '13800000003',
        remark: '闸门测试单',
        items: [{ productId: tempProduct.id, quantity: 2 }],
      },
    });
    const gateId = r.body.data?.id;
    check('造一单占住闸门 code = 0', r.body.code === 0, r.body);

    const blocked = await call('DELETE', `/admin/products/${tempProduct.id}`, { token: tokenAdmin });
    check('有在办订单时删除 -> 40007', blocked.body.code === 40007, blocked.body);

    const cc = await call('POST', `/admin/orders/${gateId}/cancel`, {
      token: tokenAdmin,
      body: { reason: '闸门测试：取消' },
    });
    check('管理员取消 code = 0', cc.body.code === 0, cc.body);

    const del = await call('DELETE', `/admin/products/${tempProduct.id}`, { token: tokenAdmin });
    check('取消后删除商品 code = 0', del.body.code === 0, del.body);
    check('返回 deleted = true', del.body.data?.deleted === true, del.body.data);

    const gone = await call('GET', `/admin/products/${tempProduct.id}`, { token: tokenAdmin });
    check('删除后详情查不到 -> 40001', gone.body.code === 40001, gone.body);

    // 商品没了，父分类也就能删了
    const dc = await call('DELETE', `/admin/categories/${catParent.id}`, { token: tokenAdmin });
    check('父分类也能删了（40006 闸门解除）', dc.body.code === 0, dc.body);
  }

  // =========================================================================
  line('21. 用户：列表 / 详情');
  let customerId = null;
  {
    const r = await call('GET', '/admin/users?pageSize=10', { token: tokenAdmin });
    check('code = 0', r.body.code === 0, r.body);
    const d = r.body.data ?? {};
    check('信封正确', ['list', 'page', 'pageSize', 'total', 'hasMore'].every((k) => k in d), d);
    check('total >= 3', d.total >= 3, d.total);

    const u = (d.list ?? [])[0];
    check('用户项带 roles 数组', Array.isArray(u?.roles), u?.roles);
    check('用户项带 currentRole', !!u?.currentRole, u?.currentRole);

    // 用户表里已经攒了不少测试账号（id 倒序），店长不会在第一页，
    // 所以按手机号精确定位，而不是假设它排在前面
    const byPhone = await call('GET', `/admin/users?keyword=${ADMIN_PHONE}`, { token: tokenAdmin });
    const admin = (byPhone.body.data?.list ?? []).find((x) => x.id === ADMIN_ID);
    check('按手机号能搜到店长', !!admin, byPhone.body.data?.list?.map((x) => x.id));
    check('店长 roles 含 ADMIN', (admin?.roles ?? []).includes('ADMIN'), admin);

    const byRole = await call('GET', '/admin/users?role=ADMIN&pageSize=50', { token: tokenAdmin });
    check('按身份过滤：全部含 ADMIN', (byRole.body.data?.list ?? []).length >= 1 && (byRole.body.data?.list ?? []).every((x) => (x.roles ?? []).includes('ADMIN')), byRole.body.data?.list?.map((x) => x.roles));

    // v1.2：DISPATCHER 已从身份枚举里移除，按它过滤应该被参数校验挡住
    const goneRole = await call('GET', '/admin/users?role=DISPATCHER&pageSize=50', { token: tokenAdmin });
    check('role=DISPATCHER 已不合法 -> 10001', goneRole.body.code === 10001, goneRole.body);

    const badRole = await call('GET', '/admin/users?role=SUPERMAN', { token: tokenAdmin });
    check('非法 role -> 10001', badRole.body.code === 10001, badRole.body);

    const byStatus = await call('GET', '/admin/users?status=1&pageSize=50', { token: tokenAdmin });
    check('按状态过滤：全部 status = 1', (byStatus.body.data?.list ?? []).every((x) => x.status === 1), byStatus.body.data?.list?.map((x) => x.status));

    const detail = await call('GET', `/admin/users/${ADMIN_ID}`, { token: tokenAdmin });
    check('用户详情 code = 0', detail.body.code === 0, detail.body);
    check('详情是店长', detail.body.data?.nickname === '店长', detail.body.data);

    const ghost = await call('GET', '/admin/users/99999999', { token: tokenAdmin });
    check('用户不存在 -> 30001', ghost.body.code === 30001, ghost.body);

    customerId = custLogin.body.data.user.id;
  }

  line('22. 用户：授予 / 撤销身份');
  {
    // v1.2：只有 CUSTOMER / ADMIN 两种身份了，所以这里用 ADMIN 演练授予/撤销
    const g = await call('PUT', `/admin/users/${customerId}/role`, {
      token: tokenAdmin,
      body: { role: 'ADMIN', action: 'GRANT' },
    });
    check('授予 ADMIN code = 0', g.body.code === 0, g.body);
    check('roles 里多了 ADMIN', (g.body.data?.roles ?? []).includes('ADMIN'), g.body.data?.roles);

    const before = g.body.data?.currentRole;
    check('授予身份不会顺手改 currentRole', before === 'CUSTOMER', { before });
    check('授予时 currentRole 不在 roles 才会被兜底', (g.body.data?.roles ?? []).includes(before), { roles: g.body.data?.roles, currentRole: before });

    const again = await call('PUT', `/admin/users/${customerId}/role`, {
      token: tokenAdmin,
      body: { role: 'ADMIN', action: 'GRANT' },
    });
    check('重复授予是幂等的（不报错）', again.body.code === 0, again.body);
    check('roles 不会重复', (again.body.data?.roles ?? []).filter((r2) => r2 === 'ADMIN').length === 1, again.body.data?.roles);

    const rev = await call('PUT', `/admin/users/${customerId}/role`, {
      token: tokenAdmin,
      body: { role: 'ADMIN', action: 'REVOKE' },
    });
    check('撤销 ADMIN code = 0', rev.body.code === 0, rev.body);
    check('roles 里没有 ADMIN 了', !(rev.body.data?.roles ?? []).includes('ADMIN'), rev.body.data?.roles);
    check('撤销后仍保留 CUSTOMER（不会变成零身份）', (rev.body.data?.roles ?? []).includes('CUSTOMER'), rev.body.data?.roles);

    const revAgain = await call('PUT', `/admin/users/${customerId}/role`, {
      token: tokenAdmin,
      body: { role: 'ADMIN', action: 'REVOKE' },
    });
    check('撤销本来就没有的身份 -> 10001', revAgain.body.code === 10001, revAgain.body);

    const badAction = await call('PUT', `/admin/users/${customerId}/role`, {
      token: tokenAdmin,
      body: { role: 'ADMIN', action: 'PROMOTE' },
    });
    check('非法 action -> 10001', badAction.body.code === 10001, badAction.body);

    // v1.2：DISPATCHER 已不是合法身份，授予它应该被参数校验挡住
    const goneRole = await call('PUT', `/admin/users/${customerId}/role`, {
      token: tokenAdmin,
      body: { role: 'DISPATCHER', action: 'GRANT' },
    });
    check('授予 DISPATCHER -> 10001（身份已下线）', goneRole.body.code === 10001, goneRole.body);
  }

  line('23. 用户：自我保护（不能把自己锁在外面）');
  {
    const self = await call('PUT', `/admin/users/${ADMIN_ID}/role`, {
      token: tokenAdmin,
      body: { role: 'ADMIN', action: 'REVOKE' },
    });
    check('撤销自己的 ADMIN -> 30004', self.body.code === 30004, self.body);
    check('提示解释了后果', /进不了管理端/.test(self.body.message ?? ''), self.body.message);

    // 撤销别人（新顾客）的 ADMIN 是允许的 —— 这里换个角度验证：先给自己以外的账号授予再撤销
    const g = await call('PUT', `/admin/users/${customerId}/role`, {
      token: tokenAdmin,
      body: { role: 'ADMIN', action: 'GRANT' },
    });
    check('可以给别人授予 ADMIN', g.body.code === 0, g.body);

    const r = await call('PUT', `/admin/users/${customerId}/role`, {
      token: tokenAdmin,
      body: { role: 'ADMIN', action: 'REVOKE' },
    });
    check('可以撤销别人的 ADMIN', r.body.code === 0, r.body);
  }

  line('24. 用户：禁用 / 启用');
  {
    const self = await call('PUT', `/admin/users/${ADMIN_ID}/status`, {
      token: tokenAdmin,
      body: { status: 0 },
    });
    check('禁用自己 -> 30004', self.body.code === 30004, self.body);

    const off = await call('PUT', `/admin/users/${customerId}/status`, {
      token: tokenAdmin,
      body: { status: 0 },
    });
    check('禁用别人 code = 0', off.body.code === 0, off.body);
    check('status = 0', off.body.data?.status === 0, off.body.data?.status);

    // 被禁用的账号不能再登录（登录时校验 status）
    const relogin = await call('POST', '/auth/login', { body: { code: `s6a${stamp}` } });
    check('被禁用的账号登录被拒 -> 20004', relogin.body.code === 20004, relogin.body);

    const on = await call('PUT', `/admin/users/${customerId}/status`, {
      token: tokenAdmin,
      body: { status: 1 },
    });
    check('重新启用 code = 0', on.body.code === 0, on.body);
    check('status = 1', on.body.data?.status === 1, on.body.data?.status);

    const badStatus = await call('PUT', `/admin/users/${customerId}/status`, {
      token: tokenAdmin,
      body: { status: 9 },
    });
    check('非法 status -> 10001', badStatus.body.code === 10001, badStatus.body);
  }

  // =========================================================================
  line('25. 经营看板');
  {
    const r = await call('GET', '/admin/statistics', { token: tokenAdmin });
    check('code = 0', r.body.code === 0, r.body);
    const d = r.body.data ?? {};

    check('含 today / total / statusCounts / hotProducts', !!(d.today && d.total && d.statusCounts && d.hotProducts), Object.keys(d));

    check('today 五个字段齐全', ['orderCount', 'deliveredCount', 'cancelledCount', 'revenue', 'newUsers'].every((k) => k in d.today), d.today);
    check('total 七个字段齐全', ['orderCount', 'deliveredCount', 'cancelledCount', 'revenue', 'userCount', 'productCount', 'categoryCount'].every((k) => k in d.total), d.total);

    check('营收是「分」整数', Number.isInteger(d.today?.revenue) && Number.isInteger(d.total?.revenue), { today: d.today?.revenue, total: d.total?.revenue });
    check('today.orderCount >= 1（刚造过单）', d.today?.orderCount >= 1, d.today);
    check('today.cancelledCount >= 1（刚取消过单）', d.today?.cancelledCount >= 1, d.today);
    check('today.newUsers >= 1（刚注册了顾客）', d.today?.newUsers >= 1, d.today);

    check('total.orderCount >= today.orderCount', d.total?.orderCount >= d.today?.orderCount, { total: d.total?.orderCount, today: d.today?.orderCount });
    check('total.userCount >= 3', d.total?.userCount >= 3, d.total?.userCount);
    check('productCount 是正数', d.total?.productCount > 0, d.total?.productCount);
    check('categoryCount >= 5（种子分类）', d.total?.categoryCount >= 5, d.total?.categoryCount);

    const sc = d.statusCounts ?? {};
    const keys = Object.keys(sc);
    check('statusCounts 有 4 个状态键', keys.length === 4, keys);
    check('没有 COMPLETED 键', !keys.includes('COMPLETED'), keys);
    check('没有 DISPATCHED 键（派单端已下线）', !keys.includes('DISPATCHED'), keys);
    check('状态计数都是非负整数', Object.values(sc).every((v) => Number.isInteger(v) && v >= 0), sc);

    // 自洽：各状态之和应该等于订单总数
    const sum = Object.values(sc).reduce((a, b) => a + b, 0);
    check('statusCounts 之和 = total.orderCount', sum === d.total?.orderCount, { sum, total: d.total?.orderCount });

    // 自洽：已送达数两处应当一致
    check('statusCounts.DELIVERED = total.deliveredCount', sc.DELIVERED === d.total?.deliveredCount, { sc: sc.DELIVERED, total: d.total?.deliveredCount });
    check('statusCounts.CANCELLED = total.cancelledCount', sc.CANCELLED === d.total?.cancelledCount, { sc: sc.CANCELLED, total: d.total?.cancelledCount });

    check('hotProducts 是数组', Array.isArray(d.hotProducts), d.hotProducts);
    check('hotProducts 最多 10 条', (d.hotProducts ?? []).length <= 10, d.hotProducts?.length);
    if ((d.hotProducts ?? []).length > 0) {
      const hp = d.hotProducts[0];
      check('热销项含 productId/name/quantity/amount', ['productId', 'name', 'quantity', 'amount'].every((k) => k in hp), hp);
      check('热销 quantity 是正整数', Number.isInteger(hp.quantity) && hp.quantity > 0, hp.quantity);
      check('热销 amount 是「分」整数', Number.isInteger(hp.amount), hp.amount);
      const qs = d.hotProducts.map((x) => x.quantity);
      check('热销按件数降序', qs.every((v, i) => i === 0 || qs[i - 1] >= v), qs);

      // 交叉核验：榜单第一名的件数应该能在库里复现
      if (!dbSkipped) {
        const rows = queryDb(
          `SELECT SUM(i.quantity) FROM order_item i JOIN \`order\` o ON o.id = i.order_id ` +
          `WHERE o.deleted_at IS NULL AND o.status = 'DELIVERED' AND i.product_id = ${hp.productId}`,
        );
        if (rows && rows.length === 1) {
          check(`热销第一名件数与库一致（${rows[0][0]}）`, Number(rows[0][0]) === hp.quantity, { db: rows[0][0], api: hp.quantity });
        }
      }
    } else {
      note('（还没有已送达订单，热销榜为空）', null);
    }

    if (dbSkipped) note('（mysql 不可用，未做库内交叉核验）', null);
  }

  // =========================================================================
  line('26. 分页边界');
  {
    const over = await call('GET', '/admin/orders?pageSize=999', { token: tokenAdmin });
    check('pageSize 超上限 -> 10001 或被夹到 50', over.body.code === 10001 || over.body.data?.pageSize === 50, { code: over.body.code, pageSize: over.body.data?.pageSize });

    const p2 = await call('GET', '/admin/orders?page=1&pageSize=2', { token: tokenAdmin });
    check('pageSize=2 生效', (p2.body.data?.list ?? []).length <= 2, p2.body.data?.list?.length);

    const far = await call('GET', '/admin/orders?page=9999&pageSize=10', { token: tokenAdmin });
    check('翻到很后面返回空列表而不是报错', far.body.code === 0 && Array.isArray(far.body.data?.list), far.body);
    check('hasMore = false', far.body.data?.hasMore === false, far.body.data?.hasMore);
  }

  console.log(`\n通过 ${pass} / 失败 ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('冒烟测试异常：', err?.message ?? err);
  process.exit(1);
});
