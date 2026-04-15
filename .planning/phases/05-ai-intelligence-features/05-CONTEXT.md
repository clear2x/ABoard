# Phase 5: AI Intelligence Features - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 为每条剪贴内容提供 AI 增强处理：自动类型检测、标签生成、摘要提取，以及用户可触发的翻译、总结、改写、格式转换操作。依赖 Phase 4 的 InferenceProvider trait 和 Tauri commands。

不包含：语义搜索（Phase 6）、批量操作（Phase 6）、跨平台适配（Phase 7）。

</domain>

<decisions>
## Implementation Decisions

### 自动处理流水线
- 捕获后立即异步处理 — 复制即触发类型检测+标签+摘要，符合"复制即智能"核心价值
- 混合检测方案 — 正则/规则优先检测代码/JSON/XML/链接/图片（快速零成本），仅在规则无法判断时调用 AI
- 长文本 (>200 字) 自动生成摘要 — 短内容无需摘要，长内容自动提取关键信息作为列表预览
- 单任务串行队列 — 使用 tokio MPSC channel 逐条处理，避免本地推理并发资源争抢

### AI 操作交互设计
- 右键上下文菜单触发 — 在历史列表项右键弹出翻译/总结/改写/格式化选项
- 结果弹窗展示 — 毛玻璃风格弹窗，用户可选择"复制结果"、"替换原内容"或"追加为新条目"
- 自动检测语言方向 — 中文翻译为英文，非中文翻译为中文，弹窗中可手动选择其他目标语言
- 预设风格列表 — "正式"、"随意"、"简洁"、"详细"、"学术"5 种改写预设

### 格式化工具实现
- 纯前端 JS 实现格式化 — JSON 用内置 parse+stringify，XML 用 vkbeautify 或类似库
- 行内高亮标记错误 — 格式化后 JSON 中错误行红色边框 + 错误信息 tooltip
- 混合格式转换 — 简单转换用 JS 库（markdown-it, turndown），复杂转换调用 AI
- 右键菜单自动检测 — 检测到 JSON/XML 自动显示格式化选项，其他格式转换在子菜单中

### Claude's Discretion
- 处理队列的具体实现细节
- 类型检测正则表达式的具体规则
- 摘要生成的 prompt 模板设计
- 结果弹窗的精确布局和交互

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 4)
- src-tauri/src/ai/mod.rs — InferenceProvider trait, AiState, ai_infer command
- src-tauri/src/ai/router.rs — ComplexityRouter 智能路由
- src-tauri/src/ai/config.rs — AiConfig, ProviderType (含 Auto 模式)
- src-tauri/src/ai/local.rs — Ollama HTTP 本地推理
- src-tauri/src/ai/cloud.rs — OpenAI/Anthropic 云端推理
- invoke('ai_infer') / invoke('ai_infer_auto') — 前端可调用的推理接口

### Reusable Assets (from Phase 3)
- src/components/ — SolidJS 组件（已有 ContextMenu 基础）
- src/styles/design-tokens.css — 设计系统 token
- Framer Motion 动画模式 — 可用于结果弹窗动效

### Reusable Assets (from Phase 2)
- src-tauri/src/db.rs — SQLite 存储，可扩展 AI 元数据字段
- src-tauri/src/clipboard.rs — 剪贴板监听，可在此添加自动处理触发

### Integration Points
- clipboard.rs on_capture → 触发自动处理队列
- db.rs → 新增 ai_type / ai_tags / ai_summary 字段到 clipboard_items
- 前端右键菜单 → 新增 AI 操作选项
- 前端历史列表 → 显示类型标签和摘要预览

</code_context>

<specifics>
## Specific Ideas

- 自动处理：捕获后异步触发，用户无感
- 类型标签视觉：彩色小标签（代码=蓝、链接=绿、图片=紫、JSON=橙、文本=灰）
- 摘要预览：在列表项中显示为第二行灰色小字，最多 2 行截断
- 改写风格预设：5 种一键选项，无需输入 prompt

</specifics>

<deferred>
## Deferred Ideas

- 语义搜索（Phase 6: AINT-11）
- 批量 AI 处理（Phase 6: CLIP-10）
- 流式输出（未来优化）
- 自定义 AI prompt（未来增强）

</deferred>
