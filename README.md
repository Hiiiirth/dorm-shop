# 宿舍线上小超市下单小程序

uni-app 小程序 + NestJS 后端 + MySQL 8。

## 目录结构

```
wechatseller/
├── db/                        # 数据库
│   ├── 01-schema.sql          # 建库建表（8 张表）
│   ├── 02-seed.sql            # 种子数据（2 用户 / 5 分类 / 12 商品）
│   └── docker-compose.yml     # 本地 MySQL + Redis（可选）
├── server/                    # 后端 NestJS
└── client/                    # 前端 uni-app
```

## 当前进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| S1 | 数据库 DDL + 种子数据 | ✅ 已导入 MySQL 并校验 |
| S2 | 后端骨架 + 全局公共层 | ✅ 自检 6/6 |
| S3 | health + 认证 / 用户模块 | ✅ 自检 28/28 |
| S4-1 | 分类 / 商品 / 首页聚合 | ✅ 自检 39/39 |
| S4-2 | 购物车 | ✅ 自检 42/42 |
| S5 | 下单 / 订单查询 / 取消 | ✅ 自检 95/95 |
| S6 | 管理端（分类商品 CRUD / 订单处理 / 用户身份 / 经营看板） | ✅ 自检 223/223 |
| S7-0 ~ S7-3 | 前端 uni-app（登录 / 商品 / 购物车 / 下单 / 订单 / 我的） | ✅ 自检 141/141 |

## 业务流程（v1.2）

```
顾客下单  →  PENDING（待接单）  →  DELIVERING（处理中）  →  DELIVERED（已送达）
   │                                          │
   └──────────────→ CANCELLED（已取消）←───────┘
                （未送达都能取消）
```

**没有派单端。** 顾客下单后订单就是「待接单」，店长在管理端看到并处理：

| 谁 | 动作 | 接口 |
|---|---|---|
| 店长 | 接单（开始处理） | `POST /admin/orders/:id/accept` |
| 店长 | 确认送达 | `POST /admin/orders/:id/deliver`（可从 PENDING 直达） |
| 店长 | 取消订单 | `POST /admin/orders/:id/cancel` |
| 顾客 | 取消订单 | `POST /orders/:id/cancel`（PENDING / DELIVERING 都可） |

身份只有两种：**顾客** 和 **店长**。营收只算 `DELIVERED`。

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 18（本项目在 v22 下开发） | 前后端都要用 |
| MySQL | 8.0 | 库的字符集必须是 `utf8mb4` |
| 微信开发者工具 | 最新稳定版 | **只有跑小程序端才需要**，只看 H5 不用装 |

> **路径约定**：下面所有命令都以**项目根目录**为起点 —— 也就是你 `clone` 下来后，
> 能看到 `README.md` / `client/` / `server/` / `db/` 的那一层目录。
> 命令里写的 `cd server` 都是相对它而言，**不要把命令里的路径换成别人机器上的绝对路径**。

## 快速开始

### 1. 建库导数据

```powershell
# 在项目根目录下执行
cd db

# 建库 + 建表（01-schema.sql 里自带 CREATE DATABASE）
mysql -u root -p -e "source 01-schema.sql"

# 灌种子数据
mysql -u root -p dorm_shop -e "source 02-seed.sql"
```

> ⚠️ **不要写成 `mysql -u root -p < 01-schema.sql`**。
> `<` 是 cmd / bash 的输入重定向语法，**PowerShell 不支持**，会报
> `找不到接受实际参数"<"的位置形式参数`。
> 用 `-e "source 文件.sql"` 才能跨 shell 通用。

校验：

```powershell
# 注意用**单引号**：SQL 里的 `user` 需要反引号，而 PowerShell 双引号会把反引号当转义符
mysql -u root -p dorm_shop -e 'SHOW TABLES; SELECT id, username, roles, current_role FROM `user`;'
```

应该看到 8 张表，以及 2 个账号：

