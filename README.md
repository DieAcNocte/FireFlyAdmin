# Firefly 博客本地管理后台

一个运行在本地的 [Firefly](https://github.com/CuteLeaf/Firefly) 博客管理后台（Hono + Vue 3），支持管理多个博客项目：文章、动态、相册、主页壁纸、站点配置的可视化编辑，以及一键提交并推送到自定义的 GitHub 仓库。

> 只监听 `127.0.0.1`，仅供本机使用。所有项目路径与 Token 保存在本地 `data/settings.json`（已被 gitignore），绝不会上传。

## 功能

| 页面 | 说明 |
| --- | --- |
| 仪表盘 | 文章/动态/相册/壁纸统计、git 未提交变更提醒、一键启停博客 dev server |
| 文章管理 | 列表/新建/编辑/删除，frontmatter 表单 + CodeMirror Markdown 分屏编辑 + 实时预览 + 插图上传（存 `src/content/posts/images/`） |
| 动态管理 | 发布/编辑/删除动态，文件名与时间戳格式与 `new-dynamic.js` 完全一致（站点时区） |
| 相册管理 | 相册增删改（写回 `galleryConfig.ts`）+ 每个相册的图片上传/设封面/删除（`public/gallery/<id>/`），可选上传转 AVIF |
| 主页图片 | 壁纸模式、桌面/移动壁纸列表（排序/勾选图库/手动加 URL）、主页横幅文字与链接 |
| 页面管理 | about / guestbook / friends / site 等单页整文件编辑 |
| 站点配置 | 注册表驱动的可视化表单（站点基础/个人资料/相册/主页壁纸）+ 全部配置文件源码编辑器 |
| 发布 | git 变更清单 → 填写提交信息 → 提交并推送到该项目配置的远程仓库 |
| 项目管理 | 多项目保存与切换（本地博客路径 + 远程仓库地址 + Token + 分支 + 提交作者） |

### 配置写回原理

博客的配置都是 `src/config/*.ts` 里的 TypeScript 字面量。后台用 TypeScript 编译器 API 定位
`export const xxx = {...}` 中的目标字段节点，**只替换该值节点的文本范围**：

- 中文注释、Tab 缩进、键顺序、未声明的键全部保留；
- 数组内部的文档注释原样保留；内联数组（`tags: ["a", "b"]`）保持内联风格；
- 可选字段清空时直接移除该键（而不是写入空字符串）。

新配置项的接入：在 `server/config/registry.ts` 加一个字段声明，前端表单自动渲染。

### 发布到 GitHub

- 远程仓库地址**完全自定义**（HTTPS 或 SSH），无内置默认值，随时可换；
- 填了 Token（GitHub Personal Access Token，勾选 `repo` 权限）时走 HTTPS 推送，
  Token 通过 `GIT_ASKPASS` 环境变量注入，不出现在命令行参数中，也不会修改博客仓库的 remote 配置；
- 留空 Token 则直接按仓库地址推送（SSH 地址需本机已配置好 SSH Key）；
- 发布是显式手动操作，后台的任何保存都不会自动 commit / push。

## 快速开始

环境要求：Node.js ≥ 22（Bun ≥ 1.1 亦可），pnpm ≥ 9

```bash
pnpm install

# 开发模式（后端 5175 + 前端 5176 热更新）
pnpm dev

# 生产模式：构建前端后单端口运行
pnpm build
pnpm start          # http://127.0.0.1:5175
```

Bun 用户：

```bash
pnpm build
pnpm start:bun
```

## 打包 EXE（Windows 单文件启动器）

```bash
pnpm build:exe
```

产物为项目根目录下的 **FireflyAdmin.exe**：

- 前端资源全部**内嵌**进 EXE，双击即启动服务并自动打开 `http://127.0.0.1:5175`（无需安装 Node）
- 端口可用环境变量 `PORT` 覆盖；设 `NO_OPEN=1` 则不自动开浏览器
- `sharp`（原生模块）无法嵌入 EXE，运行时从 EXE 同目录的 `node_modules` 自动加载——
  **把 EXE 放在本管理后台项目目录下双击**，AVIF 转换等功能完整可用；放到别处则上传时请关闭「转 AVIF」
- 配置与 Token 数据存放在 EXE 同目录的 `data/` 下，随 EXE 走
- 基于 Node 官方 SEA 方案（esbuild 打包 + postject 注入），首次运行无任何提示窗口，日志在启动它的控制台中

首次启动会进入四步设置向导，默认项目预置为上游 FireFly（向导同步步骤可直接拉取其内容作为演示）；
在「项目管理」中可以新增/编辑/删除/切换项目（适配任意 Firefly 类博客目录）。

## 测试

```bash
# AST 引擎往返测试（对 data/tmp-fixture 中的配置副本进行，不碰真实博客）
mkdir -p data/tmp-fixture/config
cp <博客>/src/config/{galleryConfig,siteConfig,backgroundWallpaper,profileConfig}.ts data/tmp-fixture/config/
npx tsx scripts/test-ast.ts

# E2E 测试（需服务已启动；对 data/tmp-fixture 测试项目进行全流程 CRUD）
npx tsx scripts/test-e2e.ts
```

## 目录结构

```
├── server/               # Hono 后端
│   ├── index.ts          # 入口：API 路由 + 局域网监听/令牌鉴权 + 生产模式托管 dist/
│   ├── settings.ts       # 多项目持久化（data/settings.json）
│   ├── paths.ts          # 项目目录解析与路径安全
│   ├── config/           # AST 引擎（ast.ts）+ 注册表（registry.ts）+ 路由
│   ├── content/          # 文章 / 动态 / 页面服务
│   ├── media/            # 图片上传与管理
│   ├── git/              # git status / commit / push
│   └── blog/             # 博客 dev server 进程管理
├── src/                  # Vue 3 + Element Plus 前端（响应式：桌面 + 移动端布局）
├── android/              # Capacitor Android 工程（pnpm build:mobile 同步）
├── capacitor.config.ts   # Capacitor 配置（App 壳）
├── scripts/              # 测试脚本（AST 往返 / E2E）
└── data/                 # 运行时数据（gitignore）：settings.json
```

## 移动端访问（手机 / 平板）

管理后台支持两种移动端使用方式，共用电脑端同一个 Hono 服务：

**前提**：电脑端「应用设置 → 移动端 / 局域网访问」开启「允许局域网访问」并保存后重启服务（或重启 FireflyAdmin.exe），界面会显示局域网访问地址（如 `http://192.168.1.5:5175`），手机与电脑需在同一网络（或通过 Tailscale 等组网互通）。

### 方式一：手机浏览器（零安装）

手机浏览器直接打开局域网访问地址即可，界面自动切换为移动端布局（抽屉导航、紧凑表单）。若电脑端设置了「访问令牌」，首次打开会提示填写。

### 方式二：Capacitor 原生 App（Android）

前端 UI 打包进 App，支持两种连接方式（首次启动 App 时选择，之后可在「连接设置」中切换）：

**电脑端模式**：API 请求指向电脑端服务，功能最完整。填入电脑显示的局域网地址与令牌（若设置）即可，使用时电脑需开机。

**GitHub 直连模式（独立使用，无需电脑）**：App 直接通过 GitHub API 读写博客仓库，填入 `owner/repo`、分支与 GitHub PAT（需 repo 写权限）即可。每次保存/删除 = 一次 git commit，成功或失败都会明确提示。

直连模式能力范围：

- ✅ 文章管理：增删改查、frontmatter 表单、中文转拼音 slug、文章配图上传（提交到 `src/content/posts/images/`）
- ✅ 动态管理（FireFly 的 markdown 形态）
- ✅ 页面管理（spec 单页源码编辑）
- ❌ 相册 / 主页图片 / 站点配置 / 仪表盘 / 预览：需电脑端（App 内自动隐藏）
- ❌ Mizuki 日记（`src/data/diary.ts` 结构化文件）：需电脑端

> 直连模式修改直接提交到 GitHub 远端仓库；电脑端本地克隆需 `git pull` 后才与远端同步（电脑端「初始设置向导」或项目管理中的同步功能均可）。
> iOS 构建需要 macOS + Xcode（`npx cap add ios`），本仓库当前只包含 Android 平台。

```bash
# 构建前端并同步到 Android 工程
pnpm build:mobile

# 用 Android Studio 打开并构建/安装（需 JDK 17 + Android SDK）
pnpm open:android
# Android Studio 中：Build → Build APK(s)，或直接 Run 到连接的设备
```

命令行构建 APK（不打开 IDE）：

```bash
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

## 安全说明

- 服务默认只绑定 `127.0.0.1`；开启「允许局域网访问」后监听所有网卡，**强烈建议同时设置访问令牌**（非本机来源的 API 请求需携带）；
- 不要将端口映射到公网；如需外网访问，请使用 Tailscale 等组网方案并保持令牌开启；
- `data/` 已被 gitignore，项目路径与 Token 不会进入版本库；
- 删除操作（文章/动态/图片/相册）只删文件，已提交过的内容可通过博客仓库的 git 历史找回。

## 许可证

本项目基于 [MIT](./LICENSE) 许可证开源。

Copyright (c) 2026 DieAcNocte
