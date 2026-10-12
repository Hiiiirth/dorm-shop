/**
 * S4-1 商品浏览冒烟测试（只读，无需登录）
 *
 * 前置：数据库已导入种子数据 + 后端已启动
 * 运行： node scripts/smoke-catalog.js
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';

/** 种子里的 5 个一级分类；断言用「包含」而不是「等于」，管理员合法新建分类后不该误报 */
const SEED_ROOT_NAMES = ['饮料冲调', '休闲零食', '泡面速食', '日用百货', '文具办公'];

let pass = 0;
let fail = 0;

async function get(path) {
  const res = await fetch(BASE + path, {
    headers: { 'X-Request-Id': `cat-${Math.random().toString(16).slice(2, 8)}` },
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
    console.log(`       ${JSON.stringify(detail)?.slice(0, 300)}`);
  }
}

function line(t) {
  console.log(`\n${t}`);
}

async function main() {
  line('1. 首页聚合 GET /home');
  let homeData;
  {
    const r = await get('/home');
    homeData = r.body.data;
    check('code = 0', r.body.code === 0, r.body);
    check('categories 是数组且至少 5 个一级分类', Array.isArray(homeData?.categories) && homeData.categories.length >= 5, homeData?.categories);
    check(
      '一级分类包含种子里的 5 个',
      SEED_ROOT_NAMES.every((n) => (homeData?.categories ?? []).some((c) => c.name === n)),
      homeData?.categories?.map((c) => c.name),
    );
    check('hotProducts 返回 6 个', homeData?.hotProducts?.length === 6, homeData?.hotProducts?.length);
    check('newProducts 返回 6 个', homeData?.newProducts?.length === 6, homeData?.newProducts?.length);
    check('热销第一名是农夫山泉（销量 288 最高）', homeData?.hotProducts?.[0]?.name === '农夫山泉 550ml', homeData?.hotProducts?.[0]);
    check('未登录也能访问', r.http === 200, r.http);
  }

  line('2. 分类树 GET /categories');
  {
    const r = await get('/categories');
    check('code = 0', r.body.code === 0, r.body);
    check('至少 5 个一级分类', r.body.data?.length >= 5, r.body.data?.length);
    check(
      '一级分类包含种子分类名',
      SEED_ROOT_NAMES.every((n) => (r.body.data ?? []).some((c) => c.name === n)),
      r.body.data?.map((c) => c.name),
    );
    check('叶子节点不带空 children 字段', !('children' in (r.body.data?.[0] ?? {})), r.body.data?.[0]);
  }

  line('3. 按父分类查询 GET /categories?parentId=1');
  {
    const r = await get('/categories?parentId=1');
    check('code = 0', r.body.code === 0, r.body);
    check('data 是数组', Array.isArray(r.body.data), r.body.data);
  }

  line('4. 商品列表分页 GET /products');
  {
    const r = await get('/products');
    check('code = 0', r.body.code === 0, r.body);
    const p1 = r.body.data ?? {};
    // 不写死 12：库里可能残留测试商品（冒烟脚本崩溃会漏），断言「种子全集都在」更稳
    check('至少 12 个商品（种子全集都在）', p1.total >= 12, p1.total);
    check('page = 1 / pageSize = 10', p1.page === 1 && p1.pageSize === 10, p1);
    check('list 长度 = min(10, total)', p1.list?.length === Math.min(10, p1.total), p1.list?.length);
    check('hasMore = (total > 10)', p1.hasMore === p1.total > 10, p1);
  }

  line('5. 翻到第二页');
  {
    const r = await get('/products?page=2&pageSize=10');
    const p2 = r.body.data ?? {};
    const expectLen = Math.max(0, Math.min(10, p2.total - 10));
    check('list 长度 = 剩余条数', p2.list?.length === expectLen, { got: p2.list?.length, expectLen, total: p2.total });
    check('hasMore = (total > 20)', p2.hasMore === p2.total > 20, p2);
  }

  line('6. 金额是「分」整数（关键约定）');
  {
    const r = await get('/products?pageSize=50');
    const coke = r.body.data?.list?.find((p) => p.name === '可口可乐 330ml');
    check('可口可乐价格 = 300 分', coke?.price === 300, coke);
    check('划线原价 = 350 分', coke?.originalPrice === 350, coke);
    check('price 是 number 不是 string', typeof coke?.price === 'number', typeof coke?.price);
  }

  line('7. 按分类筛选 categoryId=1（饮料冲调应有 3 个）');
  {
    const r = await get('/products?categoryId=1');
    check('至少 3 个（饮料冲调种子）', r.body.data?.total >= 3, r.body.data?.total);
    check('全部属于分类 1', (r.body.data?.list ?? []).every((p) => p.categoryId === 1), r.body.data?.list);
  }

  line('8. 关键词搜索 keyword=可乐');
  {
    const r = await get('/products?keyword=%E5%8F%AF%E4%B9%90');
    check('命中 >= 1', (r.body.data?.total ?? 0) >= 1, r.body.data);
    check('结果名含「可乐」', (r.body.data?.list ?? []).every((p) => p.name.includes('可乐')), r.body.data?.list);
  }

  line('9. 排序 sortBy');
  {
    const asc = await get('/products?sortBy=price_asc');
    check('价格升序首位 = 200 分', asc.body.data?.list?.[0]?.price === 200, asc.body.data?.list?.[0]);

    const desc = await get('/products?sortBy=price_desc');
    check('价格降序首位 = 1500 分', desc.body.data?.list?.[0]?.price === 1500, desc.body.data?.list?.[0]);

    const sales = await get('/products?sortBy=sales');
    const counts = (sales.body.data?.list ?? []).map((p) => p.salesCount);
    check('销量降序（单调不减）', counts.every((v, i) => i === 0 || counts[i - 1] >= v), counts);
  }

  line('10. 商品详情 GET /products/1');
  {
    const r = await get('/products/1');
    check('code = 0', r.body.code === 0, r.body);
    check('含 description 字段', 'description' in (r.body.data ?? {}), r.body.data);
    check('含 images 字段', 'images' in (r.body.data ?? {}), r.body.data);
    check('价格 300 分', r.body.data?.price === 300, r.body.data);
  }

  line('11. 商品不存在 GET /products/99999');
  {
    const r = await get('/products/99999');
    check('code = 40001', r.body.code === 40001, r.body);
    check('HTTP 200（业务失败不走 4xx）', r.http === 200, r.http);
  }

  line('12. 参数校验');
  {
    const a = await get('/products?pageSize=999');
    check('pageSize 超上限 -> 10001', a.body.code === 10001, a.body);

    const b = await get('/products?sortBy=not-a-real-sort');
    check('sortBy 非法 -> 10001', b.body.code === 10001, b.body);

    const c = await get('/categories?parentId=abc');
    check('parentId 非数字 -> 10001', c.body.code === 10001, c.body);
  }

  console.log(`\n通过 ${pass} / 失败 ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('冒烟测试异常：', err?.message ?? err);
  process.exit(1);
});
