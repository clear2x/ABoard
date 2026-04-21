import { pinItem, unpinItem, deleteItems } from "../stores/clipboard";
import {
  translateContent,
  summarizeContent,
  rewriteContent,
  processing,
  REWRITE_STYLES,
  setResultPopup,
} from "../stores/ai-actions";
import {
  detectContentFormat,
  formatJson,
  minifyJson,
  validateJson,
  formatXml,
  validateXml,
  convertFormat,
  type FormatType,
} from "../stores/format-tools";
import { onMount, onCleanup, createSignal, Show, createMemo } from "solid-js";

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
  const [showConvertMenu, setShowConvertMenu] = createSignal(false);

  const contentFormat = createMemo(() => detectContentFormat(props.content));

  const handleFormatJson = () => {
    const result = formatJson(props.content);
    setResultPopup({
      originalContent: props.content,
      resultText: "result" in result ? result.result : `Error: ${result.error}`,
      actionType: "format",
      itemId: props.itemId,
      isValid: "result" in result,
    });
    props.onClose();
  };

  const handleMinifyJson = () => {
    const result = minifyJson(props.content);
    setResultPopup({
      originalContent: props.content,
      resultText: "result" in result ? result.result : `Error: ${result.error}`,
      actionType: "format",
      itemId: props.itemId,
      isValid: "result" in result,
    });
    props.onClose();
  };

  const handleValidateJson = () => {
    const result = validateJson(props.content);
    if (result.valid) {
      setResultPopup({
        originalContent: props.content,
        resultText: "JSON \u683c\u5f0f\u6b63\u786e \u2713",
        actionType: "format",
        itemId: props.itemId,
        isValid: true,
      });
    } else {
      setResultPopup({
        originalContent: props.content,
        resultText: `JSON \u683c\u5f0f\u9519\u8bef:\n${result.error}${result.line ? `\n\u7b2c ${result.line} \u884c` : ""}`,
        actionType: "format",
        itemId: props.itemId,
        isValid: false,
      });
    }
    props.onClose();
  };

  const handleFormatXml = () => {
    const result = formatXml(props.content);
    setResultPopup({
      originalContent: props.content,
      resultText: "result" in result ? result.result : `Error: ${result.error}`,
      actionType: "format",
      itemId: props.itemId,
      isValid: "result" in result,
    });
    props.onClose();
  };

  const handleValidateXml = () => {
    const result = validateXml(props.content);
    if (result.valid) {
      setResultPopup({
        originalContent: props.content,
        resultText: "XML \u683c\u5f0f\u6b63\u786e \u2713",
        actionType: "format",
        itemId: props.itemId,
        isValid: true,
      });
    } else {
      setResultPopup({
        originalContent: props.content,
        resultText: `XML \u683c\u5f0f\u9519\u8bef:\n${result.error}${result.line ? `\n\u7b2c ${result.line} \u884c` : ""}`,
        actionType: "format",
        itemId: props.itemId,
        isValid: false,
      });
    }
    props.onClose();
  };

  const handleConvertFormat = (from: FormatType, to: FormatType) => {
    const result = convertFormat(props.content, from, to);
    setResultPopup({
      originalContent: props.content,
      resultText: "result" in result ? result.result : `Error: ${result.error}`,
      actionType: "format",
      itemId: props.itemId,
      isValid: "result" in result,
    });
    props.onClose();
  };

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

      {/* Format tools - conditional on content type */}
      <Show when={contentFormat().isJson}>
        <div class="my-1" style={{ "border-top": "1px solid var(--color-border)" }} />
        <button
          class={menuItemClass()}
          style={{ color: "var(--color-text-secondary)" }}
          onClick={handleFormatJson}
        >
          \u7f8e\u5316 JSON (Beautify)
        </button>
        <button
          class={menuItemClass()}
          style={{ color: "var(--color-text-secondary)" }}
          onClick={handleMinifyJson}
        >
          \u538b\u7f29 JSON (Minify)
        </button>
        <button
          class={menuItemClass()}
          style={{ color: "var(--color-text-secondary)" }}
          onClick={handleValidateJson}
        >
          \u6821\u9a8c JSON (Validate)
        </button>
      </Show>

      <Show when={contentFormat().isXml && !contentFormat().isJson}>
        <div class="my-1" style={{ "border-top": "1px solid var(--color-border)" }} />
        <button
          class={menuItemClass()}
          style={{ color: "var(--color-text-secondary)" }}
          onClick={handleFormatXml}
        >
          \u683c\u5f0f\u5316 XML
        </button>
        <button
          class={menuItemClass()}
          style={{ color: "var(--color-text-secondary)" }}
          onClick={handleValidateXml}
        >
          \u6821\u9a8c XML
        </button>
      </Show>

      <Show when={(contentFormat().isMarkdown || contentFormat().isHtml) && !contentFormat().isJson && !contentFormat().isXml}>
        <div
          class="relative"
          onMouseEnter={() => setShowConvertMenu(true)}
          onMouseLeave={() => setShowConvertMenu(false)}
        >
          <button
            class={menuItemClass()}
            style={{ color: "var(--color-text-secondary)" }}
          >
            \u683c\u5f0f\u8f6c\u6362 (Convert)
            <span class="ml-1 text-xs" style={{ color: "var(--color-text-muted)" }}>&#x25b6;</span>
          </button>
          <Show when={showConvertMenu()}>
            <div
              class="absolute left-full top-0 py-1 min-w-[160px] glass-card animate-context-menu"
              style={{ "box-shadow": "var(--shadow-elevated)", margin: "-4px 0 0 4px" }}
            >
              <Show when={contentFormat().isMarkdown}>
                <button
                  class={menuItemClass()}
                  style={{ color: "var(--color-text-secondary)" }}
                  onClick={() => handleConvertFormat("markdown", "html")}
                >
                  Markdown \u2192 HTML
                </button>
                <button
                  class={menuItemClass()}
                  style={{ color: "var(--color-text-secondary)" }}
                  onClick={() => handleConvertFormat("markdown", "plaintext")}
                >
                  Markdown \u2192 \u7eaf\u6587\u672c
                </button>
              </Show>
              <Show when={contentFormat().isHtml}>
                <button
                  class={menuItemClass()}
                  style={{ color: "var(--color-text-secondary)" }}
                  onClick={() => handleConvertFormat("html", "markdown")}
                >
                  HTML \u2192 Markdown
                </button>
                <button
                  class={menuItemClass()}
                  style={{ color: "var(--color-text-secondary)" }}
                  onClick={() => handleConvertFormat("html", "plaintext")}
                >
                  HTML \u2192 \u7eaf\u6587\u672c
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>

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
