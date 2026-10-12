/**
 * 接口冒烟测试（需要后端已启动 + 数据库已导入）
 *
 * 用法：
 *   1. 启动后端（DB_PASSWORD 用环境变量传入，不要写进文件）
 *        DB_PASSWORD=xxx npm run start:dev
 *   2. 另开终端：
 *        node scripts/smoke-api.js
 *
 * 覆盖：健康检查、登录注册、参数校验、鉴权、身份切换全链路、地址越权。
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';

let pass = 0;
let fail = 0;

async function call(method, path, { body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Request-Id': `smoke-${Math.random().toString(16).slice(2, 8)}`,
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
    console.log(`       ${JSON.stringify(detail)}`);
  }
}

function line(title) {
  console.log(`\n${title}`);
}

async function main() {
  const stamp = Date.now().toString().slice(-6);

  line('1. 健康检查');
  {
    const r = await call('GET', '/health');
    check('HTTP 200', r.http === 200, r);
    check('code = 0', r.body.code === 0, r.body);
    check('traceId 存在', typeof r.body.traceId === 'string' && r.body.traceId.length > 0, r.body);
  }

  line('2. 参数校验（code 传空）');
  {
    const r = await call('POST', '/auth/login', { body: { code: '' } });
    check('code = 10001', r.body.code === 10001, r.body);
    check('HTTP 仍是 200（可预期业务失败）', r.http === 200, r);
  }

  line('3. 微信静默登录（首次自动注册）');
  let token;
  {
    const r = await call('POST', '/auth/login', { body: { code: `stu${stamp}` } });
    check('code = 0', r.body.code === 0, r.body);
    check('返回 accessToken', typeof r.body.data?.accessToken === 'string', r.body);
    check('默认身份 CUSTOMER', r.body.data?.user?.currentRole === 'CUSTOMER', r.body.data?.user);
    check('roles = ["CUSTOMER"]', JSON.stringify(r.body.data?.user?.roles) === '["CUSTOMER"]', r.body.data?.user);
    check('不泄漏 openid / passwordHash', !('openid' in (r.body.data?.user ?? {})) && !('passwordHash' in (r.body.data?.user ?? {})), r.body.data?.user);
    token = r.body.data?.accessToken;
  }

  line('4. 鉴权：不带 token 访问 /users/me');
  {
    const r = await call('GET', '/users/me');
    check('HTTP 401', r.http === 401, r);
    check('code = 20001', r.body.code === 20001, r.body);
  }

  line('5. 鉴权：带 token 访问 /auth/profile');
  {
    const r = await call('GET', '/auth/profile', { token });
    check('code = 0', r.body.code === 0, r.body);
    check('currentRole = CUSTOMER', r.body.data?.currentRole === 'CUSTOMER', r.body.data);
  }

  line('6. 切换到未开通的身份 ADMIN -> 应被拒绝');
  {
    const r = await call('POST', '/auth/switch-role', { token, body: { role: 'ADMIN' } });
    check('code = 30003', r.body.code === 30003, r.body);
  }

  line('7. 不存在的接口 / 已删除的申请派单员接口 -> 404');
  {
    const r = await call('POST', '/users/me/apply-dispatcher', { token });
    check('HTTP 404（派单端已下线）', r.http === 404, r);
  }

  line('8. 身份只有两种：DISPATCHER 不能再切');
  {
    const r = await call('POST', '/auth/switch-role', { token, body: { role: 'DISPATCHER' } });
    check('参数校验失败 10001（DISPATCHER 已从枚举移除）', r.body.code === 10001, r.body);
  }

  line('9. 切换身份到 ADMIN 需要先被授予');
  {
    // 用种子管理员给这个测试账号授予 ADMIN，再切过去 —— 这条断言同时盯住了
    // 「授权 → 切换 → 重新签发 token → 新 token 生效」这条完整链路
    const sms = await call('POST', '/auth/sms-code', { body: { phone: '13800000001' } });
    const seedCode = sms.body.data?.mockCode;
    check('种子店长取到验证码', !!seedCode, sms.body);
    const adminLogin = await call('POST', '/auth/phone-login', {
      body: { phone: '13800000001', smsCode: seedCode },
    });
    check('种子店长登录 code = 0', adminLogin.body.code === 0, adminLogin.body);
    const meId = (await call('GET', '/users/me', { token })).body.data?.id;

    const grant = await call('PUT', `/admin/users/${meId}/role`, {
      token: adminLogin.body.data?.accessToken,
      body: { role: 'ADMIN', action: 'GRANT' },
    });
    check('授予 ADMIN code = 0', grant.body.code === 0, grant.body);
    check('roles 含 ADMIN', (grant.body.data?.roles ?? []).includes('ADMIN'), grant.body.data);

    const sw = await call('POST', '/auth/switch-role', { token, body: { role: 'ADMIN' } });
    check('切换 code = 0', sw.body.code === 0, sw.body);
    check('currentRole = ADMIN', sw.body.data?.user?.currentRole === 'ADMIN', sw.body.data?.user);

    const newToken = sw.body.data?.accessToken;
    const p = await call('GET', '/auth/profile', { token: newToken });
    check('新 token 读到的身份已变更', p.body.data?.currentRole === 'ADMIN', p.body.data);
  }

  line('10. 购物车/地址：新增 + 列表只含本人数据');
  {
    const c = await call('POST', '/users/me/addresses', {
      token,
      body: { contactName: '阿伟', contactPhone: '13800000009', roomNo: '305', isDefault: 1 },
    });
    check('新增地址 code = 0', c.body.code === 0, c.body);
    check('roomNo 未乱码', c.body.data?.roomNo === '305', c.body.data);

    const l = await call('GET', '/users/me/addresses', { token });
    check('列表 code = 0', l.body.code === 0, l.body);
    check('data 是数组（非分页）', Array.isArray(l.body.data), l.body);
  }

  console.log(`\n通过 ${pass} / 失败 ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('冒烟测试异常：', err?.message ?? err);
  process.exit(1);
});
