# ABoard

## What This Is

ABoard 是一款跨平台智能剪贴板桌面应用（macOS / Windows / Linux），由 Tauri（Rust + Web UI）驱动。它常驻系统托盘，自动捕获剪贴板内容并提供持久化历史管理，内置本地 AI 小模型（llama.cpp / Ollama）实现智能分类、文本处理、格式化和语义搜索，同时支持可选的云端 AI API。面向追求效率的开发者和知识工作者。

## Core Value

复制即智能 — 每一次剪贴操作都自动获得 AI 增强处理，无需额外操作。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 系统剪贴板监听与自动捕获
- [ ] 剪贴板内容持久化存储与历史管理
- [ ] 托盘常驻 + 可展开完整窗口的混合交互模式
- [ ] 本地 AI 模型推理（llama.cpp / Ollama 集成）
- [ ] 可选云端 AI API 支持（OpenAI / Claude 等）
- [ ] 智能分类与自动标签（代码/链接/图片/文本/JSON 等）
- [ ] AI 文本处理（翻译、总结、改写、格式转换）
- [ ] 格式化工具（JSON/XML 格式化、校验、压缩）
- [ ] 自动摘要生成（为剪贴历史生成快速摘要）
- [ ] 语义搜索剪贴历史（基于 AI 的语义匹配）
- [ ] 快捷键唤起浮动窗口，选即粘贴
- [ ] 跨平台支持：macOS、Windows、Linux

### Out of Scope

- 移动端应用 — 桌面优先，移动端后续考虑
- OCR 图片文字识别 — v1 聚焦文本处理
- 剪贴板内容同步/云备份 — 隐私优先，本地存储
- 协作/分享功能 — 个人工具定位

## Context

- **技术栈**: Tauri v2（Rust 后端 + Web 前端），前端框架待定
- **AI 推理**: llama.cpp 或 Ollama 本地推理，支持 GGUF 格式小模型
- **AI 双模式**: 本地模型处理基础任务（分类、摘要、格式化），云端 API 处理复杂任务（深度翻译、长文总结）
- **平台**: macOS、Windows、Linux 全覆盖
- **设计语言**: 苹果风格现代化 UI — 高斯模糊（毛玻璃）、丝滑动效、简约优雅
- **交互模式**: 系统托盘常驻 + 快捷键唤起浮动窗口 + 可展开完整窗口
- **数据存储**: 本地持久化，支持大量历史记录的存储和检索

## Constraints

- **Tech Stack**: Tauri v2 — 最小体积的跨平台桌面方案，适合内嵌模型
- **AI Runtime**: llama.cpp / Ollama — CPU/GPU 均可，支持主流小模型
- **App Size**: 追求小体积（不含模型应 < 20MB）
- **Privacy**: 默认本地运行，不依赖网络；云端 API 为可选增强
- **Performance**: 剪贴板监听零延迟，AI 处理异步不阻塞 UI
- **Design**: 苹果味现代美学 — 高斯模糊、动效、简约

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tauri 而非 Electron | 追求最小体积和原生性能，适合内嵌模型场景 | — Pending |
| llama.cpp / Ollama 本地推理 | 隐私优先，零网络依赖，GGUF 格式支持丰富 | — Pending |
| 混合交互模式 | 托盘常驻低侵入 + 完整窗口满足管理需求 | — Pending |
| 本地 + 云端双模式 | 本地覆盖基础需求，云端提供高阶能力 | — Pending |
| 苹果味 UI 设计 | 用户体验差异化，现代感强 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-15 after initialization*
