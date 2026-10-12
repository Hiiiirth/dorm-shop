/**
 * 构建产物预览服务器（开发自用，不参与打包）
 * ---------------------------------------------------------------------------
 * 为什么不用 `npm run dev:h5` 做自验：
 *   · dev server 是 on-demand 编译，首屏要等好几秒，截图时机不好把握
 *   · 它是常驻进程，跨工具调用容易被回收，验证过程不稳
 * 用「先 build，再静态托管 + 反代 /api」的方式，结果确定、可重复。
 *
 * 用法：
 *   node scripts/serve-dist.mjs [端口=4180] [后端=http://127.0.0.1:3000]
 *
 * 注意：SPA 用 hash 路由（#/pages/xxx），所以不需要 history fallback。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2]) || 4180;
const API_TARGET = process.argv[3] || 'http://127.0.0.1:3000';
// 用脚本自身位置定位 client 根，而不是 process.cwd()
// （后台起服务时 cwd 可能是仓库根，会导致 root 指到错误位置、全部 404）
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'dist', 'build', 'h5');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ---- /api/* 反代到后端，行为跟 vite 的 proxy 一致 ----
  if (url.pathname.startsWith('/api/')) {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const upstream = await fetch(API_TARGET + url.pathname + url.search, {
        method: req.method,
        headers: {
          'content-type': req.headers['content-type'] || 'application/json',
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      });
      res.end(buf);
    } catch (err) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: 90001, message: `反代失败: ${err.message}` }));
    }
    return;
  }

  // ---- 静态文件；找不到就回 index.html（保险起见留着） ----
  let path = join(ROOT, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  try {
    const s = await stat(path);
    if (s.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    const type = MIME[extname(path).toLowerCase()] || 'application/octet-stream';
    // 不要缓存，避免改了以后浏览器/Chrome 还拿旧的
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    try {
      const body = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('dist/build/h5 不存在，先跑 npm run build:h5');
    }
  }
});

// ⚠️ 必须绑 0.0.0.0（全网卡），不能绑 127.0.0.1 —— 否则手机用局域网 IP
// （http://192.168.x.x:4180）访问会直接被拒，表现为「电脑能开、手机打不开」。
// 安全提示：这只在你自己的局域网内暴露，没有公网可达性。
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[serve-dist] 本机: http://127.0.0.1:${PORT}/`);
  console.log(`[serve-dist] 手机: http://<你的局域网IP>:${PORT}/   (root=${ROOT})`);
  console.log(`[serve-dist] /api -> ${API_TARGET}`);
});
