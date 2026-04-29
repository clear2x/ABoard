import { Show, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import {
  resultPopup,
  setResultPopup,
} from "../stores/ai-actions";
import { addItem } from "../stores/clipboard";
import { t } from "../stores/i18n";

const ACTION_TITLE_KEYS: Record<string, string> = {
  translate: "ai.result.translate",
  summarize: "ai.result.summarize",
  rewrite: "ai.result.rewrite",
  format: "ai.result.format",
  error: "ai.errorTitle",
};

const ACTION_ICONS: Record<string, string> = {
  translate: "ph-translate",
  summarize: "ph-text-align-center",
  rewrite: "ph-pencil-simple",
  format: "ph-brackets-curly",
  error: "ph-warning",
};

export default function AiResultPopup() {
  const close = () => setResultPopup(null);

  const result = () => resultPopup();

  const handleCopy = async () => {
    const r = result();
    if (!r) return;
    try {
      await navigator.clipboard.writeText(r.resultText);
    } catch (e) {
      console.error("[AiResultPopup] Copy failed:", e);
    }
  };

  const handleReplace = async () => {
    const r = result();
    if (!r) return;
    try {
      await invoke("update_item_content", {
        id: r.itemId,
        content: r.resultText,
      });
    } catch (e) {
      console.error("[AiResultPopup] Replace failed:", e);
    }
    close();
  };

  const handleAppend = async () => {
    const r = result();
    if (!r) return;
    try {
      const id = crypto.randomUUID();
      const content = r.resultText;
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const metadata = JSON.stringify({ length: content.length, source: `ai-${r.actionType}` });
      const timestamp = Date.now();

      await invoke("insert_clipboard_item", {
        id,
        contentType: "text",
        content,
        hash,
        timestamp,
        metadata,
      });

      emit("clipboard-update");

      addItem({
        id,
        type: "text",
        content,
        hash,
        timestamp,
        metadata: { length: content.length, source: `ai-${r.actionType}` },
        pinned: false,
        pinned_at: null,
        ai_type: null,
        ai_tags: null,
        ai_summary: null,
      });
    } catch (e) {
      console.error("[AiResultPopup] Append failed:", e);
    }
    close();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (!result()) return;
      e.stopPropagation();
      close();
    }
  };

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  return (
    <Show when={result()}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div class="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={(e) => {
          if (window.getSelection()?.toString().length) return;
          close();
        }} />

        {/* Popup body */}
        <div class="relative z-10 w-[500px] max-h-[80vh] flex flex-col glass-panel rounded-2xl animate-scale-in overflow-hidden">
          {/* Header bar */}
          <div class="flex items-center justify-between px-5 py-3 border-b border-white/40 bg-white/30">
            <div class="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Show when={result()}>
                <i class={`ph ${ACTION_ICONS[result()!.actionType] || "ph-sparkle"} text-blue-500`} />
              </Show>
              {result() ? t(ACTION_TITLE_KEYS[result()!.actionType] || "ai.result.format") : ""}
            </div>
            <button
              class="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/40 transition-colors text-gray-400 hover:text-gray-600"
              onClick={close}
            >
              <i class="ph ph-x text-sm" />
            </button>
          </div>

          <div class="p-5 space-y-3 overflow-y-auto">
            {/* Original content */}
            <div class="p-3 rounded-lg text-xs max-h-[80px] overflow-y-auto bg-white/30 border border-white/50 text-gray-500">
              <div class="text-[10px] font-medium text-gray-400 mb-1 uppercase">{t("ai.resultOriginal")}</div>
              {result()?.originalContent}
            </div>

            {/* Result content */}
            <div
              class="p-3 rounded-lg max-h-[40vh] overflow-y-auto text-sm whitespace-pre-wrap"
              classList={{
                "bg-red-50/60 border border-red-200/60 text-red-600": result()?.actionType === "error",
                "bg-white/30 border border-white/50 text-gray-700": result()?.actionType !== "error",
              }}
            >
              {result()?.resultText}
            </div>

            {/* Inference stats */}
            <Show when={result()?.durationMs != null && result()?.actionType !== "error"}>
              <div class="flex items-center gap-3 text-[10px] text-gray-400">
                <span class="flex items-center gap-1">
                  <i class="ph ph-clock" />
                  {t("ai.generationTime")} {(result()?.durationMs! / 1000).toFixed(1)}s
                </span>
                <span class="flex items-center gap-1">
                  <i class="ph ph-hash" />
                  {result()?.tokensUsed} tokens
                </span>
              </div>
            </Show>

            {/* Action buttons */}
            <div class="flex gap-2 pt-1">
              <Show when={result()?.actionType === "error"}>
                <button
                  class="px-4 py-2 text-xs font-medium rounded-lg transition-colors hover:opacity-80 bg-blue-500 text-white shadow-sm"
                  onClick={close}
                >
                  OK
                </button>
              </Show>
              <Show when={result()?.actionType !== "error"}>
                <button
                  class="px-4 py-2 text-xs font-medium rounded-lg transition-colors hover:opacity-80 bg-blue-500 text-white shadow-sm"
                  onClick={handleCopy}
                >
                  {t("ai.copyResult")}
                </button>
                <button
                  class="px-4 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-white/50 border border-white/80 bg-white/40 text-gray-600"
                  onClick={handleReplace}
                >
                  {t("ai.replaceOriginal")}
                </button>
                <button
                  class="px-4 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-white/50 border border-white/80 bg-white/40 text-gray-600"
                  onClick={handleAppend}
                >
                  {t("ai.appendNew")}
                </button>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
