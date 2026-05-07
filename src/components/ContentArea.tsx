import { For, Show, createSignal, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  items,
  selectedId,
  setSelectedId,
  deleteItems,
  pinItem,
  unpinItem,
  loading,
  selectedIds,
  setSelectedIds,
  toggleSelect,
  clearSelection,
  selectAll,
  timeFilter,
  setTimeFilter,
  categoryFilter,
  reorderItems,
  searchQuery,
  type ClipboardItem,
} from "../stores/clipboard";
import { t } from "../stores/i18n";
import ClipboardItemCard from "./ClipboardItemCard";
import ContextMenu from "./ContextMenu";
import ConfirmDialog from "./ConfirmDialog";
import ImagePreview from "./ImagePreview";
import ItemDetailModal from "./ItemDetailModal";

const TIME_FILTERS = [
  { key: "all", labelKey: "filter.all" },
  { key: "pinned", labelKey: "filter.pinned" },
  { key: "today", labelKey: "filter.today" },
  { key: "yesterday", labelKey: "filter.yesterday" },
  { key: "last7days", labelKey: "filter.last7days" },
] as const;

export function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export function isYesterday(ts: number): boolean {
  const d = new Date(ts);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();
}

export function isLast7Days(ts: number): boolean {
  return Date.now() - ts < 7 * 24 * 60 * 60 * 1000;
}

