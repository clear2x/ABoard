import { Show, onMount, createSignal, onCleanup } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { searchQuery, setSearchQuery, searchHistory, semanticSearchHistory, loadHistory, monitoringPaused } from "../stores/clipboard";
import { t } from "../stores/i18n";

interface Props {
  onOpenSettings: () => void;
}

const isTauri = !!window.__TAURI_INTERNALS__;

export default function TitleBar(props: Props) {
  const appWindow = isTauri ? getCurrentWindow() : null;
  const isMac = (() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent || "";
      return /Mac|iPod|iPhone|iPad/.test(ua);
    }
    return false;
  })();
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
      class="flex items-center h-14 px-4 border-b border-[var(--color-border)] shrink-0 select-none glass-panel-inner"
      onMouseDown={handleMouseDown}
    >
      {/* Spacer for native macOS traffic lights (overlay titleBarStyle) */}
      <Show when={isMac}>
        <div class="w-[76px] shrink-0" />
      </Show>

      {/* Search bar — centered in the title bar */}
      <Show when={monitoringPaused()}>
        <div class="flex items-center gap-1 text-gray-500 shrink-0" title="Monitoring paused">
          <i class="ph ph-pause-circle text-sm" />
        </div>
      </Show>
      <div class="flex-1 max-w-xl mx-auto relative flex items-center glass-card rounded-lg px-3 py-1.5" data-tauri-no-drag>
        <i class="ph ph-magnifying-glass text-[var(--color-text-muted)]" />
        <input
          type="text"
          value={searchQuery()}
          onInput={handleSearchInput}
          placeholder={semanticMode() ? t("search.semantic") : t("search.placeholderFull")}
          class="bg-transparent border-none outline-none text-sm ml-2 w-full placeholder-[var(--color-text-muted)] text-[var(--color-text-primary)]"
        />
        <div class="flex items-center gap-1 shrink-0">
          <span class="text-[10px] bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] px-1.5 rounded border border-[var(--color-border)]">⌘K</span>
          <i class={`ph ph-funnel ml-2 cursor-pointer transition-colors ${semanticMode() ? "text-blue-500" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
             onClick={() => setSemanticMode(!semanticMode())}
          />
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
