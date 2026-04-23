import { For, Show, createSignal, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  items,
  selectedId,
  setSelectedId,
  deleteItems,
  pinItem,
  unpinItem,
  loading,
  selectedIds,
  toggleSelect,
  clearSelection,
  selectAll,
  timeFilter,
  setTimeFilter,
  categoryFilter,
} from "../stores/clipboard";
import { t } from "../stores/i18n";
import ClipboardItemCard from "./ClipboardItemCard";
import ContextMenu from "./ContextMenu";
import ConfirmDialog from "./ConfirmDialog";

const TIME_FILTERS = [
  { key: "all", labelKey: "filter.all" },
  { key: "pinned", labelKey: "filter.pinned" },
  { key: "today", labelKey: "filter.today" },
  { key: "yesterday", labelKey: "filter.yesterday" },
  { key: "last7days", labelKey: "filter.last7days" },
  { key: "custom", labelKey: "filter.custom" },
] as const;

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isYesterday(ts: number): boolean {
  const d = new Date(ts);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();
}

function isLast7Days(ts: number): boolean {
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

  // Filtered items based on category + time filter
  const filteredItems = createMemo(() => {
    let result = items();

    // Category filter
    const cat = categoryFilter();
    if (cat !== "all") {
      result = result.filter((i) => {
        if (["code", "link", "image", "text"].includes(cat)) {
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

  const handleExport = async (format: "json" | "markdown" | "text") => {
    const ids = Array.from(selectedIds());
    if (ids.length === 0) return;
    const extensions: Record<string, string> = { json: "json", markdown: "md", text: "txt" };
    const filePath = await open({
      multiple: false,
      directory: false,
      defaultPath: `aboard-export.${extensions[format]}`,
      filters: [{ name: format.toUpperCase(), extensions: [extensions[format]] }],
    });
    if (!filePath) return;
    try {
      await invoke("export_items", { ids, format, path: filePath });
      exitBatchMode();
    } catch (e) {
      console.error("[ContentArea] Export failed:", e);
    }
  };

  const [showExportMenu, setShowExportMenu] = createSignal(false);

  const handleItemDelete = (id: string) => {
    deleteItems([id]);
  };

  const handleItemPin = (id: string, pinned: boolean) => {
    if (pinned) unpinItem(id);
    else pinItem(id);
  };

  const cm = contextMenu();
  const selectedCount = () => selectedIds().size;

  return (
    <div
      class="flex-1 flex flex-col bg-white/10 relative dark:bg-slate-900/20 min-w-0"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Filter tabs */}
      <div class="flex flex-nowrap gap-4 px-6 pt-4 pb-2 border-b text-sm text-gray-500 sticky top-0 bg-white/20 backdrop-blur-md z-10 whitespace-nowrap overflow-x-auto no-scrollbar dark:bg-slate-800/30 dark:text-gray-400"
        style={{
          "border-color": "rgba(255,255,255,0.3)",
        }}
      >
        <For each={TIME_FILTERS}>
          {(filter) => {
            const isActive = () => timeFilter() === filter.key;
            return (
              <button
                class="pb-1 cursor-pointer transition-colors"
                classList={{
                  "text-blue-600 font-medium border-b-2 border-blue-600": isActive(),
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
        <div class="flex items-center gap-2 px-4 py-2 bg-white/10"
          style={{ "border-bottom": "1px solid rgba(255,255,255,0.2)" }}
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
          <div class="relative"
            onMouseEnter={() => setShowExportMenu(true)}
            onMouseLeave={() => setShowExportMenu(false)}
          >
            <button
              class="px-3 py-1.5 text-xs rounded-lg text-white disabled:opacity-40 bg-blue-500"
              disabled={selectedCount() === 0}
            >
              {t("clipboard.export")}
            </button>
            <Show when={showExportMenu() && selectedCount() > 0}>
              <div class="absolute top-full left-0 mt-1 py-1 min-w-[120px] glass-card animate-context-menu z-50"
                style={{ "box-shadow": "0 4px 6px rgba(0,0,0,0.1)" }}
              >
                <button class="w-full text-left px-3 py-2 text-xs hover:bg-white/30 text-gray-600"
                  onClick={() => handleExport("json")}
                >{t("clipboard.exportJson")}</button>
                <button class="w-full text-left px-3 py-2 text-xs hover:bg-white/30 text-gray-600"
                  onClick={() => handleExport("markdown")}
                >{t("clipboard.exportMd")}</button>
                <button class="w-full text-left px-3 py-2 text-xs hover:bg-white/30 text-gray-600"
                  onClick={() => handleExport("text")}
                >{t("clipboard.exportText")}</button>
              </div>
            </Show>
          </div>
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
              <div class="flex items-center justify-center h-32 text-sm text-gray-400">
                {t("clipboard.noItems")}
              </div>
            </Show>
          }
        >
            <For each={filteredItems()}>
              {(item) => {
                const timeStr = () => new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                return (
                  <div class="flex gap-4 group animate-slide-in">
                    {/* Timeline timestamp */}
                    <div class="text-[10px] w-8 text-right shrink-0 mt-1 text-gray-400">
                      {timeStr()}
                    </div>
                    {/* Card */}
                    <ClipboardItemCard
                      item={item}
                      isSelected={batchMode() ? false : item.id === selectedId()}
                      showCheckbox={batchMode()}
                      checked={selectedIds().has(item.id)}
                      timeline={true}
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
                    />
                  </div>
                );
              }}
            </For>
          </Show>
      </div>

      {/* Context menu */}
      <Show when={cm !== null}>
        {cm && (() => {
          const currentItem = items().find((i) => i.id === cm.itemId);
          return (
            <ContextMenu
              x={cm.x}
              y={cm.y}
              itemId={cm.itemId}
              isPinned={cm.isPinned}
              content={currentItem?.content || ""}
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
    </div>
  );
}
