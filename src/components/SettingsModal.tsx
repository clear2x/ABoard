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

const TABS = ["general", "ai", "shortcuts", "about"] as const;
type Tab = typeof TABS[number];

export default function SettingsModal(props: Props) {
  const [activeTab, setActiveTab] = createSignal<Tab>("general");

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

  onMount(async () => {
    try {
      const config = await invoke<AiConfig>("ai_get_config");
      setProvider(config.active_provider || "Auto");
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

  const TAB_LABELS: Record<Tab, string> = {
    general: t("settings.title"),
    ai: t("ai.title"),
    shortcuts: t("settings.shortcuts"),
    about: t("settings.about"),
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center modal-overlay animate-fade-in">
      {/* Modal body */}
      <div
        class="relative z-10 w-[560px] max-h-[80vh] rounded-[var(--radius-xl)] animate-scale-in overflow-hidden"
        style={{
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          "box-shadow": "var(--shadow-elevated)",
          "backdrop-filter": "saturate(1.8) blur(var(--blur-glass))",
          "-webkit-backdrop-filter": "saturate(1.8) blur(var(--blur-glass))",
        }}
      >
        {/* Modal header */}
        <div class="glass px-5 py-3 flex items-center justify-between" style={{ "border-bottom": "1px solid var(--glass-border)" }}>
          <h2 class="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>{t("settings.title")}</h2>
          <button
            class="w-7 h-7 rounded-lg flex items-center justify-center transition-smooth hover:bg-[var(--color-bg-card-hover)]"
            style={{ color: "var(--color-text-muted)" }}
            onClick={props.onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div class="flex px-5 pt-3 gap-1" style={{ "border-bottom": "1px solid var(--glass-border)" }}>
          {TABS.map((tab) => (
            <button
              class="px-3 py-2 text-xs font-medium transition-smooth rounded-t-[var(--radius-sm)]"
              style={{
                color: activeTab() === tab ? "var(--color-accent)" : "var(--color-text-muted)",
                "border-bottom": activeTab() === tab ? "2px solid var(--color-accent)" : "2px solid transparent",
                "margin-bottom": "-1px",
              }}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div class="p-5 overflow-y-auto" style={{ "max-height": "calc(80vh - 120px)" }}>
          <Show when={activeTab() === "general"}>
            <div class="space-y-5">
              {/* Language */}
              <div>
                <label class="block mb-2 text-xs font-medium" style={labelStyle}>{t("settings.language")}</label>
                <div class="flex gap-2">
                  <button
                    class="px-4 py-2 text-sm rounded-[var(--radius-sm)] transition-smooth"
                    style={{
                      "background-color": locale() === "zh" ? "var(--color-accent)" : "var(--color-bg-card)",
                      color: locale() === "zh" ? "#fff" : "var(--color-text-secondary)",
                      border: "1px solid var(--color-border)",
                    }}
                    onClick={() => setLocale("zh")}
                  >中文</button>
                  <button
                    class="px-4 py-2 text-sm rounded-[var(--radius-sm)] transition-smooth"
                    style={{
                      "background-color": locale() === "en" ? "var(--color-accent)" : "var(--color-bg-card)",
                      color: locale() === "en" ? "#fff" : "var(--color-text-secondary)",
                      border: "1px solid var(--color-border)",
                    }}
                    onClick={() => setLocale("en")}
                  >English</button>
                </div>
              </div>

              {/* Theme */}
              <div>
                <label class="block mb-2 text-xs font-medium" style={labelStyle}>{t("settings.theme")}</label>
                <div class="flex gap-2">
                  {([
                    { value: "system", label: t("settings.theme.system") },
                    { value: "dark", label: t("settings.theme.dark") },
                    { value: "light", label: t("settings.theme.light") },
                  ] as { value: ThemeMode; label: string }[]).map((opt) => (
                    <button
                      class="px-4 py-2 text-sm rounded-[var(--radius-sm)] transition-smooth"
                      style={{
                        "background-color": theme() === opt.value ? "var(--color-accent)" : "var(--color-bg-card)",
                        color: theme() === opt.value ? "#fff" : "var(--color-text-secondary)",
                        border: "1px solid var(--color-border)",
                      }}
                      onClick={() => setTheme(opt.value)}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </Show>

          <Show when={activeTab() === "ai"}>
            <div class="space-y-4">
              {/* Provider selection */}
              <div>
                <label class="block mb-2 text-xs font-medium" style={labelStyle}>{t("ai.provider")}</label>
                <select
                  value={provider()}
                  onChange={(e) => setProvider((e.target as HTMLSelectElement).value)}
                  class="w-full border rounded-[var(--radius-sm)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  style={inputStyle}
                >
                  <option value="Local">{t("ai.provider.local")}</option>
                  <option value="Auto">{t("ai.provider.auto")}</option>
                  <option value="OpenAi">{t("ai.provider.openai")}</option>
                  <option value="Anthropic">{t("ai.provider.anthropic")}</option>
                </select>
              </div>

              {/* Local provider detection */}
              <Show when={provider() === "Local" || provider() === "Auto"}>
                <div class="space-y-2">
                  <button
                    onClick={handleDetectLocal}
                    disabled={detecting()}
                    class="w-full px-3 py-2 text-xs font-medium rounded-[var(--radius-sm)] transition-smooth disabled:opacity-40 border"
                    style={{
                      "background-color": "var(--color-bg-card)",
                      color: "var(--color-text-primary)",
                      "border-color": "var(--color-border)",
                    }}
                  >
                    {detecting() ? t("ai.detecting") : t("ai.detectLocal")}
                  </button>

                  <Show when={localStatus()}>
                    <div class="rounded-[var(--radius-sm)] p-3 text-xs space-y-1.5" style={{ "background-color": "var(--color-bg-card)", "border": "1px solid var(--color-border)" }}>
                      <div class="flex items-center gap-1.5">
                        <span style={{ color: localStatus()!.ollamaAvailable ? "#22c55e" : "#ef4444" }}>
                          {localStatus()!.ollamaAvailable ? "\u2713" : "\u2717"}
                        </span>
                        <span style={{ color: "var(--color-text-primary)" }}>Ollama</span>
                        <span style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>
                          {localStatus()!.ollamaAvailable ? "(localhost:11434)" : t("ai.notRunning")}
                        </span>
                      </div>
                      <Show when={localStatus()!.ollamaAvailable && localStatus()!.detectedModels.length > 0}>
                        <div class="ml-4 space-y-0.5">
                          <span class="block" style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>{t("ai.detectedModels")}</span>
                          <For each={localStatus()!.detectedModels}>
                            {(model) => (
                              <span class="block ml-2" style={{ color: "var(--color-text-primary)", "font-size": "11px" }}>{model}</span>
                            )}
                          </For>
                        </div>
                      </Show>
                      <div class="flex items-center gap-1.5">
                        <span style={{ color: localStatus()!.llamacppAvailable ? "#22c55e" : "#ef4444" }}>
                          {localStatus()!.llamacppAvailable ? "\u2713" : "\u2717"}
                        </span>
                        <span style={{ color: "var(--color-text-primary)" }}>llama.cpp server</span>
                        <span style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>
                          {localStatus()!.llamacppAvailable ? "(localhost:8080)" : t("ai.notRunning")}
                        </span>
                      </div>
                      <Show when={!localStatus()!.ollamaAvailable && !localStatus()!.llamacppAvailable}>
                        <p class="mt-1" style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>
                          {t("ai.installHint")}
                        </p>
                      </Show>
                    </div>
                  </Show>
                </div>
              </Show>

              {/* OpenAI settings */}
              <Show when={provider() === "OpenAi" || provider() === "Auto"}>
                <div class="space-y-3">
                  <div>
                    <label class="block mb-1 text-xs font-medium" style={labelStyle}>{t("ai.apiKey")}</label>
                    <input
                      type="password"
                      value={openaiKey()}
                      onInput={(e) => setOpenaiKey((e.target as HTMLInputElement).value)}
                      placeholder="sk-..."
                      class="w-full border rounded-[var(--radius-sm)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label class="block mb-1 text-xs font-medium" style={labelStyle}>{t("ai.endpoint")}</label>
                    <input
                      type="text"
                      value={openaiEndpoint()}
                      onInput={(e) => setOpenaiEndpoint((e.target as HTMLInputElement).value)}
                      placeholder="https://api.openai.com/v1"
                      class="w-full border rounded-[var(--radius-sm)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label class="block mb-1 text-xs font-medium" style={labelStyle}>{t("ai.model")}</label>
                    <input
                      type="text"
                      value={openaiModel()}
                      onInput={(e) => setOpenaiModel((e.target as HTMLInputElement).value)}
                      placeholder="gpt-4o-mini"
                      class="w-full border rounded-[var(--radius-sm)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </Show>

              {/* Anthropic settings */}
              <Show when={provider() === "Anthropic" || provider() === "Auto"}>
                <div class="space-y-3">
                  <div>
                    <label class="block mb-1 text-xs font-medium" style={labelStyle}>{t("ai.apiKey")}</label>
                    <input
                      type="password"
                      value={anthropicKey()}
                      onInput={(e) => setAnthropicKey((e.target as HTMLInputElement).value)}
                      placeholder="sk-ant-..."
                      class="w-full border rounded-[var(--radius-sm)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label class="block mb-1 text-xs font-medium" style={labelStyle}>{t("ai.model")}</label>
                    <input
                      type="text"
                      value={anthropicModel()}
                      onInput={(e) => setAnthropicModel((e.target as HTMLInputElement).value)}
                      placeholder="claude-sonnet-4-20250514"
                      class="w-full border rounded-[var(--radius-sm)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </Show>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={saving()}
                class="w-full px-3 py-2 text-sm font-medium rounded-[var(--radius-sm)] transition-smooth disabled:opacity-40"
                style={{
                  "background-color": "var(--color-accent)",
                  color: "#fff",
                }}
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

          <Show when={activeTab() === "shortcuts"}>
            <div class="space-y-3">
              {[
                { key: "Cmd+Shift+V", desc: t("shortcut.togglePopup") },
                { key: "Cmd+Shift+J", desc: t("shortcut.quickCycle") },
                { key: "Cmd+P", desc: t("shortcut.pinItem") },
                { key: "Delete", desc: t("shortcut.deleteItem") },
              ].map((s) => (
                <div class="flex items-center justify-between py-1.5">
                  <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>{s.desc}</span>
                  <kbd
                    class="px-2 py-1 rounded text-xs font-mono"
                    style={{
                      "background-color": "var(--color-bg-card)",
                      color: "var(--color-text-muted)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </Show>

          <Show when={activeTab() === "about"}>
            <div class="text-center py-6 space-y-3">
              <div class="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--color-accent), #8b5cf6)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
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
