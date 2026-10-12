/**
 * 验证：身份切换收敛到个人资料页 + 混合状态修复
 * 对照用户给的 9 条验收标准逐条断言。只读验证，不改代码。
 *
 * ⚠️ 种子账号 admin(13800000001) 的 current_role 是 ADMIN —— 登录后**默认就是店长**，
 *    所以流程要先切到顾客身份，才能覆盖「顾客进管理端 → 守卫空态」这条路径。
 *
 * ⚠️⚠️ **本探针会写脏数据库，跑完必须收尾恢复**：
 *    `POST /auth/switch-role` 在服务端是 `user.currentRole = role; save(user)`
 *    —— 它**把 current_role 持久化到 `user` 表**，不是只签个新 token。
 *    所以「切到顾客」会把种子店长的身份**真实改成 CUSTOMER**，
 *    之后 `verify-pages.mjs` 用手机号登录拿到的就是 CUSTOMER 身份，
 *    管理端用例全部停在守卫态（实测踩过：163 项里挂了 6 项）。
 *    脚本末尾的 `restoreAdminBaseline()` 会把 current_role 切回 ADMIN，
 *    跑 FAIL 分支时也会尽力恢复。
 */
const CDP_HOST = 'http://127.0.0.1:9222';
const BASE = 'http://127.0.0.1:4180';
const ADMIN_PHONE = '13800000001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null, id = 0;
const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
async function connect() {
  const list = await (await fetch(CDP_HOST + '/json/list')).json();
  const pg = list.find((t) => t.type === 'page');
  ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
}
const evalJs = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const go = async (route) => { await send('Page.navigate', { url: `${BASE}/?r=${Date.now()}#${route}` }); await sleep(3200); };
const setInput = (i, v) => evalJs(`(()=>{const el=Array.from(document.querySelectorAll('input'))[${i}];const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const clickText = (t) => evalJs(`(()=>{const els=Array.from(document.querySelectorAll('.btn,.cell,.role,.who,.account,uni-button'));const el=els.find(x=>x.textContent.includes(${JSON.stringify(t)}));if(!el)return 'not-found';el.click();return 'clicked';})()`);
const clickBack = () => evalJs(`(()=>{const b=document.querySelector('.navbar__back');if(!b)return 'no-back';b.click();return 'clicked';})()`);

/** 当前「使用中」的身份名（个人资料页里带 .role__tag 的那一行） */
const ACTIVE_ROLE = `(()=>{const el=Array.from(document.querySelectorAll('.role')).find(x=>x.textContent.includes('使用中'));return el?el.textContent.replace(/\\s+/g,' ').trim():'';})()`;

/** 点顶部用户卡片（两端都是进「个人资料」页的入口） */
const clickAccount = () => evalJs(`(()=>{const el=document.querySelector('.account')||document.querySelector('.who');if(!el)return 'no-account-card';el.click();return 'clicked';})()`);

/**
 * 收尾：把种子店长的 current_role 恢复成 ADMIN。
 *
 * 必须做 —— `POST /auth/switch-role` 会**持久化** `current_role` 到数据库，
 * 探针中途「切到顾客」就真的把种子数据改了，会污染后续所有用到管理端身份的测试。
 */
async function restoreAdminBaseline() {
  const sms = await fetch(`${BASE}/api/v1/auth/sms-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: ADMIN_PHONE }),
  });
  const code = (await sms.json())?.data?.mockCode;
  if (!code) return '拿不到验证码';

  const login = await fetch(`${BASE}/api/v1/auth/phone-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: ADMIN_PHONE, smsCode: code }),
  });
  const d = (await login.json())?.data;
  if (!d?.accessToken) return '登录失败';

  if (d.user?.currentRole === 'ADMIN') return '已是 ADMIN（无需恢复）';

  const sw = await fetch(`${BASE}/api/v1/auth/switch-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${d.accessToken}` },
    body: JSON.stringify({ role: 'ADMIN' }),
  });
  const j = await sw.json();
  return j.code === 0 ? '已恢复为 ADMIN' : `恢复失败 code=${j.code}`;
}

/** uni-page 元素个数 ≈ 页面栈深度（H5 端每个栈内页面渲染一个 <uni-page>） */
const SNAP = `(()=>{
  const tabLabels = Array.from(document.querySelectorAll('.tabbar__item .tabbar__label')).map(x=>x.textContent.trim());
  const cells = Array.from(document.querySelectorAll('.cell,.role,.who')).map(x=>x.textContent.replace(/\\s+/g,' ').trim().slice(0,24));
  const roles = Array.from(document.querySelectorAll('.rolechip')).map(x=>x.textContent.trim());
  return {
    hash: location.hash,
    title: (document.querySelector('.navbar__title')||{}).textContent || '',
    tabLabels,
    tabKind: tabLabels.includes('看板') ? 'ADMIN' : (tabLabels.includes('购物车') ? 'CUSTOMER' : '?'),
    cells,
    roles,
    pageCount: document.querySelectorAll('uni-page').length,
    bodyHead: (document.body.innerText||'').replace(/\\n/g,' | ').slice(0,90),
  };
})()`;

const results = [];
const check = (no, desc, ok, extra = '') => {
  results.push({ no, desc, ok, extra });
  console.log(`${ok ? '✓' : '✗'} [标准${no}] ${desc}${extra ? '  → ' + extra : ''}`);
};

(async () => {
  await connect();
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // ===== 登录 admin =====
  await go('/pages/login/login');
  await setInput(0, '13800000001');
  await sleep(300);
  await clickText('获取验证码');
  await sleep(1800);
  const hint = await evalJs(`(()=>{const h=document.querySelector('.dev-hint');return h?h.textContent:''})()`);
  const m = String(hint).match(/(\d{6})/);
  await setInput(1, m ? m[1] : '');
  await sleep(300);
  await evalJs(`(()=>{const b=Array.from(document.querySelectorAll('.btn')).find(x=>x.textContent.trim()==='登录');if(b)b.click();})()`);
  await sleep(3500);

  // ===== 前置：确保当前是「店长」身份（登录身份跟随 DB 的 current_role，不确定）=====
  await go('/pages/mine/mine');
  await clickAccount();   // 顶部账号卡 → 个人资料
  await sleep(3200);
  let active = await evalJs(ACTIVE_ROLE);
  if (!active.includes('店长')) {
    await clickText('店长');
    await sleep(4500);
    console.log('前置：原本是「' + active + '」，已切到店长\n');
  } else {
    console.log('前置：已是「' + active + '」\n');
  }

  // ===== 标准 1：顾客端「我的」页无「切换到店长」 =====
  await go('/pages/mine/mine');
  let s = await evalJs(SNAP);
  console.log(`身份标签：${s.roles.join(' / ') || '(无)'}`);
  check(1, '顾客端「我的」页不存在「切换到店长」', !s.cells.some(c => c.includes('切换到店长')), `cells: ${s.cells.filter(c=>c).join(' / ')}`);

  // ===== 标准 3：管理端顶部卡片可点 → 进个人资料页 =====
  await go('/pages/admin/manage');
  s = await evalJs(SNAP);
  const onManage = s.hash.includes('/pages/admin/manage') && !s.bodyHead.includes('需要切换到店长身份');
  if (onManage) {
    const r = await clickText('可以处理订单和管理商品');   // .who 卡片的副标题
    await sleep(3200);
    s = await evalJs(SNAP);
    check(3, '管理端顶部「店长」卡片可点，进入个人资料页', s.hash.includes('/pages/mine/profile') && s.title === '个人资料', `${r} / hash=${s.hash}`);
    // ===== 标准 9 =====
    const roleText = await evalJs(`Array.from(document.querySelectorAll('.role')).map(x=>x.textContent.replace(/\\s+/g,' ').trim()).join(' || ')`);
    check(9, '「我的身份」显示当前身份为「使用中」', roleText.includes('使用中'), roleText);

    // ===== 标准 4/5/6：切到顾客 =====
    const beforePages = (await evalJs(SNAP)).pageCount;
    const cs = await clickText('顾客');
    await sleep(4500);
    s = await evalJs(SNAP);
    check(4, '切到顾客身份 → 自动跳顾客端「我的」页', s.hash.includes('/pages/mine/mine'), `${cs} / hash=${s.hash}`);
    check(5, '底部 tab 立即变为顾客端（含购物车）', s.tabKind === 'CUSTOMER', `tab=${s.tabLabels.join('/')}`);
    check(5.1, `切换后页面栈只剩 1 页（切前 ${beforePages}）`, s.pageCount === 1, `pageCount=${s.pageCount}`);
    check(8, '顾客端「我的」页 + 顾客端 tab（无混合）', s.tabKind === 'CUSTOMER' && s.hash.includes('/pages/mine/mine'));
  } else {
    check(3, '管理端顶部「店长」卡片可点，进入个人资料页', false, '当前不是店长身份，跳过');
    check(9, '「我的身份」显示「使用中」', false, '跳过');
    check(4, '切到顾客身份 → 落顾客端「我的」页', false, '跳过');
    check(5, '底部 tab 立即刷新', false, '跳过');
    check(5.1, '切后页面栈=1', false, '跳过');
    check(8, '无混合状态', false, '跳过');
  }

  // ===== 标准 2：管理端「管理」页无「切换到顾客身份」=====（此时是顾客身份）
  await go('/pages/admin/manage');
  s = await evalJs(SNAP);
  const isGuard = s.bodyHead.includes('需要切换到店长身份');
  check(2, '管理端「管理」页不存在「切换到顾客身份」', !s.cells.some(c => c.includes('切换到顾客身份')), isGuard ? '（顾客身份 → 守卫空态）' : `bodyHead=${s.bodyHead}`);

  // ===== 从守卫空态进个人资料 → 返回回来源页 =====
  if (isGuard) {
    await clickText('去切换身份');
    await sleep(3200);
    const entered = (await evalJs(SNAP)).hash.includes('/pages/mine/profile');
    await clickBack();
    await sleep(2500);
    s = await evalJs(SNAP);
    check(7, '从管理端守卫态进个人资料，返回回到管理端「管理」页', entered && s.hash.includes('/pages/admin/manage'), `进入=${entered} 返回后=${s.hash}`);
  } else {
    check(7, '从管理端进个人资料，返回回管理端', false, '未能进入守卫态');
  }

  // ===== 标准 7b：从顾客端「我的」页进 → 返回回「我的」页 =====
  await go('/pages/mine/mine');
  await clickAccount();   // 顶部账号卡副标题（昵称/门牌号）
  await sleep(3200);
  const entered2 = (await evalJs(SNAP)).hash.includes('/pages/mine/profile');
  await clickBack();
  await sleep(2500);
  s = await evalJs(SNAP);
  check(7.1, '从顾客端「我的」页进个人资料，返回回到「我的」页', entered2 && s.hash.includes('/pages/mine/mine'), `进入=${entered2} 返回后=${s.hash}`);

  // ===== 标准 6/8.1（强判据）：从「我的」页进个人资料（栈 ≥ 2）后再切身份 =====
  // 这才是图 7 的回归防护：栈里还有旧页面、身份却变了 = 混合态的温床。
  // 栈深用「返回箭头是否存在」证明（NavBar 默认 back='auto'：栈 > 1 才显示）。
  await go('/pages/mine/mine');
  await clickAccount();              // 进个人资料
  await sleep(3200);
  const inProfile = (await evalJs(SNAP)).hash.includes('/pages/mine/profile');
  const backBefore = await evalJs(`!!document.querySelector('.navbar__back')`);
  await clickText('店长');                       // 在 profile 页切到店长
  await sleep(4500);
  s = await evalJs(SNAP);
  const backAfter = await evalJs(`!!document.querySelector('.navbar__back')`);
  check(6, '栈 ≥ 2 时切身份 → 栈被清空（目标页无返回箭头）', inProfile && backBefore && !backAfter, `进profile=${inProfile} 切前有返回箭头=${backBefore} 切后=${backAfter}`);
  check(8.1, '切到店长后**没有**停在顾客端页面（图7 回归防护）', !s.hash.includes('/pages/home/home') && !s.hash.includes('/pages/mine/mine') && s.tabKind === 'ADMIN', `hash=${s.hash} tab=${s.tabKind}`);

  const failed = results.filter(r => !r.ok);
  console.log(`\n════════ 合计 ${results.length - failed.length} ✓ / ${failed.length} ✗`);
  if (failed.length) console.log('未通过：' + failed.map(f => `标准${f.no}(${f.extra})`).join(' | '));

  // 收尾：无论成功失败都要把 current_role 恢复成基线，否则污染后续测试
  try {
    console.log(`[收尾] admin.current_role → ${await restoreAdminBaseline()}`);
  } catch (e) {
    console.log(`[收尾] 恢复失败：${e.message}`);
  }
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => {
  console.error('FAIL', e.message);
  try {
    console.log(`[收尾] admin.current_role → ${await restoreAdminBaseline()}`);
  } catch {
    /* 尽力而为 */
  }
  process.exit(1);
});
