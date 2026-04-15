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
} from "../stores/clipboard";
import ClipboardItemCard from "./ClipboardItemCard";
import SearchBar from "./SearchBar";
import ContextMenu from "./ContextMenu";

export default function ClipboardList() {
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    itemId: string;
    isPinned: boolean;
  } | null>(null);

  onMount(() => {
    loadHistory();
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Delete" && selectedId()) {
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
  };

  const cm = contextMenu();

  return (
    <div
      class="flex flex-col h-full"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <SearchBar />
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
                  isSelected={item.id === selectedId()}
                  onSelect={(id) => setSelectedId(id)}
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
    </div>
  );
}
