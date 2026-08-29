# 哈基蜂摸大红

三角洲行动背景的卡通肉鸽射击网页游戏。角色自动射击、敌人分批刷新、藏品掉落、保险箱开启、背包转移、交易行、幸运鸟窝、账号登录、收藏室展柜等级与排行榜已完整实现。

## 技术栈

- Phaser 3 + TypeScript + Vite
- Cloudflare Pages + Pages Functions + Cloudflare D1（生产）
- 本地 API 兼容层：Express 5 + Node 内置 `node:sqlite`（仅本地开发/测试）
- 构建与测试：`tsc`、`vitest`、Wrangler、Playwright Core + 本机 Chrome

## 启动

### 本地旧链路（Express + sqlite）

```powershell
npm install
npm run dev
```

开发地址：`http://localhost:5173`；后端 API：`http://localhost:3001`。

生产运行：

```powershell
npm run build
npm start
```

### 本地 Cloudflare 链路（Pages Functions + 本地 D1）

```powershell
npm install
npm run build
npm run db:migrate:local
npm run dev:cloudflare
```

`dev:cloudflare` 使用 `wrangler pages dev` 在 `http://127.0.0.1:8788` 同时提供构建后的前端与 `/api/*`，无需 Express。

## 部署到 Cloudflare Pages

1. 安装依赖：

```powershell
npm install
```

2. 创建 D1 数据库并复制返回的 `database_id` 到 `wrangler.toml`：

```powershell
npm run db:create
```

3. 初始化线上数据库表：

```powershell
npm run db:migrate
```

4. 构建并部署 Pages：

```powershell
npm run deploy
```

部署后，静态前端由 Pages 提供，`/api/*` 由 `functions/` 中的 Pages Functions 处理，数据存储在 D1。

## 账号与数据

- 注册/登录使用用户名 + 密码；密码以 PBKDF2-SHA256 哈希存储，会话使用 HttpOnly Cookie。
- 首次进入必须先登录；未登录只能看到登录页，登录后才能进入主菜单。主菜单只保留“退出登录”，退出后回到登录页。
- 每名玩家的当前关卡、哈哈币、武器/装备、背包、仓库和 BUFF 会保存到服务端，下次登录可继续之前的关卡。
- 只有角色死亡才会清空局内数据；死亡后保留当前关卡，重新从这一关开始。
- 收藏室按用户保存，每个藏品对应一个展柜等级：
  - 未点亮：`Lv 0`
  - 首次点亮普通藏品：`Lv 1`
  - 红色藏品可以重复提交，每次提交使该展柜 `Lv + 1`，并累加大红价值。
- 排行榜：
  - 最高关卡进度榜：记录用户最高通关进度。
  - 大红价值榜：按收藏室红色藏品累计价值排名。
- `shared/collection-meta.mjs` 是后端用于计算大红价值的元数据，测试会校验它与 `shared/balance.ts` 保持一致。

## 常用命令

- `npm test`：数值、掉落、背包、武器、账号 API 与收藏室等级测试。
- `npm run qa`：构建并用本机 Chrome 截图主菜单、战斗和移动画面。
- `npm run test:e2e`：完整走一遍进入战斗、撤离、交易、抽卡、提交藏品与下一关。
- `npm run build`：类型检查并构建生产包。
- `npm run db:migrate:local`：初始化本地 Wrangler D1。

## 数据表

`schema.sql` 包含：`users`、`sessions`、`player_profiles`、`player_saves`、`collection_cabinets`、`cabinet_submissions`。

账号收藏室、最高进度、大红价值和每玩家关卡存档永久保存在 D1。

## 说明

- `assets/collections/origin` 与 `assets/weapons/origin` 是设计备份，游戏运行时使用 `carton` 成品资源。
- 音效全部由 Web Audio 程序合成，不依赖外部音频文件。
- 游戏素材仅使用项目目录内已有图片；未引入任何外部版权素材。
