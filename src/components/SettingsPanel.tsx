import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { theme, setTheme, type ThemeMode } from "../stores/theme";
import { locale, setLocale, t } from "../stores/i18n";
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
  { key: "general", icon: "ph-faders" },
  { key: "ai", icon: "ph-fill ph-brain" },
  { key: "appearance", icon: "ph-palette" },
  { key: "shortcuts", icon: "ph-keyboard" },
  { key: "about", icon: "ph-info" },
] as const;

type Tab = typeof TABS[number]["key"];

export default function SettingsPanel(props: Props) {
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
  const [engine, setEngine] = createSignal<"llamacpp" | "ollama">("llamacpp");
  const [selectedModel, setSelectedModel] = createSignal("llama3.1:8b-instruct-q4_k_m");

  onMount(async () => {
    try {
      const config = await invoke<AiConfig>("ai_get_config");
      setProvider(config.active_provider || "Local");
      setOpenaiKey(config.openai_api_key || "");
      setOpenaiEndpoint(config.openai_endpoint || "https://api.openai.com/v1");
      setOpenaiModel(config.openai_model || "gpt-4o-mini");
      setAnthropicKey(config.anthropic_api_key || "");
      setAnthropicModel(config.anthropic_model || "claude-sonnet-4-20250514");
    } catch (err) {
      console.warn("Failed to load AI config:", err);
    }
  });

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const config: AiConfig = {
        active_provider: provider(),
        context_length: 2048,
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
    if (e.key === "Escape") props.onClose();
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
        <div class="h-10 flex justify-center items-center font-medium text-sm text-gray-700 relative border-b border-white/40 bg-white/30">
          {t("settings.title")}
          <button class="absolute right-3 w-6 h-6 rounded flex items-center justify-center hover:bg-white/20 transition-colors text-gray-400"
            onClick={props.onClose}>
            <i class="ph ph-x" />
          </button>
        </div>

        {/* Icon tab bar — bg-white/10 border-white/30 matching ui.html */}
        <div class="flex justify-around items-center px-6 py-4 border-b border-white/30 bg-white/10">
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
                class="flex flex-col items-center gap-1.5 cursor-pointer transition-opacity"
                classList={{ "opacity-50 hover:opacity-100": !isActive() }}
                style={isActive() ? { color: "#2563eb" } : { color: "#9ca3af" }}
                onClick={() => setActiveTab(tab.key)}
              >
                <Show when={isActive()} fallback={
                  <i class={`${tab.icon} text-xl`} />
                }>
                  <div class="bg-blue-100/50 p-1 rounded-md shadow-sm border border-blue-200/50">
                    <i class={`${tab.icon} text-xl text-blue-600`} />
                  </div>
                </Show>
                <span class="text-[10px]" classList={{ "font-medium text-blue-600": isActive() }}>
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
                  >中文</button>
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
                  {/* Engine radio */}
                  <div class="flex justify-between items-center text-sm">
                    <span class="font-medium text-gray-700">{t("settings.inferenceEngine")}</span>
                    <div class="flex gap-4 text-xs">
                      <label class="flex items-center gap-1.5 cursor-pointer">
                        <div class="w-3.5 h-3.5 rounded-full border-4 border-blue-500 bg-white outline outline-1 outline-blue-500" />
                        llama.cpp
                      </label>
                      <label class="flex items-center gap-1.5 cursor-pointer text-gray-500">
                        <div class="w-3.5 h-3.5 rounded-full border border-gray-300" />
                        Ollama
                      </label>
                    </div>
                  </div>

                  {/* Model selector — matching ui.html */}
                  <div class="flex justify-between items-center text-sm">
                    <span class="font-medium text-gray-700">{t("ai.model")}</span>
                    <div class="flex items-center gap-2 bg-white/60 border border-white/80 px-3 py-1.5 rounded-lg text-xs cursor-pointer shadow-sm w-[180px] justify-between">
                      <span class="truncate">{selectedModel()}</span>
                      <i class="ph ph-caret-down text-gray-400 shrink-0" />
                    </div>
                  </div>

                  {/* Detect local */}
                  <button onClick={handleDetectLocal} disabled={detecting()}
                    class="w-full px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-40 border transition-colors bg-white/50 text-gray-700 border-white/80"
                  >
                    {detecting() ? t("ai.detecting") : t("ai.detectLocal")}
                  </button>

                  <Show when={localStatus()}>
                    <div class="rounded-lg p-3 text-xs space-y-1.5 bg-white/50 border border-white/80">
                      <div class="flex items-center gap-1.5">
                        <span style={{ color: localStatus()!.ollamaAvailable ? "#22c55e" : "#ef4444" }}>
                          {localStatus()!.ollamaAvailable ? "\u2713" : "\u2717"}
                        </span>
                        <span class="text-gray-700">Ollama</span>
                        <span class="text-gray-400 text-[11px]">
                          {localStatus()!.ollamaAvailable ? "(localhost:11434)" : t("ai.notRunning")}
                        </span>
                      </div>
                      <Show when={localStatus()!.ollamaAvailable && localStatus()!.detectedModels.length > 0}>
                        <div class="ml-4 space-y-0.5">
                          <span class="block text-gray-400 text-[11px]">{t("ai.detectedModels")}</span>
                          <For each={localStatus()!.detectedModels}>
                            {(model) => <span class="block ml-2 text-gray-600 text-[11px]">{model}</span>}
                          </For>
                        </div>
                      </Show>
                      <div class="flex items-center gap-1.5">
                        <span style={{ color: localStatus()!.llamacppAvailable ? "#22c55e" : "#ef4444" }}>
                          {localStatus()!.llamacppAvailable ? "\u2713" : "\u2717"}
                        </span>
                        <span class="text-gray-700">llama.cpp server</span>
                        <span class="text-gray-400 text-[11px]">
                          {localStatus()!.llamacppAvailable ? "(localhost:8080)" : t("ai.notRunning")}
                        </span>
                      </div>
                      <Show when={!localStatus()!.ollamaAvailable && !localStatus()!.llamacppAvailable}>
                        <p class="mt-1 text-gray-400 text-[11px]">{t("ai.installHint")}</p>
                      </Show>
                    </div>
                  </Show>

                  {/* Context window — matching ui.html */}
                  <div class="flex justify-between items-center text-sm">
                    <span class="font-medium text-gray-700">{t("settings.contextWindow")}</span>
                    <input type="text" value="8192"
                      class="bg-white/60 border border-white/80 px-3 py-1.5 rounded-lg text-xs w-[180px] shadow-sm outline-none text-right font-mono"
                    />
                  </div>

                  {/* GPU toggle — matching ui.html */}
                  <div class="flex justify-between items-center text-sm pb-1">
                    <span class="font-medium text-gray-700">{t("settings.gpuAcceleration")}</span>
                    <button
                      class="w-9 h-5 rounded-full relative shadow-inner cursor-pointer transition-colors"
                      classList={{ "bg-blue-500": gpuEnabled(), "bg-gray-300": !gpuEnabled() }}
                      onClick={() => setGpuEnabled(!gpuEnabled())}
                    >
                      <div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform"
                        style={{ left: gpuEnabled() ? "18px" : "2px" }}
                      />
                    </button>
                  </div>

                  {/* Model running status card — matching ui.html */}
                  <div class="bg-[#f0fdf4]/60 border border-green-200/60 p-3 rounded-lg flex items-center justify-between">
                    <div>
                      <div class="flex items-center gap-1.5 text-green-700 text-xs font-semibold mb-0.5">
                        <span class="relative flex h-2 w-2">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        模型运行中
                      </div>
                      <div class="text-[9px] text-green-600/70 font-mono">llama.cpp · 线程: 8 · 上下文: 8192</div>
                    </div>
                    <div class="text-right flex flex-col items-end">
                      <div class="text-[10px] text-green-600/70 mb-0.5">Tokens/s</div>
                      <div class="text-green-600 font-mono font-bold text-sm flex items-center gap-1">
                        45.2 <i class="ph ph-trend-up text-xs" />
                      </div>
                    </div>
                  </div>
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
                  <h3 class="text-[11px] font-bold text-gray-500 mb-2 uppercase">隐私与数据</h3>
                  <div class="glass-card rounded-xl p-3 space-y-3">
                    <div class="flex justify-between items-center">
                      <div class="text-xs text-gray-700">隐私优先<br /><span class="text-[9px] text-gray-400">(本地模式)</span></div>
                      <div class="w-7 h-4 bg-blue-500 rounded-full relative cursor-pointer">
                        <div class="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full" />
                      </div>
                    </div>
                    <div class="flex justify-between items-center pt-2 border-t border-white/30">
                      <div class="text-xs text-gray-700">自动清理</div>
                      <div class="text-xs bg-white/50 px-2 py-0.5 rounded border border-white/80 cursor-pointer flex items-center gap-1">30 天后 <i class="ph ph-caret-down text-[10px]" /></div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 class="text-[11px] font-bold text-gray-500 mb-2 uppercase">存储状态</h3>
                  <div class="glass-card rounded-xl p-3 h-full flex flex-col justify-between">
                    <div>
                      <div class="text-[10px] text-gray-500 mb-0.5">已使用</div>
                      <div class="flex items-baseline gap-1 mb-1.5">
                        <span class="text-sm font-bold text-gray-700">12.4 GB</span><span class="text-[9px] text-gray-400">/ 50 GB</span>
                      </div>
                      <div class="w-full h-1.5 bg-gray-200/50 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-500 rounded-full" style={{ width: "25%" }} />
                      </div>
                    </div>
                    <button class="w-full mt-2 bg-white/60 hover:bg-white/80 border border-white/80 rounded py-1 text-[10px] text-gray-600 transition-colors shadow-sm">清理旧数据</button>
                  </div>
                </div>
              </div>

              {/* Save */}
              <button onClick={handleSave} disabled={saving()}
                class="w-full px-3 py-2 text-sm font-medium rounded-lg disabled:opacity-40 transition-colors bg-blue-500 text-white"
              >
                {saving() ? t("ai.saving") : t("ai.save")}
              </button>
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

          {/* Shortcuts tab — matching ui.html */}
          <Show when={activeTab() === "shortcuts"}>
            <div class="space-y-4">
              <h3 class="text-[11px] font-bold text-gray-500 uppercase">{t("settings.shortcuts")}</h3>
              <div class="glass-card rounded-xl p-3 space-y-2">
                {[
                  { desc: t("settings.showHideWindow"), key: "\u2325 V" },
                  { desc: t("settings.quickPastePanel"), key: "\u2318 \u21E7 V" },
                ].map((s) => (
                  <div class="flex justify-between items-center text-xs">
                    <span class="text-gray-700">{s.desc}</span>
                    <div class="flex items-center gap-1 bg-white/60 border border-white/80 px-2 py-0.5 rounded shadow-sm text-gray-600">
                      {s.key}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Show>

          {/* About tab */}
          <Show when={activeTab() === "about"}>
            <div class="text-center py-6 space-y-3">
              <div class="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-500">
                <i class="ph-fill ph-clipboard-text text-white text-2xl" />
              </div>
              <h3 class="text-lg font-bold text-gray-700">ABoard v0.1.0</h3>
              <p class="text-sm text-gray-400">{t("settings.aboutDesc")}</p>
              <div class="pt-2">
                <span class="text-xs px-2 py-1 rounded-full bg-white/50 text-gray-400">
                  Tauri v2 + SolidJS + SQLite
                </span>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
