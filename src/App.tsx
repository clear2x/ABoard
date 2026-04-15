import { onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { startClipboardListener, stopClipboardListener, loadHistory } from "./stores/clipboard";
import ClipboardList from "./components/ClipboardList";

export default function App() {
  onMount(async () => {
    // Setup close-to-tray behavior
    const appWindow = getCurrentWindow();
    await appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await appWindow.hide();
    });

    // Start listening for clipboard events
    await startClipboardListener();

    // Load persisted history from SQLite
    await loadHistory();
  });

  return (
    <div class="min-h-screen bg-gray-900 text-white flex flex-col">
      <header class="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h1 class="text-base font-semibold tracking-tight">ABoard</h1>
        <span class="text-xs text-gray-500">Clipboard Manager</span>
      </header>
      <main class="flex-1 overflow-hidden">
        <ClipboardList />
      </main>
    </div>
  );
}
