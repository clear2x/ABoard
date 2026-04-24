import { For, Show, createMemo, onMount } from "solid-js";
import { items, categoryFilter, setCategoryFilter, storageSize, itemCount, loadStorageStats } from "../stores/clipboard";
import { t } from "../stores/i18n";

const CATEGORIES = [
  { key: "all", icon: "ph-squares-four", labelKey: "sidebar.all" },
  { key: "code", icon: "ph-code", labelKey: "sidebar.code" },
  { key: "link", icon: "ph-link", labelKey: "sidebar.links" },
  { key: "image", icon: "ph-image", labelKey: "sidebar.images" },
  { key: "text", icon: "ph-file-text", labelKey: "sidebar.text" },
] as const;

export default function Sidebar() {
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  onMount(() => {
    loadStorageStats();
  });

  const categoryCounts = createMemo(() => {
    const all = items();
    return {
      all: all.length,
      code: all.filter((i) => (i.ai_type || i.type) === "code").length,
      link: all.filter((i) => (i.ai_type || i.type) === "link").length,
      image: all.filter((i) => (i.ai_type || i.type) === "image").length,
      text: all.filter((i) => (i.ai_type || i.type) === "text").length,
    };
  });

  const isValidTag = (tag: string) => {
    if (tag.length < 2) return false;
    // Filter out punctuation-only tags
    if (/^[\s\p{P}\p{S}]+$/u.test(tag)) return false;
    return true;
  };

  const allTags = createMemo(() => {
    const tagMap = new Map<string, number>();
    for (const item of items()) {
      if (item.ai_tags) {
        for (const tag of item.ai_tags) {
          if (isValidTag(tag)) {
            tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
          }
        }
      }
    }
    return Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  });

  return (
    <div class="w-[160px] min-w-[160px] bg-white/20 border-r border-white/40 flex flex-col gap-6 overflow-y-auto no-scrollbar shrink-0 p-3 dark:bg-slate-800/30 dark:border-white/10">
      {/* Logo */}
      <div class="flex items-center gap-2 font-bold text-gray-700 dark:text-gray-200 px-2 pt-2">
        <i class="ph-fill ph-clipboard-text text-blue-600 text-xl" />
        <span>ABoard</span>
      </div>

      {/* Category navigation */}
      <ul class="space-y-1">
        <For each={CATEGORIES}>
          {(cat) => {
            const isActive = () => categoryFilter() === cat.key;
            const count = () => categoryCounts()[cat.key as keyof ReturnType<typeof categoryCounts>] ?? 0;
            return (
              <li
                class="flex justify-between items-center px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors"
                classList={{
                  "bg-blue-500 text-white shadow-sm": isActive(),
                  "text-gray-600 hover:bg-white/40 dark:text-gray-300 dark:hover:bg-white/10": !isActive(),
                }}
                onClick={() => setCategoryFilter(cat.key)}
              >
                <span class="flex items-center gap-2">
                  <i class={`ph ${cat.icon}`} />
                  {t(cat.labelKey)}
                </span>
                <span classList={{ "bg-white/20 px-1.5 rounded text-[10px]": isActive(), "text-[10px] text-gray-400": !isActive() }}>
                  {count()}
                </span>
              </li>
            );
          }}
        </For>
      </ul>

      {/* Tags section */}
      <Show when={allTags().length > 0}>
        <div>
          <div class="text-xs text-gray-400 font-medium px-2 mb-2 dark:text-gray-500">
            {t("sidebar.tags")}
          </div>
          <ul class="space-y-1">
            <For each={allTags()}>
              {([tag, count]) => (
                <li
                  class="flex justify-between items-center px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors hover:bg-white/40 text-gray-600 dark:text-gray-300 dark:hover:bg-white/10"
                  onClick={() => setCategoryFilter(tag)}
                >
                  <span>{tag}</span>
                  <span class="text-[10px] text-gray-400">{count}</span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      {/* Storage usage */}
      <div class="mt-auto px-2 pb-2">
        <div class="text-[10px] text-gray-400 mb-1 font-medium dark:text-gray-500">
          {t("sidebar.clipboardData")}
        </div>
        <div class="flex items-baseline gap-1 mb-1">
          <span class="text-xs font-bold text-gray-600 dark:text-gray-300">{formatSize(storageSize())}</span>
          <span class="text-[9px] text-gray-400">{t("sidebar.records", { n: itemCount() })}</span>
        </div>
      </div>
    </div>
  );
}
