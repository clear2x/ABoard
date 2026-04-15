# Phase 2: Storage & History Management - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 在 Phase 1 的剪贴板捕获基础上，添加持久化存储、历史浏览、关键词搜索、删除/批量删除和置顶功能。用户的所有剪贴内容被持久化保存到本地 SQLite 数据库，可浏览、搜索、管理完整历史。

</domain>

<decisions>
## Implementation Decisions

### Storage Engine
- 使用 SQLite (rusqlite) 作为 Rust 后端的持久化存储方案
- 嵌入式、零配置、支持 FTS5 全文搜索
- 搜索功能用 SQLite FTS5 做基础关键词匹配（语义搜索留给 Phase 6）

### Data Flow Architecture
- 前端通过 Tauri Commands (invoke) 主动调用 Rust 查询历史数据
- Tauri 事件仅用于实时新项通知（保持 Phase 1 的事件推送模式）
- 分离读写路径：写入由 Rust 剪贴板监控触发，读取由前端主动请求

### Interaction Design
- 右键菜单 + 快捷键作为删除/置顶的交互方式
- 右键卡片弹出操作菜单（删除、置顶/取消置顶）
- Delete 键删除选中项，Cmd+P 置顶
- 保持 Phase 1 的苹果风格极简美学（暗色主题、毛玻璃）

### Claude's Discretion
- SQLite schema 设计细节
- 分页/虚拟滚动策略
- 批量删除的确认对话框设计
- 搜索输入的防抖延迟
- 数据迁移策略

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- src-tauri/src/clipboard.rs — ClipboardMonitor 已实现，发送 "clipboard-update" 事件
- src/stores/clipboard.ts — Solid.js createSignal store，当前纯内存最多100条
- src/components/ClipboardList.tsx — 已有列表组件
- src/components/ClipboardItemCard.tsx — 已有卡片组件
- src-tauri/src/lib.rs — Tauri 应用入口，已注册 clipboard 模块和 tray 模块

### Established Patterns
- Rust 侧: Tauri command + 事件桥接模式
- 前端侧: Solid.js reactive primitives + CSS modules
- 数据模型: ClipboardItem { id, content_type, content, timestamp, sha256 }

### Integration Points
- clipboard.rs 需要在捕获新项时同时写入 SQLite
- clipboard.ts store 需要从 invoke(commands) 加载历史
- ClipboardList 需要支持搜索、删除、置顶操作
- ClipboardItemCard 需要支持右键菜单和选中状态

</code_context>

<specifics>
## Specific Ideas

- 置顶条目始终显示在列表顶部，按置顶时间排序，非置顶按捕获时间倒序
- 批量删除需要确认对话框
- 搜索应该实时过滤（防抖），不需要搜索按钮
- 持久化应异步执行，不阻塞剪贴板监控

</specifics>

<deferred>
## Deferred Ideas

- 语义搜索（Phase 6）
- 图片内容的持久化存储
- 导出/导入历史数据
- 存储容量限制和自动清理策略

</deferred>
