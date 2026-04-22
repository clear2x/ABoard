import { onMount, createSignal, Show } from "solid-js";
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
    initTheme();

    if (isTauri) {
      const unlisten = await listen("open-settings", () => {
        setSettingsOpen(true);
      });

      await appWindow!.onCloseRequested(async (event) => {
        event.preventDefault();
        await appWindow!.hide();
      });

      await startClipboardListener();
      await loadHistory();
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

    return () => { if (isTauri) { /* unlisten */ } };
  });

  const openSettings = () => setSettingsOpen(true);

  return (
    <div class="glass-panel min-h-screen flex flex-col overflow-hidden" style={{ "border-radius": "20px" }}>
      {/* Title bar with embedded search */}
      <TitleBar onOpenSettings={openSettings} />

      {/* AI detection banner */}
      <Show when={aiBannerVisible() && !aiBannerDismissed()}>
        <div class="ai-banner px-4 py-2 flex items-center justify-between">
          <span class="text-xs" style={{ color: "var(--color-accent)" }}>
            {t("ai.notConfigured")} — {t("ai.clickToSetup")}
          </span>
          <div class="flex items-center gap-2">
            <button
              class="text-xs px-2 py-1 rounded transition-smooth"
              style={{ background: "var(--color-accent)", color: "#fff" }}
              onClick={openSettings}
            >{t("settings.title")}</button>
            <button
              class="text-xs px-1.5 py-1 rounded transition-smooth"
              style={{ color: "var(--color-text-muted)" }}
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
    </div>
  );
}