| 用户名 | 手机号 | 身份 | 初始工作台 |
|---|---|---|---|
| admin | 13800000001 | 顾客 + 店长 | 管理端 |
| student | 13800000003 | 顾客 | 顾客端 |

密码统一 `123456`（bcrypt 哈希已内置）。重新生成哈希：`npm run hash -- 新密码`。

### 2. 启动后端

后端在 `server/` 子目录，`package.json` 在那里 —— **必须先 `cd server`** 再执行 npm 命令。

#### 2.1 准备环境变量文件（⚠️ 少这一步后端起不来）

仓库里**没有** `server/.env` —— 它是故意不提交的（见文末「安全」一节）。
从模板复制一份出来：

```powershell
cd server
Copy-Item .env.example .env
```

然后打开 `server/.env`，把这两项改成你自己的：

| 变量 | 改成什么 |
|---|---|
| `DB_PASSWORD` | 你本机 MySQL 的密码 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 随机长字符串（本地不换也能跑，但**别拿去部署**） |

其余保持默认即可。两个要点：

- `DB_USER=root`、`DB_DATABASE=dorm_shop` —— 要和第 1 步建的库一致
- `WX_MOCK_LOGIN=true` —— 没有微信 appid 时走 mock 登录，本地自测就靠它

#### 2.2 装依赖并启动

```powershell
npm install          # 已装过可跳过
npm run start:dev
```

启动要等约 30 秒（编译 + 连库）。看到 `[Bootstrap] 接口地址: ...` 才算起来了。

启动后访问 <http://localhost:3000/api/v1/health>，应返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": { "status": "up", "env": "development", "uptime": 12, "now": 1791372643112 },
  "timestamp": 1791372643112,
  "traceId": "8f3c1a2b9d"
}
```

### 3. 启动前端

```powershell
cd client
npm install           # 已装过可跳过

# 浏览器预览（H5）—— 终端会打印出访问地址，通常是 http://localhost:5173
npm run dev:h5

# 小程序端：先构建，再用「微信开发者工具」导入 client/dist/dev/mp-weixin
npm run dev:mp-weixin
```

> **后端必须先起**。前端调接口的地址按端分流（见 `client/src/utils/config.js`）：
> - **H5（浏览器）**：走 vite 代理 `/api` → `127.0.0.1:3000`，同源，没有跨域问题
> - **小程序**：用绝对地址 `http://127.0.0.1:3000/api/v1`。真机调试时要把 `127.0.0.1`
>   换成电脑的局域网 IP，并在微信开发者工具里勾上「不校验合法域名」

### 4. 自检脚本

作者用这些脚本来验收。**clone 的人不必全跑**，但跑通了说明环境没问题。

#### 后端（`server/scripts/`）

```powershell
cd server

# 响应规范自检（不需要数据库）—— 用真实的拦截器 / 过滤器起一个最小服务
# ⚠️ 它硬编码监听 3100 端口，跑之前先确认 3100 没被占用
node -r ts-node/register/transpile-only scripts/verify-response.ts    # 6 项

# 接口冒烟（需要后端已启动 + 数据库已导入）
node scripts/smoke-api.js        # 28 项：认证 / 用户 / 身份切换
node scripts/smoke-catalog.js    # 39 项：分类 / 商品 / 首页
node scripts/smoke-cart.js       # 42 项：购物车 / 越权隔离
node scripts/smoke-order.js      # 95 项：下单 / 状态流转 / 取消 / 库存回滚
node scripts/smoke-admin.js      # 223 项：管理端 CRUD / 订单处理 / 用户身份 / 看板
node scripts/smoke-image.js      # 52 项：商品封面图 / 用户头像（base64 上传）
```

后端合计 **485** 条断言。

