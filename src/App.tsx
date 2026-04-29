import { onMount, onCleanup, createSignal, Show } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { startClipboardListener, loadHistory } from "./stores/clipboard";
import { initTheme } from "./stores/theme";
import { initLocale, t } from "./stores/i18n";
import FloatingPopup from "./components/FloatingPopup";
import TitleBar from "./components/TitleBar";
import MainLayout from "./components/MainLayout";
import SettingsPanel from "./components/SettingsPanel";
import AiResultPopup from "./components/AiResultPopup";

let currentLabel = "main";
try {
  if (window.__TAURI_INTERNALS__) {
    currentLabel = getCurrentWindow().label;
  }
} catch {}

interface LocalProviderStatus {
  ollamaAvailable: boolean;
  llamacppAvailable: boolean;
  detectedModels: string[];
}

const isTauri = !!window.__TAURI_INTERNALS__;

export default function App() {
  if (currentLabel === "floating") {
    return <FloatingPopup />;
  }

  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [aiBannerVisible, setAiBannerVisible] = createSignal(false);
  const [aiBannerDismissed, setAiBannerDismissed] = createSignal(false);

  const appWindow = isTauri ? getCurrentWindow() : null;

  onMount(async () => {
    initLocale();
    const cleanupTheme = initTheme();
    onCleanup(cleanupTheme);

    if (isTauri) {
      // Load history FIRST — don't block on other setup
      loadHistory().catch((e) => console.error("[App] loadHistory failed:", e));

      // Start other services in parallel, non-blocking
      listen("open-settings", () => setSettingsOpen(true)).catch(console.error);
      appWindow!.onCloseRequested(async (event) => {
        // Save window state before hiding
        try {
          const pos = await appWindow!.outerPosition();
          const size = await appWindow!.innerSize();
          const maximized = await appWindow!.isMaximized();
          await invoke("save_window_state", {
            x: pos.x, y: pos.y,
            width: size.width, height: size.height,
            isMaximized: maximized,
          });
        } catch {}
        event.preventDefault();
        await appWindow!.hide();
      }).catch(console.error);
      startClipboardListener().catch(console.error);

      // Restore window position (values saved as physical pixels)
      try {
        const state = await invoke<{ x: number; y: number; width: number; height: number; is_maximized: boolean } | null>("load_window_state");
        if (state && !state.is_maximized) {
          const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");
          await appWindow!.setPosition(new PhysicalPosition(state.x, state.y));
          if (state.width && state.height) {
            await appWindow!.setSize(new PhysicalSize(state.width, state.height));
          }
        }
      } catch {}
    }

    if (!aiBannerDismissed()) {
      try {
        const config = await invoke<{ active_provider: string }>("ai_get_config");
        if (config.active_provider === "Local" || config.active_provider === "Auto") {
          const status = await invoke<LocalProviderStatus>("ai_detect_local_provider");
          if (!status.ollamaAvailable && !status.llamacppAvailable) {
            setAiBannerVisible(true);
          }
        }
      } catch {}
    }
  });

  const openSettings = () => setSettingsOpen(true);

  return (
    <div class="glass-panel h-screen flex flex-col overflow-hidden" style={{ "border-radius": "20px" }}>
      {/* Title bar with embedded search */}
      <TitleBar onOpenSettings={openSettings} />

      {/* AI detection banner */}
      <Show when={aiBannerVisible() && !aiBannerDismissed()}>
        <div class="ai-banner px-4 py-2 flex items-center justify-between">
          <span class="text-xs text-blue-600 dark:text-blue-400">
            {t("ai.notConfigured")} — {t("ai.clickToSetup")}
          </span>
          <div class="flex items-center gap-2">
            <button
              class="text-xs px-2 py-1 rounded transition-smooth bg-blue-500 text-white"
              onClick={openSettings}
            >{t("settings.title")}</button>
            <button
              class="text-xs px-1.5 py-1 rounded transition-smooth text-gray-400"
              onClick={() => setAiBannerDismissed(true)}
            >
              <i class="ph ph-x text-xs" />
            </button>
          </div>
        </div>
      </Show>

      {/* Main three-column layout */}
      <MainLayout />

      {/* Settings slide-in panel */}
      <Show when={settingsOpen()}>
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      </Show>

      {/* AI result popup — at root level so it centers on viewport */}
      <AiResultPopup />
    </div>
  );
}
