import { Show, onMount, createSignal } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SearchBar from "./SearchBar";

interface Props {
  onOpenSettings: () => void;
}

const isTauri = !!window.__TAURI_INTERNALS__;

export default function TitleBar(props: Props) {
  const appWindow = isTauri ? getCurrentWindow() : null;
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const [maximized, setMaximized] = createSignal(false);

  let headerRef: HTMLDivElement | undefined;
  let lastClickTime = 0;

  onMount(async () => {
    try {
      if (appWindow) setMaximized(await appWindow.isMaximized());
    } catch {}
  });

  const handleMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    // Skip if clicked on a no-drag element
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

  return (
    <div
      ref={headerRef}
      data-tauri-drag-region
      class="flex items-center h-14 px-4 border-b shrink-0 select-none"
      style={{
        "border-color": "rgba(255,255,255,0.4)",
        background: "rgba(255,255,255,0.3)",
        "-webkit-app-region": "drag",
        "app-region": "drag",
      }}
      onMouseDown={handleMouseDown}
    >
      {/* macOS traffic lights */}
      <Show when={isMac}>
        <div class="flex gap-2 w-[52px] shrink-0" data-tauri-no-drag style={{ "-webkit-app-region": "no-drag", "app-region": "no-drag" }}>
          <button class="traffic-light traffic-light-close" onClick={handleClose} title="Close" />
          <button class="traffic-light traffic-light-minimize" onClick={handleMinimize} title="Minimize" />
          <button class="traffic-light traffic-light-maximize" onClick={handleMaximize} title={maximized() ? "Restore" : "Maximize"} />
        </div>
      </Show>

      {/* Search bar in center */}
      <div class="flex-1 max-w-xl mx-auto" data-tauri-no-drag style={{ "-webkit-app-region": "no-drag", "app-region": "no-drag" }}>
        <SearchBar />
      </div>

      {/* Right side controls */}
      <div class="flex items-center gap-1 shrink-0" data-tauri-no-drag style={{ "-webkit-app-region": "no-drag", "app-region": "no-drag" }}>
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
