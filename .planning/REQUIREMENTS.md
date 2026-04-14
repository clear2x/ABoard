# Requirements: ABoard

**Defined:** 2026-04-15
**Core Value:** 复制即智能 — 每一次剪贴操作都自动获得 AI 增强处理，无需额外操作

## v1 Requirements

### Clipboard Core

- [ ] **CLIP-01**: 应用启动后自动监听系统剪贴板变化，捕获文本、图片、文件路径
- [ ] **CLIP-02**: 剪贴内容持久化到本地存储，应用重启后保留全部历史
- [ ] **CLIP-03**: 用户可浏览完整剪贴历史，按时间倒序排列
- [ ] **CLIP-04**: 用户可通过关键词搜索剪贴历史
- [ ] **CLIP-05**: 用户可删除单条或批量删除历史记录
- [ ] **CLIP-06**: 用户可置顶重要条目，置顶条目置顶显示
- [ ] **CLIP-07**: 应用启动后在系统托盘常驻，不占用 Dock 栏
- [ ] **CLIP-08**: 用户可通过全局快捷键唤起浮动剪贴板窗口
- [ ] **CLIP-09**: 浮动窗口中选择条目后直接粘贴到当前活动应用
- [ ] **CLIP-10**: 用户可多选条目并进行批量操作（删除、导出）
- [ ] **CLIP-11**: 用户可通过快捷键快速切换最近 N 条剪贴内容

### AI Intelligence

- [ ] **AINT-01**: 自动识别剪贴内容类型（代码、链接、图片、纯文本、JSON、XML 等）
- [ ] **AINT-02**: 对每条剪贴内容自动生成标签（基于内容类型和语义）
- [ ] **AINT-03**: 对长文本内容自动生成摘要（用于历史列表预览和搜索）
- [ ] **AINT-04**: 用户可对剪贴内容执行 AI 翻译（中英互译为默认）
- [ ] **AINT-05**: 用户可对剪贴内容执行 AI 总结（生成要点列表）
- [ ] **AINT-06**: 用户可对剪贴内容执行 AI 改写（调整语气、风格）
- [ ] **AINT-07**: 用户可对剪贴内容执行格式转换（Markdown ↔ HTML ↔ 纯文本）
- [ ] **AINT-08**: 用户可对 JSON 内容一键格式化（美化/压缩）
- [ ] **AINT-09**: 用户可对 JSON 内容进行校验并显示错误位置
- [ ] **AINT-10**: 用户可对 XML 内容进行格式化和校验
- [ ] **AINT-11**: 用户可通过语义描述搜索剪贴历史（不只是关键词匹配）

### AI Engine

- [ ] **AIEN-01**: 集成 llama.cpp 或 Ollama 本地推理引擎
- [ ] **AIEN-02**: 用户可下载和管理本地 AI 模型（列表、下载、切换、删除）
- [ ] **AIEN-03**: 用户可配置模型参数（温度、上下文长度等）
- [ ] **AIEN-04**: 用户可配置云端 AI API（OpenAI、Claude 等）作为可选推理后端
- [ ] **AIEN-05**: 系统根据任务复杂度智能路由到本地或云端模型
- [ ] **AIEN-06**: AI 处理异步执行，不阻塞 UI 和剪贴板监听

### UI/UX

- [ ] **UIUX-01**: 主界面采用苹果味现代设计语言 — 毛玻璃/高斯模糊背景、圆角卡片
- [ ] **UIUX-02**: 完整窗口模式包含：历史列表、AI 工具面板、设置页面
- [ ] **UIUX-03**: 浮动窗口轻量展示最近剪贴条目，支持键盘导航
- [ ] **UIUX-04**: 列表项和面板切换具有丝滑过渡动画（≥60fps）
- [ ] **UIUX-05**: 支持深色/浅色主题切换，跟随系统或手动设置
- [ ] **UIUX-06**: 窗口尺寸自适应，内容无裁切无溢出
- [ ] **UIUX-07**: 偏执级 UI 审美标准 — 每个像素对齐、间距一致、动效流畅自然

### Platform

- [ ] **PLAT-01**: macOS 原生支持（Intel + Apple Silicon）
- [ ] **PLAT-02**: Windows 10/11 原生支持
- [ ] **PLAT-03**: Linux 主流发行版支持（Ubuntu/Fedora/Arch）

## v2 Requirements

### Advanced Features

- **ADVN-01**: OCR 图片文字识别并提取到剪贴板
- **ADVN-02**: 剪贴板内容跨设备同步
- **ADVN-03**: 自定义 AI 工作流（链式处理）
- **ADVN-04**: 插件系统支持第三方扩展
- **ADVN-05**: 代码片段智能补全建议

### Collaboration

- **COLL-01**: 剪贴板内容分享链接
- **COLL-02**: 团队共享剪贴板空间

## Out of Scope

| Feature | Reason |
|---------|--------|
| 移动端应用 | 桌面优先，移动端架构差异大 |
| 剪贴板云备份 | 隐私优先，v1 纯本地存储 |
| 实时协作 | 个人效率工具定位 |
| 文件管理器 | 专注剪贴板，不做通用文件工具 |
| 浏览器扩展 | 桌面应用覆盖剪贴板场景 |

## Quality Standards

- **UI 审美**: 偏执级 — 每个组件对齐精确、间距统一、色彩和谐、动效流畅
- **自测验收**: 偏执级 — 每个 requirement 必须有对应的验收测试用例，全部通过才算完成

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (Populated during roadmap creation) | | |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 0
- Unmapped: 31 ⚠️

---
*Requirements defined: 2026-04-15*
*Last updated: 2026-04-15 after initial definition*
