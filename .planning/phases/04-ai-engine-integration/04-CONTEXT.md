# Phase 4: AI Engine Integration - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 集成本地 AI 推理引擎和云端 API，提供统一的推理接口。不实现智能路由（留给 Phase 5/6）。用户可管理模型、配置参数、使用云端 API 作为备选。

</domain>

<decisions>
## Implementation Decisions

### AI Runtime
- 使用 llama.cpp 嵌入式推理（通过 llama-cpp-rs Rust 绑定）
- 无需外部依赖，用户不需要单独安装 Ollama
- 支持 GGUF 模型格式
- 增加 ~5MB 包体积（在 20MB 约束内）

### Cloud API
- 同时支持 OpenAI 兼容 API 和 Anthropic Claude API
- 用户可配置 API 密钥和端点
- OpenAI 兼容覆盖：OpenAI、Groq、Together 等

### Auto-routing
- Phase 4 不实现智能路由
- 仅搭建统一推理接口，支持本地和云端两种后端
- 路由逻辑留给 Phase 5/6

### Claude's Discretion
- 模型存储目录位置
- 模型下载管理 UI 细节
- 参数配置界面布局
- 异步任务队列实现细节

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- src-tauri/src/db.rs — SQLite 存储，可用于模型元数据
- src-tauri/src/clipboard.rs — 异步监控模式可参考
- src/App.tsx — 主窗口双区域布局（AI 面板区域已预留）
- src/styles/design-tokens.css — 设计 token 系统

### Integration Points
- Rust 侧新增 ai 模块（llama-cpp-rs + HTTP client）
- 前端新增 AI 设置面板和模型管理页面
- Tauri commands 暴露 AI 功能给前端

</code_context>

<specifics>
## Specific Ideas

- 模型管理：列表、下载、切换、删除
- 参数调整：温度、上下文长度、top_p 等
- 云端配置：API key、endpoint、model name
- AI 处理异步不阻塞 UI

</specifics>

<deferred>
## Deferred Ideas

- 智能路由（Phase 5/6）
- RAG/向量搜索集成
- 批量 AI 处理
- 流式输出

</deferred>
