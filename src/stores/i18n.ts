import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export type Locale = "zh" | "en";

const STORAGE_KEY = "aboard-locale";

const [locale, setLocaleInternal] = createSignal<Locale>("zh");
export { locale };

export function setLocale(lang: Locale) {
  setLocaleInternal(lang);
  localStorage.setItem(STORAGE_KEY, lang);
  // Sync tray menu texts with the new locale
  invoke("update_tray_locale", { locale: lang }).catch(() => {});
}

export function initLocale() {
  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (saved === "zh" || saved === "en") {
    setLocaleInternal(saved);
  }
  // Sync tray menu on startup
  const current = saved || "zh";
  invoke("update_tray_locale", { locale: current }).catch(() => {});
}

// --- Translation map ---

type Translations = Record<string, Record<Locale, string>>;

const t_map: Translations = {
  // Header
  "app.title": { zh: "ABoard", en: "ABoard" },
  "app.subtitle": { zh: "智能剪贴板管理器", en: "Smart Clipboard Manager" },

  // ClipboardList
  "clipboard.noItems": { zh: "暂无剪贴板内容，复制一些东西试试！", en: "No clipboard items yet. Copy something!" },
  "clipboard.loading": { zh: "加载中...", en: "Loading..." },
  "clipboard.batch": { zh: "批量", en: "Batch" },
  "clipboard.selectAll": { zh: "全选", en: "Select All" },
  "clipboard.clearSel": { zh: "取消选择", en: "Clear" },
  "clipboard.deleteSelected": { zh: "删除选中", en: "Delete Selected" },
  "clipboard.export": { zh: "导出", en: "Export" },
  "clipboard.exportJson": { zh: "导出为 JSON", en: "Export as JSON" },
  "clipboard.exportMd": { zh: "导出为 Markdown", en: "Export as Markdown" },
  "clipboard.exportText": { zh: "导出为文本", en: "Export as Text" },
  "clipboard.cancel": { zh: "取消", en: "Cancel" },
  "clipboard.confirmDelete": { zh: "确认删除", en: "Delete Items" },
  "clipboard.confirmDeleteMsg": { zh: "确定要删除 {count} 条记录吗？此操作无法撤销。", en: "Are you sure you want to delete {count} item(s)? This cannot be undone." },

  // Search
  "search.placeholder": { zh: "搜索剪贴板...", en: "Search clipboard..." },
  "search.semantic": { zh: "AI 语义搜索", en: "AI Semantic Search" },

  // ContextMenu
  "ctx.translate": { zh: "翻译", en: "Translate" },
  "ctx.translating": { zh: "翻译中...", en: "Translating..." },
  "ctx.summarize": { zh: "总结", en: "Summarize" },
  "ctx.summarizing": { zh: "总结中...", en: "Summarizing..." },
  "ctx.rewrite": { zh: "改写", en: "Rewrite" },
  "ctx.rewriting": { zh: "改写中...", en: "Rewriting..." },
  "ctx.formal": { zh: "正式", en: "Formal" },
  "ctx.casual": { zh: "随意", en: "Casual" },
  "ctx.concise": { zh: "简洁", en: "Concise" },
  "ctx.detailed": { zh: "详细", en: "Detailed" },
  "ctx.academic": { zh: "学术", en: "Academic" },
  "ctx.beautifyJson": { zh: "美化 JSON", en: "Beautify JSON" },
  "ctx.minifyJson": { zh: "压缩 JSON", en: "Minify JSON" },
  "ctx.validateJson": { zh: "校验 JSON", en: "Validate JSON" },
  "ctx.formatXml": { zh: "格式化 XML", en: "Format XML" },
  "ctx.validateXml": { zh: "校验 XML", en: "Validate XML" },
  "ctx.convert": { zh: "格式转换", en: "Convert" },
  "ctx.copy": { zh: "复制", en: "Copy" },
  "ctx.copied": { zh: "已复制", en: "Copied" },
  "ctx.pin": { zh: "置顶", en: "Pin" },
  "ctx.unpin": { zh: "取消置顶", en: "Unpin" },
  "ctx.delete": { zh: "删除", en: "Delete" },

  // AiResultPopup
  "ai.result.translate": { zh: "翻译结果", en: "Translation Result" },
  "ai.result.summarize": { zh: "总结结果", en: "Summary Result" },
  "ai.result.rewrite": { zh: "改写结果", en: "Rewrite Result" },
  "ai.result.format": { zh: "格式化结果", en: "Format Result" },
  "ai.copyResult": { zh: "复制结果", en: "Copy Result" },
  "ai.replaceOriginal": { zh: "替换原内容", en: "Replace Original" },
  "ai.appendNew": { zh: "追加为新条目", en: "Append as New Entry" },

  // Settings
  "settings.title": { zh: "设置", en: "Settings" },
  "settings.language": { zh: "语言", en: "Language" },
  "settings.language.zh": { zh: "中文", en: "Chinese" },
  "settings.language.en": { zh: "English", en: "English" },
  "settings.theme": { zh: "主题", en: "Theme" },
  "settings.theme.system": { zh: "跟随系统", en: "System" },
  "settings.theme.dark": { zh: "深色", en: "Dark" },
  "settings.theme.light": { zh: "浅色", en: "Light" },
  "settings.shortcuts": { zh: "快捷键", en: "Shortcuts" },
  "settings.about": { zh: "关于", en: "About" },
  "settings.aboutVersion": { zh: "ABoard", en: "ABoard" },
  "settings.aboutDesc": { zh: "智能剪贴板管理器，内置 AI", en: "Smart clipboard manager with AI" },

  // AI Settings
  "ai.title": { zh: "AI 设置", en: "AI Settings" },
  "ai.provider": { zh: "AI 提供商", en: "AI Provider" },
  "ai.provider.local": { zh: "本地 (Ollama / llama.cpp)", en: "Local (Ollama / llama.cpp)" },
  "ai.provider.openai": { zh: "OpenAI 兼容", en: "OpenAI Compatible" },
  "ai.provider.anthropic": { zh: "Anthropic", en: "Anthropic" },
  "ai.provider.auto": { zh: "自动选择", en: "Auto" },
  "ai.detectLocal": { zh: "检测本地服务", en: "Detect Local Services" },
  "ai.detecting": { zh: "检测中...", en: "Detecting..." },
  "ai.notRunning": { zh: "未运行", en: "not running" },
  "ai.detectedModels": { zh: "已发现模型：", en: "Detected models:" },
  "ai.installHint": { zh: "请从 https://ollama.com 安装 Ollama 或启动 llama.cpp 服务", en: "Install Ollama from https://ollama.com or start llama.cpp server" },
  "ai.apiKey": { zh: "API 密钥", en: "API Key" },
  "ai.endpoint": { zh: "接口地址", en: "Endpoint" },
  "ai.model": { zh: "模型", en: "Model" },
  "ai.save": { zh: "保存配置", en: "Save Config" },
  "ai.saving": { zh: "保存中...", en: "Saving..." },
  "ai.saved": { zh: "已保存", en: "Saved" },
  "ai.status": { zh: "AI 状态", en: "AI Status" },
  "ai.notConfigured": { zh: "AI 未配置", en: "AI Not Configured" },
  "ai.ready": { zh: "AI 就绪", en: "AI Ready" },
  "ai.clickToSetup": { zh: "点击设置 AI 提供商以启用智能功能", en: "Click to set up AI provider to enable smart features" },
  "ai.errorTitle": { zh: "AI 错误", en: "AI Error" },

  // Model Manager
  "model.title": { zh: "模型管理", en: "Model Manager" },
  "model.active": { zh: "使用中", en: "Active" },
  "model.setActive": { zh: "设为当前", en: "Set Active" },
  "model.delete": { zh: "删除", en: "Delete" },
  "model.download": { zh: "下载模型", en: "Download Model" },
  "model.downloadUrl": { zh: "模型 URL", en: "Model URL" },
  "model.downloadName": { zh: "模型名称", en: "Model Name" },
  "model.downloading": { zh: "下载中", en: "Downloading" },
  "model.noModels": { zh: "暂无已安装的模型", en: "No models installed" },

  // Model Params
  "params.title": { zh: "模型参数", en: "Model Parameters" },
  "params.temperature": { zh: "温度", en: "Temperature" },
  "params.contextLength": { zh: "上下文长度", en: "Context Length" },
  "params.topP": { zh: "Top P", en: "Top P" },

  // Floating popup
  "float.title": { zh: "快速粘贴", en: "Quick Paste" },
  "float.empty": { zh: "暂无记录", en: "No items" },

  // Window controls
  "window.minimize": { zh: "最小化", en: "Minimize" },
  "window.maximize": { zh: "最大化", en: "Maximize" },
  "window.restore": { zh: "还原", en: "Restore" },
  "window.close": { zh: "关闭", en: "Close" },

  // View mode
  "view.list": { zh: "列表", en: "List" },
  "view.grid": { zh: "平铺", en: "Grid" },

  // Shortcuts
  "shortcut.togglePopup": { zh: "切换浮动窗", en: "Toggle floating popup" },
  "shortcut.quickCycle": { zh: "快速循环粘贴", en: "Quick cycle paste" },
  "shortcut.pinItem": { zh: "置顶/取消置顶", en: "Pin/Unpin item" },
  "shortcut.deleteItem": { zh: "删除选中项", en: "Delete selected item" },

  // JSON validate
  "json.valid": { zh: "JSON 格式正确", en: "JSON is valid" },
  "json.invalid": { zh: "JSON 格式错误", en: "JSON format error" },
  "json.line": { zh: "第 {n} 行", en: "Line {n}" },
  "xml.valid": { zh: "XML 格式正确", en: "XML is valid" },
  "xml.invalid": { zh: "XML 格式错误", en: "XML format error" },

  // Sidebar
  "sidebar.all": { zh: "全部", en: "All" },
  "sidebar.code": { zh: "代码", en: "Code" },
  "sidebar.links": { zh: "链接", en: "Links" },
  "sidebar.images": { zh: "图片", en: "Images" },
  "sidebar.videos": { zh: "视频", en: "Videos" },
  "sidebar.text": { zh: "文本", en: "Text" },
  "sidebar.tags": { zh: "标签", en: "Tags" },
  "sidebar.newTag": { zh: "新建标签", en: "New Tag" },
  "sidebar.storage": { zh: "本地存储", en: "Local Storage" },

  // Filter tabs
  "filter.all": { zh: "全部", en: "All" },
  "filter.pinned": { zh: "已固定", en: "Pinned" },
  "filter.today": { zh: "今天", en: "Today" },
  "filter.yesterday": { zh: "昨天", en: "Yesterday" },
  "filter.last7days": { zh: "近7天", en: "Last 7 Days" },
  "filter.custom": { zh: "自定义", en: "Custom" },

  // AI Toolbox
  "toolbox.title": { zh: "AI 工具箱", en: "AI Toolbox" },
  "toolbox.translate": { zh: "翻译", en: "Translate" },
  "toolbox.translateDesc": { zh: "多语言互译，自动检测", en: "Multi-language translation, auto-detect" },
  "toolbox.summarize": { zh: "总结", en: "Summarize" },
  "toolbox.summarizeDesc": { zh: "提炼要点，生成摘要", en: "Extract key points, generate summary" },
  "toolbox.rewrite": { zh: "改写", en: "Rewrite" },
  "toolbox.rewriteDesc": { zh: "优化表达，调整语气", en: "Optimize expression, adjust tone" },
  "toolbox.format": { zh: "格式化", en: "Format" },
  "toolbox.formatDesc": { zh: "美化 / 压缩 / 校验", en: "Beautify / Minify / Validate" },
  "toolbox.markdown": { zh: "转换 Markdown", en: "Convert Markdown" },
  "toolbox.markdownDesc": { zh: "Markdown ⇌ 其他格式", en: "Markdown to/from other formats" },
  "toolbox.privacyNote": { zh: "所有 AI 处理均在本地完成", en: "All AI processing is done locally" },
  "toolbox.noSelection": { zh: "请先选择一个剪贴板条目", en: "Select a clipboard item first" },

  // Settings Panel
  "settings.general": { zh: "通用", en: "General" },
  "settings.appearance": { zh: "外观", en: "Appearance" },
  "settings.aiConfig": { zh: "AI 配置", en: "AI Config" },
  "settings.aiMode": { zh: "AI 模式", en: "AI Mode" },
  "settings.aiModeLocal": { zh: "本地模型 (推荐)", en: "Local Model (Recommended)" },
  "settings.aiModeLocalDesc": { zh: "完全本地运行，隐私安全", en: "Runs entirely locally, privacy-safe" },
  "settings.aiModeCloud": { zh: "云端 API (可选)", en: "Cloud API (Optional)" },
  "settings.aiModeCloudDesc": { zh: "使用云端大模型，功能更强大", en: "Use cloud models, more powerful" },
  "settings.inferenceEngine": { zh: "推理引擎", en: "Inference Engine" },
  "settings.contextWindow": { zh: "上下文窗口", en: "Context Window" },
  "settings.gpuAcceleration": { zh: "GPU 加速", en: "GPU Acceleration" },
  "settings.modelRunning": { zh: "模型运行中", en: "Model Running" },
  "settings.privacyAndData": { zh: "隐私与数据", en: "Privacy & Data" },
  "settings.privacyFirst": { zh: "隐私优先", en: "Privacy First" },
  "settings.localMode": { zh: "(本地模式)", en: "(Local mode)" },
  "settings.autoCleanup": { zh: "自动清理", en: "Auto Cleanup" },
  "settings.afterDays": { zh: "{n} 天后", en: "After {n} days" },
  "settings.storageStatus": { zh: "存储状态", en: "Storage Status" },
  "settings.used": { zh: "已使用", en: "Used" },
  "settings.cleanOldData": { zh: "清理旧数据", en: "Clean Old Data" },
  "settings.cleaning": { zh: "清理中...", en: "Cleaning..." },
  "settings.cleaned": { zh: "已清理 {n} 条旧数据", en: "Cleaned {n} old items" },
  "settings.noOldItems": { zh: "没有需要清理的旧数据", en: "No old items to clean" },
  "settings.showHideWindow": { zh: "显示 / 隐藏主窗口", en: "Show / Hide Main Window" },
  "settings.quickPastePanel": { zh: "快速粘贴面板", en: "Quick Paste Panel" },

  // Floating Popup redesign
  "float.search": { zh: "搜索剪贴板...", en: "Search clipboard..." },
  "float.pinned": { zh: "已固定", en: "Pinned" },
  "float.recent": { zh: "最近复制", en: "Recently Copied" },
  "float.clear": { zh: "清空", en: "Clear" },
  "float.openMainWindow": { zh: "打开主窗口", en: "Open Main Window" },

  // Missing translations - Sidebar
  "sidebar.clipboardData": { zh: "剪贴板数据", en: "Clipboard Data" },
  "sidebar.records": { zh: "{n} 条记录", en: "{n} records" },

  // ContextMenu - format conversion
  "ctx.jsonValid": { zh: "JSON 格式正确 ✓", en: "JSON is valid ✓" },
  "ctx.jsonInvalid": { zh: "JSON 格式错误:\n{error}", en: "JSON format error:\n{error}" },
  "ctx.xmlValid": { zh: "XML 格式正确 ✓", en: "XML is valid ✓" },
  "ctx.xmlInvalid": { zh: "XML 格式错误:\n{error}", en: "XML format error:\n{error}" },
  "ctx.markdownToPlaintext": { zh: "Markdown → 纯文本", en: "Markdown → Plain Text" },
  "ctx.htmlToPlaintext": { zh: "HTML → 纯文本", en: "HTML → Plain Text" },

  // AiResultPopup
  "ai.resultOriginal": { zh: "原文", en: "Original" },
  "ai.generationTime": { zh: "生成耗时", en: "Generation time" },

  // AiToolbox
  "toolbox.unrecognizedFormat": { zh: "无法识别内容格式。支持 JSON、XML、HTML 和 Markdown 格式化。", en: "Unrecognized content format. Supports JSON, XML, HTML, and Markdown formatting." },

  // Settings Panel - embedded model
  "settings.builtInEngine": { zh: "内置引擎 (Candle)", en: "Built-in Engine (Candle)" },
  "settings.modelLoadFailed": { zh: "模型加载失败: {error}", en: "Model load failed: {error}" },
  "settings.loading": { zh: "加载中...", en: "Loading..." },
  "settings.downloadingModel": { zh: "下载模型中 (首次约400MB)...", en: "Downloading model (first time ~400MB)..." },
  "settings.modelLoaded": { zh: "✓ 模型已加载", en: "✓ Model loaded" },
  "settings.loadModel": { zh: "加载内置模型", en: "Load built-in model" },
  "settings.modelInfo": { zh: "Candle · Qwen2.5-0.5B · Q4_K_M", en: "Candle · Qwen2.5-0.5B · Q4_K_M" },
  "settings.defaultModel": { zh: "Qwen2.5-0.5B-Instruct (内置)", en: "Qwen2.5-0.5B-Instruct (Built-in)" },

  // Search
  "search.placeholderFull": { zh: "搜索剪贴板 (语义搜索 / 正则 / 标签)", en: "Search clipboard (semantic / regex / tags)" },

  // Update check
  "settings.checkUpdate": { zh: "检查更新", en: "Check for Updates" },
  "settings.checking": { zh: "正在检查...", en: "Checking..." },
  "settings.upToDate": { zh: "已是最新版本", en: "You're up to date" },
  "settings.newVersion": { zh: "发现新版本: {version}", en: "New version available: {version}" },
  "settings.downloadUpdate": { zh: "前往下载", en: "Download" },
  "settings.updateError": { zh: "检查失败，请稍后重试", en: "Check failed, please try again later" },
  "settings.author": { zh: "作者", en: "Author" },
  "settings.homepage": { zh: "主页", en: "Homepage" },
};

// --- Translation function ---

/**
 * Look up a translation key. Supports {var} interpolation.
 * Falls back to the key itself if not found.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = t_map[key];
  if (!entry) return key;
  let text = entry[locale()] || entry["en"] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
