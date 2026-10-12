/**
 * S10 图片上传（base64 落库）冒烟测试
 *
 * 前置：数据库已导入 db/01-schema.sql + db/02-seed.sql；后端已启动。
 * 运行： node scripts/smoke-image.js
 *        BASE_URL=http://127.0.0.1:3100/api/v1 node scripts/smoke-image.js
 *
 * 覆盖：
 *   1. DDL 字段类型确实是 mediumtext（直连库交叉核验）
 *   2. 商品封面图：POST/PUT 提交 base64 → 详情/管理列表/顾客目录 三条 VO 路径都带图
 *   3. 商品封面图：换图 + 传空串移除
 *   4. 用户头像：PUT /users/me 提交 base64 → GET /users/me 读回一致 → 清空
 *   5. 校验闸门：非图片串 / 非法 MIME / 伪 base64 / 超 1.5MB 一律 10001
 *   6. 传输闸门：超过 Express 2mb body 上限 → 413/90001（不是 10001），两层独立
 *   7. 外链 URL 仍被接受（旧数据 / 未来换 CDN 不破）
 *   8. 带图商品**下单**：order_item.product_cover 快照能存进图（1406 回归防线）
 *   9. 带在办订单的商品删不掉（40007）
 *
 * 数据是自己造的：临时分类 + 临时商品，跑完下架（挂着测试订单，删不掉）。
 * 头像会改到临时顾客账号上，不影响种子店长。
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeJpegDataUrl } = require('./lib/jpeg');

let pass = 0;
let fail = 0;
let dbSkipped = false;

const ADMIN_PHONE = '13800000001';

// ---------------------------------------------------------------------------
// 直连数据库（交叉核验字段类型 / 体量 / 快照落库）
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
// 请求
// ---------------------------------------------------------------------------
async function call(method, path, { body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Request-Id': `img-${Math.random().toString(16).slice(2, 8)}`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  return { http: res.status, body: parsed };
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
  console.log(`S10 图片上传冒烟 · BASE=${BASE}\n`);
  const stamp = Date.now().toString().slice(-8);
  const tag = `I${stamp.slice(-5)}`;

  // 两张体量不同的真图：主图 ~100KB，小图 ~20KB
  const big = makeJpegDataUrl({ size: 600, targetJpegBytes: 100 * 1024 });
  const small = makeJpegDataUrl({ size: 200, targetJpegBytes: 20 * 1024 });
  const imgBig = big.url;
  const imgSmall = small.url;

  // =========================================================================
  line('1. DDL 字段类型（直连库核验）');
  {
    const rows = queryDb(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA='dorm_shop'
         AND ((TABLE_NAME='user' AND COLUMN_NAME='avatar')
           OR (TABLE_NAME='product' AND COLUMN_NAME='cover_image')
           OR (TABLE_NAME='order_item' AND COLUMN_NAME='product_cover'))
       ORDER BY TABLE_NAME`,
    );
    if (rows === null) {
      note('(mysql 不可用，跳过字段类型核验)', null);
    } else {
      check('3 个图片字段都查到了', rows.length === 3, rows);
      for (const [table, col, type, nullable] of rows) {
        check(`${table}.${col} 是 mediumtext`, type === 'mediumtext', { table, col, type });
        check(
          `${table}.${col} 可空（TEXT 列不能有 DEFAULT，必须 NULLABLE）`,
          nullable === 'YES',
          { table, col, nullable },
        );
      }
    }
  }

  // =========================================================================
  line('2. 生成真图');
  {
    note('主图', { jpegBytes: big.bytes, kb: Math.round(big.bytes / 1024), base64Chars: imgBig.length });
    note('小图', { jpegBytes: small.bytes, kb: Math.round(small.bytes / 1024), base64Chars: imgSmall.length });
    check('主图前缀是标准 JPEG data URL', imgBig.startsWith('data:image/jpeg;base64,/9j/'), imgBig.slice(0, 40));
    check('主图体量 ~100KB（模拟「800px/质量0.8」压缩结果）', big.bytes === 100 * 1024, big.bytes);
    check('两图体量不同（用于验证「真的换了图」）', big.bytes !== small.bytes, { big: big.bytes, small: small.bytes });
    check('主图 base64 后约 136KB，VARCHAR(255) 绝对装不下', imgBig.length > 255 * 100, imgBig.length);
  }

  // =========================================================================
  line('3. 登录管理员');
  const { token: tokenAdmin, login: adminLogin } = await loginByPhone(ADMIN_PHONE);
  check('管理员登录成功', !!tokenAdmin && adminLogin.body.code === 0, adminLogin.body?.message);
  if (!tokenAdmin) {
    console.log('\n无法登录管理员，后续用例无法进行');
    console.log(`\n通过 ${pass} / 失败 ${fail}\n`);
    process.exit(1);
  }
  check('登录到的是种子管理员 currentRole=ADMIN',
    adminLogin.body.data?.user?.currentRole === 'ADMIN',
    adminLogin.body.data?.user?.currentRole);

  // =========================================================================
  line('4. 建临时分类 + 带 base64 封面的商品');
  let categoryId = null;
  let productId = null;
  {
    const c = await call('POST', '/admin/categories', {
      token: tokenAdmin,
      body: { name: `图片测试${tag}` },
    });
    categoryId = c.body.data?.id;
    check('临时分类创建成功', !!categoryId, c.body);

    const p = await call('POST', '/admin/products', {
      token: tokenAdmin,
      body: {
        categoryId,
        name: `带图商品${tag}`,
        coverImage: imgBig,
        price: 500,
        stock: 50,
        status: 1,
      },
    });
    check('创建带 base64 封面的商品 → code=0', p.body.code === 0, p.body);
    productId = p.body.data?.id;
    check('返回的 coverImage 与提交**逐字符一致**', p.body.data?.coverImage === imgBig, {
      submitted: imgBig.length,
      returned: p.body.data?.coverImage?.length,
    });
  }
  check('临时商品已创建', !!productId, productId);

  // =========================================================================
  line('5. 三条 VO 路径都要带图（详情 / 管理列表 / 顾客目录）');
  {
    const d = await call('GET', `/admin/products/${productId}`, { token: tokenAdmin });
    check('管理端详情带图', d.body.data?.coverImage === imgBig, d.body.data?.coverImage?.length);

    const list = await call('GET', `/admin/products?keyword=带图商品${tag}`, { token: tokenAdmin });
    const hit = (list.body.data?.list ?? []).find((x) => x.id === productId);
    check('管理端列表带图', !!hit && hit.coverImage === imgBig, hit?.coverImage?.length);

    // 顾客端目录走的是 toProductListVo，是**另一条** VO 路径，必须也带
    const cust = await call('GET', `/products?categoryId=${categoryId}&pageSize=50`);
    const chit = (cust.body.data?.list ?? []).find((x) => x.id === productId);
    check('顾客端 /products 带图', !!chit && chit.coverImage === imgBig, chit?.coverImage?.length);

    const rows = queryDb(`SELECT CHAR_LENGTH(cover_image) FROM product WHERE id=${productId}`);
    if (rows && rows.length === 1) {
      check(`库里 cover_image 字符数与提交一致（${rows[0][0]}）`, Number(rows[0][0]) === imgBig.length, {
        db: Number(rows[0][0]),
        sent: imgBig.length,
      });
    }
  }

  // =========================================================================
  line('6. 换图 + 移除');
  {
    const u = await call('PUT', `/admin/products/${productId}`, {
      token: tokenAdmin,
      body: { coverImage: imgSmall },
    });
    check('换成小图 → code=0', u.body.code === 0, u.body);
    check('换图后返回的是小图', u.body.data?.coverImage === imgSmall, {
      sent: imgSmall.length,
      got: u.body.data?.coverImage?.length,
    });

    const rm = await call('PUT', `/admin/products/${productId}`, {
      token: tokenAdmin,
      body: { coverImage: '' },
    });
    check('传空串移除封面 → code=0', rm.body.code === 0, rm.body);
    check('移除后 coverImage 是空串', rm.body.data?.coverImage === '', rm.body.data?.coverImage);

    const rows = queryDb(`SELECT IFNULL(CHAR_LENGTH(cover_image),-1) FROM product WHERE id=${productId}`);
    if (rows && rows.length === 1) {
      const len = Number(rows[0][0]);
      check('库里已清空（长度 0 或 NULL）', len === 0 || len === -1, len);
    }

    // 复原成有图，供后面的下单用例
    await call('PUT', `/admin/products/${productId}`, { token: tokenAdmin, body: { coverImage: imgBig } });
  }

  // =========================================================================
  line('7. 校验闸门（DTO 层 → 10001）');
  {
    const cases = [
      ['纯文本串', 'this-is-not-an-image'],
      ['svg+xml 不在白名单', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
      ['前缀对但内容不是 base64', 'data:image/png;base64,@@@not-base64@@@'],
      ['只给前缀没有逗号', 'data:image/jpeg;base64'],
      ['超过 1.5MB 字符上限', `data:image/jpeg;base64,${'A'.repeat(1.6 * 1024 * 1024)}`],
    ];
    for (const [label, value] of cases) {
      const r = await call('PUT', `/admin/products/${productId}`, {
        token: tokenAdmin,
        body: { coverImage: value },
      });
      check(`${label} → 10001`, r.body.code === 10001, {
        code: r.body.code, http: r.http, msg: r.body.message,
      });
    }

    const ok = await call('PUT', `/admin/products/${productId}`, {
      token: tokenAdmin,
      body: { coverImage: 'https://example.com/a.jpg' },
    });
    check('外链 URL 仍被接受（旧数据兼容 / 未来换 CDN）', ok.body.code === 0, ok.body);

    // 无效输入不能把已有的图弄丢
    const back = await call('GET', `/admin/products/${productId}`, { token: tokenAdmin });
    check('校验失败的那几次没有污染数据（封面仍是外链那次的值）',
      back.body.data?.coverImage === 'https://example.com/a.jpg',
      back.body.data?.coverImage?.slice(0, 40));

    await call('PUT', `/admin/products/${productId}`, { token: tokenAdmin, body: { coverImage: imgBig } });
  }

  // =========================================================================
  line('8. 传输闸门（Express body 上限 → 413/90001）');
  {
    const huge = `data:image/jpeg;base64,${'A'.repeat(3 * 1024 * 1024)}`;
    const r = await call('PUT', `/admin/products/${productId}`, {
      token: tokenAdmin,
      body: { coverImage: huge },
    });
    check('超 2mb body 被传输层拒绝（413 或 90001，不是 10001）',
      r.http === 413 || r.body.code === 90001, { http: r.http, code: r.body.code });
    note('两层闸门独立：body 体积（2mb）在 Express；格式/1.5MB（10001）在 DTO', null);
  }

  // =========================================================================
  line('9. 头像：PUT /users/me → GET /users/me 读回');
  let avatarUserId = null;
  {
    const { token: tokenCust } = await loginCustomer(`img${stamp}`);
    check('临时顾客登录成功', !!tokenCust);

    const me0 = await call('GET', '/users/me', { token: tokenCust });
    check('新账号初始 avatar 是空串（DB 里是 NULL）', me0.body.data?.avatar === '', me0.body.data?.avatar);
    avatarUserId = me0.body.data?.id;

    const up = await call('PUT', '/users/me', { token: tokenCust, body: { avatar: imgBig } });
    check('提交 base64 头像 → code=0', up.body.code === 0, up.body);
    check('返回的 avatar 与提交一致', up.body.data?.avatar === imgBig, up.body.data?.avatar?.length);

    const me1 = await call('GET', '/users/me', { token: tokenCust });
    check('重新查询 avatar 仍在（确实落库了）', me1.body.data?.avatar === imgBig, me1.body.data?.avatar?.length);

    if (avatarUserId) {
      const rows = queryDb(`SELECT CHAR_LENGTH(avatar) FROM user WHERE id=${avatarUserId}`);
      if (rows && rows.length === 1) {
        check(`库里 avatar 字符数一致（${rows[0][0]}）`, Number(rows[0][0]) === imgBig.length, {
          db: Number(rows[0][0]), sent: imgBig.length,
        });
      }
    }

    const bad = await call('PUT', '/users/me', { token: tokenCust, body: { avatar: 'not-an-image' } });
    check('头像传垃圾串 → 10001', bad.body.code === 10001, bad.body);

    const clear = await call('PUT', '/users/me', { token: tokenCust, body: { avatar: '' } });
    check('传空串清空头像 → code=0', clear.body.code === 0, clear.body);
    check('清空后 avatar 是空串', clear.body.data?.avatar === '', clear.body.data?.avatar);

    const rows = queryDb(`SELECT IFNULL(CHAR_LENGTH(avatar),-1) FROM user WHERE id=${avatarUserId}`);
    if (rows && rows.length === 1) {
      const len = Number(rows[0][0]);
      check('库里头像已清空', len === 0 || len === -1, len);
    }
  }

  // =========================================================================
  line('10. 带图商品下单：order_item.product_cover 快照（1406 回归防线）');
  let orderId = null;
  {
    const { token: tokenCust } = await loginCustomer(`ord${stamp}`);
    check('下单用顾客登录成功', !!tokenCust);
    if (tokenCust) {
      // 顾客账号没有门牌号 → 先补一个
      await call('PUT', '/users/me', { token: tokenCust, body: { defaultRoom: '9 号楼 906' } });

      const o = await call('POST', '/orders', {
        token: tokenCust,
        body: {
          items: [{ productId, quantity: 2 }],
          contactName: '图片测试',
          contactPhone: '13800000003',
          roomNo: '9 号楼 906',
        },
      });
      check('带图商品下单成功 → code=0', o.body.code === 0, o.body);
      orderId = o.body.data?.id;

      const item = (o.body.data?.items ?? [])[0];
      check('订单明细里封面快照 = 提交的图', item?.coverImage === imgBig, {
        len: item?.coverImage?.length,
      });

      if (orderId) {
        const rows = queryDb(
          `SELECT CHAR_LENGTH(product_cover) FROM order_item WHERE order_id=${orderId} LIMIT 1`,
        );
        if (rows && rows.length === 1) {
          check(`库里快照字符数一致（${rows[0][0]}）`, Number(rows[0][0]) === imgBig.length, {
            db: Number(rows[0][0]), sent: imgBig.length,
          });
        }
      }
    }
  }

  // =========================================================================
  line('11. 带在办订单的商品删不掉（40007）');
  {
    if (!orderId) {
      note('（下单没成功，跳过 40007 校验）', null);
    } else {
      const del = await call('DELETE', `/admin/products/${productId}`, { token: tokenAdmin });
      check('删除被拒 → 40007', del.body.code === 40007, del.body);
      check('提示里带上商品名与未完成订单数',
        typeof del.body.message === 'string' && del.body.message.includes('带图商品'),
        del.body.message);

      const dc = await call('DELETE', `/admin/categories/${categoryId}`, { token: tokenAdmin });
      check('分类下有商品也删不掉 → 40006', dc.body.code === 40006, dc.body);
    }

    // 清理：下架，让顾客端看不见
    const off = await call('PUT', `/admin/products/${productId}`, {
      token: tokenAdmin,
      body: { status: 0 },
    });
    check('清理：改成下架成功', off.body.code === 0, off.body);
    note('（临时分类/商品保留，因为挂着测试订单；下架后顾客端不可见）', { categoryId, productId, orderId });
  }

  if (dbSkipped) note('（mysql 不可用，未做库内交叉核验）', null);

  console.log(`\n通过 ${pass} / 失败 ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('冒烟测试异常：', err?.message ?? err);
  process.exit(1);
});
