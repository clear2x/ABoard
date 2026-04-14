import { onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function App() {
  onMount(async () => {
    const appWindow = getCurrentWindow();

    // Intercept window close: hide to tray instead of quitting
    await appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await appWindow.hide();
    });
  });

  return (
    <div class="min-h-screen bg-gray-900 text-white p-4">
      <h1 class="text-xl font-bold">ABoard</h1>
      <p class="text-gray-400 mt-2">Clipboard monitoring active...</p>
    </div>
  );
}
