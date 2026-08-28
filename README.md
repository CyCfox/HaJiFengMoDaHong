# 哈基蜂摸大红

三角洲行动背景的卡通肉鸽射击网页游戏。角色自动射击、敌人分批刷新、藏品掉落、保险箱开启、背包转移、交易行、幸运鸟窝与收藏室已完整实现。

## 技术栈

- Phaser 3 + TypeScript + Vite
- Express 5 + Node 内置 `node:sqlite`
- 构建与测试：`tsc`、`vitest`、Playwright Core + 本机 Chrome

## 启动

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

打开 `http://localhost:3001`。

## 常用命令

- `npm test`：数值、掉落、背包、武器与后端 API 测试。
- `npm run qa`：构建并用本机 Chrome 截图主菜单、战斗和移动画面。
- `npm run test:e2e`：完整走一遍进入战斗、撤离、交易、抽卡、提交藏品与下一关。
- `npm run build`：类型检查并构建生产包。

## 数据

- 数据库默认文件：`server/data/hajifeng.sqlite`，可用 `HAJIFENG_DB_PATH` 覆盖。
- 后端只持久化收藏室点亮藏品；背包、仓库、武器、哈哈币和 BUFF 都是当前局数据，死亡清空。
- 所有平衡配置集中在 `shared/balance.ts` 与 `shared/calculations.ts`。

## 说明

- `assets/collections/origin` 与 `assets/weapons/origin` 是设计备份，游戏运行时使用 `carton` 成品资源。
- 音效全部由 Web Audio 程序合成，不依赖外部音频文件。
- 游戏素材仅使用项目目录内已有图片；未引入任何外部版权素材。
