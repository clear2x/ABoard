import { createSignal, onMount } from "solid-js";

export type ThemeMode = "system" | "dark" | "light";

const [theme, setThemeInternal] = createSignal<ThemeMode>("system");

export { theme };

const STORAGE_KEY = "aboard-theme";

function applyTheme(mode: ThemeMode) {
  let effectiveTheme: "dark" | "light";
  if (mode === "system") {
    effectiveTheme = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  } else {
    effectiveTheme = mode;
  }
  document.documentElement.setAttribute("data-theme", effectiveTheme);
}

export function setTheme(mode: ThemeMode) {
  setThemeInternal(mode);
  localStorage.setItem(STORAGE_KEY, mode);
  applyTheme(mode);
}

export function initTheme(): () => void {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  const mode = saved || "system";
  setThemeInternal(mode);
  applyTheme(mode);

  // Listen for system theme changes when in "system" mode
  const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
  const handler = () => {
    if (theme() === "system") {
      applyTheme("system");
    }
  };
  mediaQuery.addEventListener("change", handler);

  return () => {
    mediaQuery.removeEventListener("change", handler);
  };
}
