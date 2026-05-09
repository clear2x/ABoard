<!-- GSD:project-start source:PROJECT.md -->
## Project

**ABoard**

ABoard 是一款跨平台智能剪贴板桌面应用（macOS / Windows），由 Tauri（Rust + Web UI）驱动。它常驻系统托盘，自动捕获剪贴板内容并提供持久化历史管理，内置本地 AI 小模型（llama.cpp / Ollama）实现智能分类、文本处理、格式化和语义搜索，同时支持可选的云端 AI API。面向追求效率的开发者和知识工作者。

**Core Value:** 复制即智能 — 每一次剪贴操作都自动获得 AI 增强处理，无需额外操作。

### Constraints

- **Tech Stack**: Tauri v2 — 最小体积的跨平台桌面方案，适合内嵌模型
- **AI Runtime**: llama.cpp / Ollama — CPU/GPU 均可，支持主流小模型
- **App Size**: 追求小体积（不含模型应 < 20MB）
- **Privacy**: 默认本地运行，不依赖网络；云端 API 为可选增强
- **Performance**: 剪贴板监听零延迟，AI 处理异步不阻塞 UI
- **Design**: 苹果味现代美学 — 高斯模糊、动效、简约
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
