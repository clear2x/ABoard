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
} from "../stores/ai-actions";
import { formatJson, validateJson, formatXml, validateXml } from "../stores/format-tools";
import { t } from "../stores/i18n";

interface ToolDef {
  icon: string;
  iconBg: string;
  iconColor: string;
  titleKey: string;
  descKey: string;
  action: () => void;
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
    if (content.startsWith("{") || content.startsWith("[")) {
      formatJson(content);
    } else if (content.startsWith("<")) {
      formatXml(content);
    }
  };

  const handleMarkdown = () => {
    // Placeholder — future markdown conversion
  };

  const tools: ToolDef[] = [
    { icon: "ph-translate", iconBg: "bg-blue-100 dark:bg-blue-900/40", iconColor: "text-blue-600 dark:text-blue-400", titleKey: "toolbox.translate", descKey: "toolbox.translateDesc", action: handleTranslate },
    { icon: "ph-text-align-center", iconBg: "bg-purple-100 dark:bg-purple-900/40", iconColor: "text-purple-600 dark:text-purple-400", titleKey: "toolbox.summarize", descKey: "toolbox.summarizeDesc", action: handleSummarize },
    { icon: "ph-pencil-simple", iconBg: "bg-indigo-100 dark:bg-indigo-900/40", iconColor: "text-indigo-600 dark:text-indigo-400", titleKey: "toolbox.rewrite", descKey: "toolbox.rewriteDesc", action: handleRewrite },
    { icon: "ph-brackets-curly", iconBg: "bg-green-100 dark:bg-green-900/40", iconColor: "text-green-600 dark:text-green-400", titleKey: "toolbox.format", descKey: "toolbox.formatDesc", action: handleFormat },
    { icon: "", iconBg: "bg-orange-100 dark:bg-orange-900/40", iconColor: "text-orange-600 dark:text-orange-400", titleKey: "toolbox.markdown", descKey: "toolbox.markdownDesc", action: handleMarkdown },
  ];

  return (
    <div class="w-[220px] bg-white/20 border-l flex flex-col shrink-0 p-4"
      style={{ "border-color": "rgba(255,255,255,0.4)" }}
    >
      {/* Header */}
      <div class="flex items-center gap-2 font-medium px-1 mb-4" style={{ color: "var(--color-text-secondary)" }}>
        <i class="ph-fill ph-magic-wand text-blue-500" />
        {t("toolbox.title")}
      </div>

      {/* Tool cards */}
      <div class="space-y-3 flex-1 overflow-y-auto no-scrollbar pb-10">
        {tools.map((tool) => (
          <button
            class="glass-card-ref w-full p-3 rounded-xl cursor-pointer flex items-center gap-3 text-left"
            onClick={tool.action}
            disabled={isProcessing() || !selectedItem()}
            style={{ opacity: isProcessing() || !selectedItem() ? 0.5 : 1 }}
          >
            <div class={`w-8 h-8 rounded-lg ${tool.iconBg} ${tool.iconColor} flex items-center justify-center shrink-0`}>
              <Show when={tool.icon} fallback={<span class="font-bold text-sm">M↓</span>}>
                <i class={`ph ${tool.icon} text-lg`} />
              </Show>
            </div>
            <div>
              <div class="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                {t(tool.titleKey)}
              </div>
              <div class="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {t(tool.descKey)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* No selection notice */}
      <Show when={!selectedItem()}>
        <div class="text-center text-[10px] py-2" style={{ color: "var(--color-text-muted)" }}>
          {t("toolbox.noSelection")}
        </div>
      </Show>

      {/* Privacy footer */}
      <div class="mt-auto pt-4 text-center text-[10px] flex items-center justify-center gap-1"
        style={{ color: "var(--color-text-muted)", "border-top": "1px solid rgba(255,255,255,0.3)" }}
      >
        <i class="ph ph-shield-check" />
        {t("toolbox.privacyNote")}
      </div>
    </div>
  );
}
