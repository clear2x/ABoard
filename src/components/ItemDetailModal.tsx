import { Show, createSignal, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { ClipboardItem } from "../stores/clipboard";
import { copyItemContent } from "../stores/clipboard";
import { t } from "../stores/i18n";

interface Props {
  item: ClipboardItem | null;
  onClose: () => void;
}

export default function ItemDetailModal(props: Props) {
  const [fullContent, setFullContent] = createSignal<string | null>(null);
  const [imageSrc, setImageSrc] = createSignal<string | null>(null);

  const isCode = () => props.item?.ai_type === "code" || (props.item?.type as string) === "code";
  const isImage = () => props.item?.type === "image";

  onMount(async () => {
    if (!props.item) return;

    // Load full content from data file if available
    if (props.item.file_path) {
      try {
        const content = await invoke<string>("read_data_file", { relativePath: props.item.file_path });
        if (isImage()) {
          setImageSrc(content);
        } else {
          setFullContent(content);
        }
      } catch {
        setFullContent(props.item.content);
      }
    } else {
      setFullContent(props.item.content);
    }

    // For images without file_path but with data URL
    if (isImage() && props.item.content.startsWith("data:")) {
      setImageSrc(props.item.content);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  });

  const handleCopy = async () => {
    if (props.item) {
      await copyItemContent(props.item);
    }
  };

  const lines = () => {
    const content = fullContent();
    if (!content) return [];
    return content.split("\n");
  };

  return (
    <Show when={props.item}>
      <div
        class="fixed inset-0 z-[100] flex items-center justify-center"
        onClick={props.onClose}
      >
        {/* Backdrop */}
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" />

        {/* Modal */}
        <div
          class="relative w-full max-w-2xl max-h-[80vh] bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-popup-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200/50 dark:border-gray-700/50 shrink-0">
            <div class="flex items-center gap-2">
              <span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {props.item!.ai_type || props.item!.type}
              </span>
              <span class="text-xs text-gray-400">
                {new Date(props.item!.timestamp).toLocaleString()}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="px-2.5 py-1 text-xs rounded-lg bg-accent text-white hover:bg-[var(--color-accent-hover)] transition-colors"
                onClick={handleCopy}
              >
                <i class="ph ph-copy mr-1" />
                {t("ctx.copy")}
              </button>
              <button
                class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors"
                onClick={props.onClose}
              >
                <i class="ph ph-x" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div class="flex-1 overflow-y-auto p-5 no-scrollbar">
            <Show
              when={isImage() && imageSrc()}
              fallback={
                <Show
                  when={isCode()}
                  fallback={
                    <pre class="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words font-sans">
                      {fullContent() || props.item?.content}
                    </pre>
                  }
                >
                  <div class="font-mono text-sm text-gray-700 dark:text-gray-200 leading-relaxed bg-gray-50 dark:bg-slate-900/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50 overflow-x-auto">
                    {lines().map((line, i) => (
                      <div class="flex">
                        <span class="w-10 shrink-0 text-right pr-4 text-gray-300 dark:text-gray-600 select-none text-xs leading-relaxed">
                          {i + 1}
                        </span>
                        <span class="whitespace-pre-wrap break-all">{line}</span>
                      </div>
                    ))}
                  </div>
                </Show>
              }
            >
              <div class="flex items-center justify-center">
                <img
                  src={imageSrc()!}
                  alt="Clipboard image"
                  class="max-w-full max-h-[60vh] rounded-lg object-contain"
                />
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
