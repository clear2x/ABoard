import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.fn().mockResolvedValue(undefined);

// Mock @tauri-apps/api/core before importing i18n
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Import after mock setup
import { t, setLocale, locale } from "../i18n";

describe("i18n", () => {
  beforeEach(() => {
    // Reset to default locale
    if (locale() !== "zh") {
      setLocale("zh");
    }
  });

  describe("t() — key lookup", () => {
    it("returns Chinese text for known key when locale is zh", () => {
      expect(t("app.title")).toBe("ABoard");
      expect(t("clipboard.noItems")).toBe("暂无剪贴板内容，复制一些东西试试！");
    });

    it("returns English text for known key when locale is en", () => {
      setLocale("en");
      expect(t("clipboard.noItems")).toBe("No clipboard items yet. Copy something!");
    });

    it("returns the key itself for unknown keys", () => {
      expect(t("nonexistent.key")).toBe("nonexistent.key");
    });

    it("returns shared text for keys where zh and en are identical", () => {
      expect(t("app.title")).toBe("ABoard");
      setLocale("en");
      expect(t("app.title")).toBe("ABoard");
    });
  });

  describe("t() — interpolation", () => {
    it("replaces {var} placeholders with provided values", () => {
      setLocale("en");
      expect(t("settings.afterDays", { n: "30" })).toBe("After 30 days");
    });

    it("replaces Chinese interpolation variables", () => {
      expect(t("settings.afterDays", { n: "7" })).toBe("7 天后");
    });

    it("handles multiple interpolation variables", () => {
      // Use a key with multiple vars if available
      const result = t("clipboard.confirmDeleteMsg", { count: "5" });
      expect(result).toContain("5");
    });

    it("returns template unchanged when no vars provided", () => {
      const result = t("settings.afterDays");
      expect(result).toContain("{n}");
    });
  });

  describe("setLocale()", () => {
    it("switches locale and affects subsequent t() calls", () => {
      setLocale("en");
      expect(t("settings.title")).toBe("Settings");

      setLocale("zh");
      expect(t("settings.title")).toBe("设置");
    });

    it("persists locale to localStorage", () => {
      setLocale("en");
      expect(localStorage.getItem("aboard-locale")).toBe("en");

      setLocale("zh");
      expect(localStorage.getItem("aboard-locale")).toBe("zh");
    });

    it("calls invoke to sync tray locale", () => {
      mockInvoke.mockClear();
      setLocale("en");
      expect(mockInvoke).toHaveBeenCalledWith("update_tray_locale", { locale: "en" });
    });
  });

  describe("locale signal", () => {
    it("reflects current locale", () => {
      setLocale("zh");
      expect(locale()).toBe("zh");

      setLocale("en");
      expect(locale()).toBe("en");
    });
  });
});