> ⚠️ 冒烟脚本会往库里留**临时分类 / 商品 / 订单**（挂单商品受保护删不掉）。
> 跑完清理：`node scripts/cleanup-test-residue.js --apply`（不加 `--apply` 只打印、不删）。
> 不清残留的话，临时分类会变成「第一个分类」，前端探针会误报。

#### 前端（`client/scripts/`）

前端自检走 CDP 驱动真实浏览器，所以下面几件事要**同时在跑**：

```powershell
# ① 后端（见第 2 步，端口 3000）
# ② 一个开了调试端口的 Chrome —— Chrome 路径按你本机实际情况改
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
    --remote-debugging-port=9222 --user-data-dir="$env:TEMP\wb-cdp"

# ③ 另开一个窗口：构建产物 + 静态托管（自带反代到 3000）
cd client
npm run build:h5
node scripts/serve-dist.mjs 4180          # 用法：serve-dist.mjs [端口=4180] [后端=http://127.0.0.1:3000]

# ④ 再开一个窗口跑断言
node scripts/verify-pages.mjs             # 163 项：全部页面的结构与交互
```

前端合计 **163** 条断言。另有若干专项探针（`probe-align.mjs` 量图标对齐、
`probe-switch-role.mjs` 验身份切换等），按需单独跑。

## 关键约定

- 统一响应体 `{ code, message, data, timestamp, traceId }`，`code = 0` 为成功
- 业务失败一律 **HTTP 200 + `code != 0`**；401 / 403 只在鉴权失败时使用
- **身份 ≠ 登录**：`/admin/*` 校验 token 里的 `currentRole`，
  顾客身份的 token 打进来是 403 + `20003`，必须 `switch-role` 换成店长身份
- **切换身份必须重新签发 token**，否则守卫读到的还是旧身份
- 金额：数据库存「元」（DECIMAL），**接口对外传「分」整数**
- 时间：统一毫秒时间戳
- 身份：一个账号多身份（`roles` 数组），`current_role` 决定当前工作台
- 列表 query 里的布尔值用 `0` / `1`，别用 `true` / `false`（`"false"` 会被转成 `true`）
- 控制器里静态路由必须声明在 `:id` 之前，`:id` 一律用 `IntParamPipe`
- `order` 是 MySQL 保留字，SQL 里必须加反引号

更细的接口清单、响应规范与设计取舍写在项目内 `docs/`（**未随仓库开源**）。

## 安全：哪些东西不会（也不该）进仓库

`.gitignore` 挡掉了三类东西，**请不要用 `git add -f` 强行绕过**：

| 忽略项 | 为什么必须忽略 |
|---|---|
| `server/.env` | 里面是数据库密码、JWT 签名密钥、微信 AppSecret。一旦提交，任何能看到仓库的人都能连你的数据库、伪造登录态 |
| `.workbuddy/` | AI 助手的工作目录，含浏览器用户数据、会话记忆、文档备份 —— 体积大，而且带本机使用痕迹 |
| `node_modules/`、`**/dist/` | 依赖和构建产物。clone 的人自己 `npm install` / `npm run build` 就行 |

**唯一的例外是 `server/.env.example`** —— 它是模板，只有占位符，**必须**留在仓库里，
别人靠它才知道需要配哪些变量。

### 部署前必须改的三处

1. **`DB_PASSWORD`** —— 换成真实密码，且**不要提交**（本地 `server/.env` 改完就完事）
2. **`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`** —— 换成随机长字符串：

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   用默认值等于没有签名保护 —— 任何人都能自己签一个「店长」token 打进来。
3. **`WX_MOCK_LOGIN=false`** —— mock 登录**只用于本地开发**，它会让任意 code 都能登录成功。

> 另外提醒：本仓库种子数据里的账号（`admin` / `student`，明文密码 `123456`）是**开发用假数据**，
> 生产环境请删掉重建。

## 许可

本项目为课程 / 学习用途。内置图标来自 [lucide](https://lucide.dev) 与 morphicons，
使用前请自行确认并遵循其各自的许可协议。
