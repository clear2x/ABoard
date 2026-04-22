import { For, Show, createMemo } from "solid-js";
import { items, categoryFilter, setCategoryFilter } from "../stores/clipboard";
import { t } from "../stores/i18n";

const CATEGORIES = [
  { key: "all", icon: "ph-squares-four", labelKey: "sidebar.all" },
  { key: "code", icon: "ph-code", labelKey: "sidebar.code" },
  { key: "link", icon: "ph-link", labelKey: "sidebar.links" },
  { key: "image", icon: "ph-image", labelKey: "sidebar.images" },
  { key: "text", icon: "ph-file-text", labelKey: "sidebar.text" },
] as const;

export default function Sidebar() {
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

  const allTags = createMemo(() => {
    const tagMap = new Map<string, number>();
    for (const item of items()) {
      if (item.ai_tags) {
        for (const tag of item.ai_tags) {
          tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
        }
      }
    }
    return Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  });

  return (
    <div class="w-[180px] bg-white/20 border-r border-white/40 flex flex-col gap-6 overflow-y-auto no-scrollbar shrink-0 p-3">
      {/* Logo */}
      <div class="flex items-center gap-2 font-bold text-gray-700 px-2 pt-2">
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
                  "text-gray-600 hover:bg-white/40": !isActive(),
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
          <div class="text-xs text-gray-400 font-medium px-2 mb-2">
            {t("sidebar.tags")}
          </div>
          <ul class="space-y-1">
            <For each={allTags()}>
              {([tag, count]) => (
                <li
                  class="flex justify-between items-center px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors hover:bg-white/40 text-gray-600"
                  onClick={() => setCategoryFilter(tag)}
                >
                  <span>{tag}</span>
                  <span class="text-[10px] text-gray-400">{count}</span>
                </li>
              )}
            </For>
          </ul>
          <div class="px-3 py-2 mt-1 text-sm text-blue-500 cursor-pointer flex items-center gap-1 hover:text-blue-600">
            <i class="ph ph-plus" /> {t("sidebar.newTag")}
          </div>
        </div>
      </Show>

      {/* Storage usage */}
      <div class="mt-auto px-2 pb-2">
        <div class="text-[10px] text-gray-400 mb-1 font-medium">
          {t("sidebar.storage")}
        </div>
        <div class="flex items-end gap-1 mb-1.5">
          <span class="text-xs font-bold text-gray-600">12.4 GB</span>
          <span class="text-[9px] text-gray-400">/ 50 GB</span>
        </div>
        <div class="w-full h-1.5 bg-gray-200/50 rounded-full overflow-hidden">
          <div class="h-full bg-blue-500 rounded-full" style={{ width: "25%" }} />
        </div>
      </div>
    </div>
  );
}
