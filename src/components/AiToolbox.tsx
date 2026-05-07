import { Show } from "solid-js";
import {
  selectedId,
  items,
} from "../stores/clipboard";
import {
  translateContent,
  summarizeContent,
  rewriteContent,
  processing,
  setResultPopup,
} from "../stores/ai-actions";
import {
  formatJson,
  formatXml,
  detectContentFormat,
  convertFormat,
  type FormatResult,
  type FormatError,
} from "../stores/format-tools";
import { t } from "../stores/i18n";

interface ToolDef {
  icon: string;
  iconBg: string;
  iconColor: string;
  titleKey: string;
  descKey: string;
  action: () => void;
}

function showFormatResult(
  content: string,
  itemId: string,
  result: FormatResult | FormatError
) {
  if ("result" in result) {
    setResultPopup({
      originalContent: content,
      resultText: result.result,
      actionType: "format",
      itemId,
    });
  } else {
    setResultPopup({
      originalContent: content,
      resultText: result.error,
      actionType: "error",
      itemId,
    });
  }
}

export default function AiToolbox() {
  const selectedItem = () => {
    const id = selectedId();
    if (!id) return null;
    return items().find((i) => i.id === id) ?? null;
  };

  const isProcessing = () => processing() !== null;

  const handleTranslate = () => {
    const item = selectedItem();
    if (!item) return;
    translateContent(item.content, item.id);
  };

  const handleSummarize = () => {
    const item = selectedItem();
    if (!item) return;
    summarizeContent(item.content, item.id);
  };

  const handleRewrite = () => {
    const item = selectedItem();
    if (!item) return;
    rewriteContent(item.content, item.id, "formal");
  };

  const handleFormat = () => {
    const item = selectedItem();
    if (!item) return;
    const content = item.content.trim();
    const fmt = detectContentFormat(content);

    if (fmt.isJson) {
      const result = formatJson(content);
      showFormatResult(content, item.id, result);
    } else if (fmt.isXml) {
      const result = formatXml(content);
      showFormatResult(content, item.id, result);
    } else if (fmt.isHtml) {
      const result = convertFormat(content, "html", "markdown");
      showFormatResult(content, item.id, result);
    } else if (fmt.isMarkdown) {
      const result = convertFormat(content, "markdown", "html");
      showFormatResult(content, item.id, result);
    } else {
      // Try JSON first, then XML
      const content2 = content;
      if (content2.startsWith("{") || content2.startsWith("[")) {
        showFormatResult(content2, item.id, formatJson(content2));
      } else if (content2.startsWith("<")) {
        showFormatResult(content2, item.id, formatXml(content2));
      } else {
        setResultPopup({
          originalContent: content,
          resultText: t("toolbox.unrecognizedFormat"),
          actionType: "error",
          itemId: item.id,
        });
      }
    }
  };

  const handleMarkdown = () => {
    const item = selectedItem();
    if (!item) return;
    const content = item.content.trim();
    const fmt = detectContentFormat(content);

    let result: FormatResult | FormatError;
    if (fmt.isHtml) {
      result = convertFormat(content, "html", "markdown");
    } else if (fmt.isMarkdown) {
      result = convertFormat(content, "markdown", "html");
    } else {
      // Treat as plaintext -> markdown
      result = convertFormat(content, "plaintext", "markdown");
    }
    showFormatResult(content, item.id, result);
  };

  const tools: ToolDef[] = [
    { icon: "ph-translate", iconBg: "bg-blue-100", iconColor: "text-blue-600", titleKey: "toolbox.translate", descKey: "toolbox.translateDesc", action: handleTranslate },
    { icon: "ph-text-align-center", iconBg: "bg-purple-100", iconColor: "text-purple-600", titleKey: "toolbox.summarize", descKey: "toolbox.summarizeDesc", action: handleSummarize },
    { icon: "ph-pencil-simple", iconBg: "bg-indigo-100", iconColor: "text-indigo-600", titleKey: "toolbox.rewrite", descKey: "toolbox.rewriteDesc", action: handleRewrite },
    { icon: "ph-brackets-curly", iconBg: "bg-green-100", iconColor: "text-green-600", titleKey: "toolbox.format", descKey: "toolbox.formatDesc", action: handleFormat },
    { icon: "", iconBg: "bg-orange-100", iconColor: "text-orange-600", titleKey: "toolbox.markdown", descKey: "toolbox.markdownDesc", action: handleMarkdown },
  ];

  return (
    <div class="w-[200px] min-w-[200px] glass-panel-inner flex flex-col shrink-0 p-3">
      {/* Header */}
      <div class="flex items-center gap-2 font-medium text-gray-600 dark:text-gray-300 mb-4 px-1">
        <i class="ph-fill ph-magic-wand text-blue-500" />
        {t("toolbox.title")}
      </div>

      {/* Tool cards */}
      <div class="space-y-3 flex-1 overflow-y-auto no-scrollbar pb-10">
        {tools.map((tool) => (
          <button
            class="glass-card w-full p-3 rounded-xl cursor-pointer flex items-center gap-3 text-left"
            onClick={tool.action}
            disabled={isProcessing() || !selectedItem()}
            style={{ opacity: isProcessing() || !selectedItem() ? 0.5 : 1 }}
          >
            <div class={`w-8 h-8 rounded-lg ${tool.iconBg} ${tool.iconColor} flex items-center justify-center shrink-0`}>
              <Show when={tool.icon} fallback={<span class="font-bold text-lg">M↓</span>}>
                <i class={`ph ${tool.icon} text-lg`} />
              </Show>
            </div>
            <div>
              <div class="text-sm font-medium text-gray-700 dark:text-gray-200">
                {t(tool.titleKey)}
              </div>
              <div class="text-[10px] text-gray-400 dark:text-gray-500">
                {t(tool.descKey)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* No selection notice */}
      <Show when={!selectedItem()}>
        <div class="text-center text-[10px] py-2 text-gray-400">
          {t("toolbox.noSelection")}
        </div>
      </Show>

      {/* Privacy footer */}
      <div class="mt-auto pt-4 text-center text-[10px] flex items-center justify-center gap-1 text-[var(--color-text-muted)]"
        style={{ "border-top": "1px solid var(--color-border-subtle)" }}
      >
        <i class="ph ph-shield-check" />
        {t("toolbox.privacyNote")}
      </div>
    </div>
  );
}
