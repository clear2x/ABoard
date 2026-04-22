import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { items, loadHistory, type ClipboardItem } from "../stores/clipboard";
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
    default:
      return { icon: "", bg: "bg-blue-100 dark:bg-blue-900/30", color: "text-blue-600", letter: "T" };
  }
}

export default function FloatingPopup() {
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [popupItems, setPopupItems] = createSignal<ClipboardItem[]>([]);
  const [searchText, setSearchText] = createSignal("");

  onMount(async () => {
    initLocale();
    initTheme();
    await loadHistory(0, 20);
    setPopupItems(items().slice(0, 20));

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

  async function openMainWindow() {
    try {
      await invoke("show_main_window");
    } catch {}
    await getCurrentWindow().hide();
  }

  return (
    <div class="glass-panel min-h-screen flex flex-col overflow-hidden select-none animate-popup-in"
      style={{ "border-radius": "20px" }}
    >
      {/* Header */}
      <div class="p-4 pb-2 border-b" style={{ "border-color": "rgba(255,255,255,0.3)" }}>
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2 font-bold text-lg tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            <i class="ph-fill ph-clipboard-text text-blue-600" />
            ABoard
          </div>
          <div class="flex gap-2" style={{ color: "var(--color-text-muted)" }}>
            <button class="hover:opacity-70 transition-opacity">
              <i class="ph ph-push-pin" />
            </button>
            <button class="hover:opacity-70 transition-opacity">
              <i class="ph ph-gear" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div class="relative flex items-center rounded-lg px-3 py-1.5 shadow-sm"
          style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.7)" }}
        >
          <i class="ph ph-magnifying-glass text-sm" style={{ color: "var(--color-text-muted)" }} />
          <input
            type="text"
            placeholder={t("float.search")}
            value={searchText()}
            onInput={(e) => { setSearchText((e.target as HTMLInputElement).value); setSelectedIndex(0); }}
            class="bg-transparent border-none outline-none text-xs ml-2 w-full"
            style={{ color: "var(--color-text-primary)" }}
          />
          <span class="text-[10px] px-1.5 rounded shrink-0"
            style={{ background: "rgba(128,128,128,0.1)", color: "var(--color-text-muted)", border: "1px solid rgba(128,128,128,0.15)" }}
          >⌘K</span>
        </div>
      </div>

      {/* Content sections */}
      <div class="flex-1 overflow-y-auto no-scrollbar p-3 space-y-4">
        <Show when={filteredItems().length === 0}>
          <div class="text-center py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {t("float.empty")}
          </div>
        </Show>

        {/* Pinned section */}
        <Show when={pinnedItems().length > 0}>
          <div>
            <div class="flex justify-between items-center text-xs mb-2 px-1 font-medium" style={{ color: "var(--color-text-muted)" }}>
              <span class="flex items-center gap-1"><i class="ph ph-push-pin-fill" /> {t("float.pinned")}</span>
            </div>
            <div class="space-y-2">
              <For each={pinnedItems()}>
                {(item, index) => {
                  const dtype = () => displayType(item);
                  const icon = () => typeIcon(dtype());
                  const globalIndex = () => filteredItems().indexOf(item);
                  return (
                    <div
                      class="glass-card-ref p-3 rounded-xl cursor-pointer"
                      classList={{ "ring-1 ring-blue-500/50": globalIndex() === selectedIndex() }}
                      onClick={() => { setSelectedIndex(globalIndex()); selectAndPaste(item); }}
                    >
                      <div class="flex gap-2">
                        <div class={`w-6 h-6 rounded-full ${icon().bg} ${icon().color} flex items-center justify-center shrink-0 text-xs font-bold`}>
                          <Show when={icon().icon} fallback={icon().letter}>
                            <i class={`ph ${icon().icon}`} />
                          </Show>
                        </div>
                        <div class="text-xs leading-tight truncate" style={{ color: "var(--color-text-secondary)" }}>
                          {item.content.slice(0, 80)}
                        </div>
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
            <div class="flex justify-between items-center text-xs mb-2 px-1 font-medium" style={{ color: "var(--color-text-muted)" }}>
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
                      class="glass-card-ref p-3 rounded-xl cursor-pointer relative"
                      classList={{ "ring-1 ring-blue-500/50": globalIndex() === selectedIndex() }}
                      onClick={() => { setSelectedIndex(globalIndex()); selectAndPaste(item); }}
                    >
                      <div class="flex gap-2">
                        <div class={`w-6 h-6 rounded-full ${icon().bg} ${icon().color} flex items-center justify-center shrink-0`}>
                          <Show when={icon().icon} fallback={icon().letter}>
                            <i class={`ph ${icon().icon}`} />
                          </Show>
                        </div>
                        <Show
                          when={dtype() === "code"}
                          fallback={
                            <div class="text-xs leading-tight truncate" style={{ color: "var(--color-text-secondary)" }}>
                              {item.content.slice(0, 80)}
                            </div>
                          }
                        >
                          <div class="text-xs font-mono leading-tight" style={{ color: "var(--color-text-secondary)" }}>
                            {item.content.slice(0, 100)}
                          </div>
                        </Show>
                      </div>
                      <i class="ph ph-star absolute right-3 bottom-3 hover:text-yellow-400"
                        style={{ color: "var(--color-text-muted)" }}
                      />
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>

      {/* Footer */}
      <div class="p-3 border-t flex items-center justify-between text-xs cursor-pointer hover:bg-white/20 transition-colors"
        style={{ "border-color": "rgba(255,255,255,0.3)", color: "var(--color-text-muted)" }}
        onClick={openMainWindow}
      >
        <span class="flex items-center gap-1"><i class="ph ph-sidebar-simple" /> {t("float.openMainWindow")}</span>
        <span class="text-[10px] px-1.5 rounded"
          style={{ background: "rgba(128,128,128,0.1)", border: "1px solid rgba(128,128,128,0.15)" }}
        >⌥⌘</span>
      </div>
    </div>
  );
}
