import { For, Show, onMount, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  items,
  selectedId,
  setSelectedId,
  loadHistory,
  deleteItems,
  pinItem,
  unpinItem,
  loading,
  selectedIds,
  toggleSelect,
  clearSelection,
  selectAll,
  viewMode,
  setViewMode,
  type ViewMode,
} from "../stores/clipboard";
import { t } from "../stores/i18n";
import ClipboardItemCard from "./ClipboardItemCard";
import SearchBar from "./SearchBar";
import ContextMenu from "./ContextMenu";
import ConfirmDialog from "./ConfirmDialog";
import AiResultPopup from "./AiResultPopup";

export default function ClipboardList() {
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    itemId: string;
    isPinned: boolean;
  } | null>(null);

  const [batchMode, setBatchMode] = createSignal(false);
  const [confirmOpen, setConfirmOpen] = createSignal(false);

  onMount(() => {
    loadHistory();
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
        if (item.pinned) {
          unpinItem(id);
        } else {
          pinItem(id);
        }
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
      console.error("[ClipboardList] Export failed:", e);
    }
  };

  const [showExportMenu, setShowExportMenu] = createSignal(false);

  const handleItemDelete = (id: string) => {
    deleteItems([id]);
  };

  const handleItemPin = (id: string, pinned: boolean) => {
    if (pinned) {
      unpinItem(id);
    } else {
      pinItem(id);
    }
  };

  const cm = contextMenu();
  const selectedCount = () => selectedIds().size;
  const isGrid = () => viewMode() === "grid";

  return (
    <div
      class="flex flex-col h-full"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div class="flex items-center gap-2 px-2 pt-2">
        <SearchBar />
        {/* View mode toggle */}
        <div class="flex items-center rounded-lg overflow-hidden border flex-shrink-0" style={{ "border-color": "var(--color-border)" }}>
          <button
            class="px-2 py-1.5 text-xs transition-smooth flex items-center gap-1"
            style={{
              "background-color": !isGrid() ? "var(--color-accent)" : "transparent",
              color: !isGrid() ? "#fff" : "var(--color-text-muted)",
            }}
            onClick={() => setViewMode("list")}
            title={t("view.list")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
          <button
            class="px-2 py-1.5 text-xs transition-smooth flex items-center gap-1"
            style={{
              "background-color": isGrid() ? "var(--color-accent)" : "transparent",
              color: isGrid() ? "#fff" : "var(--color-text-muted)",
            }}
            onClick={() => setViewMode("grid")}
            title={t("view.grid")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>
        </div>
        <Show when={!batchMode()}>
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-card-hover)] transition-smooth flex-shrink-0"
            style={{ color: "var(--color-text-secondary)" }}
            onClick={enterBatchMode}
            title="Batch delete"
          >
            {t("clipboard.batch")}
          </button>
        </Show>
      </div>

      <Show when={batchMode()}>
        <div class="glass-subtle flex items-center gap-2 px-2 py-2">
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-card-hover)] transition-smooth"
            style={{ color: "var(--color-text-secondary)" }}
            onClick={selectAll}
          >
            {t("clipboard.selectAll")}
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-card-hover)] transition-smooth"
            style={{ color: "var(--color-text-secondary)" }}
            onClick={clearSelection}
          >
            {t("clipboard.clearSel")}
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-[var(--color-destructive)] hover:opacity-80 text-white transition-smooth disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleBatchDelete}
            disabled={selectedCount() === 0}
          >
            {t("clipboard.deleteSelected")} ({selectedCount()})
          </button>
          <div
            class="relative"
            onMouseEnter={() => setShowExportMenu(true)}
            onMouseLeave={() => setShowExportMenu(false)}
          >
            <button
              class="px-3 py-1.5 text-xs rounded-lg bg-[var(--color-accent)] hover:opacity-80 text-white transition-smooth disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={selectedCount() === 0}
            >
              {t("clipboard.export")}
            </button>
            <Show when={showExportMenu() && selectedCount() > 0}>
              <div
                class="absolute top-full left-0 mt-1 py-1 min-w-[120px] glass-card animate-context-menu z-50"
                style={{ "box-shadow": "var(--shadow-elevated)" }}
              >
                <button
                  class="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-bg-card-hover)]"
                  style={{ color: "var(--color-text-secondary)" }}
                  onClick={() => handleExport("json")}
                >
                  {t("clipboard.exportJson")}
                </button>
                <button
                  class="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-bg-card-hover)]"
                  style={{ color: "var(--color-text-secondary)" }}
                  onClick={() => handleExport("markdown")}
                >
                  {t("clipboard.exportMd")}
                </button>
                <button
                  class="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-bg-card-hover)]"
                  style={{ color: "var(--color-text-secondary)" }}
                  onClick={() => handleExport("text")}
                >
                  {t("clipboard.exportText")}
                </button>
              </div>
            </Show>
          </div>
          <div class="flex-1" />
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-card-hover)] transition-smooth"
            style={{ color: "var(--color-text-secondary)" }}
            onClick={exitBatchMode}
          >
            {t("clipboard.cancel")}
          </button>
        </div>
      </Show>

      <div
        class={isGrid()
          ? "grid grid-cols-2 gap-2 overflow-y-auto flex-1 p-2"
          : "flex flex-col overflow-y-auto flex-1 p-2"
        }
        style={isGrid() ? {} : { gap: "var(--space-sm)" }}
      >
        <Show
          when={!loading()}
          fallback={
            <div class="flex items-center justify-center h-32 text-sm col-span-2" style={{ color: "var(--color-text-muted)" }}>
              {t("clipboard.loading")}
            </div>
          }
        >
          <Show
            when={items().length > 0}
            fallback={
              <div class="flex items-center justify-center h-32 text-sm col-span-2" style={{ color: "var(--color-text-muted)" }}>
                {t("clipboard.noItems")}
              </div>
            }
          >
            <For each={items()}>
              {(item, index) => (
                <div class={isGrid() ? "" : "animate-slide-in"} style={isGrid() ? {} : { "animation-delay": `${index() * 30}ms` }}>
                <ClipboardItemCard
                  item={item}
                  isSelected={batchMode() ? false : item.id === selectedId()}
                  showCheckbox={batchMode()}
                  checked={selectedIds().has(item.id)}
                  grid={isGrid()}
                  onSelect={(id) => {
                    if (batchMode()) {
                      toggleSelect(id);
                    } else {
                      setSelectedId(id);
                    }
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
              )}
            </For>
          </Show>
        </Show>
      </div>
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
      <AiResultPopup />
    </div>
  );
}
