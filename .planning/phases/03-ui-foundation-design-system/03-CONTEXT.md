# Phase 3: UI Foundation & Design System - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 在 Phase 1-2 的功能基础上，构建苹果品质的现代 UI 系统。包括：毛玻璃/高斯模糊背景、圆角卡片布局、完整主窗口（历史+AI面板+设置）、轻量浮动弹窗（键盘导航+粘贴）、流畅动画。

</domain>

<decisions>
## Implementation Decisions

### Window Architecture
- 双窗口架构：主窗口 + 浮动弹窗
- 主窗口：完整历史列表 + AI 工具面板区域 + 设置入口
- 浮动弹窗：轻量展示最近剪贴条目，Cmd+Shift+V 触发
- 保持 Phase 1 的快捷键行为一致性

### Animation
- 使用 Framer Motion 实现动画
- 列表项切换、面板展开、窗口过渡均需流畅（目标 60fps）
- 虽然 Framer Motion 增加包体积，但提供更好的动画控制

### Glassmorphism
- CSS backdrop-filter: blur() 实现毛玻璃效果
- 零依赖，Tauri webview 原生支持
- 跨平台一致的视觉效果
- 不使用 window-vibrancy（仅 macOS 最佳）

### Claude's Discretion
- 主窗口布局细节（侧边栏 vs 标签页）
- 浮动弹窗的具体尺寸和位置
- 圆角卡片的具体像素值
- 动画持续时间和缓动函数
- 响应式断点策略

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- src/App.tsx — 主入口，已有窗口关闭到托盘逻辑
- src/components/ClipboardList.tsx — 已有列表组件（搜索、右键、批量删除）
- src/components/ClipboardItemCard.tsx — 已有卡片组件（选中、置顶标记）
- src/components/SearchBar.tsx — 已有搜索组件
- src/components/ContextMenu.tsx — 已有右键菜单
- src/components/ConfirmDialog.tsx — 已有确认对话框
- src/styles/index.css — 全局样式（目前仅 Tailwind import）
- src-tauri/src/lib.rs — Rust 入口，已有窗口管理（光标居中、快捷键）

### Established Patterns
- Solid.js reactive primitives (createSignal, createStore)
- Tauri invoke commands for data access
- Tailwind CSS for styling
- CSS modules pattern available

### Integration Points
- App.tsx 需要重构为双窗口路由
- 现有组件需要毛玻璃背景和动画包装
- Rust 侧可能需要新增浮动窗口的 Tauri 窗口管理

</code_context>

<specifics>
## Specific Ideas

- Phase 1 已有 UI-SPEC (01-UI-SPEC.md) 定义了颜色、排版、间距 token
- 毛玻璃背景用于窗口背景和卡片层
- 浮动弹窗选中条目后内容直接粘贴到当前活动应用
- 窗口尺寸自适应，内容无裁切无溢出

</specifics>

<deferred>
## Deferred Ideas

- 浅色主题（Phase 7）
- 完整的 AI 工具面板 UI（Phase 5）
- 设置页面 UI（Phase 7）
- 跨平台窗口样式适配（Phase 7）

</deferred>
