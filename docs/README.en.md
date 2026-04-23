<p align="center">
  <img src="../src-tauri/icons/icon.png" alt="ABoard" width="128" height="128">
</p>

<h1 align="center">ABoard</h1>

<p align="center">
  <strong>AI-Powered Clipboard Manager — Intelligence at Every Copy</strong><br>
  智能剪贴板 — 复制即智能
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
  <img src="https://img.shields.io/badge/Tauri-v2-green" alt="Tauri v2">
  <img src="https://img.shields.io/badge/license-MIT-orange" alt="MIT License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

---

[中文](../README.md) | **English**

## Screenshots

<p align="center">
  <img src="images/screenshot.png" alt="ABoard Full Screenshot" width="800">
</p>

<p align="center">
  <img src="images/main-ui.png" alt="ABoard Main UI" width="600">
</p>

## Features

- **Auto Capture** — Monitors clipboard in real-time, stores everything with SHA256 deduplication
- **Local AI** — Built-in Qwen2.5-0.5B via Candle GGUF inference, runs fully offline
- **Smart Classify** — Auto-detects content type: code, link, JSON, XML, image, text
- **AI Actions** — Translate, summarize, rewrite, format with one click
- **Semantic Search** — Natural language search powered by AI keyword expansion + FTS5
- **Privacy First** — All processing happens locally by default, no network required
- **Quick Paste** — `Cmd+Shift+V` floating popup, `Cmd+Shift+J` cycle through history
- **Dark Mode** — System-aware theme with glassmorphism design
- **Cross-Platform** — macOS, Windows, Linux via Tauri v2

## Download

> ABoard is in early development (v0.1.0). Pre-built binaries are available on the [Releases](https://github.com/clear2x/ABoard/releases) page.

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

ABoard has a built-in AI engine that works out of the box, with local and cloud extensions.

| Provider | Type | Setup |
|----------|------|-------|
| **Built-in** (Candle) | Built-in | No setup needed, auto-downloads Qwen2.5-0.5B GGUF model (~400MB) on first use |
| **Ollama** | Local | Install [Ollama](https://ollama.com), pull a model, click "Detect Local Services" in settings |
| **OpenAI** | Cloud | Enter API Key and Endpoint |
| **Anthropic** | Cloud | Enter API Key |

Configure in **Settings > AI**. Default uses the built-in engine (Candle), runs fully offline, no network required.

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

We welcome contributions! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the [MIT License](../LICENSE).
