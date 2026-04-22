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

  const inputStyle = {
    "font-size": "var(--font-body)",
    color: "var(--color-text-primary)",
    "background-color": "var(--color-bg-card)",
    "border-color": "var(--color-border)",
  };

  const labelStyle = {
    "font-size": "var(--font-label)",
    color: "var(--color-text-muted)",
    "font-weight": "500" as string,
  };

  return (
    <div class="fixed inset-0 z-40">
      {/* Backdrop */}
      <div class="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={props.onClose} />

      {/* Panel */}
      <div class="absolute top-0 right-0 h-full settings-slide-in flex flex-col overflow-hidden"
        style={{
          width: "var(--settings-panel-width)",
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          "backdrop-filter": "saturate(1.8) blur(var(--blur-glass))",
          "-webkit-backdrop-filter": "saturate(1.8) blur(var(--blur-glass))",
          "box-shadow": "-8px 0 32px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div class="h-10 flex justify-center items-center font-medium text-sm relative border-b"
          style={{ color: "var(--color-text-primary)", "border-color": "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.2)" }}
        >
          {t("settings.title")}
          <button class="absolute right-3 w-6 h-6 rounded flex items-center justify-center hover:bg-white/20 transition-colors"
            style={{ color: "var(--color-text-muted)" }} onClick={props.onClose}>
            <i class="ph ph-x" />
          </button>
        </div>

        {/* Icon tab bar */}
        <div class="flex justify-around items-center px-6 py-4 border-b"
          style={{ "border-color": "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)" }}
        >
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
                style={isActive() ? { color: "var(--color-accent)" } : { color: "var(--color-text-muted)" }}
                onClick={() => setActiveTab(tab.key)}
              >
                <Show when={isActive()} fallback={
                  <i class={`${tab.icon} text-xl`} />
                }>
                  <div class="bg-blue-100/50 dark:bg-blue-900/30 p-1 rounded-md shadow-sm"
                    style={{ border: "1px solid rgba(59,130,246,0.2)" }}>
                    <i class={`${tab.icon} text-xl`} />
                  </div>
                </Show>
                <span class="text-[10px]" classList={{ "font-medium": isActive() }}>
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
                <label class="block mb-2 text-xs font-medium" style={labelStyle}>{t("settings.language")}</label>
                <div class="flex gap-2">
                  <button class="px-4 py-2 text-sm rounded-lg transition-colors"
                    classList={{ "bg-blue-500 text-white": locale() === "zh" }}
                    style={locale() !== "zh" ? { background: "var(--color-bg-card)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" } : {}}
                    onClick={() => setLocale("zh")}
                  >中文</button>
                  <button class="px-4 py-2 text-sm rounded-lg transition-colors"
                    classList={{ "bg-blue-500 text-white": locale() === "en" }}
                    style={locale() !== "en" ? { background: "var(--color-bg-card)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" } : {}}
                    onClick={() => setLocale("en")}
                  >English</button>
                </div>
              </div>
            </div>
          </Show>

          {/* AI Config tab */}
          <Show when={activeTab() === "ai"}>
            <div class="space-y-5">
              {/* AI Mode selector */}
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
                  {t("settings.aiMode")}
                </h3>
                <div class="flex gap-3">
                  <button
                    class="flex-1 p-3 rounded-xl flex flex-col justify-center items-center cursor-pointer relative overflow-hidden transition-all"
                    classList={{
                      "bg-blue-50/70 border-2 border-blue-400 shadow-sm": provider() === "Local",
                      "bg-white/40 border border-white/80 opacity-70 hover:opacity-100": provider() !== "Local",
                    }}
                    onClick={() => setProvider("Local")}
                  >
                    <span class="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-1">
                      {t("settings.aiModeLocal")} <i class="ph-fill ph-check-circle text-blue-500 text-sm" />
                    </span>
                    <span class="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{t("settings.aiModeLocalDesc")}</span>
                  </button>
                  <button
                    class="flex-1 p-3 rounded-xl flex flex-col justify-center items-center cursor-pointer transition-all"
                    classList={{
                      "bg-blue-50/70 border-2 border-blue-400 shadow-sm": provider() === "OpenAi" || provider() === "Anthropic",
                      "bg-white/40 border border-white/80 opacity-70 hover:opacity-100": provider() !== "OpenAi" && provider() !== "Anthropic",
                    }}
                    onClick={() => setProvider("OpenAi")}
                  >
                    <span class="text-sm font-semibold mb-1 flex items-center gap-1" style={{ color: "var(--color-text-primary)" }}>
                      <i class="ph ph-cloud" /> {t("settings.aiModeCloud")}
                    </span>
                    <span class="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{t("settings.aiModeCloudDesc")}</span>
                  </button>
                </div>
              </div>

              {/* Inference config card */}
              <Show when={provider() === "Local" || provider() === "Auto"}>
                <div class="glass-card-ref rounded-xl p-4 space-y-4">
                  {/* Engine radio */}
                  <div class="flex justify-between items-center text-sm">
                    <span class="font-medium" style={{ color: "var(--color-text-secondary)" }}>{t("settings.inferenceEngine")}</span>
                    <div class="flex gap-4 text-xs">
                      <label class="flex items-center gap-1.5 cursor-pointer">
                        <div class="w-3.5 h-3.5 rounded-full border-4 border-blue-500 bg-white outline outline-1 outline-blue-500" />
                        llama.cpp
                      </label>
                      <label class="flex items-center gap-1.5 cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
                        <div class="w-3.5 h-3.5 rounded-full border border-gray-300" />
                        Ollama
                      </label>
                    </div>
                  </div>

                  {/* Detect local */}
                  <button onClick={handleDetectLocal} disabled={detecting()}
                    class="w-full px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-40 border transition-colors"
                    style={{ background: "var(--color-bg-card)", color: "var(--color-text-primary)", "border-color": "var(--color-border)" }}
                  >
                    {detecting() ? t("ai.detecting") : t("ai.detectLocal")}
                  </button>

                  <Show when={localStatus()}>
                    <div class="rounded-lg p-3 text-xs space-y-1.5" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
                      <div class="flex items-center gap-1.5">
                        <span style={{ color: localStatus()!.ollamaAvailable ? "#22c55e" : "#ef4444" }}>
                          {localStatus()!.ollamaAvailable ? "\u2713" : "\u2717"}
                        </span>
                        <span>Ollama</span>
                        <span style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>
                          {localStatus()!.ollamaAvailable ? "(localhost:11434)" : t("ai.notRunning")}
                        </span>
                      </div>
                      <Show when={localStatus()!.ollamaAvailable && localStatus()!.detectedModels.length > 0}>
                        <div class="ml-4 space-y-0.5">
                          <span class="block" style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>{t("ai.detectedModels")}</span>
                          <For each={localStatus()!.detectedModels}>
                            {(model) => <span class="block ml-2" style={{ "font-size": "11px" }}>{model}</span>}
                          </For>
                        </div>
                      </Show>
                      <div class="flex items-center gap-1.5">
                        <span style={{ color: localStatus()!.llamacppAvailable ? "#22c55e" : "#ef4444" }}>
                          {localStatus()!.llamacppAvailable ? "\u2713" : "\u2717"}
                        </span>
                        <span>llama.cpp server</span>
                        <span style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>
                          {localStatus()!.llamacppAvailable ? "(localhost:8080)" : t("ai.notRunning")}
                        </span>
                      </div>
                      <Show when={!localStatus()!.ollamaAvailable && !localStatus()!.llamacppAvailable}>
                        <p class="mt-1" style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>{t("ai.installHint")}</p>
                      </Show>
                    </div>
                  </Show>

                  {/* Context window */}
                  <div class="flex justify-between items-center text-sm">
                    <span class="font-medium" style={{ color: "var(--color-text-secondary)" }}>{t("settings.contextWindow")}</span>
                    <input type="text" value="8192"
                      class="border px-3 py-1.5 rounded-lg text-xs w-[140px] text-right font-mono outline-none"
                      style={inputStyle}
                    />
                  </div>

                  {/* GPU toggle */}
                  <div class="flex justify-between items-center text-sm pb-1">
                    <span class="font-medium" style={{ color: "var(--color-text-secondary)" }}>{t("settings.gpuAcceleration")}</span>
                    <button
                      class="w-9 h-5 rounded-full relative shadow-inner cursor-pointer transition-colors"
                      style={{ background: gpuEnabled() ? "var(--color-accent)" : "var(--color-border)" }}
                      onClick={() => setGpuEnabled(!gpuEnabled())}
                    >
                      <div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform"
                        style={{ left: gpuEnabled() ? "18px" : "2px" }}
                      />
                    </button>
                  </div>
                </div>
              </Show>

              {/* Cloud API settings */}
              <Show when={provider() === "OpenAi" || provider() === "Auto"}>
                <div class="space-y-3">
                  <div>
                    <label class="block mb-1 text-xs font-medium" style={labelStyle}>{t("ai.apiKey")}</label>
                    <input type="password" value={openaiKey()} onInput={(e) => setOpenaiKey((e.target as HTMLInputElement).value)}
                      placeholder="sk-..." class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label class="block mb-1 text-xs font-medium" style={labelStyle}>{t("ai.endpoint")}</label>
                    <input type="text" value={openaiEndpoint()} onInput={(e) => setOpenaiEndpoint((e.target as HTMLInputElement).value)}
                      placeholder="https://api.openai.com/v1" class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label class="block mb-1 text-xs font-medium" style={labelStyle}>{t("ai.model")}</label>
                    <input type="text" value={openaiModel()} onInput={(e) => setOpenaiModel((e.target as HTMLInputElement).value)}
                      placeholder="gpt-4o-mini" class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                  </div>
                </div>
              </Show>

              <Show when={provider() === "Anthropic"}>
                <div class="space-y-3">
                  <div>
                    <label class="block mb-1 text-xs font-medium" style={labelStyle}>{t("ai.apiKey")}</label>
                    <input type="password" value={anthropicKey()} onInput={(e) => setAnthropicKey((e.target as HTMLInputElement).value)}
                      placeholder="sk-ant-..." class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label class="block mb-1 text-xs font-medium" style={labelStyle}>{t("ai.model")}</label>
                    <input type="text" value={anthropicModel()} onInput={(e) => setAnthropicModel((e.target as HTMLInputElement).value)}
                      placeholder="claude-sonnet-4-20250514" class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                  </div>
                </div>
              </Show>

              {/* Save */}
              <button onClick={handleSave} disabled={saving()}
                class="w-full px-3 py-2 text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
                style={{ "background-color": "var(--color-accent)", color: "#fff" }}
              >
                {saving() ? t("ai.saving") : t("ai.save")}
              </button>
              <Show when={message()}>
                <p class="text-xs" style={{ color: message().startsWith("Error") ? "var(--color-destructive)" : "#22c55e" }}>
                  {message()}
                </p>
              </Show>
            </div>
          </Show>

          {/* Appearance tab */}
          <Show when={activeTab() === "appearance"}>
            <div class="space-y-5">
              <div>
                <label class="block mb-2 text-xs font-medium" style={labelStyle}>{t("settings.theme")}</label>
                <div class="flex gap-2">
                  {([
                    { value: "system", label: t("settings.theme.system") },
                    { value: "dark", label: t("settings.theme.dark") },
                    { value: "light", label: t("settings.theme.light") },
                  ] as { value: ThemeMode; label: string }[]).map((opt) => (
                    <button
                      class="px-4 py-2 text-sm rounded-lg transition-colors"
                      classList={{ "bg-blue-500 text-white": theme() === opt.value }}
                      style={theme() !== opt.value ? { background: "var(--color-bg-card)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" } : {}}
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
              <h3 class="text-[11px] font-bold uppercase" style={{ color: "var(--color-text-muted)" }}>{t("settings.shortcuts")}</h3>
              <div class="glass-card-ref rounded-xl p-3 space-y-2">
                {[
                  { desc: t("settings.showHideWindow"), key: "\u2325 V" },
                  { desc: t("settings.quickPastePanel"), key: "\u2318 \u21E7 V" },
                ].map((s) => (
                  <div class="flex justify-between items-center text-xs">
                    <span style={{ color: "var(--color-text-secondary)" }}>{s.desc}</span>
                    <div class="flex items-center gap-1 px-2 py-0.5 rounded shadow-sm"
                      style={{ background: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.6)", color: "var(--color-text-secondary)" }}
                    >
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
              <div class="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, var(--color-accent), #8b5cf6)" }}
              >
                <i class="ph-fill ph-clipboard-text text-white text-2xl" />
              </div>
              <h3 class="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>ABoard v0.1.0</h3>
              <p class="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("settings.aboutDesc")}</p>
              <div class="pt-2">
                <span class="text-xs px-2 py-1 rounded-full" style={{ background: "var(--color-bg-card)", color: "var(--color-text-muted)" }}>
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