export default function ContentArea() {
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    itemId: string;
    isPinned: boolean;
  } | null>(null);

  const [batchMode, setBatchMode] = createSignal(false);
  const [confirmOpen, setConfirmOpen] = createSignal(false);

  // Drag-and-drop state
  const [dragItemId, setDragItemId] = createSignal<string | null>(null);
  const [dropTargetId, setDropTargetId] = createSignal<string | null>(null);

  // Image preview state
  const [previewSrc, setPreviewSrc] = createSignal<string | null>(null);

  // Item detail modal state (US-006)
  const [detailItem, setDetailItem] = createSignal<ClipboardItem | null>(null);

  // Filtered items based on category + time filter
  const filteredItems = createMemo(() => {
    let result = items();

    // Category filter
    const cat = categoryFilter();
    if (cat !== "all") {
      result = result.filter((i) => {
        if (["code", "link", "image", "video", "text"].includes(cat)) {
          return (i.ai_type || i.type) === cat;
        }
        // Tag filter
        return i.ai_tags?.includes(cat) ?? false;
      });
    }

    // Time filter
    const tf = timeFilter();
    switch (tf) {
      case "pinned":
        result = result.filter((i) => i.pinned);
        break;
      case "today":
        result = result.filter((i) => isToday(i.timestamp));
        break;
      case "yesterday":
        result = result.filter((i) => isYesterday(i.timestamp));
        break;
      case "last7days":
        result = result.filter((i) => isLast7Days(i.timestamp));
        break;
    }

    return result;
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Delete" && selectedId() && !batchMode()) {
      e.preventDefault();
      deleteItems([selectedId()!]);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "p") {
      e.preventDefault();
      const id = selectedId();
      if (!id) return;
      const item = items().find((i) => i.id === id);
      if (item) {
        if (item.pinned) unpinItem(id);
        else pinItem(id);
      }
    }
    if (e.key === "Escape" && batchMode()) {
      setBatchMode(false);
      clearSelection();
    }
    // Ctrl+A / Cmd+A to toggle select all in batch mode (US-005)
    if ((e.metaKey || e.ctrlKey) && e.key === "a" && batchMode()) {
      e.preventDefault();
      const allIds = filteredItems().map(i => i.id) as string[];
      if (allIds.every(id => selectedIds().has(id))) {
        setSelectedIds(new Set<string>());
      } else {
        setSelectedIds(new Set<string>(allIds));
      }
    }
    // Arrow key navigation (US-003)
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const list = filteredItems();
      if (list.length === 0) return;
      const cur = selectedId();
      if (!cur) {
        setSelectedId(e.key === "ArrowDown" ? list[0].id : list[list.length - 1].id);
      } else {
        const idx = list.findIndex((i) => i.id === cur);
        if (idx === -1) {
          setSelectedId(list[0].id);
        } else {
          const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
          if (next >= 0 && next < list.length) {
            setSelectedId(list[next].id);
          }
        }
      }
      // Scroll into view
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-item-id="${selectedId()}"]`);
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  };

  const enterBatchMode = () => {
    setBatchMode(true);
    clearSelection();
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    clearSelection();
    setConfirmOpen(false);
  };

  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds());
    if (ids.length === 0) return;
    setConfirmOpen(true);
  };

  const confirmBatchDelete = async () => {
    const ids = Array.from(selectedIds());
    await deleteItems(ids);
    exitBatchMode();
  };

  const handleExport = async () => {
    const ids = Array.from(selectedIds());
    if (ids.length === 0) return;
    const filePath = await save({
      defaultPath: `aboard-export.zip`,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!filePath) return;
    try {
      await invoke("export_items", { ids, path: filePath });
      exitBatchMode();
    } catch (e) {
      console.error("[ContentArea] Export failed:", e);
    }
  };

  const handleItemDelete = (id: string) => {
    deleteItems([id]);
  };

  const handleItemPin = (id: string, pinned: boolean) => {
    if (pinned) unpinItem(id);
    else pinItem(id);
  };

  const selectedCount = () => selectedIds().size;

  return (
    <div
      class="flex-1 flex flex-col bg-transparent relative min-w-0"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Filter tabs */}
      <div class="flex flex-nowrap gap-4 px-6 pt-4 pb-2 border-b border-[var(--color-border)] text-sm text-[var(--color-text-muted)] sticky top-0 glass-panel-inner backdrop-blur-md z-10 whitespace-nowrap overflow-x-auto no-scrollbar"
      >
        <For each={TIME_FILTERS}>
          {(filter) => {
            const isActive = () => timeFilter() === filter.key;
            return (
              <button
                class="pb-1 cursor-pointer transition-colors"
                classList={{
                  "text-accent font-medium border-b-2 border-accent": isActive(),
                  "hover:text-gray-800 dark:hover:text-gray-300": !isActive(),
                }}
                onClick={() => setTimeFilter(filter.key)}
              >
                {t(filter.labelKey)}
              </button>
            );
          }}
        </For>

        <div class="flex-1" />

        {/* Batch mode toggle */}
        <Show when={!batchMode()}>
          <button
            class="text-xs px-2 py-1 rounded-lg transition-colors hover:bg-white/30 text-gray-400"
            onClick={enterBatchMode}
          >
            {t("clipboard.batch")}
          </button>
        </Show>
      </div>

      {/* Batch mode toolbar */}
      <Show when={batchMode()}>
        <div class="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]"
        >
          <button class="px-3 py-1.5 text-xs rounded-lg hover:bg-white/30 transition-colors text-gray-600" onClick={selectAll}>
            {t("clipboard.selectAll")}
          </button>
          <button class="px-3 py-1.5 text-xs rounded-lg hover:bg-white/30 transition-colors text-gray-600" onClick={clearSelection}>
            {t("clipboard.clearSel")}
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded-lg text-white transition-smooth disabled:opacity-40 bg-red-500"
            onClick={handleBatchDelete}
            disabled={selectedCount() === 0}
          >
            {t("clipboard.deleteSelected")} ({selectedCount()})
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded-lg text-white disabled:opacity-40 bg-accent"
            disabled={selectedCount() === 0}
            onClick={handleExport}
          >
            {t("clipboard.export")}
          </button>
          <div class="flex-1" />
          <button class="px-3 py-1.5 text-xs rounded-lg hover:bg-white/30 transition-colors text-gray-600" onClick={exitBatchMode}>
            {t("clipboard.cancel")}
          </button>
        </div>
      </Show>

      {/* Content list — timeline layout */}
      <div class="flex-1 overflow-y-auto no-scrollbar p-6 space-y-4">
        <Show
          when={filteredItems().length > 0}
          fallback={
            <Show when={!loading()} fallback={
              <div class="flex items-center justify-center h-32 text-sm text-gray-400">
                {t("clipboard.loading")}
              </div>
            }>
              <div class="flex flex-col items-center justify-center py-16 text-gray-400">
                <i class="ph ph-clipboard-text text-5xl mb-4 text-gray-300 dark:text-gray-600" />
                <p class="text-sm mb-2">{t("clipboard.noItems")}</p>
                <p class="text-[11px] text-gray-300 dark:text-gray-600">⌘⇧V</p>
              </div>
            </Show>
          }
        >
            <For each={filteredItems()}>
              {(item) => {
                const timeStr = () => new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const isDragging = () => dragItemId() === item.id;
                const isDropTarget = () => dropTargetId() === item.id;
                return (
                  <div
                    class="flex gap-4 group animate-slide-in transition-opacity"
                    classList={{
                      "opacity-40": isDragging(),
                      "border-t-2 border-blue-400": isDropTarget(),
                    }}
                    draggable={true}
                    onDragStart={(e) => {
                      setDragItemId(item.id);
                      e.dataTransfer!.effectAllowed = "move";
                      e.dataTransfer!.setData("text/plain", item.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer!.dropEffect = "move";
                      setDropTargetId(item.id);
                    }}
                    onDragLeave={() => {
                      if (dropTargetId() === item.id) setDropTargetId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromId = dragItemId();
                      if (fromId && fromId !== item.id) {
                        const allItems = items();
                        const fromIdx = allItems.findIndex((i) => i.id === fromId);
                        const toIdx = allItems.findIndex((i) => i.id === item.id);
                        if (fromIdx !== -1 && toIdx !== -1) {
                          reorderItems(fromIdx, toIdx);
                        }
                      }
                      setDragItemId(null);
                      setDropTargetId(null);
                    }}
                    onDragEnd={() => {
                      setDragItemId(null);
                      setDropTargetId(null);
                    }}
                  >
                    {/* Timeline timestamp */}
                    <div class="text-[10px] w-8 text-right shrink-0 mt-1 text-gray-400">
                      {timeStr()}
                    </div>
                    {/* Card */}
                    <ClipboardItemCard
                      item={item}
                      data-item-id={item.id}
                      isSelected={batchMode() ? false : item.id === selectedId()}
                      showCheckbox={batchMode()}
                      checked={selectedIds().has(item.id)}
                      timeline={true}
                      searchQuery={searchQuery()}
                      onSelect={(id) => {
                        if (batchMode()) toggleSelect(id);
                        else setSelectedId(id);
                      }}
                      onContextMenu={(e, id, pinned) =>
                        setContextMenu({
                          x: (e as MouseEvent).clientX,
                          y: (e as MouseEvent).clientY,
                          itemId: id,
                          isPinned: pinned,
                        })
                      }
                      onDelete={handleItemDelete}
                      onPin={handleItemPin}
                      onImageClick={(src) => setPreviewSrc(src)}
                      onDoubleClick={() => setDetailItem(item)}
                    />
                  </div>
                );
              }}
            </For>
          </Show>
      </div>

      {/* Context menu */}
      <Show when={contextMenu() !== null}>
        {(() => {
          const cm = contextMenu();
          if (!cm) return null;
          const currentItem = items().find((i) => i.id === cm.itemId);
          return (
            <ContextMenu
              x={cm.x}
              y={cm.y}
              itemId={cm.itemId}
              isPinned={cm.isPinned}
              content={currentItem?.content || ""}
              itemType={currentItem?.type || "text"}
              filePath={currentItem?.file_path}
              onClose={() => setContextMenu(null)}
            />
          );
        })()}
      </Show>

      <ConfirmDialog
        open={confirmOpen()}
        title={t("clipboard.confirmDelete")}
        message={t("clipboard.confirmDeleteMsg", { count: String(selectedCount()) })}
        onConfirm={confirmBatchDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <Show when={previewSrc() !== null}>
        <ImagePreview src={previewSrc()!} onClose={() => setPreviewSrc(null)} />
      </Show>

      <ItemDetailModal item={detailItem()} onClose={() => setDetailItem(null)} />
    </div>
  );
}
