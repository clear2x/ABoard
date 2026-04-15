import { For, Show, onMount, createSignal } from "solid-js";
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
} from "../stores/clipboard";
import ClipboardItemCard from "./ClipboardItemCard";
import SearchBar from "./SearchBar";
import ContextMenu from "./ContextMenu";
import ConfirmDialog from "./ConfirmDialog";

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

  const cm = contextMenu();
  const selectedCount = () => selectedIds().size;

  return (
    <div
      class="flex flex-col h-full"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div class="flex items-center gap-2 px-2 pt-2">
        <SearchBar />
        <Show when={!batchMode()}>
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors flex-shrink-0"
            onClick={enterBatchMode}
            title="Batch delete"
          >
            Batch
          </button>
        </Show>
      </div>

      <Show when={batchMode()}>
        <div class="flex items-center gap-2 px-2 py-2 border-b border-gray-800">
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            onClick={selectAll}
          >
            Select All
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            onClick={clearSelection}
          >
            Clear
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleBatchDelete}
            disabled={selectedCount() === 0}
          >
            Delete Selected ({selectedCount()})
          </button>
          <div class="flex-1" />
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            onClick={exitBatchMode}
          >
            Cancel
          </button>
        </div>
      </Show>

      <div class="flex flex-col gap-2 overflow-y-auto flex-1 p-2">
        <Show
          when={!loading()}
          fallback={
            <div class="flex items-center justify-center h-32 text-gray-500 text-sm">
              Loading...
            </div>
          }
        >
          <Show
            when={items().length > 0}
            fallback={
              <div class="flex items-center justify-center h-32 text-gray-500 text-sm">
                No clipboard items yet. Copy something!
              </div>
            }
          >
            <For each={items()}>
              {(item) => (
                <ClipboardItemCard
                  item={item}
                  isSelected={batchMode() ? false : item.id === selectedId()}
                  showCheckbox={batchMode()}
                  checked={selectedIds().has(item.id)}
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
                />
              )}
            </For>
          </Show>
        </Show>
      </div>
      <Show when={cm !== null}>
        {cm && (
          <ContextMenu
            x={cm.x}
            y={cm.y}
            itemId={cm.itemId}
            isPinned={cm.isPinned}
            onClose={() => setContextMenu(null)}
          />
        )}
      </Show>
      <ConfirmDialog
        open={confirmOpen()}
        title="Delete Items"
        message={`Are you sure you want to delete ${selectedCount()} item${selectedCount() !== 1 ? "s" : ""}? This action cannot be undone.`}
        onConfirm={confirmBatchDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
