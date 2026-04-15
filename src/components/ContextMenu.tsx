import { pinItem, unpinItem, deleteItems } from "../stores/clipboard";
import {
  translateContent,
  summarizeContent,
  rewriteContent,
  processing,
  REWRITE_STYLES,
} from "../stores/ai-actions";
import { onMount, onCleanup, createSignal, Show } from "solid-js";

interface Props {
  x: number;
  y: number;
  itemId: string;
  isPinned: boolean;
  content: string;
  onClose: () => void;
}

const REWRITE_STYLE_LABELS: Record<string, string> = {
  formal: "\u6b63\u5f0f",
  casual: "\u968f\u610f",
  concise: "\u7b80\u6d01",
  detailed: "\u8be6\u7ec6",
  academic: "\u5b66\u672f",
};

export default function ContextMenu(props: Props) {
  const [showRewriteMenu, setShowRewriteMenu] = createSignal(false);

  const handlePin = async () => {
    if (props.isPinned) {
      await unpinItem(props.itemId);
    } else {
      await pinItem(props.itemId);
    }
    props.onClose();
  };

  const handleDelete = async () => {
    await deleteItems([props.itemId]);
    props.onClose();
  };

  const handleTranslate = () => {
    translateContent(props.content, props.itemId);
    props.onClose();
  };

  const handleSummarize = () => {
    summarizeContent(props.content, props.itemId);
    props.onClose();
  };

  const handleRewrite = (style: string) => {
    rewriteContent(props.content, props.itemId, style);
    props.onClose();
  };

  const handleClickOutside = (e: MouseEvent) => {
    props.onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      props.onClose();
    }
  };

  onMount(() => {
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });

  const isProcessing = () => processing() !== null;

  const menuItemClass = (disabled: boolean = false) =>
    `w-full text-left px-3 py-2 text-sm cursor-pointer transition-smooth rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-card-hover)]${disabled ? " opacity-50 cursor-not-allowed" : ""}`;

  return (
    <div
      class="glass-card fixed py-1 min-w-[160px] z-50 animate-context-menu"
      style={{ left: `${props.x}px`, top: `${props.y}px`, "box-shadow": "var(--shadow-elevated)" }}
    >
      {/* AI Actions */}
      <button
        class={menuItemClass(isProcessing())}
        style={{ color: "var(--color-text-secondary)" }}
        onClick={handleTranslate}
        disabled={isProcessing()}
      >
        {processing() === "translate" ? "Translating..." : "\u7ffb\u8bd1 (Translate)"}
      </button>
      <button
        class={menuItemClass(isProcessing())}
        style={{ color: "var(--color-text-secondary)" }}
        onClick={handleSummarize}
        disabled={isProcessing()}
      >
        {processing() === "summarize" ? "Summarizing..." : "\u603b\u7ed3 (Summarize)"}
      </button>

      {/* Rewrite with sub-menu */}
      <div
        class="relative"
        onMouseEnter={() => setShowRewriteMenu(true)}
        onMouseLeave={() => setShowRewriteMenu(false)}
      >
        <button
          class={menuItemClass(isProcessing())}
          style={{ color: "var(--color-text-secondary)" }}
          disabled={isProcessing()}
        >
          {processing() === "rewrite" ? "Rewriting..." : "\u6539\u5199 (Rewrite)"}
          <span class="ml-1 text-xs" style={{ color: "var(--color-text-muted)" }}>&#x25b6;</span>
        </button>

        <Show when={showRewriteMenu()}>
          <div
            class="absolute left-full top-0 py-1 min-w-[100px] glass-card animate-context-menu"
            style={{ "box-shadow": "var(--shadow-elevated)", margin: "-4px 0 0 4px" }}
          >
            {Object.keys(REWRITE_STYLES).map((style) => (
              <button
                class={menuItemClass(isProcessing())}
                style={{ color: "var(--color-text-secondary)" }}
                onClick={() => handleRewrite(style)}
                disabled={isProcessing()}
              >
                {REWRITE_STYLE_LABELS[style]}
              </button>
            ))}
          </div>
        </Show>
      </div>

      {/* Separator */}
      <div class="my-1" style={{ "border-top": "1px solid var(--color-border)" }} />

      {/* Existing actions */}
      <button
        class="w-full text-left px-3 py-2 text-sm cursor-pointer transition-smooth rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-card-hover)]"
        style={{ color: "var(--color-text-secondary)" }}
        onClick={handlePin}
      >
        {props.isPinned ? "Unpin" : "Pin"}
      </button>
      <button
        class="w-full text-left px-3 py-2 text-sm cursor-pointer transition-smooth rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-card-hover)]"
        style={{ color: "var(--color-destructive)" }}
        onClick={handleDelete}
      >
        Delete
      </button>
    </div>
  );
}
