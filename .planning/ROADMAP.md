# Roadmap: ABoard

## Overview

ABoard 从零构建一个跨平台智能剪贴板桌面应用。Phase 1 搭建 Tauri v2 项目骨架并实现核心剪贴板监听与托盘常驻。Phase 2 构建持久化存储层和完整的历史管理能力。Phase 3 建立苹果风格设计系统并实现主窗口与浮动窗口 UI。Phase 4 集成本地 AI 推理引擎（llama.cpp/Ollama）。Phase 5 在引擎之上实现所有 AI 智能功能（分类、标签、翻译、总结、格式化）。Phase 6 实现语义搜索和高级交互功能。Phase 7 完成跨平台适配、设置系统和主题切换的最终打磨。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Clipboard Core & Tray** - 剪贴板监听、系统托盘常驻、全局快捷键唤起
- [ ] **Phase 2: Storage & History Management** - 持久化存储、历史浏览、搜索、增删管理
- [ ] **Phase 3: UI Foundation & Design System** - 苹果风格设计系统、主窗口、浮动窗口、动效
- [ ] **Phase 4: AI Engine Integration** - 本地推理引擎集成、模型管理、云端 API、异步处理
- [ ] **Phase 5: AI Intelligence Features** - 智能分类、标签、摘要、翻译、总结、改写、格式化
- [ ] **Phase 6: Semantic Search & Advanced Interaction** - 语义搜索、快捷切换、批量操作、选即粘贴
- [ ] **Phase 7: Cross-Platform Polish & Settings** - 跨平台适配、设置页面、主题切换、最终打磨

## Phase Details

### Phase 1: Clipboard Core & Tray
**Goal**: 用户启动应用后剪贴板内容被自动捕获，应用常驻系统托盘，可通过快捷键唤起
**Depends on**: Nothing (first phase)
**Requirements**: CLIP-01, CLIP-07, CLIP-08
**Success Criteria** (what must be TRUE):
  1. 应用启动后自动监听系统剪贴板，复制文本/图片/文件路径时均被捕获
  2. 应用在系统托盘常驻显示图标，不占据 Dock 栏位置
  3. 用户按下全局快捷键可唤起一个窗口（即使其他应用在前台）
  4. 关闭窗口后应用继续在托盘运行，不退出
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Scaffold Tauri v2 project + Rust clipboard monitoring core with SHA256 dedup
- [x] 01-02-PLAN.md — System tray, global shortcut Cmd+Shift+V, window close-to-tray behavior
- [x] 01-03-PLAN.md — Solid.js frontend with clipboard list + end-to-end integration verification
**UI hint**: yes

### Phase 2: Storage & History Management
**Goal**: 用户的所有剪贴内容被持久化保存，可浏览、搜索、管理完整历史
**Depends on**: Phase 1
**Requirements**: CLIP-02, CLIP-03, CLIP-04, CLIP-05, CLIP-06
**Success Criteria** (what must be TRUE):
  1. 所有捕获的剪贴内容持久化到本地存储，应用重启后全部历史保留
  2. 用户可浏览完整剪贴历史，条目按时间倒序排列
  3. 用户可通过关键词搜索历史记录并得到匹配结果
  4. 用户可删除单条记录或批量删除多条记录
  5. 用户可置顶重要条目，置顶条目始终显示在列表顶部
**Plans**: 3 plans
Plans:
- [x] 02-01-PLAN.md — SQLite storage layer with FTS5 search + Tauri commands for history/pin/delete
- [x] 02-02-PLAN.md — Frontend store refactor + SearchBar + ContextMenu + keyboard interactions
- [x] 02-03-PLAN.md — Batch delete with ConfirmDialog + multi-select UI

### Phase 3: UI Foundation & Design System
**Goal**: 用户看到苹果品质的现代 UI，包含毛玻璃效果、丝滑动效、完整窗口和浮动窗口
**Depends on**: Phase 2
**Requirements**: UIUX-01, UIUX-02, UIUX-03, UIUX-04, UIUX-06, UIUX-07, CLIP-09
**Success Criteria** (what must be TRUE):
  1. 主界面呈现苹果风格现代设计 — 毛玻璃/高斯模糊背景、圆角卡片布局
  2. 完整窗口包含历史列表区域、AI 工具面板区域和设置入口
  3. 浮动窗口轻量展示最近剪贴条目，支持键盘上下导航和选中确认
  4. 列表项切换、面板展开、窗口过渡均具有流畅动画（视觉上达到 60fps）
  5. 浮动窗口中选中条目后内容直接粘贴到当前活动应用
  6. 窗口尺寸自适应，内容无裁切无溢出
**Plans**: 4 plans
Plans:
- [x] 03-01-PLAN.md — Design system tokens + glassmorphism CSS + Motion One setup
- [x] 03-02-PLAN.md — Main window glassmorphism redesign + dual-area layout + component restyling
- [x] 03-03-PLAN.md — Floating popup window (Rust + frontend) + keyboard navigation + paste-to-active
- [x] 03-04-PLAN.md — Framer Motion animations for list transitions, context menu, popup, card hover
**UI hint**: yes

