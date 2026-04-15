import { createSignal, onMount, Show } from "solid-js";
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

interface ParamDef {
  key: "temperature" | "context_length" | "top_p";
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

const PARAMS: ParamDef[] = [
  { key: "temperature", label: "Temperature", min: 0, max: 2.0, step: 0.1, defaultValue: 0.7 },
  { key: "context_length", label: "Context Length", min: 512, max: 8192, step: 256, defaultValue: 2048 },
  { key: "top_p", label: "Top P", min: 0, max: 1.0, step: 0.05, defaultValue: 0.9 },
];

export default function ModelParams() {
  const [temperature, setTemperature] = createSignal(0.7);
  const [contextLength, setContextLength] = createSignal(2048);
  const [topP, setTopP] = createSignal(0.9);
  const [saving, setSaving] = createSignal(false);

  const setters: Record<string, (v: number) => void> = {
    temperature: setTemperature,
    context_length: setContextLength,
    top_p: setTopP,
  };

  onMount(async () => {
    try {
      const config = await invoke<AiConfig>("ai_get_config");
      setTemperature(config.temperature ?? 0.7);
      setContextLength(config.context_length ?? 2048);
      setTopP(config.top_p ?? 0.9);
    } catch (err) {
      console.warn("Failed to load AI config for params:", err);
    }
  });

  const saveParams = async () => {
    setSaving(true);
    try {
      const config = await invoke<AiConfig>("ai_get_config");
      config.temperature = temperature();
      config.context_length = contextLength();
      config.top_p = topP();
      await invoke("ai_set_config", { config });
    } catch (err) {
      console.warn("Failed to save params:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (param: ParamDef, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const clamped = Math.min(param.max, Math.max(param.min, num));
    const setter = setters[param.key];
    if (setter) setter(clamped);
  };

  const handleCommit = () => {
    saveParams();
  };

  const getValue = (key: string): number => {
    switch (key) {
      case "temperature": return temperature();
      case "context_length": return contextLength();
      case "top_p": return topP();
      default: return 0;
    }
  };

  return (
    <div>
      <h3 class="text-sm font-semibold tracking-tight mb-2" style={{ color: "var(--color-text-primary)" }}>
        Parameters
      </h3>

      <div class="space-y-3">
        {PARAMS.map((param) => (
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {param.label}
              </label>
              <span class="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                {getValue(param.key)}
              </span>
            </div>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step}
              value={getValue(param.key)}
              onInput={(e) => handleChange(param, (e.target as HTMLInputElement).value)}
              onChange={handleCommit}
              class="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                "background-color": "var(--color-bg-card)",
                "accent-color": "var(--color-accent)",
              } as Record<string, string>}
            />
          </div>
        ))}
      </div>

      <Show when={saving()}>
        <p class="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Saving...</p>
      </Show>
    </div>
  );
}
