import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface ModelInfo {
  id: string;
  name: string;
  filename: string;
  file_size: number;
  status: string;
  downloaded_at: number;
  is_active: boolean;
}

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

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export default function ModelManager() {
  const [models, setModels] = createSignal<ModelInfo[]>([]);
  const [downloadUrl, setDownloadUrl] = createSignal("");
  const [downloadName, setDownloadName] = createSignal("");
  const [downloading, setDownloading] = createSignal(false);
  const [downloadProgress, setDownloadProgress] = createSignal(0);
  const [message, setMessage] = createSignal("");

  const loadModels = async () => {
    try {
      const list = await invoke<ModelInfo[]>("ai_list_models");
      setModels(list);
    } catch (err) {
      console.warn("Failed to load models:", err);
    }
  };

  onMount(async () => {
    await loadModels();
    try {
      await listen<{ downloaded: number; total: number }>("model-download-progress", (event) => {
        const { downloaded, total } = event.payload;
        if (total > 0) {
          setDownloadProgress(Math.round((downloaded / total) * 100));
        }
      });
    } catch (err) {
      console.warn("Failed to listen download progress:", err);
    }
  });

  const handleDownload = async () => {
    const url = downloadUrl().trim();
    const name = downloadName().trim();
    if (!url || !name) {
      setMessage("URL and name are required");
      return;
    }
    if (!url.startsWith("https://")) {
      setMessage("Only HTTPS URLs are allowed");
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);
    setMessage("");

    try {
      await invoke("ai_download_model", { url, name });
      setDownloadUrl("");
      setDownloadName("");
      setMessage("Download complete");
      setTimeout(() => setMessage(""), 3000);
      await loadModels();
    } catch (err) {
      setMessage(`Error: ${err}`);
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleDelete = async (modelId: string) => {
    if (!confirm("Delete this model? This cannot be undone.")) return;
    try {
      await invoke("ai_delete_model", { modelId });
      await loadModels();
    } catch (err) {
      setMessage(`Error: ${err}`);
    }
  };

  const handleSetActive = async (model: ModelInfo) => {
    try {
      const config = await invoke<AiConfig>("ai_get_config");
      config.model_path = model.filename;
      await invoke("ai_set_config", { config });
      await loadModels();
    } catch (err) {
      setMessage(`Error: ${err}`);
    }
  };

  const labelStyle = {
    "font-size": "var(--font-label)",
    color: "var(--color-text-muted)",
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
        Models
      </h3>

      <Show when={models().length === 0}>
        <p class="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
          No models downloaded yet
        </p>
      </Show>

      <div class="space-y-1.5 mb-3" style={{ "max-height": "200px", "overflow-y": "auto" }}>
        <For each={models()}>
          {(model) => (
            <div
              class="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] border"
              style={{
                "background-color": model.is_active ? "rgba(59, 130, 246, 0.1)" : "var(--color-bg-card)",
                "border-color": model.is_active ? "var(--color-accent)" : "var(--color-border)",
              }}
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <Show when={model.is_active}>
                    <span class="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ "background-color": "var(--color-accent)" }} />
                  </Show>
                  <span class="text-xs truncate" style={{ color: "var(--color-text-primary)" }}>
                    {model.name}
                  </span>
                </div>
                <span class="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {formatSize(model.file_size)}
                  {" "}
                  <Show when={model.status !== "available"}>
                    <span style={{ color: "var(--color-accent)" }}>({model.status})</span>
                  </Show>
                </span>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <Show when={!model.is_active}>
                  <button
                    class="px-1.5 py-0.5 text-xs rounded transition-smooth"
                    style={{ color: "var(--color-accent)", "background-color": "rgba(59, 130, 246, 0.1)" }}
                    onClick={() => handleSetActive(model)}
                    title="Set as active model"
                  >
                    Set Active
                  </button>
                </Show>
                <Show when={model.is_active}>
                  <span class="px-1.5 py-0.5 text-xs rounded" style={{ color: "var(--color-accent)" }}>
                    Active
                  </span>
                </Show>
                <button
                  class="px-1.5 py-0.5 text-xs rounded transition-smooth"
                  style={{ color: "var(--color-destructive)" }}
                  onClick={() => handleDelete(model.id)}
                  title="Delete model"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="space-y-1.5">
        <label class="block" style={labelStyle}>Add Model (GGUF)</label>
        <input
          type="text"
          value={downloadUrl()}
          onInput={(e) => setDownloadUrl((e.target as HTMLInputElement).value)}
          placeholder="https://example.com/model.gguf"
          class="w-full border rounded-[var(--radius-sm)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          style={inputStyle}
        />
        <input
          type="text"
          value={downloadName()}
          onInput={(e) => setDownloadName((e.target as HTMLInputElement).value)}
          placeholder="Model name"
          class="w-full border rounded-[var(--radius-sm)] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          style={inputStyle}
        />
        <Show when={downloading()}>
          <div class="w-full rounded-[var(--radius-sm)] overflow-hidden" style={{ "background-color": "var(--color-bg-card)", height: "4px" }}>
            <div
              class="h-full transition-smooth"
              style={{ width: `${downloadProgress()}%`, "background-color": "var(--color-accent)" }}
            />
          </div>
          <span class="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {downloadProgress()}%
          </span>
        </Show>
        <button
          onClick={handleDownload}
          disabled={downloading()}
          class="w-full px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-smooth disabled:opacity-40"
          style={{
            "background-color": "var(--color-bg-card-hover)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          {downloading() ? "Downloading..." : "Download"}
        </button>
      </div>

      <Show when={message()}>
        <p class="mt-1 text-xs" style={{ color: message().startsWith("Error") ? "var(--color-destructive)" : "var(--color-text-muted)" }}>
          {message()}
        </p>
      </Show>
    </div>
  );
}
