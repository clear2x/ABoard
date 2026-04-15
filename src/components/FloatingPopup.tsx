import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { items, loadHistory, type ClipboardItem } from "../stores/clipboard";

export default function FloatingPopup() {
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [popupItems, setPopupItems] = createSignal<ClipboardItem[]>([]);

  onMount(async () => {
    await loadHistory(0, 10);
    setPopupItems(items().slice(0, 10));

    await getCurrentWindow().setFocus();

    const handler = (e: KeyboardEvent) => {
      const current = selectedIndex();
      const list = popupItems();
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
  });

  async function selectAndPaste(item: ClipboardItem) {
    if (!item) return;
    try {
      await invoke("paste_to_active", { content: item.content });
    } catch (e) {
      console.error("[FloatingPopup] Paste failed:", e);
    }
    await getCurrentWindow().hide();
  }

  return (
    <div class="window-bg min-h-screen text-white flex flex-col p-3 rounded-xl select-none animate-popup-in">
      <div class="text-xs mb-2 px-1" style={{ color: "var(--color-text-muted)" }}>
        Quick Paste
      </div>
      <div class="flex flex-col gap-1 overflow-y-auto flex-1">
        <Show when={popupItems().length === 0}>
          <div class="text-center py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>
            No clipboard items
          </div>
        </Show>
        <For each={popupItems()}>
          {(item, index) => (
            <div
              class={`p-2 rounded-[var(--radius-md)] cursor-pointer transition-smooth animate-slide-in ${
                index() === selectedIndex()
                  ? "bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/50"
                  : "hover:bg-[var(--color-bg-card-hover)] border border-transparent"
              }`}
              style={{ "animation-delay": `${index() * 20}ms` }}
              onClick={() => {
                setSelectedIndex(index());
                selectAndPaste(item);
              }}
            >
              <div class="flex items-center gap-2">
                <Show when={item.pinned}>
                  <span class="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                </Show>
                <span class="text-sm truncate" style={{ color: "var(--color-text-secondary)" }}>
                  {item.type === "image" ? "[Image]" : item.content.slice(0, 80)}
                </span>
              </div>
              <div class="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                {new Date(item.timestamp).toLocaleTimeString()}
              </div>
            </div>
          )}
        </For>
      </div>
      <div class="text-[10px] mt-2 text-center" style={{ color: "var(--color-text-muted)" }}>
        Up/Down to navigate &middot; Enter to paste &middot; Esc to close
      </div>
    </div>
  );
}
