/**
 * 清理冒烟测试留下的临时数据（开发自用，不参与打包）
 * ---------------------------------------------------------------------------
 * 冒烟脚本（smoke-admin / smoke-image 等）每次跑都会造「临时分类 + 商品 + 订单」，
 * 有些因为挂着在办订单删不掉（40007 删除保护），会留在库里。
 *
 * 残留数据的副作用（踩过）：
 *   · 临时分类 id 更大 → 分类页「第一个一级分类」变成它
 *   · 它下面只有下架商品 → 顾客端网格是空的
 *   · verify-pages.mjs 的分类页用例于是变红（看起来像回归，其实是数据脏了）
 *
 * 用法：
 *   node scripts/cleanup-test-residue.js              # 只报告
 *   node scripts/cleanup-test-residue.js --apply      # 真的删
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');

/** 临时数据的名字前缀（各冒烟脚本统一用这些） */
const PREFIXES = ['图片测试%', '冒烟%', '测试%', 'S9%', 'S10%', 'T%临时%', 'T%测试%', '带图商品%'];

const ENV_PATH = path.join(__dirname, '..', '.env');
const env = {};
for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

(async () => {
  const conn = await mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD,
    database: env.DB_NAME || 'dorm_shop',
  });
  const q = async (sql) => (await conn.query(sql))[0];

  const counts = async () =>
    (
      await q(
        `SELECT (SELECT COUNT(*) FROM user) AS u,
                (SELECT COUNT(*) FROM category) AS c,
                (SELECT COUNT(*) FROM product) AS p,
                (SELECT COUNT(*) FROM \`order\`) AS o,
                (SELECT COUNT(*) FROM order_item) AS oi,
                (SELECT COUNT(*) FROM cart) AS ct`,
      )
    )[0];

  console.log(`[cleanup] 库=${env.DB_NAME || 'dorm_shop'}  模式=${APPLY ? 'APPLY(真删)' : 'DRY-RUN(只报告)'}`);
  console.log('[cleanup] 清理前:', await counts());

  const where = PREFIXES.map((p) => `name LIKE '${p}'`).join(' OR ');
  const cats = await q(`SELECT id, name FROM category WHERE ${where}`);
  if (!cats.length) {
    console.log('\n[cleanup] 没有找到临时分类，库是干净的。');
    await conn.end();
    return;
  }
  console.log('\n[cleanup] 命中临时分类:');
  for (const c of cats) console.log(`   id=${c.id}  ${c.name}`);

  const catIds = cats.map((r) => r.id).join(',');
  const prods = await q(`SELECT id, name, category_id, status FROM product WHERE category_id IN (${catIds})`);
  console.log(`\n[cleanup] 其下商品 ${prods.length} 个:`);
  for (const p of prods) console.log(`   id=${p.id}  ${p.name}  status=${p.status}`);

  // ⚠️ 只删「临时商品」自己的订单，**不碰别的账号买种子商品的订单**。
  //    踩过的坑：第一版按 product_id 反查订单，把种子顾客（user_id=8）买
  //    种子商品的历史订单也圈进来了 —— 那是有效数据，不是残留。
  //    判据 = 明细里**只**包含临时商品（不含任何种子商品 1~12）的订单。
  const prodIds = prods.map((r) => r.id).join(',');
  let orderIds = [];
  if (prodIds) {
    const rows = await q(
      `SELECT oi.order_id
         FROM order_item oi
        WHERE oi.product_id IN (${prodIds})
          AND NOT EXISTS (
                SELECT 1 FROM order_item x
                 WHERE x.order_id = oi.order_id
                   AND x.product_id NOT IN (${prodIds})
              )`,
    );
    orderIds = [...new Set(rows.map((r) => r.order_id))];
    console.log(`\n[cleanup] 只由临时商品构成的订单 ${orderIds.length} 笔: ${orderIds.join(', ') || '(无)'}`);
  }

  if (!APPLY) {
    console.log('\n[cleanup] DRY-RUN 结束。加 --apply 才会真删。');
    await conn.end();
    return;
  }

  // 删除顺序：order_item / order_status_log → order → product → category
  // （外键 + 业务约束：分类下有商品删不掉，商品有在办订单删不掉）
  if (orderIds.length) {
    const ids = orderIds.join(',');
    await q(`DELETE FROM order_item WHERE order_id IN (${ids})`);
    await q(`DELETE FROM order_status_log WHERE order_id IN (${ids})`);
    await q(`DELETE FROM \`order\` WHERE id IN (${ids})`);
    console.log(`[cleanup] 已删订单 ${orderIds.length} 笔及其明细/日志`);
  }
  if (prodIds) {
    await q(`DELETE FROM cart WHERE product_id IN (${prodIds})`);
    await q(`DELETE FROM product WHERE id IN (${prodIds})`);
    console.log(`[cleanup] 已删商品 ${prods.length} 个及其购物车引用`);
  }
  await q(`DELETE FROM category WHERE id IN (${catIds})`);
  console.log(`[cleanup] 已删分类 ${cats.length} 个`);

  console.log('\n[cleanup] 清理后:', await counts());
  await conn.end();
})().catch((e) => {
  console.error('[cleanup] 出错:', e.message);
  process.exit(1);
});
