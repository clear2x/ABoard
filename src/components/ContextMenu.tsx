import { pinItem, unpinItem, deleteItems } from "../stores/clipboard";
import { invoke } from "@tauri-apps/api/core";
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
import { t } from "../stores/i18n";
import { onMount, onCleanup, createSignal, Show, createMemo, createEffect } from "solid-js";

interface Props {
  x: number;
  y: number;
  itemId: string;
  isPinned: boolean;
  content: string;
  itemType?: "text" | "image" | "file-paths" | "video";
  filePath?: string | null;
  onClose: () => void;
}

export default function ContextMenu(props: Props) {
  const [showRewriteMenu, setShowRewriteMenu] = createSignal(false);
  const [showConvertMenu, setShowConvertMenu] = createSignal(false);
  let menuRef!: HTMLDivElement;
  const [menuPos, setMenuPos] = createSignal({ left: props.x, top: props.y });

  createEffect(() => {
    const el = menuRef;
    if (!el) return;
    const menuWidth = el.offsetWidth;
    const menuHeight = el.offsetHeight;
    const left = Math.max(0, Math.min(props.x, window.innerWidth - menuWidth - 8));
    const top = Math.max(0, Math.min(props.y, window.innerHeight - menuHeight - 8));
    setMenuPos({ left, top });
  });

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
        resultText: t("ctx.jsonValid"),
        actionType: "format",
        itemId: props.itemId,
        isValid: true,
      });
    } else {
      setResultPopup({
        originalContent: props.content,
        resultText: t("ctx.jsonInvalid", { error: `${result.error}${result.line ? `\n${t("json.line", { n: result.line })}` : ""}` }),
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
        resultText: t("ctx.xmlValid"),
        actionType: "format",
        itemId: props.itemId,
        isValid: true,
      });
    } else {
      setResultPopup({
        originalContent: props.content,
        resultText: t("ctx.xmlInvalid", { error: `${result.error}${result.line ? `\n${t("json.line", { n: result.line })}` : ""}` }),
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

  const handleRevealInFolder = () => {
    if (props.filePath) {
      invoke("reveal_in_folder", { filePath: props.filePath });
    }
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

  const handlePastePlain = async () => {
    const plain = props.content
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    await navigator.clipboard.writeText(plain);
    props.onClose();
  };

  const handleClickOutside = (e: MouseEvent) => {
    props.onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
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
    `w-full text-left px-3 py-2 text-sm cursor-pointer transition-smooth rounded-[var(--radius-sm)] text-gray-600 hover:bg-[var(--color-bg-card-hover)]${disabled ? " opacity-50 cursor-not-allowed" : ""}`;

  return (
    <div
      ref={menuRef}
      class="glass-card fixed py-1 min-w-[160px] z-50 animate-context-menu"
      style={{ left: `${menuPos().left}px`, top: `${menuPos().top}px`, "box-shadow": "var(--shadow-elevated)" }}
    >
      {/* AI Actions */}
      <button
        class={menuItemClass(isProcessing())}
        onClick={handleTranslate}
        disabled={isProcessing()}
      >
        {processing() === "translate" ? t("ctx.translating") : t("ctx.translate")}
      </button>
      <button
        class={menuItemClass(isProcessing())}
        onClick={handleSummarize}
        disabled={isProcessing()}
      >
        {processing() === "summarize" ? t("ctx.summarizing") : t("ctx.summarize")}
      </button>

      {/* Rewrite with sub-menu */}
      <div
        class="relative"
        onMouseEnter={() => setShowRewriteMenu(true)}
        onMouseLeave={() => setShowRewriteMenu(false)}
      >
        <button
          class={menuItemClass(isProcessing())}
          disabled={isProcessing()}
        >
          {processing() === "rewrite" ? t("ctx.rewriting") : t("ctx.rewrite")}
          <span class="ml-1 text-xs text-gray-400">&#x25b6;</span>
        </button>

        <Show when={showRewriteMenu()}>
          <div
            class="absolute left-full top-0 py-1 min-w-[100px] glass-card animate-context-menu"
            style={{ "box-shadow": "var(--shadow-elevated)", margin: "-4px 0 0 4px" }}
          >
            {Object.keys(REWRITE_STYLES).map((style) => (
              <button
                class={menuItemClass(isProcessing())}
                onClick={() => handleRewrite(style)}
                disabled={isProcessing()}
              >
                {t(`ctx.${style}`)}
              </button>
            ))}
          </div>
        </Show>
      </div>

      {/* Format tools - conditional on content type */}
      <Show when={contentFormat().isJson}>
        <div class="my-1 border-t border-white/80" />
        <button
          class={menuItemClass()}
          onClick={handleFormatJson}
        >
          {t("ctx.beautifyJson")}
        </button>
        <button
          class={menuItemClass()}
          onClick={handleMinifyJson}
        >
          {t("ctx.minifyJson")}
        </button>
        <button
          class={menuItemClass()}
          onClick={handleValidateJson}
        >
          {t("ctx.validateJson")}
        </button>
      </Show>

      <Show when={contentFormat().isXml && !contentFormat().isJson}>
        <div class="my-1 border-t border-white/80" />
        <button
          class={menuItemClass()}
          onClick={handleFormatXml}
        >
          {t("ctx.formatXml")}
        </button>
        <button
          class={menuItemClass()}
          onClick={handleValidateXml}
        >
          {t("ctx.validateXml")}
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
          >
            {t("ctx.convert")}
            <span class="ml-1 text-xs text-gray-400">&#x25b6;</span>
          </button>
          <Show when={showConvertMenu()}>
            <div
              class="absolute left-full top-0 py-1 min-w-[160px] glass-card animate-context-menu"
              style={{ "box-shadow": "var(--shadow-elevated)", margin: "-4px 0 0 4px" }}
            >
              <Show when={contentFormat().isMarkdown}>
                <button
                  class={menuItemClass()}
                  onClick={() => handleConvertFormat("markdown", "html")}
                >
                  Markdown → HTML
                </button>
                <button
                  class={menuItemClass()}
                  onClick={() => handleConvertFormat("markdown", "plaintext")}
                >
                  {t("ctx.markdownToPlaintext")}
                </button>
              </Show>
              <Show when={contentFormat().isHtml}>
                <button
                  class={menuItemClass()}
                  onClick={() => handleConvertFormat("html", "markdown")}
                >
                  HTML → Markdown
                </button>
                <button
                  class={menuItemClass()}
                  onClick={() => handleConvertFormat("html", "plaintext")}
                >
                  {t("ctx.htmlToPlaintext")}
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>

      {/* Separator */}
      <div class="my-1" style={{ "border-top": "1px solid var(--color-border)" }} />

      {/* Paste as Plain Text - only for text/code items */}
      <Show when={props.itemType === "text" || props.itemType === "file-paths" || !props.itemType}>
        <button
          class="w-full text-left px-3 py-2 text-sm cursor-pointer transition-smooth rounded-[var(--radius-sm)] text-gray-600 hover:bg-[var(--color-bg-card-hover)]"
          onClick={handlePastePlain}
        >
          {t("ctx.pastePlain")}
        </button>
      </Show>

      {/* Show in Folder (for file-backed items like screenshots / recordings) */}
      <Show when={props.filePath}>
        <button
          class="w-full text-left px-3 py-2 text-sm cursor-pointer transition-smooth rounded-[var(--radius-sm)] text-gray-600 hover:bg-[var(--color-bg-card-hover)]"
          onClick={handleRevealInFolder}
        >
          {t("ctx.revealInFolder")}
        </button>
      </Show>

      {/* Existing actions */}
      <button
        class="w-full text-left px-3 py-2 text-sm cursor-pointer transition-smooth rounded-[var(--radius-sm)] text-gray-600 hover:bg-[var(--color-bg-card-hover)]"
        onClick={handlePin}
      >
        {props.isPinned ? t("ctx.unpin") : t("ctx.pin")}
      </button>
      <button
        class="w-full text-left px-3 py-2 text-sm cursor-pointer transition-smooth rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-card-hover)]"
        style={{ color: "var(--color-destructive)" }}
        onClick={handleDelete}
      >
        {t("ctx.delete")}
      </button>
    </div>
  );
}
