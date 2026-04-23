<p align="center">
  <img src="src-tauri/icons/icon.png" alt="ABoard" width="128" height="128">
</p>

<h1 align="center">ABoard</h1>

<p align="center">
  <strong>智能剪贴板 — 复制即智能</strong><br>
  AI-Powered Clipboard Manager — Intelligence at Every Copy
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
  <img src="https://img.shields.io/badge/Tauri-v2-green" alt="Tauri v2">
  <img src="https://img.shields.io/badge/license-MIT-orange" alt="MIT License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

---

**中文** | [English](docs/README.en.md)

## 截图

<p align="center">
  <img src="docs/images/screenshot.png" alt="ABoard 完整截图" width="800">
</p>

<p align="center">
  <img src="docs/images/main-ui.png" alt="ABoard 主界面" width="600">
</p>

## 核心特性

- **自动捕获** — 实时监控剪贴板，SHA256 去重存储
- **本地 AI** — 内置 Qwen2.5-0.5B 模型（Candle GGUF），完全离线运行
- **智能分类** — 自动识别代码、链接、JSON、XML、图片、文本
- **AI 工具箱** — 一键翻译、摘要、改写、格式化
- **语义搜索** — AI 关键词扩展 + FTS5 全文检索
- **隐私优先** — 默认本地处理，无需联网
- **快速粘贴** — `Cmd+Shift+V` 浮窗弹窗，`Cmd+Shift+J` 历史循环粘贴
- **深色模式** — 跟随系统主题，毛玻璃设计
- **跨平台** — macOS、Windows、Linux

## 下载安装

> ABoard 目前处于早期开发阶段（v0.1.0），可从 [Releases](https://github.com/clear2x/ABoard/releases) 页面下载最新构建版本。

## 快速开始（开发）

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.77
- 平台依赖参考 [Tauri v2 前置条件](https://v2.tauri.app/start/prerequisites/)

### 构建与运行

```bash
# 克隆仓库
git clone https://github.com/clear2x/ABoard.git
cd ABoard

# 安装依赖
npm install

# 启动开发服务器
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
| `Cmd/Ctrl + Shift + V` | 打开/关闭快速粘贴浮窗 |
| `Cmd/Ctrl + Shift + J` | 循环切换剪贴板历史并粘贴 |
| `Delete` | 删除选中条目 |
| `Cmd/Ctrl + P` | 固定/取消固定选中条目 |
| `Escape` | 退出批量选择模式 |

## AI 配置

ABoard 内置 AI 引擎，开箱即用，同时支持本地和云端扩展。

| 提供商 | 类型 | 配置方式 |
|--------|------|----------|
| **内置引擎**（Candle） | 内置 | 无需配置，首次使用自动下载 Qwen2.5-0.5B GGUF 模型（约 400MB） |
| **Ollama** | 本地 | 安装 [Ollama](https://ollama.com)，拉取模型，在设置中点击「检测本地服务」 |
| **OpenAI** | 云端 | 填写 API Key 和 Endpoint |
| **Anthropic** | 云端 | 填写 API Key |

在 **设置 > AI** 中配置。默认使用内置引擎（Candle），完全离线运行，无需联网。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Tauri v2](https://v2.tauri.app/)（Rust + WebView） |
| 前端 | [SolidJS](https://www.solidjs.com/) + [Tailwind CSS v4](https://tailwindcss.com/) |
| 数据库 | [SQLite](https://www.sqlite.org/) via [rusqlite](https://github.com/rusqlite/rusqlite) |
| 搜索 | [FTS5](https://www.sqlite.org/fts5.html) 全文检索 |
| AI（内置） | [Candle](https://github.com/huggingface/candle) GGUF 推理 |
| AI（本地） | [Ollama](https://ollama.ai) / [llama.cpp](https://github.com/ggerganov/llama.cpp) |
| 图标 | [Phosphor Icons](https://phosphoricons.com/) |

## 项目结构

```
ABoard/
├── src/                      # SolidJS 前端
│   ├── components/           # UI 组件
│   ├── stores/               # 响应式状态（SolidJS signals）
│   └── styles/               # CSS 与设计令牌
├── src-tauri/                # Rust 后端
│   ├── src/
│   │   ├── ai/               # AI 提供商（云端、本地、内置）
│   │   ├── clipboard.rs      # 剪贴板监控
│   │   ├── db.rs             # SQLite 存储与 FTS5
│   │   ├── tray.rs           # 系统托盘与 macOS 菜单
│   │   └── lib.rs            # 应用入口与命令注册
│   ├── icons/                # 应用图标（全平台）
│   └── tauri.conf.json       # Tauri 配置
└── tests/                    # 测试脚本
```

## 参与贡献

欢迎提交 PR 和 Issue！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开源协议

本项目基于 [MIT 协议](LICENSE) 开源。
