/**
 * S4-2 购物车冒烟测试（需要登录）
 *
 * 前置：数据库已导入种子数据 + 后端已启动
 * 运行： node scripts/smoke-cart.js
 *
 * 种子商品参考： id1 可口可乐 3.00(200件) / id2 农夫山泉 2.00(300件) / id8 自热米饭 15.00(60件)
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';

let pass = 0;
let fail = 0;

async function call(method, path, { body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Request-Id': `cart-${Math.random().toString(16).slice(2, 8)}`,
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
    console.log(`       ${JSON.stringify(detail)?.slice(0, 320)}`);
  }
}

function line(t) {
  console.log(`\n${t}`);
}

const itemOf = (cart, productId) =>
  (cart?.list ?? []).find((i) => i.productId === productId);

async function login(code) {
  const r = await call('POST', '/auth/login', { body: { code } });
  return r.body.data?.accessToken;
}

async function main() {
  const stamp = Date.now().toString().slice(-6);

  line('1. 未登录访问购物车');
  {
    const r = await call('GET', '/cart');
    check('HTTP 401', r.http === 401, r);
    check('code = 20001', r.body.code === 20001, r.body);
  }

  const tokenA = await login(`cartA${stamp}`);
  const tokenB = await login(`cartB${stamp}`);
  check('两个测试账号登录成功', !!tokenA && !!tokenB, { tokenA: !!tokenA, tokenB: !!tokenB });

  line('2. 新用户的购物车是空的');
  {
    const r = await call('GET', '/cart', { token: tokenA });
    check('code = 0', r.body.code === 0, r.body);
    check('list 为空数组', Array.isArray(r.body.data?.list) && r.body.data.list.length === 0, r.body.data);
    check('合计为 0', r.body.data?.totalAmount === 0 && r.body.data?.totalQuantity === 0, r.body.data);
  }

  line('3. 加入购物车：可口可乐(id1, 300分) x2');
  {
    const r = await call('POST', '/cart', { token: tokenA, body: { productId: 1, quantity: 2 } });
    check('code = 0', r.body.code === 0, r.body);
    const item = itemOf(r.body.data, 1);
    check('itemCount = 1', r.body.data?.itemCount === 1, r.body.data);
    check('单价 300 分', item?.price === 300, item);
    check('小计 600 分', item?.subtotal === 600, item);
    check('available = true', item?.available === true, item);
    check('合计 600 分', r.body.data?.totalAmount === 600, r.body.data);
    check('总件数 2', r.body.data?.totalQuantity === 2, r.body.data);
  }

  line('4. 重复加同一商品 -> 累加，不产生第二条');
  {
    const r = await call('POST', '/cart', { token: tokenA, body: { productId: 1, quantity: 1 } });
    check('itemCount 仍是 1', r.body.data?.itemCount === 1, r.body.data);
    check('数量合并为 3', itemOf(r.body.data, 1)?.quantity === 3, itemOf(r.body.data, 1));
    check('合计 900 分', r.body.data?.totalAmount === 900, r.body.data);
  }

  line('5. 加入第二个商品：农夫山泉(id2, 200分) x1');
  {
    const r = await call('POST', '/cart', { token: tokenA, body: { productId: 2, quantity: 1 } });
    check('itemCount = 2', r.body.data?.itemCount === 2, r.body.data);
    check('合计 1100 分', r.body.data?.totalAmount === 1100, r.body.data);
    check('默认勾选', itemOf(r.body.data, 2)?.selected === 1, itemOf(r.body.data, 2));
  }

  line('6. 取消勾选可口可乐 -> 合计只算勾选的');
  {
    const cart = (await call('GET', '/cart', { token: tokenA })).body.data;
    const coke = itemOf(cart, 1);

    const r = await call('PUT', `/cart/${coke.id}`, { token: tokenA, body: { selected: 0 } });
    check('code = 0', r.body.code === 0, r.body);
    check('selectedItemCount = 1', r.body.data?.selectedItemCount === 1, r.body.data);
    check('合计只剩农夫山泉 200 分', r.body.data?.totalAmount === 200, r.body.data);
    check('总件数 1', r.body.data?.totalQuantity === 1, r.body.data);
    check('未勾选项仍在列表里', itemOf(r.body.data, 1)?.selected === 0, itemOf(r.body.data, 1));
  }

  line('7. 改数量：农夫山泉 -> 5 件');
  {
    const cart = (await call('GET', '/cart', { token: tokenA })).body.data;
    const water = itemOf(cart, 2);

    const r = await call('PUT', `/cart/${water.id}`, { token: tokenA, body: { quantity: 5 } });
    check('数量 = 5', itemOf(r.body.data, 2)?.quantity === 5, itemOf(r.body.data, 2));
    check('合计 1000 分', r.body.data?.totalAmount === 1000, r.body.data);
    check('总件数 5', r.body.data?.totalQuantity === 5, r.body.data);
  }

  line('8. 数据隔离：B 的购物车不受影响');
  {
    const r = await call('GET', '/cart', { token: tokenB });
    check('B 的车是空的', r.body.data?.itemCount === 0, r.body.data);
  }

  line('9. 越权：B 改 / 删 A 的购物车项');
  {
    const cartA = (await call('GET', '/cart', { token: tokenA })).body.data;
    const target = itemOf(cartA, 1);

    const u = await call('PUT', `/cart/${target.id}`, { token: tokenB, body: { quantity: 1 } });
    check('改他人项 -> 10002', u.body.code === 10002, u.body);

    const d = await call('DELETE', `/cart/${target.id}`, { token: tokenB });
    check('删他人项 -> 10002', d.body.code === 10002, d.body);

    const stillThere = (await call('GET', '/cart', { token: tokenA })).body.data;
    check('A 的数据没被改动', itemOf(stillThere, 1)?.quantity === 3, itemOf(stillThere, 1));
  }

  line('10. 商品校验');
  {
    const a = await call('POST', '/cart', { token: tokenA, body: { productId: 99999 } });
    check('商品不存在 -> 40001', a.body.code === 40001, a.body);

    const b = await call('POST', '/cart', { token: tokenA, body: { productId: 8, quantity: 61 } });
    check('超库存(自热米饭仅 60) -> 40003', b.body.code === 40003, b.body);

    const c = await call('POST', '/cart', { token: tokenA, body: { productId: 1, quantity: 100 } });
    check('数量 100 超上限 -> 10001', c.body.code === 10001, c.body);

    const d = await call('POST', '/cart', { token: tokenA, body: { quantity: 1 } });
    check('缺 productId -> 10001', d.body.code === 10001, d.body);
  }

  line('11. 删除单项');
  {
    const cart = (await call('GET', '/cart', { token: tokenA })).body.data;
    const coke = itemOf(cart, 1);

    const r = await call('DELETE', `/cart/${coke.id}`, { token: tokenA });
    check('code = 0', r.body.code === 0, r.body);
    check('itemCount 剩 1', r.body.data?.itemCount === 1, r.body.data);
    check('可口可乐已移除', itemOf(r.body.data, 1) === undefined, r.body.data?.list);

    const again = await call('DELETE', `/cart/${coke.id}`, { token: tokenA });
    check('重复删除 -> 10002', again.body.code === 10002, again.body);
  }

  line('12. 清空购物车');
  {
    const r = await call('DELETE', '/cart', { token: tokenA });
    check('code = 0', r.body.code === 0, r.body);
    check('list 为空', r.body.data?.list?.length === 0, r.body.data);
    check('合计归零', r.body.data?.totalAmount === 0, r.body.data);
  }

  console.log(`\n通过 ${pass} / 失败 ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('冒烟测试异常：', err?.message ?? err);
  process.exit(1);
});
