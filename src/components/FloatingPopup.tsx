import { createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { items, loadHistory, type ClipboardItem, copyItemContent, pinItem, unpinItem, deleteItems, copiedId, reorderItems, startClipboardListener } from "../stores/clipboard";
import { initLocale, t } from "../stores/i18n";
import { initTheme } from "../stores/theme";

function displayType(item: ClipboardItem): string {
  return item.ai_type || item.type;
}

function typeIcon(type: string): { icon: string; bg: string; color: string; letter?: string } {
  switch (type) {
    case "code":
      return { icon: "ph-code", bg: "bg-purple-50 dark:bg-purple-900/30", color: "text-purple-500" };
    case "link":
      return { icon: "ph-link", bg: "bg-blue-50 dark:bg-blue-900/30", color: "text-blue-500" };
    case "image":
      return { icon: "ph-image", bg: "bg-green-50 dark:bg-green-900/30", color: "text-green-500" };
    case "video":
      return { icon: "ph-video-camera", bg: "bg-rose-50 dark:bg-rose-900/30", color: "text-rose-500" };
    default:
      return { icon: "", bg: "bg-blue-100 dark:bg-blue-900/30", color: "text-blue-600", letter: "T" };
  }
}

function itemLabel(item: ClipboardItem): string {
  if (item.type === "video") {
    return item.file_path ? item.file_path.split("/").pop() || "Video" : "Video recording";
  }
  if (item.type === "image") {
    return "Image";
  }
  return item.content.slice(0, 80);
}

export default function FloatingPopup() {
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [popupItems, setPopupItems] = createSignal<ClipboardItem[]>([]);
  const [searchText, setSearchText] = createSignal("");
  const [hoveredId, setHoveredId] = createSignal<string | null>(null);
  const [windowPinned, setWindowPinned] = createSignal(false);
  const [dragItemId, setDragItemId] = createSignal<string | null>(null);
  const [dropTargetId, setDropTargetId] = createSignal<string | null>(null);

  function handlePopupDrop(fromId: string, toId: string) {
    if (fromId === toId) return;
    // Reorder popupItems locally
    const list = popupItems();
    const fromIdx = list.findIndex((i) => i.id === fromId);
    const toIdx = list.findIndex((i) => i.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...list];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setPopupItems(next);
    // Also sync global store
    const allItems = items();
    const gFrom = allItems.findIndex((i) => i.id === fromId);
    const gTo = allItems.findIndex((i) => i.id === toId);
    if (gFrom !== -1 && gTo !== -1) reorderItems(gFrom, gTo);
  }

  onMount(async () => {
    initLocale();
    initTheme();
    await loadHistory(0, 20);
    setPopupItems(items().slice(0, 20));

    // Listen for clipboard updates to refresh popup content (debounced)
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const unlisten = await listen("clipboard-update", async () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(async () => {
        await loadHistory(0, 20);
        setPopupItems(items().slice(0, 20));
      }, 300);
    });
    onCleanup(() => {
      unlisten();
      if (reloadTimer) clearTimeout(reloadTimer);
    });

    await getCurrentWindow().setFocus();

    const handler = (e: KeyboardEvent) => {
      const current = selectedIndex();
      const list = filteredItems();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(Math.min(current + 1, list.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(Math.max(current - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectAndPaste(list[current]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        getCurrentWindow().hide();
      }
    };
    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));

    // Auto-hide on blur when not pinned
    const blurHandler = () => {
      if (!windowPinned()) {
        getCurrentWindow().hide();
      }
    };
    window.addEventListener("blur", blurHandler);
    onCleanup(() => window.removeEventListener("blur", blurHandler));
  });

  createEffect(() => {
    const len = filteredItems().length;
    if (selectedIndex() >= len) {
      setSelectedIndex(Math.max(0, len - 1));
    }
  });

  const filteredItems = () => {
    const q = searchText().toLowerCase();
    if (!q) return popupItems();
    return popupItems().filter((i) => i.content.toLowerCase().includes(q));
  };

  const pinnedItems = () => filteredItems().filter((i) => i.pinned);
  const recentItems = () => filteredItems().filter((i) => !i.pinned).slice(0, 8);

  async function selectAndPaste(item: ClipboardItem) {
    if (!item) return;
    try {
      await invoke("paste_to_active", { content: item.content });
    } catch (e) {
      console.error("[FloatingPopup] Paste failed:", e);
    }
    await getCurrentWindow().hide();
  }

  async function handleCopy(e: MouseEvent, item: ClipboardItem) {
    e.stopPropagation();
    await copyItemContent(item);
  }

  async function handlePin(e: MouseEvent, id: string) {
    e.stopPropagation();
    const item = popupItems().find((i) => i.id === id);
    if (!item) return;
    if (item.pinned) {
      await unpinItem(id);
      setPopupItems((prev) => prev.map((i) => (i.id === id ? { ...i, pinned: false } : i)));
    } else {
      await pinItem(id);
      setPopupItems((prev) => prev.map((i) => (i.id === id ? { ...i, pinned: true } : i)));
    }
  }

  async function handleDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    await deleteItems([id]);
    setPopupItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function openMainWindow() {
    try {
      await invoke("show_main_window");
    } catch {}
    await getCurrentWindow().hide();
  }

  async function openSettings() {
    try {
      await invoke("show_main_window");
      // Give main window a moment to show, then emit settings event
      setTimeout(async () => {
        try {
          await invoke("emit_open_settings");
        } catch {}
      }, 100);
    } catch {}
    await getCurrentWindow().hide();
  }

  function ItemActions(props: { item: ClipboardItem }) {
    return (
      <div class="flex items-center gap-1 text-gray-400 shrink-0 ml-2">
        <button
          class="transition-colors hover:text-yellow-400"
          onClick={(e) => handlePin(e, props.item.id)}
          title={props.item.pinned ? t("ctx.unpin") : t("ctx.pin")}
        >
          <i class={`ph ${props.item.pinned ? "ph-fill ph-star text-yellow-400" : "ph ph-star"}`} />
        </button>
        <button
          class="transition-colors hover:text-blue-500"
          onClick={(e) => handleCopy(e, props.item)}
          title={t("ctx.copy")}
        >
          <i class={copiedId() === props.item.id ? "ph-fill ph-check text-blue-500" : "ph ph-copy"} />
        </button>
        <button
          class="transition-colors hover:text-red-500"
          onClick={(e) => handleDelete(e, props.item.id)}
          title={t("ctx.delete")}
        >
          <i class="ph ph-trash" />
        </button>
      </div>
    );
  }

  return (
    <div
      class="glass-panel h-screen flex flex-col overflow-hidden select-none animate-popup-in"
    >
      {/* Header — drag region */}
      <div class="titlebar px-4 pt-1 pb-2 border-b border-white/40" data-tauri-drag-region>
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2 font-bold text-lg tracking-tight text-gray-700 pl-14">
            <i class="ph-fill ph-clipboard-text text-blue-600" />
            ABoard
          </div>
          <div class="flex gap-2 text-gray-400">
            <button
              class="transition-colors hover:text-amber-500"
              onClick={() => setWindowPinned((p) => !p)}
              title={windowPinned() ? "Unpin window" : "Pin window"}
            >
              <i class={`ph ${windowPinned() ? "ph-fill ph-push-pin text-amber-500" : "ph ph-push-pin"}`} />
            </button>
            <button
              class="hover:text-gray-700 transition-colors"
              onClick={openSettings}
              title={t("settings.title")}
            >
              <i class="ph ph-gear" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div class="relative flex items-center bg-white/60 border border-white/80 rounded-lg px-3 py-1.5 shadow-sm">
          <i class="ph ph-magnifying-glass text-sm text-gray-400" />
          <input
            type="text"
            placeholder={t("float.search")}
            value={searchText()}
            onInput={(e) => { setSearchText((e.target as HTMLInputElement).value); setSelectedIndex(0); }}
            class="bg-transparent border-none outline-none text-xs ml-2 w-full text-gray-600 placeholder-gray-400"
          />
          <span class="text-[10px] bg-gray-200/50 text-gray-500 px-1.5 rounded border border-gray-300/50 shrink-0">⌘K</span>
        </div>
      </div>

      {/* Content sections */}
      <div class="flex-1 overflow-y-auto no-scrollbar p-3 space-y-4">
        <Show when={filteredItems().length === 0}>
          <div class="text-center py-8 text-sm text-gray-400">
            {t("float.empty")}
          </div>
        </Show>

        {/* Pinned section */}
        <Show when={pinnedItems().length > 0}>
          <div>
            <div class="flex justify-between items-center text-xs mb-2 px-1 font-medium text-gray-500">
              <span class="flex items-center gap-1"><i class="ph-fill ph-push-pin" /> {t("float.pinned")}</span>
            </div>
            <div class="space-y-2">
              <For each={pinnedItems()}>
                {(item) => {
                  const dtype = () => displayType(item);
                  const icon = () => typeIcon(dtype());
                  const globalIndex = () => filteredItems().indexOf(item);
                  return (
                    <div
                      class="glass-card p-3 rounded-xl cursor-pointer relative transition-opacity"
                      classList={{
                        "ring-1 ring-blue-500/50": globalIndex() === selectedIndex(),
                        "opacity-40": dragItemId() === item.id,
                        "border-t-2 border-blue-400": dropTargetId() === item.id,
                      }}
                      draggable={true}
                      onDragStart={(e) => { setDragItemId(item.id); e.dataTransfer!.effectAllowed = "move"; }}
                      onDragOver={(e) => { e.preventDefault(); setDropTargetId(item.id); }}
                      onDragLeave={() => { if (dropTargetId() === item.id) setDropTargetId(null); }}
                      onDrop={(e) => { e.preventDefault(); const from = dragItemId(); if (from) handlePopupDrop(from, item.id); setDragItemId(null); setDropTargetId(null); }}
                      onDragEnd={() => { setDragItemId(null); setDropTargetId(null); }}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => { setSelectedIndex(globalIndex()); selectAndPaste(item); }}
                    >
                      <div class="flex items-center gap-2">
                        <div class={`w-6 h-6 rounded-full ${icon().bg} ${icon().color} flex items-center justify-center shrink-0 text-xs font-bold border border-white/50 shadow-sm`}>
                          <Show when={icon().icon} fallback={icon().letter}>
                            <i class={`ph ${icon().icon}`} />
                          </Show>
                        </div>
                        <div class="text-xs text-gray-600 leading-tight truncate flex-1 min-w-0">
                          {itemLabel(item)}
                        </div>
                        <Show when={hoveredId() === item.id}>
                          <ItemActions item={item} />
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        {/* Recent section */}
        <Show when={recentItems().length > 0}>
          <div>
            <div class="flex justify-between items-center text-xs mb-2 px-1 font-medium text-gray-500">
              <span class="flex items-center gap-1"><i class="ph ph-clock" /> {t("float.recent")}</span>
            </div>
            <div class="space-y-2">
              <For each={recentItems()}>
                {(item) => {
                  const dtype = () => displayType(item);
                  const icon = () => typeIcon(dtype());
                  const globalIndex = () => filteredItems().indexOf(item);
                  return (
                    <div
                      class="glass-card p-3 rounded-xl cursor-pointer relative transition-opacity"
                      classList={{
                        "ring-1 ring-blue-500/50": globalIndex() === selectedIndex(),
                        "opacity-40": dragItemId() === item.id,
                        "border-t-2 border-blue-400": dropTargetId() === item.id,
                      }}
                      draggable={true}
                      onDragStart={(e) => { setDragItemId(item.id); e.dataTransfer!.effectAllowed = "move"; }}
                      onDragOver={(e) => { e.preventDefault(); setDropTargetId(item.id); }}
                      onDragLeave={() => { if (dropTargetId() === item.id) setDropTargetId(null); }}
                      onDrop={(e) => { e.preventDefault(); const from = dragItemId(); if (from) handlePopupDrop(from, item.id); setDragItemId(null); setDropTargetId(null); }}
                      onDragEnd={() => { setDragItemId(null); setDropTargetId(null); }}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => { setSelectedIndex(globalIndex()); selectAndPaste(item); }}
                    >
                      <div class="flex items-center gap-2">
                        <div class={`w-6 h-6 rounded-full ${icon().bg} ${icon().color} flex items-center justify-center shrink-0 border border-white/50 shadow-sm`}>
                          <Show when={icon().icon} fallback={icon().letter}>
                            <i class={`ph ${icon().icon}`} />
                          </Show>
                        </div>
                        <Show
                          when={dtype() === "code"}
                          fallback={
                            <div class="text-xs text-gray-600 leading-tight truncate flex-1 min-w-0">
                              {itemLabel(item)}
                            </div>
                          }
                        >
                          <div class="text-xs font-mono text-gray-600 leading-tight flex-1 min-w-0 truncate">
                            {item.content.slice(0, 100)}
                          </div>
                        </Show>
                        <Show when={hoveredId() === item.id}>
                          <ItemActions item={item} />
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>

      {/* Footer — expand to main window */}
      <div
        class="p-3 border-t border-white/40 flex items-center justify-between text-xs text-gray-500 cursor-pointer hover:bg-white/20 transition-colors"
        onClick={openMainWindow}
      >
        <span class="flex items-center gap-1">
          <i class="ph ph-arrows-out-simple" /> {t("float.openMainWindow")}
        </span>
        <span class="bg-gray-200/50 text-gray-500 px-1.5 rounded border border-gray-300/50 text-[10px]">
          ⌘⌥O
        </span>
      </div>
    </div>
  );
}
