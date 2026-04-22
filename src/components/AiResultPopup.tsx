import { Show, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  resultPopup,
  setResultPopup,
} from "../stores/ai-actions";
import { addItem, type ClipboardItem } from "../stores/clipboard";
import { t } from "../stores/i18n";

const ACTION_TITLE_KEYS: Record<string, string> = {
  translate: "ai.result.translate",
  summarize: "ai.result.summarize",
  rewrite: "ai.result.rewrite",
  format: "ai.result.format",
  error: "ai.errorTitle",
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
      // Compute a simple hash for the new item
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

      // Add to reactive signal array for immediate display
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
      close();
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <Show when={result()}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={close}
        />
        {/* Popup body */}
        <div
          class="relative z-10 w-[500px] max-h-[80vh] flex flex-col glass-panel rounded-2xl animate-scale-in"
        >
          {/* Title */}
          <h3
            class="text-base font-semibold tracking-tight mb-3 text-gray-700"
          >
            {result() ? t(ACTION_TITLE_KEYS[result()!.actionType] || "ai.result.format") : ""}
          </h3>

          {/* Original content */}
          <div
            class="mb-2 p-2 rounded-lg text-xs max-h-[80px] overflow-y-auto bg-white/5 text-gray-400"
          >
            {result()?.originalContent}
          </div>

          {/* Result content */}
          <div
            class="p-3 rounded-lg max-h-[40vh] overflow-y-auto text-sm whitespace-pre-wrap"
            classList={{
              "bg-red-500/10 text-red-500": result()?.actionType === "error",
              "bg-white/5 text-gray-600": result()?.actionType !== "error",
            }}
          >
            {result()?.resultText}
          </div>

          {/* Action buttons */}
          <div class="flex gap-2 mt-3">
            <Show when={result()?.actionType === "error"}>
              <button
                class="px-3 py-1.5 text-xs font-medium rounded-lg transition-smooth hover:opacity-80 bg-blue-500 text-white"
                onClick={close}
              >
                OK
              </button>
            </Show>
            <Show when={result()?.actionType !== "error"}>
              <button
                class="px-3 py-1.5 text-xs font-medium rounded-lg transition-smooth hover:opacity-80 bg-blue-500 text-white"
                onClick={handleCopy}
              >
                {t("ai.copyResult")}
              </button>
              <button
                class="px-3 py-1.5 text-xs font-medium rounded-lg transition-smooth hover:opacity-80 border border-white/80 bg-white/50 text-gray-600"
                onClick={handleReplace}
              >
                {t("ai.replaceOriginal")}
              </button>
              <button
                class="px-3 py-1.5 text-xs font-medium rounded-lg transition-smooth hover:opacity-80 border border-white/80 bg-white/50 text-gray-600"
                onClick={handleAppend}
              >
                {t("ai.appendNew")}
              </button>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
