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

**English** | [中文](#中文说明)

## Features

- **Auto Capture** — Monitors clipboard in real-time, stores everything with deduplication
- **Local AI** — Built-in Qwen2.5-0.5B via Candle GGUF, runs fully offline
- **Smart Classify** — Auto-detects content type: code, link, JSON, XML, image, text
- **AI Actions** — Translate, summarize, rewrite, format with one click
- **Semantic Search** — Natural language search powered by AI keyword expansion + FTS5
- **Privacy First** — All processing happens locally by default, no network required
- **Quick Paste** — `Cmd+Shift+V` floating popup, `Cmd+Shift+J` cycle through history
- **Dark Mode** — System-aware theme with glassmorphism design
- **Cross-Platform** — macOS, Windows, Linux via Tauri v2

## Download

> ABoard is in early development (v0.1.0). Pre-built binaries will be available with the first stable release.

## Quick Start (Development)

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.77
- Platform dependencies per [Tauri v2 guide](https://v2.tauri.app/start/prerequisites/)

### Build & Run

```bash
# Clone the repo
git clone https://github.com/clear2x/ABoard.git
cd ABoard

# Install dependencies
npm install

# Start dev server
npm run tauri dev
```

### Build for Production

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + V` | Toggle floating quick-paste popup |
| `Cmd/Ctrl + Shift + J` | Cycle through clipboard history & paste |
| `Delete` | Delete selected item |
| `Cmd/Ctrl + P` | Pin/unpin selected item |
| `Escape` | Exit batch selection mode |

## AI Configuration

ABoard supports multiple AI providers:

| Provider | Type | Setup |
|----------|------|-------|
| **Embedded** (Candle) | Built-in | No setup needed, downloads Qwen2.5-0.5B GGUF |
| **Ollama** | Local | Install [Ollama](https://ollama.ai), pull a model |
| **llama.cpp** | Local | Run llama.cpp server locally |
| **OpenAI** | Cloud | API key required |
| **Anthropic** | Cloud | API key required |

Configure in **Settings > AI**. Default is `Auto` mode — uses local provider if available, falls back to embedded.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri v2](https://v2.tauri.app/) (Rust + WebView) |
| Frontend | [SolidJS](https://www.solidjs.com/) + [Tailwind CSS v4](https://tailwindcss.com/) |
| Database | [SQLite](https://www.sqlite.org/) via [rusqlite](https://github.com/rusqlite/rusqlite) |
| Search | [FTS5](https://www.sqlite.org/fts5.html) full-text search |
| AI (Embedded) | [Candle](https://github.com/huggingface/candle) GGUF inference |
| AI (Local) | [Ollama](https://ollama.ai) / [llama.cpp](https://github.com/ggerganov/llama.cpp) |
| Icons | [Phosphor Icons](https://phosphoricons.com/) |

## Project Structure

```
ABoard/
├── src/                      # SolidJS frontend
│   ├── components/           # UI components
│   ├── stores/               # Reactive state (SolidJS signals)
│   └── styles/               # CSS & design tokens
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── ai/               # AI providers (cloud, local, embedded)
│   │   ├── clipboard.rs      # Clipboard monitor
│   │   ├── db.rs             # SQLite storage & FTS5
│   │   ├── tray.rs           # System tray & macOS menu
│   │   └── lib.rs            # App entry & command registration
│   ├── icons/                # App icons (all platforms)
│   └── tauri.conf.json       # Tauri configuration
└── tests/                    # Test scripts
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the [MIT License](LICENSE).

---

<a id="中文说明"></a>

## 中文说明

ABoard 是一款跨平台智能剪贴板桌面应用，由 Tauri v2（Rust + Web UI）驱动。常驻系统托盘，自动捕获剪贴板内容并提供持久化历史管理，内置本地 AI 模型实现智能分类、文本处理、格式化和语义搜索。

### 核心特性

- **自动捕获** — 实时监控剪贴板，SHA256 去重存储
- **本地 AI** — 内置 Qwen2.5-0.5B 模型，完全离线运行
- **智能分类** — 自动识别代码、链接、JSON、XML、图片、文本
- **AI 工具箱** — 一键翻译、摘要、改写、格式化
- **语义搜索** — AI 关键词扩展 + FTS5 全文检索
- **隐私优先** — 默认本地处理，无需联网
- **快速粘贴** — `Cmd+Shift+V` 浮窗，`Cmd+Shift+J` 历史循环粘贴
- **深色模式** — 跟随系统主题，毛玻璃设计
- **跨平台** — macOS、Windows、Linux

### 参与贡献

欢迎提交 PR 和 Issue！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 开源协议

本项目基于 [MIT 协议](LICENSE) 开源。
