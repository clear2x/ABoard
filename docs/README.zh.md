<p align="center">
  <img src="../src-tauri/icons/icon.png" alt="ABoard" width="128" height="128">
</p>

<h1 align="center">ABoard</h1>

<p align="center">
  <strong>AI 智能剪贴板管理器</strong><br>
  <sub>复制即智能 — 全程本地运行，无需联网</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-0A0A0A?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Tauri-v2-24C8D8?style=flat-square" alt="Tauri v2">
  <img src="https://img.shields.io/badge/size-%3C20MB-4C1?style=flat-square" alt="Small Footprint">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License">
</p>

<p align="center">
  <strong>中文</strong> · <a href="../README.md">English</a>
</p>

---

## 为什么选择 ABoard？

每一次复制，ABoard 都会自动捕获、分类并用 AI 增强 — 无需任何额外操作。为开发者和效率用户打造。

- **零配置** — 开箱即用，AI 完全离线运行
- **隐私优先** — 所有处理在本地完成，数据不离开你的设备
- **体积小巧** — 应用本体不到 20MB（不含可选 AI 模型）

## 功能特性

### 剪贴板管理

- **实时捕获** — 零延迟监控剪贴板变化，SHA256 去重存储
- **智能分类** — 自动识别代码、链接、JSON、XML、图片、视频、纯文本
- **固定收藏** — 星标重要条目，置顶显示
- **批量操作** — 多选、批量删除、批量导出
- **拖拽排序** — 直接拖动调整顺序

### AI 工具箱

- **一键操作** — 翻译、摘要、改写、格式化
- **本地 AI 引擎** — 内置 Qwen2.5-0.5B 模型（Candle GGUF 推理），完全离线
- **可扩展** — 支持 Ollama、OpenAI、Anthropic 等更强大的模型
- **格式工具** — JSON/XML 格式化、HTML ↔ Markdown 互转

### 搜索与导航

- **全文搜索** — 基于 FTS5 的即时全文检索
- **语义搜索** — AI 关键词扩展，支持自然语言查询
- **分类筛选** — 按类型（代码、链接、图片等）或 AI 标签过滤
- **键盘导航** — 方向键、快捷键覆盖所有操作

### 屏幕捕获

- **截图** — 交互式区域选择，自动保存到剪贴板历史
- **录屏** — 从托盘菜单直接录制 MP4（支持 macOS / Windows / Linux）

## 截图

<p align="center">
  <img src="images/screenshot.png" alt="ABoard 截图" width="800">
</p>

## 下载安装

从 [GitHub Releases](https://github.com/clear2x/ABoard/releases) 下载最新版本。

### macOS

ABoard 使用自签名（未经 Apple 公证）。首次打开时：

1. 打开 `.dmg`，将 **ABoard** 拖入「应用程序」
2. 在 Finder 中 **右键点击** ABoard → 选择 **打开**
3. 在弹窗中再次点击 **打开**

> 直接双击会被 Gatekeeper 拦截。右键 → 打开 可以绕过验证。

### Windows & Linux

从 [Releases](https://github.com/clear2x/ABoard/releases) 下载对应平台的安装包。

## 快速开始（开发）

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.77
- 平台依赖参考 [Tauri v2 前置条件](https://v2.tauri.app/start/prerequisites/)

```bash
git clone https://github.com/clear2x/ABoard.git
cd ABoard
npm install
npm run tauri dev
```

### 生产构建

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘/Ctrl + Shift + V` | 打开/关闭快速粘贴浮窗 |
| `⌘/Ctrl + Shift + J` | 循环切换剪贴板历史并粘贴 |
| `⌘/Ctrl + K` | 聚焦搜索栏 |
| `Delete` | 删除选中条目 |
| `⌘/Ctrl + P` | 固定/取消固定选中条目 |
| `↑ / ↓` | 上下导航 |
| `Esc` | 退出批量选择模式 |

## AI 配置

ABoard 内置 AI 引擎，基础功能无需配置即可使用。

| 提供商 | 类型 | 配置方式 |
|--------|------|----------|
| **内置引擎**（Candle） | 内嵌 | 首次使用自动下载 Qwen2.5-0.5B GGUF 模型（约 400MB） |
| [Ollama](https://ollama.com) | 本地 | 安装 Ollama，拉取模型，在设置中点击「检测」 |
| [OpenAI](https://openai.com) | 云端 | 填写 API Key 和 Endpoint |
| [Anthropic](https://anthropic.com) | 云端 | 填写 API Key |

在 **设置 → AI** 中配置。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Tauri v2](https://v2.tauri.app/)（Rust + WebView） |
| 前端 | [SolidJS](https://www.solidjs.com/) + [Tailwind CSS v4](https://tailwindcss.com/) |
| 数据库 | [SQLite](https://www.sqlite.org/) via [rusqlite](https://github.com/rusqlite/rusqlite) |
| 搜索 | [FTS5](https://www.sqlite.org/fts5.html) 全文检索 + 语义扩展 |
| AI（内嵌） | [Candle](https://github.com/huggingface/candle) GGUF 推理 |
| AI（本地） | [Ollama](https://ollama.com) / [llama.cpp](https://github.com/ggerganov/llama.cpp) |
| 图标 | [Phosphor Icons](https://phosphoricons.com/) |

## 项目结构

```
ABoard/
├── src/                    # SolidJS 前端
│   ├── components/         # UI 组件
│   ├── stores/             # 响应式状态（SolidJS signals）
│   └── styles/             # CSS 与设计令牌
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── ai/             # AI 提供商（云端、本地、内嵌）
│   │   ├── clipboard.rs    # 剪贴板监控
│   │   ├── db.rs           # SQLite 存储与 FTS5
│   │   ├── tray.rs         # 系统托盘与菜单
│   │   └── lib.rs          # 应用入口与命令注册
│   ├── icons/              # 应用图标（全平台）
│   └── tauri.conf.json     # Tauri 配置
├── .github/workflows/      # CI/CD — 构建与发布
└── docs/                   # 截图、英文 README
```

## 参与贡献

欢迎提交 Issue 和 PR！如需大规模改动，请先开 Issue 讨论。

## 开源协议

[MIT](../LICENSE)