### Phase 4: AI Engine Integration
**Goal**: 本地 AI 推理引擎可用，用户可管理模型、配置参数、使用云端 API 作为备选
**Depends on**: Phase 3
**Requirements**: AIEN-01, AIEN-02, AIEN-03, AIEN-04, AIEN-05, AIEN-06
**Success Criteria** (what must be TRUE):
  1. 应用成功集成 llama.cpp 或 Ollama，可加载 GGUF 模型进行本地推理
  2. 用户可查看可用模型列表、下载新模型、切换当前使用模型、删除已下载模型
  3. 用户可调整模型参数（温度、上下文长度等）并立即生效
  4. 用户可配置云端 AI API（OpenAI/Claude 等）密钥和端点，作为可选推理后端
  5. 系统根据任务复杂度自动路由到本地或云端模型（简单任务走本地，复杂任务走云端）
  6. AI 处理全程异步执行，UI 和剪贴板监听不受阻塞
**Plans**: 5 plans
Plans:
- [x] 04-01-PLAN.md — Rust AI engine core: InferenceProvider trait, llama-cpp-rs local provider, OpenAI/Anthropic cloud clients, Tauri commands
- [x] 04-02-PLAN.md — Model management: SQLite metadata table, download/list/delete/switch models, parameter config persistence
- [x] 04-03-PLAN.md — Frontend AI settings panel: provider config, model manager, parameter sliders, integrated into App.tsx
- [x] 04-04-PLAN.md — Gap closure: LocalProvider Ollama HTTP 推理替代 stub，本地服务检测
- [x] 04-05-PLAN.md — Gap closure: 智能路由模块 ComplexityRouter + Auto provider 模式
**UI hint**: yes

### Phase 5: AI Intelligence Features
**Goal**: 每条剪贴内容自动获得 AI 分类、标签和摘要，用户可执行翻译、总结、改写和格式化
**Depends on**: Phase 4
**Requirements**: AINT-01, AINT-02, AINT-03, AINT-04, AINT-05, AINT-06, AINT-07, AINT-08, AINT-09, AINT-10
**Success Criteria** (what must be TRUE):
  1. 新剪贴内容被自动识别类型（代码、链接、图片、纯文本、JSON、XML 等）并显示类型标签
  2. 每条内容自动生成语义标签（基于内容类型和语义分析）
  3. 长文本内容自动生成摘要，在历史列表中显示为预览文字
  4. 用户可对任意内容执行 AI 翻译（中英互译），结果可直接使用或复制
  5. 用户可对内容执行 AI 总结（生成要点列表）
  6. 用户可对内容执行 AI 改写（调整语气、风格）
  7. 用户可在 Markdown、HTML、纯文本之间执行格式转换
  8. JSON 内容可一键美化格式化或压缩，并可校验显示错误位置
  9. XML 内容可格式化和校验
**Plans**: 4 plans
Plans:
- [ ] 05-01-PLAN.md — 数据库扩展 + 自动处理流水线(类型检测+标签生成) + MPSC 队列
- [ ] 05-02-PLAN.md — 自动摘要生成 + 前端摘要预览
- [ ] 05-03-PLAN.md — AI 操作交互(翻译/总结/改写) + 右键菜单扩展 + 结果弹窗
- [ ] 05-04-PLAN.md — 格式化工具(JSON/XML 格式化校验 + Markdown/HTML 格式转换)
**UI hint**: yes

### Phase 6: Semantic Search & Advanced Interaction
**Goal**: 用户可通过自然语言语义搜索历史，并通过快捷键和批量操作高效管理剪贴板
**Depends on**: Phase 5
**Requirements**: AINT-11, CLIP-10, CLIP-11
**Success Criteria** (what must be TRUE):
  1. 用户输入自然语言描述即可搜索到语义相关的剪贴历史（不只是关键词匹配）
  2. 用户可多选历史条目并执行批量操作（批量删除、批量导出）
  3. 用户可通过快捷键在最近 N 条剪贴内容之间快速切换并粘贴
**Plans**: TBD
**UI hint**: yes

### Phase 7: Cross-Platform Polish & Settings
**Goal**: 应用在 macOS/Windows/Linux 上均运行良好，设置完善，主题自适应
**Depends on**: Phase 6
**Requirements**: PLAT-01, PLAT-02, PLAT-03, UIUX-05
**Success Criteria** (what must be TRUE):
  1. 应用在 macOS 上原生运行（支持 Intel 和 Apple Silicon）
  2. 应用在 Windows 10/11 上原生运行
  3. 应用在 Linux 主流发行版（Ubuntu/Fedora/Arch）上原生运行
  4. 用户可在深色/浅色主题之间切换，支持跟随系统自动切换或手动设置
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Clipboard Core & Tray | 0/3 | Ready to execute | - |
| 2. Storage & History Management | 0/3 | Planning complete | - |
| 3. UI Foundation & Design System | 0/4 | Planning complete | - |
| 4. AI Engine Integration | 0/5 | Gap closure planned | - |
| 5. AI Intelligence Features | 0/4 | Planning complete | - |
| 6. Semantic Search & Advanced Interaction | 0/? | Not started | - |
| 7. Cross-Platform Polish & Settings | 0/? | Not started | - |
