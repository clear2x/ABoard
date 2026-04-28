import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { theme, setTheme, type ThemeMode } from "../stores/theme";
import { locale, setLocale, t } from "../stores/i18n";
import { storageSize, itemCount, loadStorageStats, loadHistory } from "../stores/clipboard";
import type { Locale } from "../stores/i18n";

interface AiConfig {
  active_provider: string;
  model_path?: string;
  context_length: number;
  openai_api_key?: string;
  openai_endpoint: string;
  openai_model: string;
  anthropic_api_key?: string;
  anthropic_model: string;
  temperature?: number;
  top_p?: number;
}

interface LocalProviderStatus {
  ollamaAvailable: boolean;
  llamacppAvailable: boolean;
  detectedModels: string[];
}

interface Props {
  onClose: () => void;
}

const TABS = [
  { key: "general", icon: "ph ph-gear-six" },
  { key: "ai", icon: "ph ph-sparkle" },
  { key: "appearance", icon: "ph ph-palette" },
  { key: "shortcuts", icon: "ph ph-keyboard" },
  { key: "about", icon: "ph ph-info" },
] as const;

type Tab = typeof TABS[number]["key"];

export default function SettingsPanel(props: Props) {
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const [activeTab, setActiveTab] = createSignal<Tab>("ai");

  // AI settings state
  const [provider, setProvider] = createSignal("Local");
  const [openaiKey, setOpenaiKey] = createSignal("");
  const [openaiEndpoint, setOpenaiEndpoint] = createSignal("https://api.openai.com/v1");
  const [openaiModel, setOpenaiModel] = createSignal("gpt-4o-mini");
  const [anthropicKey, setAnthropicKey] = createSignal("");
  const [anthropicModel, setAnthropicModel] = createSignal("claude-sonnet-4-20250514");
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [detecting, setDetecting] = createSignal(false);
  const [localStatus, setLocalStatus] = createSignal<LocalProviderStatus | null>(null);
  const [gpuEnabled, setGpuEnabled] = createSignal(true);
  const [engine, setEngine] = createSignal<"embedded" | "ollama">("embedded");
  const [selectedModel, setSelectedModel] = createSignal(t("settings.defaultModel"));
  const [embeddedStatus, setEmbeddedStatus] = createSignal<"unknown" | "downloading" | "loading" | "ready" | "error">("unknown");
  const [contextLength, setContextLength] = createSignal(8192);
  const [saveError, setSaveError] = createSignal("");

  // Privacy & storage state
  const [monitoringEnabled, setMonitoringEnabled] = createSignal(true);
  const [cleanupDays, setCleanupDays] = createSignal(30);
  const [showCleanupDropdown, setShowCleanupDropdown] = createSignal(false);

  // Update check state
  const [appVersion, setAppVersion] = createSignal("");
  const [updateStatus, setUpdateStatus] = createSignal<"idle" | "checking" | "up-to-date" | "available" | "error">("idle");
  const [latestVersion, setLatestVersion] = createSignal("");
  const [cleaning, setCleaning] = createSignal(false);
  const [cleanMessage, setCleanMessage] = createSignal("");
  const [importing, setImporting] = createSignal(false);
  const [importMessage, setImportMessage] = createSignal("");

  // Shortcuts state
  const [shortcuts, setShortcuts] = createSignal<{ action: string; shortcut: string }[]>([]);
  const [recordingAction, setRecordingAction] = createSignal<string | null>(null);

  const shortcutLabels: Record<string, string> = {
    toggle_popup: t("shortcut.togglePopup"),
    quick_cycle: t("shortcut.quickCycle"),
    pin_item: t("shortcut.pinItem"),
    delete_item: t("shortcut.deleteItem"),
    toggle_window: t("settings.showHideWindow"),
    quick_paste: t("settings.quickPastePanel"),
  };

  const formatShortcut = (raw: string): string => {
    return raw
      .replace(/CommandOrControl\+/g, "Cmd+")
      .replace(/Cmd\+/g, "\u2318 ")
      .replace(/Shift\+/g, "\u21E7 ")
      .replace(/Alt\+/g, "\u2325 ")
      .replace(/Control\+/g, "Ctrl+")
      .replace(/Super\+/g, "\u2318 ");
  };

  const parseKeyboardEvent = (e: KeyboardEvent): string => {
    const parts: string[] = [];
    if (e.metaKey || e.ctrlKey) parts.push("CommandOrControl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");
    // Map key to Electron/Accelerator name
    let key = e.key;
    if (key === " ") key = "Space";
    else if (key === "+") key = "Plus";
    else if (key === ",") key = "Comma";
    else if (key === ".") key = "Period";
    else if (key === "-") key = "Minus";
    else if (key.length === 1) key = key.toUpperCase();
    if (!["Meta", "Control", "Shift", "Alt"].includes(e.key)) {
      parts.push(key);
    }
    return parts.join("+");
  };

  const checkForUpdate = async () => {
    setUpdateStatus("checking");
    try {
      // Get current version (fallback to "0.0.0" if unavailable)
      let current = appVersion();
      if (!current) {
        try { current = await getVersion(); setAppVersion(current); } catch { current = "0.0.0"; }
      }

      const res = await fetch("https://api.github.com/repos/clear2x/ABoard/releases/latest", {
        headers: { "Accept": "application/vnd.github+json" },
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      const remoteTag: string = data.tag_name || "";
      console.log("[update] current:", current, "remote:", remoteTag);

      // Strip leading 'v' for comparison
      const remote = remoteTag.replace(/^v/, "");
      if (remote && remote !== current) {
        setLatestVersion(remoteTag);
        setUpdateStatus("available");
      } else {
        setUpdateStatus("up-to-date");
      }
    } catch (e) {
      console.error("[update] check failed:", e);
      setUpdateStatus("error");
    }
  };

  onMount(async () => {
    try {
      const ver = await getVersion();
      setAppVersion(ver);
    } catch {}

    loadStorageStats();

    try {
      const monitoring = await invoke<boolean>("get_monitoring_state");
      setMonitoringEnabled(monitoring);
    } catch {}

    try {
      const days = await invoke<string>("get_setting", { key: "cleanup_days" });
      if (days) setCleanupDays(Math.max(1, Math.min(365, parseInt(days, 10) || 30)));
    } catch {}

    try {
      const gpu = await invoke<string>("get_setting", { key: "gpu_enabled" });
      if (gpu !== null && gpu !== undefined) setGpuEnabled(gpu === "true");
    } catch {}

    try {
      const config = await invoke<AiConfig>("ai_get_config");
      setProvider(config.active_provider || "Local");
      setOpenaiKey(config.openai_api_key || "");
      setOpenaiEndpoint(config.openai_endpoint || "https://api.openai.com/v1");
      setOpenaiModel(config.openai_model || "gpt-4o-mini");
      setAnthropicKey(config.anthropic_api_key || "");
      setAnthropicModel(config.anthropic_model || "claude-sonnet-4-20250514");
      setContextLength(config.context_length || 8192);
    } catch (err) {
      console.warn("Failed to load AI config:", err);
    }

    // Load keyboard shortcuts
    try {
      const sc = await invoke<{ action: string; shortcut: string }[]>("get_shortcuts");
      setShortcuts(sc);
    } catch (err) {
      console.warn("Failed to load shortcuts:", err);
    }
  });

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    setSaveError("");

    // Validate API key for cloud providers
    const prov = provider();
    if (prov === "OpenAi" && !openaiKey().trim()) {
      setSaveError(t("settings.apiKeyRequired") || "API key is required for OpenAI.");
      setSaving(false);
      return;
    }
    if (prov === "Anthropic" && !anthropicKey().trim()) {
      setSaveError(t("settings.apiKeyRequired") || "API key is required for Anthropic.");
      setSaving(false);
      return;
    }

    try {
      const config: AiConfig = {
        active_provider: prov,
        context_length: contextLength(),
        openai_api_key: openaiKey() || undefined,
        openai_endpoint: openaiEndpoint(),
        openai_model: openaiModel(),
        anthropic_api_key: anthropicKey() || undefined,
        anthropic_model: anthropicModel(),
      };
      await invoke("ai_set_config", { config });
      setMessage(t("ai.saved"));
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      setMessage(`Error: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDetectLocal = async () => {
    setDetecting(true);
    setLocalStatus(null);
    try {
      const status = await invoke<LocalProviderStatus>("ai_detect_local_provider");
      setLocalStatus(status);
    } catch (err) {
      setMessage(`Detection failed: ${err}`);
    } finally {
      setDetecting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      props.onClose();
    }
  };

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  return (
    <div class="fixed inset-0 z-40">
      {/* Backdrop */}
      <div class="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={props.onClose} />

      {/* Panel */}
      <div class="glass-panel absolute top-0 right-0 h-full settings-slide-in flex flex-col overflow-hidden"
        style={{
          width: "380px",
          "border-radius": "20px 0 0 20px",
          "box-shadow": "-8px 0 32px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header — bg-white/30 matching ui.html */}
        <div class="h-10 flex justify-center items-center font-medium text-sm text-gray-700 dark:text-gray-200 relative border-b border-white/40 bg-white/30 dark:bg-slate-800/50">
          {t("settings.title")}
          <button class="absolute right-3 w-6 h-6 rounded flex items-center justify-center hover:bg-white/20 transition-colors text-gray-400"
            onClick={props.onClose}>
            <i class="ph ph-x" />
          </button>
        </div>

        {/* Icon tab bar — bg-white/10 border-white/30 matching ui.html */}
        <div class="flex justify-around items-center px-6 py-4 border-b border-white/50 bg-white/25">
          {TABS.map((tab) => {
            const isActive = () => activeTab() === tab.key;
            const tabLabels: Record<string, string> = {
              general: t("settings.general"),
              ai: t("settings.aiConfig"),
              appearance: t("settings.appearance"),
              shortcuts: t("settings.shortcuts"),
              about: t("settings.about"),
            };
            return (
              <button
                class="flex flex-col items-center gap-1.5 cursor-pointer transition-all"
                classList={{ "opacity-90 hover:opacity-100": !isActive() }}
                style={isActive() ? { color: "#2563eb" } : { color: "#6b7280" }}
                onClick={() => setActiveTab(tab.key)}
              >
                <Show when={isActive()} fallback={
                  <div class="p-1">
                    <i class={`${tab.icon} text-xl text-gray-500`} />
                  </div>
                }>
                  <div class="bg-blue-100/80 p-1 rounded-md shadow-sm border border-blue-200/50">
                    <i class={`${tab.icon} text-xl text-blue-600`} />
                  </div>
                </Show>
                <span class="text-[11px]" classList={{ "font-medium text-blue-600": isActive() }}>
                  {tabLabels[tab.key]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div class="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
          {/* General tab */}
          <Show when={activeTab() === "general"}>
            <div class="space-y-5">
              <div>
                <label class="block mb-2 text-xs font-medium text-gray-500">{t("settings.language")}</label>
                <div class="flex gap-2">
                  <button class="px-4 py-2 text-sm rounded-lg transition-colors"
                    classList={{ "bg-blue-500 text-white": locale() === "zh" }}
                    style={locale() !== "zh" ? { background: "rgba(255,255,255,0.5)", color: "#4b5563", border: "1px solid rgba(255,255,255,0.8)" } : {}}
                    onClick={() => setLocale("zh")}
                  >{t("settings.language.zh")}</button>
                  <button class="px-4 py-2 text-sm rounded-lg transition-colors"
                    classList={{ "bg-blue-500 text-white": locale() === "en" }}
                    style={locale() !== "en" ? { background: "rgba(255,255,255,0.5)", color: "#4b5563", border: "1px solid rgba(255,255,255,0.8)" } : {}}
                    onClick={() => setLocale("en")}
                  >English</button>
                </div>
              </div>
            </div>
          </Show>

          {/* AI Config tab */}
          <Show when={activeTab() === "ai"}>
            <div class="space-y-5">
              {/* AI Mode selector — border not border-2, with decorative glow */}
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider mb-3 text-gray-500">
                  {t("settings.aiMode")}
                </h3>
                <div class="flex gap-3">
                  <button
                    class="flex-1 p-3 rounded-xl flex flex-col justify-center items-center cursor-pointer relative overflow-hidden transition-all"
                    classList={{
                      "bg-blue-50/70 border border-blue-400 shadow-sm": provider() === "Local",
                      "bg-white/40 border border-white/80 opacity-70 hover:opacity-100": provider() !== "Local",
                    }}
                    onClick={() => setProvider("Local")}
                  >
                    {/* Decorative glow */}
                    <Show when={provider() === "Local"}>
                      <div class="absolute -right-2 -top-2 w-10 h-10 bg-blue-500 rounded-full opacity-10 blur-xl" />
                    </Show>
                    <span class="text-sm font-semibold text-blue-700 mb-1 flex items-center gap-1">
                      {t("settings.aiModeLocal")} <i class="ph-fill ph-check-circle text-blue-500 text-sm" />
                    </span>
                    <span class="text-[10px] text-gray-500">{t("settings.aiModeLocalDesc")}</span>
                  </button>
                  <button
                    class="flex-1 p-3 rounded-xl flex flex-col justify-center items-center cursor-pointer transition-all"
                    classList={{
                      "bg-blue-50/70 border border-blue-400 shadow-sm": provider() === "OpenAi" || provider() === "Anthropic",
                      "bg-white/40 border border-white/80 opacity-70 hover:opacity-100": provider() !== "OpenAi" && provider() !== "Anthropic",
                    }}
                    onClick={() => setProvider("OpenAi")}
                  >
                    <span class="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1">
                      <i class="ph ph-cloud" /> {t("settings.aiModeCloud")}
                    </span>
                    <span class="text-[10px] text-gray-500">{t("settings.aiModeCloudDesc")}</span>
                  </button>
                </div>
              </div>

              {/* Inference config card */}
              <Show when={provider() === "Local" || provider() === "Auto"}>
                <div class="glass-card rounded-xl p-4 space-y-4">
                  {/* Engine — embedded only */}
                  <div class="flex justify-between items-center text-sm">
                    <span class="font-medium text-gray-700">{t("settings.inferenceEngine")}</span>
                    <div class="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                      <i class="ph ph-cpu" />
                      {t("settings.builtInEngine")}
                    </div>
                  </div>

                  {/* Model selector — embedded model */}
                  <div class="flex justify-between items-center text-sm">
                    <span class="font-medium text-gray-700">{t("ai.model")}</span>
                    <div class="flex items-center gap-2 bg-white/60 border border-white/80 px-3 py-1.5 rounded-lg text-xs shadow-sm w-[180px] justify-between">
                      <span class="truncate">{selectedModel()}</span>
                    </div>
                  </div>

                  {/* Embedded model status & load */}
                  <button onClick={async () => {
                    setEmbeddedStatus("loading");
                    try {
                      await invoke("ai_embedded_load");
                      setEmbeddedStatus("ready");
                    } catch (err) {
                      // If model not found, try downloading first
                      try {
                        setEmbeddedStatus("downloading");
                        await invoke("ai_embedded_download");
                        setEmbeddedStatus("loading");
                        await invoke("ai_embedded_load");
                        setEmbeddedStatus("ready");
                      } catch (e2) {
                        setEmbeddedStatus("error");
                        setMessage(t("settings.modelLoadFailed", { error: String(e2) }));
                      }
                    }
                  }} disabled={embeddedStatus() === "loading" || embeddedStatus() === "downloading"}
                    class="w-full px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-40 border transition-colors bg-blue-50/70 text-blue-700 border-blue-200"
                  >
                    {embeddedStatus() === "loading" ? t("settings.loading") :
                     embeddedStatus() === "downloading" ? t("settings.downloadingModel") :
                     embeddedStatus() === "ready" ? t("settings.modelLoaded") :
                     t("settings.loadModel")}
                  </button>

                  <Show when={embeddedStatus() === "error" && message()}>
                    <div class="rounded-lg p-2 text-xs text-red-600 bg-red-50 border border-red-200">
                      {message()}
                    </div>
                  </Show>

                  {/* Context window — matching ui.html */}
                  <div class="flex justify-between items-center text-sm">
                    <span class="font-medium text-gray-700">{t("settings.contextWindow")}</span>
                    <input type="text" value={String(contextLength())} onInput={(e) => {
                      const v = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!isNaN(v) && v > 0) setContextLength(v);
                    }}
                      class="bg-white/60 border border-white/80 px-3 py-1.5 rounded-lg text-xs w-[180px] shadow-sm outline-none text-right font-mono"
                    />
                  </div>

                  {/* GPU toggle — matching ui.html */}
                  <div class="flex justify-between items-center text-sm pb-1">
                    <span class="font-medium text-gray-700">{t("settings.gpuAcceleration")}</span>
                    <button
                      class="w-9 h-5 rounded-full relative shadow-inner cursor-pointer transition-colors"
                      classList={{ "bg-blue-500": gpuEnabled(), "bg-gray-300": !gpuEnabled() }}
                      onClick={() => {
                        const next = !gpuEnabled();
                        setGpuEnabled(next);
                        invoke("set_setting", { key: "gpu_enabled", value: String(next) }).catch(() => {});
                      }}
                    >
                      <div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform"
                        style={{ left: gpuEnabled() ? "18px" : "2px" }}
                      />
                    </button>
                  </div>

                  {/* Model running status card */}
                  <Show when={embeddedStatus() === "ready"}>
                    <div class="bg-[#f0fdf4]/60 border border-green-200/60 p-3 rounded-lg flex items-center justify-between">
                      <div>
                        <div class="flex items-center gap-1.5 text-green-700 text-xs font-semibold mb-0.5">
                          <span class="relative flex h-2 w-2">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                          </span>
                          {t("settings.modelRunning")}
                        </div>
                        <div class="text-[9px] text-green-600/70 font-mono">{t("settings.modelInfo")}</div>
                      </div>
                    </div>
                  </Show>
                </div>
              </Show>

              {/* Cloud API settings */}
              <Show when={provider() === "OpenAi" || provider() === "Auto"}>
                <div class="space-y-3">
                  <div>
                    <label class="block mb-1 text-xs font-medium text-gray-500">{t("ai.apiKey")}</label>
                    <input type="password" value={openaiKey()} onInput={(e) => setOpenaiKey((e.target as HTMLInputElement).value)}
                      placeholder="sk-..." class="w-full border border-white/80 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white/50 text-gray-700" />
                  </div>
                  <div>
                    <label class="block mb-1 text-xs font-medium text-gray-500">{t("ai.endpoint")}</label>
                    <input type="text" value={openaiEndpoint()} onInput={(e) => setOpenaiEndpoint((e.target as HTMLInputElement).value)}
                      placeholder="https://api.openai.com/v1" class="w-full border border-white/80 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white/50 text-gray-700" />
                  </div>
                  <div>
                    <label class="block mb-1 text-xs font-medium text-gray-500">{t("ai.model")}</label>
                    <input type="text" value={openaiModel()} onInput={(e) => setOpenaiModel((e.target as HTMLInputElement).value)}
                      placeholder="gpt-4o-mini" class="w-full border border-white/80 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white/50 text-gray-700" />
                  </div>
                </div>
              </Show>

              <Show when={provider() === "Anthropic"}>
                <div class="space-y-3">
                  <div>
                    <label class="block mb-1 text-xs font-medium text-gray-500">{t("ai.apiKey")}</label>
                    <input type="password" value={anthropicKey()} onInput={(e) => setAnthropicKey((e.target as HTMLInputElement).value)}
                      placeholder="sk-ant-..." class="w-full border border-white/80 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white/50 text-gray-700" />
                  </div>
                  <div>
                    <label class="block mb-1 text-xs font-medium text-gray-500">{t("ai.model")}</label>
                    <input type="text" value={anthropicModel()} onInput={(e) => setAnthropicModel((e.target as HTMLInputElement).value)}
                      placeholder="claude-sonnet-4-20250514" class="w-full border border-white/80 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white/50 text-gray-700" />
                  </div>
                </div>
              </Show>

              {/* Privacy & Storage cards — matching ui.html grid layout */}
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <h3 class="text-[11px] font-bold text-gray-500 mb-2 uppercase">{t("settings.privacyAndData")}</h3>
                  <div class="glass-card rounded-xl p-3 space-y-3">
                    <div class="flex justify-between items-center">
                      <div class="text-xs text-gray-700">{t("settings.privacyFirst")}<br /><span class="text-[9px] text-gray-400">{monitoringEnabled() ? t("settings.localMode") : "Monitoring paused"}</span></div>
                      <button
                        class="w-7 h-4 rounded-full relative cursor-pointer transition-colors"
                        classList={{ "bg-blue-500": monitoringEnabled(), "bg-gray-300": !monitoringEnabled() }}
                        onClick={async () => {
                          try {
                            const active = await invoke<boolean>("toggle_monitoring");
                            setMonitoringEnabled(active);
                          } catch {}
                        }}
                      >
                        <div class="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform"
                          style={{ left: monitoringEnabled() ? "14px" : "2px" }}
                        />
                      </button>
                    </div>
                    <div class="flex justify-between items-center pt-2 border-t border-white/30 relative">
                      <div class="text-xs text-gray-700">{t("settings.autoCleanup")}</div>
                      <button
                        class="text-xs bg-white/50 px-2 py-0.5 rounded border border-white/80 cursor-pointer flex items-center gap-1"
                        onClick={() => setShowCleanupDropdown((v) => !v)}
                      >
                        {t("settings.afterDays", { n: cleanupDays() })} <i class="ph ph-caret-down text-[10px]" />
                      </button>
                      <Show when={showCleanupDropdown()}>
                        <div class="absolute right-0 top-7 z-50 bg-white/95 backdrop-blur-sm border border-white/80 rounded-lg shadow-lg py-1 min-w-[80px]">
                          {([7, 14, 30, 60, 90] as const).map((d) => (
                            <button
                              class="w-full text-left px-3 py-1 text-xs hover:bg-blue-50 transition-colors"
                              classList={{ "text-blue-600 font-medium": cleanupDays() === d, "text-gray-600": cleanupDays() !== d }}
                              onClick={() => {
                                setCleanupDays(d);
                                setShowCleanupDropdown(false);
                                invoke("set_setting", { key: "cleanup_days", value: String(d) }).catch(() => {});
                              }}
                            >
                              {t(`settings.days${d}`)}
                            </button>
                          ))}
                        </div>
                      </Show>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 class="text-[11px] font-bold text-gray-500 mb-2 uppercase">{t("settings.storageStatus")}</h3>
                  <div class="glass-card rounded-xl p-3 h-full flex flex-col justify-between">
                    <div>
                      <div class="text-[10px] text-gray-500 mb-0.5">{t("settings.used")}</div>
                      <div class="flex items-baseline gap-1 mb-1.5">
                        <span class="text-sm font-bold text-gray-700">{formatSize(storageSize())}</span>
                        <span class="text-[10px] text-gray-400">{itemCount()} items</span>
                      </div>
                      <div class="w-full h-1.5 bg-gray-200/50 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (storageSize() / (50 * 1024 * 1024 * 1024)) * 100)}%` }} />
                      </div>
                    </div>
                    <button class="w-full mt-2 bg-white/60 hover:bg-white/80 border border-white/80 rounded py-1 text-[10px] text-gray-600 transition-colors shadow-sm disabled:opacity-40"
                      disabled={cleaning()}
                      onClick={async () => {
                        setCleaning(true);
                        setCleanMessage("");
                        try {
                          const count = await invoke<number>("clean_old_items", { days: cleanupDays() });
                          setCleanMessage(count > 0 ? t("settings.cleaned", { n: String(count) }) : t("settings.noOldItems"));
                          await loadStorageStats();
                          await loadHistory();
                          setTimeout(() => setCleanMessage(""), 3000);
                        } catch (e) {
                          setCleanMessage(`Error: ${e}`);
                        } finally {
                          setCleaning(false);
                        }
                      }}
                    >{cleaning() ? t("settings.cleaning") : t("settings.cleanOldData")}</button>
                    <Show when={cleanMessage()}>
                      <p class="text-[10px] mt-1 text-center" classList={{
                        "text-green-500": !cleanMessage().startsWith("Error"),
                        "text-red-500": cleanMessage().startsWith("Error"),
                      }}>{cleanMessage()}</p>
                    </Show>
                    <button class="w-full mt-1 bg-white/60 hover:bg-white/80 border border-white/80 rounded py-1 text-[10px] text-gray-600 transition-colors shadow-sm disabled:opacity-40"
                      disabled={importing()}
                      onClick={async () => {
                        const selected = await open({ filters: [{ name: "ZIP", extensions: ["zip"] }] });
                        if (!selected) return;
                        setImporting(true);
                        setImportMessage("");
                        try {
                          const count = await invoke<number>("import_items", { path: selected });
                          setImportMessage(t("settings.imported", { n: String(count) }));
                          await loadStorageStats();
                          await loadHistory();
                          setTimeout(() => setImportMessage(""), 3000);
                        } catch (e) {
                          setImportMessage(t("settings.importError"));
                        } finally {
                          setImporting(false);
                        }
                      }}
                    >{importing() ? "..." : t("settings.importZip")}</button>
                    <Show when={importMessage()}>
                      <p class="text-[10px] mt-1 text-center" classList={{
                        "text-green-500": !importMessage().startsWith("Error"),
                        "text-red-500": importMessage().startsWith("Error"),
                      }}>{importMessage()}</p>
                    </Show>
                  </div>
                </div>
              </div>

              {/* Save */}
              <button onClick={handleSave} disabled={saving()}
                class="w-full px-3 py-2 text-sm font-medium rounded-lg disabled:opacity-40 transition-colors bg-blue-500 text-white"
              >
                {saving() ? t("ai.saving") : t("ai.save")}
              </button>
              <Show when={saveError()}>
                <p class="text-xs text-red-500">{saveError()}</p>
              </Show>
              <Show when={message()}>
                <p class="text-xs" classList={{
                  "text-green-500": !message().startsWith("Error"),
                  "text-red-500": message().startsWith("Error"),
                }}>
                  {message()}
                </p>
              </Show>
            </div>
          </Show>

          {/* Appearance tab */}
          <Show when={activeTab() === "appearance"}>
            <div class="space-y-5">
              <div>
                <label class="block mb-2 text-xs font-medium text-gray-500">{t("settings.theme")}</label>
                <div class="flex gap-2">
                  {([
                    { value: "system", label: t("settings.theme.system") },
                    { value: "dark", label: t("settings.theme.dark") },
                    { value: "light", label: t("settings.theme.light") },
                  ] as { value: ThemeMode; label: string }[]).map((opt) => (
                    <button
                      class="px-4 py-2 text-sm rounded-lg transition-colors"
                      classList={{ "bg-blue-500 text-white": theme() === opt.value }}
                      style={theme() !== opt.value ? { background: "rgba(255,255,255,0.5)", color: "#4b5563", border: "1px solid rgba(255,255,255,0.8)" } : {}}
                      onClick={() => setTheme(opt.value)}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </Show>

          {/* Shortcuts tab */}
          <Show when={activeTab() === "shortcuts"}>
            <div class="space-y-4">
              <h3 class="text-[11px] font-bold text-gray-500 uppercase">{t("settings.shortcuts")}</h3>
              <div class="glass-card rounded-xl p-3 space-y-2">
                <For each={shortcuts()}>
                  {(sc) => {
                    const isRecording = () => recordingAction() === sc.action;
                    const label = () => shortcutLabels[sc.action] || sc.action;

                    const handleKeyDown = async (e: KeyboardEvent) => {
                      if (!isRecording()) return;
                      e.preventDefault();
                      e.stopPropagation();
                      // Escape cancels recording
                      if (e.key === "Escape") {
                        setRecordingAction(null);
                        return;
                      }
                      // Ignore lone modifier presses
                      if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return;
                      const newShortcut = parseKeyboardEvent(e);
                      try {
                        await invoke("update_shortcut", { action: sc.action, shortcut: newShortcut });
                        setShortcuts((prev) =>
                          prev.map((s) => s.action === sc.action ? { ...s, shortcut: newShortcut } : s)
                        );
                      } catch (err) {
                        console.error("Failed to update shortcut:", err);
                      }
                      setRecordingAction(null);
                    };

                    return (
                      <div class="flex justify-between items-center text-xs gap-2">
                        <span class="text-gray-700 truncate">{label()}</span>
                        <div class="flex items-center gap-1.5 shrink-0">
                          <Show when={isRecording()} fallback={
                            <div class="bg-white/60 border border-white/80 px-2 py-0.5 rounded shadow-sm text-gray-600 font-mono text-[11px]">
                              {formatShortcut(sc.shortcut)}
                            </div>
                          }>
                            <div class="bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shadow-sm text-blue-600 text-[11px] animate-pulse">
                              {t("settings.pressNewShortcut")}
                            </div>
                          </Show>
                          <button
                            class="px-2 py-0.5 rounded text-[10px] transition-colors border"
                            classList={{
                              "bg-blue-500 text-white border-blue-500": isRecording(),
                              "bg-white/60 text-gray-500 border-white/80 hover:bg-white/80": !isRecording(),
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isRecording()) {
                                setRecordingAction(null);
                               } else {
                                setRecordingAction(sc.action);
                              }
                            }}
                            onKeyDown={handleKeyDown}
                            tabIndex={0}
                          >
                            {isRecording() ? "\u2715" : t("settings.editShortcut")}
                          </button>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>

          {/* About tab */}
          <Show when={activeTab() === "about"}>
            <div class="text-center py-6 space-y-3">
              <div class="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-500">
                <i class="ph-fill ph-clipboard-text text-white text-2xl" />
              </div>
              <h3 class="text-lg font-bold text-gray-700">{t("settings.aboutVersion")}</h3>
              <Show when={appVersion()}>
                <p class="text-xs text-gray-400">v{appVersion()}</p>
              </Show>
              <p class="text-sm text-gray-400">{t("settings.aboutDesc")}</p>
              <div class="pt-2">
                <span class="text-xs px-2 py-1 rounded-full bg-white/50 text-gray-400">
                  Tauri v2 + SolidJS + SQLite
                </span>
              </div>

              {/* Check for updates */}
              <div class="pt-4 space-y-2">
                <button
                  onClick={checkForUpdate}
                  disabled={updateStatus() === "checking"}
                  class="px-4 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 bg-blue-500 text-white shadow-sm hover:bg-blue-600"
                >
                  {updateStatus() === "checking" ? t("settings.checking") : t("settings.checkUpdate")}
                </button>

                <Show when={updateStatus() === "up-to-date"}>
                  <div class="flex items-center justify-center gap-1.5 text-xs text-green-600">
                    <i class="ph ph-check-circle" />
                    {t("settings.upToDate")}
                  </div>
                </Show>

                <Show when={updateStatus() === "available"}>
                  <div class="space-y-2">
                    <div class="flex items-center justify-center gap-1.5 text-xs text-orange-500">
                      <i class="ph ph-arrow-up-circle" />
                      {t("settings.newVersion", { version: latestVersion() })}
                    </div>
                    <button
                      onClick={() => invoke("open_url", { url: "https://github.com/clear2x/ABoard/releases/latest" })}
                      class="inline-block px-4 py-1.5 text-xs font-medium rounded-lg bg-green-500 text-white shadow-sm hover:bg-green-600 transition-colors"
                    >
                      {t("settings.downloadUpdate")}
                    </button>
                  </div>
                </Show>

                <Show when={updateStatus() === "error"}>
                  <div class="text-xs text-red-400">{t("settings.updateError")}</div>
                </Show>
              </div>

              {/* Author & Links */}
              <div class="pt-6 space-y-2 text-xs text-gray-400">
                <div class="flex items-center justify-center gap-1.5">
                  <i class="ph ph-user-circle" />
                  <span>{t("settings.author")}：突然冷风吹</span>
                </div>
                <div class="flex items-center justify-center gap-1.5">
                  <i class="ph ph-github-logo" />
                  <button onClick={() => invoke("open_url", { url: "https://github.com/clear2x/ABoard" })} class="text-blue-500 hover:underline">GitHub</button>
                </div>
                <div class="flex items-center justify-center gap-1.5">
                  <i class="ph ph-chats-circle" />
                  <span>QQ：1483782149</span>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
