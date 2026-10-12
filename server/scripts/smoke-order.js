/**
 * S5-1 下单与订单查询 冒烟测试
 *
 * 前置：数据库已导入种子数据 + 后端已启动
 * 运行： node scripts/smoke-order.js
 *
 * 覆盖：
 *   下单预览算价 / 直购下单 / 购物车下单 / 库存与销量扣减
 *   订单号格式 / 初始状态为 PENDING / 状态轨迹
 *   我的订单列表与状态过滤 / 订单详情 / 数据隔离与越权
 *   取消订单与库存回滚 / 各类参数与库存异常
 *
 * v1.2：不再有自动派单。顾客下单后订单就是 PENDING（待接单），
 * 等店长在工作台接单 / 确认送达，所以这里断言「初始状态 = PENDING、
 * 轨迹只有一条」，派单相关的断言全部移除。
 *
 * 种子参考：id1 可口可乐 300分 / id2 农夫山泉 200分 / id6 卫龙辣条 400分
 *          id7 康师傅红烧牛肉面 550分 / id8 自热米饭 1500分(仅 60 件)
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';

let pass = 0;
let fail = 0;

async function call(method, path, { body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Request-Id': `order-${Math.random().toString(16).slice(2, 8)}`,
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

/** 只打印、不计入通过数：用于受历史数据影响的观察项 */
function note(label, value) {
  console.log(`  info ${label}: ${JSON.stringify(value)}`);
}

function line(t) {
  console.log(`\n${t}`);
}

async function login(code) {
  const r = await call('POST', '/auth/login', { body: { code } });
  return r.body.data?.accessToken;
}

/** 取当前登录人的资料（拿 id / roles 用） */
async function whoami(token) {
  const r = await call('GET', '/users/me', { token });
  return r.body.data;
}

/** 取商品当前 stock / salesCount，用来做「相对变化」断言，避免受历史数据影响 */
async function snap(productId) {
  const r = await call('GET', `/products/${productId}`);
  const d = r.body.data;
  return { stock: d?.stock, salesCount: d?.salesCount };
}

const ADDR = { roomNo: '305', contactName: '阿伟', contactPhone: '13800001234' };

