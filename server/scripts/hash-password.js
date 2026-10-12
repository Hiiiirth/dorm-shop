/**
 * 生成 bcrypt 密码哈希，用于 db/02-seed.sql 里的 password_hash 字段
 *
 * 用法：
 *   node scripts/hash-password.js 123456
 *   npm run hash -- 123456
 */
const bcrypt = require('bcryptjs');

const password = process.argv[2] || '123456';
const hash = bcrypt.hashSync(password, 10);

console.log(`明文: ${password}`);
console.log(`哈希: ${hash}`);
console.log('');
console.log('校验: ' + bcrypt.compareSync(password, hash));
