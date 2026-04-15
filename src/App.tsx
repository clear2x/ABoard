import { onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { startClipboardListener, loadHistory } from "./stores/clipboard";
import ClipboardList from "./components/ClipboardList";
import FloatingPopup from "./components/FloatingPopup";

const currentLabel = getCurrentWindow().label;

export default function App() {
  if (currentLabel === "floating") {
    return <FloatingPopup />;
  }

  // Main window
  onMount(async () => {
    const appWindow = getCurrentWindow();
    await appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await appWindow.hide();
    });

    await startClipboardListener();
    await loadHistory();
  });

  return (
    <div class="window-bg min-h-screen text-white flex flex-col">
      <header class="glass px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-lg">&#x1F4CB;</span>
          <h1 class="text-xl font-semibold tracking-tight" style={{ "font-size": "var(--font-display, 20px)" }}>ABoard</h1>
        </div>
        <span class="text-xs" style={{ color: "var(--color-text-muted)" }}>Clipboard Manager</span>
      </header>
      <main class="flex flex-1 overflow-hidden">
        {/* Left column: History list area */}
        <div class="flex-1 flex flex-col overflow-hidden border-r transition-smooth" style={{ "border-color": "var(--color-border-subtle)" }}>
          <ClipboardList />
        </div>
        {/* Right column: AI Tool Panel placeholder */}
        <div class="hidden lg:flex flex-col w-[300px] glass-subtle">
          <div class="p-4">
            <h2 class="text-base font-semibold tracking-tight mb-2">AI Tools</h2>
            <p class="text-sm" style={{ color: "var(--color-text-muted)" }}>Coming soon...</p>
          </div>
        </div>
      </main>
    </div>
  );
}