async function main() {
  const stamp = Date.now().toString().slice(-8);

  line('1. 未登录访问订单接口');
  {
    const r = await call('POST', '/orders', { body: { ...ADDR, items: [{ productId: 1, quantity: 1 }] } });
    check('HTTP 401', r.http === 401, r);
    check('code = 20001', r.body.code === 20001, r.body);

    const g = await call('GET', '/orders');
    check('GET 列表 HTTP 401', g.http === 401, g);
  }

  const tokenA = await login(`ordA${stamp}`);
  const tokenB = await login(`ordB${stamp}`);
  check('两个测试账号登录成功', !!tokenA && !!tokenB, { A: !!tokenA, B: !!tokenB });
  if (!tokenA || !tokenB) throw new Error('登录失败，检查服务是否启动、WX_MOCK_LOGIN 是否为 true');

  const me = await whoami(tokenA);
  check('能读到下单人自己的资料', !!me?.id, me);
  check('新账号初始身份是 CUSTOMER', Array.isArray(me?.roles) && me.roles.includes('CUSTOMER'), me?.roles);

  // ============================================================
  line('2. 下单预览：只算价不落库');
  {
    const r = await call('POST', '/orders/preview', {
      token: tokenA,
      body: { items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 3 }] },
    });
    check('code = 0', r.body.code === 0, r.body);
    const d = r.body.data ?? {};
    check('unitCount = 2（2 种商品）', d.unitCount === 2, d);
    check('totalQuantity = 5（共 5 件）', d.totalQuantity === 5, d);
    check('totalAmount = 1200 分', d.totalAmount === 1200, d);
    check('可乐单价 300 分 / 小计 600 分', d.items?.[0]?.unitPrice === 300 && d.items?.[0]?.subtotal === 600, d.items?.[0]);
    check('矿泉水小计 600 分', d.items?.[1]?.subtotal === 600, d.items?.[1]);

    const stockNow = await snap(1);
    check('预览不扣库存', typeof stockNow.stock === 'number', stockNow);
  }

  line('3. 预览参数校验');
  {
    const a = await call('POST', '/orders/preview', { token: tokenA, body: {} });
    check('什么都不传 -> 50004', a.body.code === 50004, a.body);

    const b = await call('POST', '/orders/preview', {
      token: tokenA,
      body: { items: [{ productId: 1, quantity: 0 }] },
    });
    check('数量 0 -> 10001', b.body.code === 10001, b.body);

    const c = await call('POST', '/orders/preview', { token: tokenA, body: { items: 'x' } });
    check('items 非数组 -> 10001', c.body.code === 10001, c.body);
  }

  // ============================================================
  line('4. 直接下单（items 方式）');
  const before1 = await snap(1);
  const before2 = await snap(2);
  let orderA = null;
  {
    const r = await call('POST', '/orders', {
      token: tokenA,
      body: { ...ADDR, remark: '放门口', items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 3 }] },
    });
    check('code = 0', r.body.code === 0, r.body);
    orderA = r.body.data;

    check('orderNo 形如 SO + 18 位数字', /^SO\d{18}$/.test(orderA?.orderNo ?? ''), orderA?.orderNo);
    check('totalAmount = 1200 分', orderA?.totalAmount === 1200, orderA);
    check('itemCount = 2', orderA?.itemCount === 2, orderA);
    check('totalQuantity = 5', orderA?.totalQuantity === 5, orderA);
    check('门牌号 = 305', orderA?.roomNo === '305', orderA);
    check('收件人 = 阿伟', orderA?.contactName === '阿伟', orderA);
    check('备注 = 放门口', orderA?.remark === '放门口', orderA);
    check('payStatus = 2（货到付款）', orderA?.payStatus === 2, orderA);
    check('payType = 2（线下结算）', orderA?.payType === 2, orderA);
    check('明细带商品名快照', orderA?.items?.[0]?.name === '可口可乐 330ml', orderA?.items?.[0]);
    check('明细单价为分（300）', orderA?.items?.[0]?.unitPrice === 300, orderA?.items?.[0]);
  }

  line('5. 下单后初始状态 = PENDING（待接单，等店长处理）');
  {
    check('状态 = PENDING', orderA?.status === 'PENDING', orderA?.status);
    check('statusText = 待接单', orderA?.statusText === '待接单', orderA?.statusText);
    check('不再有 dispatcher 字段', !('dispatcher' in (orderA ?? {})), Object.keys(orderA ?? {}));
    check('不再有 dispatchedAt 字段', !('dispatchedAt' in (orderA ?? {})), Object.keys(orderA ?? {}));
    check('deliveredAt 为空', orderA?.deliveredAt === null, orderA?.deliveredAt);

    const logs = orderA?.statusLogs ?? [];
    check('状态轨迹只有 1 条（还没有店长操作）', logs.length === 1, logs);
    check('轨迹 1：空 -> PENDING', logs[0]?.toStatus === 'PENDING', logs[0]);
    check('轨迹 1 的操作人是顾客', logs[0]?.operatorRole === 'CUSTOMER', logs[0]);
    check('提交订单备注', /提交订单/.test(logs[0]?.remark ?? ''), logs[0]?.remark);
  }

  line('6. 库存与销量已扣减');
  {
    const after1 = await snap(1);
    const after2 = await snap(2);
    check('可乐库存 -2', after1.stock === before1.stock - 2, { before: before1, after: after1 });
    check('可乐销量 +2', after1.salesCount === before1.salesCount + 2, { before: before1, after: after1 });
    check('矿泉水库存 -3', after2.stock === before2.stock - 3, { before: before2, after: after2 });
  }

  // ============================================================
  line('7. 我的订单列表');
  {
    const r = await call('GET', '/orders', { token: tokenA });
    check('code = 0', r.body.code === 0, r.body);
    const d = r.body.data ?? {};
    check('信封含 list/page/pageSize/total/hasMore', ['list', 'page', 'pageSize', 'total', 'hasMore'].every((k) => k in d), d);
    check('包含刚下的单', (d.list ?? []).some((o) => o.orderNo === orderA.orderNo), d.list?.map((o) => o.orderNo));
    check('列表项带 statusText', (d.list ?? [])[0]?.statusText !== undefined, (d.list ?? [])[0]);
    check('total >= 1', d.total >= 1, d.total);
  }

  line('8. 按状态过滤');
  {
    const r = await call('GET', '/orders?status=DELIVERED', { token: tokenA });
    check('code = 0', r.body.code === 0, r.body);
    check('DELIVERED 列表不含该单', !(r.body.data?.list ?? []).some((o) => o.orderNo === orderA.orderNo), r.body.data?.list);

    const s = await call('GET', '/orders?status=PENDING', { token: tokenA });
    check('PENDING 列表含该单', (s.body.data?.list ?? []).some((o) => o.orderNo === orderA.orderNo), s.body.data?.list);

    const gone = await call('GET', '/orders?status=DISPATCHED', { token: tokenA });
    check('DISPATCHED 已不是合法状态 -> 10001', gone.body.code === 10001, gone.body);

    const bad = await call('GET', '/orders?status=NOPE', { token: tokenA });
    check('非法 status -> 10001', bad.body.code === 10001, bad.body);

    const pg = await call('GET', '/orders?pageSize=100', { token: tokenA });
    check('pageSize 超上限 50 -> 10001', pg.body.code === 10001, pg.body);
  }

  line('9. 订单详情');
  {
    const r = await call('GET', `/orders/${orderA.id}`, { token: tokenA });
    check('code = 0', r.body.code === 0, r.body);
    check('orderNo 一致', r.body.data?.orderNo === orderA.orderNo, r.body.data?.orderNo);
    check('详情含 statusLogs', Array.isArray(r.body.data?.statusLogs), r.body.data?.statusLogs);
    check('deliveredAt 为空（还没送达）', r.body.data?.deliveredAt === null, r.body.data?.deliveredAt);

    const nf = await call('GET', '/orders/99999999', { token: tokenA });
    check('订单不存在 -> 50001', nf.body.code === 50001, nf.body);
  }

  line('10. 数据隔离与越权');
  {
    const g = await call('GET', `/orders/${orderA.id}`, { token: tokenB });
    check('B 查 A 的单 -> 50001', g.body.code === 50001, g.body);

    const c = await call('POST', `/orders/${orderA.id}/cancel`, { token: tokenB, body: {} });
    check('B 取消 A 的单 -> 50001', c.body.code === 50001, c.body);

    const list = await call('GET', '/orders', { token: tokenB });
    check('B 的列表不含 A 的单', !(list.body.data?.list ?? []).some((o) => o.orderNo === orderA.orderNo), list.body.data?.list);

    const stillOk = await call('GET', `/orders/${orderA.id}`, { token: tokenA });
    check('A 的单未被改动，仍是 PENDING', stillOk.body.data?.status === 'PENDING', stillOk.body.data?.status);
  }

  line('11. 路径参数非法');
  {
    const r = await call('GET', '/orders/abc', { token: tokenA });
    check('HTTP 200', r.http === 200, r.http);
    check('code = 10001', r.body.code === 10001, r.body);
  }

  // ============================================================
  line('12. 从购物车下单');
  let orderC = null;
  const before6 = await snap(6);
  const before7 = await snap(7);
  {
    await call('DELETE', '/cart', { token: tokenA });
    await call('POST', '/cart', { token: tokenA, body: { productId: 6, quantity: 2 } });
    await call('POST', '/cart', { token: tokenA, body: { productId: 7, quantity: 1 } });

    const cart = (await call('GET', '/cart', { token: tokenA })).body.data;
    check('购物车 2 条', cart?.itemCount === 2, cart);
    const cartIds = (cart?.list ?? []).map((i) => i.id);

    const r = await call('POST', '/orders', { token: tokenA, body: { ...ADDR, cartIds } });
    check('code = 0', r.body.code === 0, r.body);
    orderC = r.body.data;
    check('totalAmount = 1350 分（400x2 + 550）', orderC?.totalAmount === 1350, orderC);
    check('itemCount = 2', orderC?.itemCount === 2, orderC);
    check('totalQuantity = 3', orderC?.totalQuantity === 3, orderC);

    const after = (await call('GET', '/cart', { token: tokenA })).body.data;
    check('下单后购物车已清空', after?.list?.length === 0, after);

    const a6 = await snap(6);
    const a7 = await snap(7);
    check('辣条库存 -2', a6.stock === before6.stock - 2, { before: before6, after: a6 });
    check('泡面库存 -1', a7.stock === before7.stock - 1, { before: before7, after: a7 });
  }

  line('13. 用别人的 cartId 下单');
  {
    await call('POST', '/cart', { token: tokenA, body: { productId: 1, quantity: 1 } });
    const aCart = (await call('GET', '/cart', { token: tokenA })).body.data;
    const aCartId = aCart.list[0].id;

    const r = await call('POST', '/orders', { token: tokenB, body: { ...ADDR, cartIds: [aCartId] } });
    check('B 用 A 的购物车条目 -> 10002', r.body.code === 10002, r.body);

    const afterA = (await call('GET', '/cart', { token: tokenA })).body.data;
    check('A 的购物车条目仍在', afterA?.itemCount === 1, afterA);
  }

  // ============================================================
  line('14. 取消订单 + 库存回滚');
  {
    const before = await snap(6);
    const r = await call('POST', `/orders/${orderC.id}/cancel`, { token: tokenA, body: { reason: '不要了' } });
    check('code = 0', r.body.code === 0, r.body);
    check('状态 = CANCELLED', r.body.data?.status === 'CANCELLED', r.body.data?.status);
    check('statusText = 已取消', r.body.data?.statusText === '已取消', r.body.data?.statusText);
    check('cancelReason = 不要了', r.body.data?.cancelReason === '不要了', r.body.data?.cancelReason);
    check('cancelledAt 非空', !!r.body.data?.cancelledAt, r.body.data?.cancelledAt);

    const logs = r.body.data?.statusLogs ?? [];
    check('轨迹最后一条是 CANCELLED', logs[logs.length - 1]?.toStatus === 'CANCELLED', logs[logs.length - 1]);

    const after = await snap(6);
    check('辣条库存已回滚 +2', after.stock === before.stock + 2, { before, after });
    check('辣条销量已回滚 -2', after.salesCount === before.salesCount - 2, { before, after });
  }

  line('15. 重复取消 / 取消不存在的订单');
  {
    const again = await call('POST', `/orders/${orderC.id}/cancel`, { token: tokenA, body: {} });
    check('重复取消 -> 50002', again.body.code === 50002, again.body);

    const nf = await call('POST', '/orders/99999999/cancel', { token: tokenA, body: {} });
    check('不存在 -> 50001', nf.body.code === 50001, nf.body);
  }

  // ============================================================
  line('16. 下单异常校验');
  {
    const a = await call('POST', '/orders', { token: tokenA, body: { ...ADDR, items: [{ productId: 8, quantity: 61 }] } });
    check('超库存(自热米饭仅 60) -> 40003', a.body.code === 40003, a.body);
    check('提示带商品名与剩余量', /自热米饭/.test(a.body.message ?? ''), a.body.message);

    const b = await call('POST', '/orders', { token: tokenA, body: { ...ADDR, items: [{ productId: 99999, quantity: 1 }] } });
    check('商品不存在 -> 40001', b.body.code === 40001, b.body);

    const c = await call('POST', '/orders', { token: tokenA, body: { ...ADDR, items: [{ productId: 1, quantity: 100 }] } });
    check('数量 100 超上限 -> 10001', c.body.code === 10001, c.body);

    const d = await call('POST', '/orders', { token: tokenA, body: { items: [{ productId: 1, quantity: 1 }] } });
    check('缺门牌号 -> 10001', d.body.code === 10001, d.body);

    const e = await call('POST', '/orders', {
      token: tokenA,
      body: { ...ADDR, contactPhone: '123', items: [{ productId: 1, quantity: 1 }] },
    });
    check('手机号格式错 -> 10001', e.body.code === 10001, e.body);

    const f = await call('POST', '/orders', { token: tokenA, body: { ...ADDR, items: [] } });
    check('items 空数组 -> 50004', f.body.code === 50004, f.body);

    const g = await call('POST', '/orders', { token: tokenA, body: { ...ADDR, items: [{ productId: 1, quantity: 1 }], cartIds: [] } });
    check('items 优先于 cartIds，可正常下单', g.body.code === 0, g.body);
  }

  // ============================================================
  line('17. 第二个账号也能独立下单（订单彼此隔离）');
  {
    const r = await call('POST', '/orders', { token: tokenB, body: { ...ADDR, items: [{ productId: 3, quantity: 1 }] } });
    check('B 也能正常下单', r.body.code === 0, r.body);
    check('B 的单状态 = PENDING', r.body.data?.status === 'PENDING', r.body.data?.status);
    check('B 的单有独立订单号', r.body.data?.orderNo !== orderA?.orderNo, {
      a: orderA?.orderNo,
      b: r.body.data?.orderNo,
    });

    // 两个账号各自的列表里只能看到自己的单
    const la = await call('GET', '/orders', { token: tokenA });
    const lb = await call('GET', '/orders', { token: tokenB });
    check(
      'A 的列表不含 B 的单',
      !(la.body.data?.list ?? []).some((o) => o.orderNo === r.body.data?.orderNo),
      la.body.data?.list?.map((o) => o.orderNo),
    );
    check(
      'B 的列表不含 A 的单',
      !(lb.body.data?.list ?? []).some((o) => o.orderNo === orderA?.orderNo),
      lb.body.data?.list?.map((o) => o.orderNo),
    );
  }

  console.log(`\n通过 ${pass} / 失败 ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('冒烟测试异常：', err?.message ?? err);
  process.exit(1);
});
