# Phase 1: Clipboard Core & Tray - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

用户启动 ABoard 后，系统剪贴板内容被自动捕获（文本/图片/文件路径），应用常驻系统托盘，可通过全局快捷键唤起浮动窗口。此阶段建立项目骨架、剪贴板监听核心和托盘/快捷键基础交互。

</domain>

<decisions>
## Implementation Decisions

### Project Foundation Tech Stack
- Frontend: Solid.js — 轻量（~7KB），高性能响应式，适合 Tauri 小体积目标
- State management: Solid 内置 Signals/Store — 无需额外库
- CSS: Tailwind CSS — 原子化 CSS，配合苹果味设计
- Build tool: Vite — Tauri 官方推荐，HMR 快

### Clipboard Monitoring Strategy
- Event-driven with polling fallback — 优先平台原生事件，失败时降级为 200ms 轮询
- SHA256 hash deduplication — 对比内容 hash，跳过重复复制
- Content types: Text + Image + File paths — 覆盖 v1 全部需求
- Monitoring in Rust backend — 系统级调用在 Rust 层，通过 Tauri 事件桥接前端

### System Tray & Window Behavior
- Default shortcut: Cmd+Shift+V (macOS) / Ctrl+Shift+V (Win/Linux)
- Close window → minimize to tray (not quit)
- Tray menu: Show Window / Pause Monitoring / Quit
- Popup window: centered on cursor position, shows recent clipboard items

### Project Structure & Dev Workflow
- Tauri standard monorepo: `src-tauri/` (Rust) + `src/` (frontend)
- Frontend modules: `components/`, `hooks/`, `stores/`, `styles/`
- Unified ClipboardItem model: `{ id, type, content, hash, timestamp, metadata }`
- Dev: Vite dev server + Tauri dev command

### Claude's Discretion
Implementation details beyond these decisions are at Claude's discretion.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
Greenfield project — no existing code. Building from scratch.

### Established Patterns
Tauri v2 + Solid.js + Tailwind CSS stack to be established in this phase.

### Integration Points
- Rust backend ↔ Frontend via Tauri events/commands
- System clipboard API via Rust
- System tray via Tauri tray API
- Global shortcut via Tauri global-shortcut API

</code_context>

<specifics>
## Specific Ideas

- Apple-quality modern UI is a core requirement — even this first phase should have clean, polished visual elements
- The popup window should feel instant — no noticeable delay between shortcut press and window appearance
- Monitoring should have zero impact on system performance when idle

</specifics>

<deferred>
## Deferred Ideas

- Persistent storage — deferred to Phase 2
- Full UI design system — deferred to Phase 3 (this phase uses minimal functional UI)
- Keyboard navigation within popup — deferred to Phase 3
- Custom shortcut configuration — deferred to Phase 7

</deferred>
