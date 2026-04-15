import { createSignal, onMount, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

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

export default function AiSettings() {
  const [provider, setProvider] = createSignal("Local");
  const [openaiKey, setOpenaiKey] = createSignal("");
  const [openaiEndpoint, setOpenaiEndpoint] = createSignal("https://api.openai.com/v1");
  const [openaiModel, setOpenaiModel] = createSignal("gpt-4o-mini");
  const [anthropicKey, setAnthropicKey] = createSignal("");
  const [anthropicModel, setAnthropicModel] = createSignal("claude-sonnet-4-20250514");
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal("");

  // Local provider detection state
  const [detecting, setDetecting] = createSignal(false);
  const [localStatus, setLocalStatus] = createSignal<LocalProviderStatus | null>(null);

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
      setMessage("Saved");
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

  const labelStyle = {
    "font-size": "var(--font-label)",
    color: "var(--color-text-muted)",
    "font-weight": "var(--weight-body)" as string,
  };

  const inputStyle = {
    "font-size": "var(--font-body)",
    color: "var(--color-text-primary)",
    "background-color": "var(--color-bg-card)",
    "border-color": "var(--color-border)",
  };

  return (
    <div>
      <h3 class="text-sm font-semibold tracking-tight mb-2" style={{ color: "var(--color-text-primary)" }}>
        Provider
      </h3>

      <div class="mb-3">
        <select
          value={provider()}
          onChange={(e) => setProvider((e.target as HTMLSelectElement).value)}
          class="w-full border rounded-[var(--radius-sm)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          style={inputStyle}
        >
          <option value="Local">Local (Ollama / llama.cpp)</option>
          <option value="OpenAi">OpenAI Compatible</option>
          <option value="Anthropic">Anthropic</option>
        </select>
      </div>

      <Show when={provider() === "Local"}>
        <div class="space-y-2 mb-3">
          <button
            onClick={handleDetectLocal}
            disabled={detecting()}
            class="w-full px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-smooth disabled:opacity-40 border"
            style={{
              "background-color": "var(--color-bg-card)",
              color: "var(--color-text-primary)",
              "border-color": "var(--color-border)",
            }}
          >
            {detecting() ? "Detecting..." : "Detect Local Services"}
          </button>

          <Show when={localStatus()}>
            <div class="rounded-[var(--radius-sm)] p-2 text-xs space-y-1" style={{ "background-color": "var(--color-bg-card)", "border": "1px solid var(--color-border)" }}>
              <div class="flex items-center gap-1.5">
                <span style={{ color: localStatus()!.ollamaAvailable ? "#22c55e" : "#ef4444" }}>
                  {localStatus()!.ollamaAvailable ? "\u2713" : "\u2717"}
                </span>
                <span style={{ color: "var(--color-text-primary)" }}>Ollama</span>
                <span style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>
                  {localStatus()!.ollamaAvailable ? "(localhost:11434)" : "not running"}
                </span>
              </div>

              <Show when={localStatus()!.ollamaAvailable && localStatus()!.detectedModels.length > 0}>
                <div class="ml-4 space-y-0.5">
                  <span class="block" style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>Detected models:</span>
                  <For each={localStatus()!.detectedModels}>
                    {(model) => (
                      <span class="block ml-2" style={{ color: "var(--color-text-primary)", "font-size": "11px" }}>
                        {model}
                      </span>
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
                  {localStatus()!.llamacppAvailable ? "(localhost:8080)" : "not running"}
                </span>
              </div>

              <Show when={!localStatus()!.ollamaAvailable && !localStatus()!.llamacppAvailable}>
                <p class="mt-1" style={{ color: "var(--color-text-muted)", "font-size": "11px" }}>
                  Install Ollama from https://ollama.com or start llama.cpp server
                </p>
              </Show>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={provider() === "OpenAi"}>
        <div class="space-y-2 mb-3">
          <div>
            <label class="block mb-1" style={labelStyle}>API Key</label>
            <input
              type="password"
              value={openaiKey()}
              onInput={(e) => setOpenaiKey((e.target as HTMLInputElement).value)}
              placeholder="sk-..."
              class="w-full border rounded-[var(--radius-sm)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              style={inputStyle}
            />
          </div>
          <div>
            <label class="block mb-1" style={labelStyle}>Endpoint</label>
            <input
              type="text"
              value={openaiEndpoint()}
              onInput={(e) => setOpenaiEndpoint((e.target as HTMLInputElement).value)}
              placeholder="https://api.openai.com/v1"
              class="w-full border rounded-[var(--radius-sm)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              style={inputStyle}
            />
          </div>
          <div>
            <label class="block mb-1" style={labelStyle}>Model</label>
            <input
              type="text"
              value={openaiModel()}
              onInput={(e) => setOpenaiModel((e.target as HTMLInputElement).value)}
              placeholder="gpt-4o-mini"
              class="w-full border rounded-[var(--radius-sm)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              style={inputStyle}
            />
          </div>
        </div>
      </Show>

      <Show when={provider() === "Anthropic"}>
        <div class="space-y-2 mb-3">
          <div>
            <label class="block mb-1" style={labelStyle}>API Key</label>
            <input
              type="password"
              value={anthropicKey()}
              onInput={(e) => setAnthropicKey((e.target as HTMLInputElement).value)}
              placeholder="sk-ant-..."
              class="w-full border rounded-[var(--radius-sm)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              style={inputStyle}
            />
          </div>
          <div>
            <label class="block mb-1" style={labelStyle}>Model</label>
            <input
              type="text"
              value={anthropicModel()}
              onInput={(e) => setAnthropicModel((e.target as HTMLInputElement).value)}
              placeholder="claude-sonnet-4-20250514"
              class="w-full border rounded-[var(--radius-sm)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              style={inputStyle}
            />
          </div>
        </div>
      </Show>

      <button
        onClick={handleSave}
        disabled={saving()}
        class="w-full px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-smooth disabled:opacity-40"
        style={{
          "background-color": "var(--color-accent)",
          color: "var(--color-text-primary)",
        }}
      >
        {saving() ? "Saving..." : "Save Provider Config"}
      </button>

      <Show when={message()}>
        <p class="mt-1 text-xs" style={{ color: message().startsWith("Error") ? "var(--color-destructive)" : "var(--color-text-muted)" }}>
          {message()}
        </p>
      </Show>
    </div>
  );
}
