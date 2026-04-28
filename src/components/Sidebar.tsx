import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { items, categoryFilter, setCategoryFilter, storageSize, itemCount, loadStorageStats } from "../stores/clipboard";
import { t } from "../stores/i18n";

const CATEGORIES = [
  { key: "all", icon: "ph-squares-four", labelKey: "sidebar.all" },
  { key: "code", icon: "ph-code", labelKey: "sidebar.code" },
  { key: "link", icon: "ph-link", labelKey: "sidebar.links" },
  { key: "image", icon: "ph-image", labelKey: "sidebar.images" },
  { key: "video", icon: "ph-video-camera", labelKey: "sidebar.videos" },
  { key: "text", icon: "ph-file-text", labelKey: "sidebar.text" },
] as const;

export default function Sidebar() {
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // --- Snippets state ---
  interface Snippet {
    id: string;
    title: string;
    content: string;
    created_at: number;
    updated_at: number;
  }

  const [snippets, setSnippets] = createSignal<Snippet[]>([]);
  const [showSnippetModal, setShowSnippetModal] = createSignal(false);
  const [editingSnippet, setEditingSnippet] = createSignal<Snippet | null>(null);
  const [snippetTitle, setSnippetTitle] = createSignal("");
  const [snippetContent, setSnippetContent] = createSignal("");
  const [confirmDeleteId, setConfirmDeleteId] = createSignal<string | null>(null);

  async function loadSnippets() {
    try {
      const result = await invoke<Snippet[]>("list_snippets");
      setSnippets(result);
    } catch (e) {
      console.error("[sidebar] Failed to load snippets:", e);
    }
  }

  function openNewSnippet() {
    setEditingSnippet(null);
    setSnippetTitle("");
    setSnippetContent("");
    setShowSnippetModal(true);
  }

  function openEditSnippet(snippet: Snippet) {
    setEditingSnippet(snippet);
    setSnippetTitle(snippet.title);
    setSnippetContent(snippet.content);
    setShowSnippetModal(true);
  }

  async function saveSnippet() {
    const title = snippetTitle().trim();
    const content = snippetContent().trim();
    if (!title || !content) return;

    try {
      const editing = editingSnippet();
      if (editing) {
        await invoke("update_snippet", { id: editing.id, title, content });
      } else {
        await invoke("create_snippet", { title, content });
      }
      setShowSnippetModal(false);
      await loadSnippets();
    } catch (e) {
      console.error("[sidebar] Failed to save snippet:", e);
    }
  }

  async function deleteSnippet(id: string) {
    try {
      await invoke("delete_snippet", { id });
      await loadSnippets();
    } catch (e) {
      console.error("[sidebar] Failed to delete snippet:", e);
    }
  }

  async function copySnippetContent(snippet: Snippet) {
    try {
      await navigator.clipboard.writeText(snippet.content);
    } catch (e) {
      console.error("[sidebar] Failed to copy snippet:", e);
    }
  }

  onMount(() => {
    loadStorageStats();
    loadSnippets();
  });

  const categoryCounts = createMemo(() => {
    const all = items();
    return {
      all: all.length,
      code: all.filter((i) => (i.ai_type || i.type) === "code").length,
      link: all.filter((i) => (i.ai_type || i.type) === "link").length,
      image: all.filter((i) => (i.ai_type || i.type) === "image").length,
      video: all.filter((i) => (i.ai_type || i.type) === "video").length,
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

      {/* Snippets section */}
      <div>
        <div class="flex items-center justify-between px-2 mb-2">
          <span class="text-xs text-gray-400 font-medium dark:text-gray-500">
            {t("sidebar.snippets")}
          </span>
          <button
            class="text-gray-400 hover:text-blue-500 transition-colors"
            onClick={openNewSnippet}
            title={t("snippet.new")}
          >
            <i class="ph ph-plus text-sm" />
          </button>
        </div>
        <Show
          when={snippets().length > 0}
          fallback={
            <div class="text-[10px] text-gray-300 dark:text-gray-600 px-3">
              —
            </div>
          }
        >
          <ul class="space-y-1">
            <For each={snippets()}>
              {(snippet) => (
                <div class="contents">
                <li
                  class="group flex justify-between items-center px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors hover:bg-white/40 text-gray-600 dark:text-gray-300 dark:hover:bg-white/10"
                  onClick={() => copySnippetContent(snippet)}
                >
                  <span class="truncate flex-1 mr-1">{snippet.title}</span>
                  <span class="hidden group-hover:flex items-center gap-1">
                    <button
                      class="text-gray-400 hover:text-blue-500 transition-colors"
                      onClick={(e) => { e.stopPropagation(); openEditSnippet(snippet); }}
                      title={t("snippet.title")}
                    >
                      <i class="ph ph-pencil-simple text-xs" />
                    </button>
                    <button
                      class="text-gray-400 hover:text-red-500 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(snippet.id); }}
                      title={t("snippet.delete")}
                    >
                      <i class="ph ph-trash text-xs" />
                    </button>
                  </span>
                </li>
                <Show when={confirmDeleteId() === snippet.id}>
                  <li class="flex items-center justify-between px-3 py-1 text-[10px] text-gray-500">
                    <span>{t("dialog.deleteConfirm")}</span>
                    <span class="flex gap-1">
                      <button
                        class="text-red-500 hover:text-red-700 font-medium"
                        onClick={(e) => { e.stopPropagation(); deleteSnippet(snippet.id); setConfirmDeleteId(null); }}
                      >{t("dialog.yes")}</button>
                      <button
                        class="text-gray-400 hover:text-gray-600"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                      >{t("dialog.no")}</button>
                    </span>
                  </li>
                </Show>
                </div>
              )}
            </For>
          </ul>
        </Show>
      </div>

      {/* Snippet modal */}
      <Show when={showSnippetModal()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowSnippetModal(false)}>
          <div
            class="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-xl shadow-xl border border-white/40 dark:border-white/10 w-72 p-4 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {editingSnippet() ? t("snippet.title") : t("snippet.new")}
            </div>
            <input
              type="text"
              class="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/60 dark:bg-slate-700/60 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-blue-400 transition-colors"
              placeholder={t("snippet.title")}
              value={snippetTitle()}
              onInput={(e) => setSnippetTitle(e.currentTarget.value)}
            />
            <textarea
              class="w-full h-32 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/60 dark:bg-slate-700/60 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-blue-400 resize-none transition-colors"
              placeholder={t("snippet.content")}
              value={snippetContent()}
              onInput={(e) => setSnippetContent(e.currentTarget.value)}
            />
            <div class="flex justify-end gap-2">
              <button
                class="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setShowSnippetModal(false)}
              >
                {t("clipboard.cancel")}
              </button>
              <button
                class="px-3 py-1.5 rounded-lg text-xs bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                onClick={saveSnippet}
              >
                {t("snippet.save")}
              </button>
            </div>
          </div>
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
