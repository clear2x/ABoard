import { Show, onMount, createSignal, onCleanup } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { searchQuery, setSearchQuery, searchHistory, semanticSearchHistory, loadHistory } from "../stores/clipboard";
import { t } from "../stores/i18n";

interface Props {
  onOpenSettings: () => void;
}

const isTauri = !!window.__TAURI_INTERNALS__;

export default function TitleBar(props: Props) {
  const appWindow = isTauri ? getCurrentWindow() : null;
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const [maximized, setMaximized] = createSignal(false);
  const [semanticMode, setSemanticMode] = createSignal(false);

  let headerRef: HTMLDivElement | undefined;
  let lastClickTime = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    try {
      if (appWindow) setMaximized(await appWindow.isMaximized());
    } catch {}
  });

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  const handleMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, a, [data-tauri-no-drag]")) return;
    const now = Date.now();
    if (now - lastClickTime < 400) {
      appWindow?.toggleMaximize();
      setMaximized(!maximized());
    }
    lastClickTime = now;
  };

  const handleClose = () => appWindow?.hide();
  const handleMinimize = () => appWindow?.minimize();
  const handleMaximize = () => {
    appWindow?.toggleMaximize();
    setMaximized(!maximized());
  };

  const handleSearchInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    setSearchQuery(value);

    if (debounceTimer) clearTimeout(debounceTimer);
    if (!value.trim()) {
      loadHistory();
      return;
    }
    debounceTimer = setTimeout(() => {
      if (semanticMode()) {
        semanticSearchHistory(value);
      } else {
        searchHistory(value);
      }
    }, semanticMode() ? 500 : 200);
  };

  return (
    <div
      ref={headerRef}
      data-tauri-drag-region
      class="flex items-center h-14 px-4 border-b border-white/40 shrink-0 select-none bg-white/30 dark:bg-slate-800/50"
      onMouseDown={handleMouseDown}
    >
      {/* Spacer for native macOS traffic lights (overlay titleBarStyle) */}
      <Show when={isMac}>
        <div class="w-[76px] shrink-0" />
      </Show>

      {/* Search bar — centered in the title bar */}
      <div class="flex-1 max-w-xl mx-auto relative flex items-center bg-white/70 border border-white/80 rounded-lg px-3 py-1.5 shadow-sm dark:bg-slate-700/50 dark:border-white/10" data-tauri-no-drag>
        <i class="ph ph-magnifying-glass text-gray-400 dark:text-gray-500" />
        <input
          type="text"
          value={searchQuery()}
          onInput={handleSearchInput}
          placeholder={semanticMode() ? t("search.semantic") : t("search.placeholderFull")}
          class="bg-transparent border-none outline-none text-sm ml-2 w-full placeholder-gray-400 text-gray-700 dark:text-gray-200"
        />
        <div class="flex items-center gap-1 shrink-0">
          <span class="text-[10px] bg-gray-200/50 text-gray-500 px-1.5 rounded border border-gray-300/50 dark:bg-gray-600/50 dark:text-gray-400 dark:border-gray-500/50">⌘K</span>
          <i class="ph ph-funnel text-gray-400 ml-2 hover:text-gray-700 cursor-pointer dark:text-gray-500 dark:hover:text-gray-300" />
        </div>
      </div>

      {/* Right side controls */}
      <div class="flex items-center gap-1 shrink-0" data-tauri-no-drag>
        <Show when={isMac}>
          <button class="window-btn" onClick={props.onOpenSettings} title="Settings">
            <i class="ph ph-gear text-sm" />
          </button>
        </Show>
        <Show when={!isMac}>
          <button class="window-btn" onClick={props.onOpenSettings} title="Settings">
            <i class="ph ph-gear text-sm" />
          </button>
          <button class="window-btn" onClick={handleMinimize} title="Minimize">
            <i class="ph ph-minus text-sm" />
          </button>
          <button class="window-btn" onClick={handleMaximize} title={maximized() ? "Restore" : "Maximize"}>
            <i class={`ph ${maximized() ? "ph-copy" : "ph-square"} text-sm`} />
          </button>
          <button class="window-btn window-btn-close" onClick={handleClose} title="Close">
            <i class="ph ph-x text-sm" />
          </button>
        </Show>
      </div>
    </div>
  );
}
