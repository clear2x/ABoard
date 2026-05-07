import { createSignal } from "solid-js";

export type ThemeMode = "system" | "dark" | "light";
export type AccentColor = "blue" | "green" | "purple" | "orange" | "rose";

const [theme, setThemeInternal] = createSignal<ThemeMode>("system");
const [accentColor, setAccentColorInternal] = createSignal<AccentColor>("blue");

export { theme, accentColor };

const THEME_KEY = "aboard-theme";
const ACCENT_KEY = "aboard-accent";

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

function applyAccent(color: AccentColor) {
  document.documentElement.setAttribute("data-accent", color);
}

export function setTheme(mode: ThemeMode) {
  setThemeInternal(mode);
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}

export function setAccentColor(color: AccentColor) {
  setAccentColorInternal(color);
  localStorage.setItem(ACCENT_KEY, color);
  applyAccent(color);
}

export function initTheme(): () => void {
  const savedTheme = localStorage.getItem(THEME_KEY) as ThemeMode | null;
  const mode = savedTheme || "system";
  setThemeInternal(mode);
  applyTheme(mode);

  const savedAccent = localStorage.getItem(ACCENT_KEY) as AccentColor | null;
  const accent = savedAccent || "blue";
  setAccentColorInternal(accent);
  applyAccent(accent);

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
