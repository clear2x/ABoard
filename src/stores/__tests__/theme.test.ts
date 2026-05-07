import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @tauri-apps/api/core (not needed by theme but transitively imported)
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { initTheme, setTheme, theme } from "../theme";

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  describe("initTheme()", () => {
    it("returns a cleanup function", () => {
      const cleanup = initTheme();
      expect(typeof cleanup).toBe("function");
      cleanup();
    });

    it("defaults to system theme when no saved preference", () => {
      const cleanup = initTheme();
      expect(theme()).toBe("system");
      // data-theme should be set based on system preference
      const attr = document.documentElement.getAttribute("data-theme");
      expect(attr).toMatch(/^(dark|light)$/);
      cleanup();
    });

    it("restores saved dark theme", () => {
      localStorage.setItem("aboard-theme", "dark");
      const cleanup = initTheme();
      expect(theme()).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      cleanup();
    });

    it("restores saved light theme", () => {
      localStorage.setItem("aboard-theme", "light");
      const cleanup = initTheme();
      expect(theme()).toBe("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      cleanup();
    });
  });

  describe("setTheme()", () => {
    it("sets dark theme and updates DOM + localStorage", () => {
      setTheme("dark");
      expect(theme()).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(localStorage.getItem("aboard-theme")).toBe("dark");
    });

    it("sets light theme and updates DOM + localStorage", () => {
      setTheme("light");
      expect(theme()).toBe("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      expect(localStorage.getItem("aboard-theme")).toBe("light");
    });

    it("sets system theme and persists it", () => {
      setTheme("system");
      expect(theme()).toBe("system");
      expect(localStorage.getItem("aboard-theme")).toBe("system");
      // data-theme should be dark or light based on system
      const attr = document.documentElement.getAttribute("data-theme");
      expect(attr).toMatch(/^(dark|light)$/);
    });
  });

  describe("cleanup function", () => {
    it("removes matchMedia listener when called", () => {
      const cleanup = initTheme();
      // Should not throw when called
      expect(() => cleanup()).not.toThrow();
      // Calling again should be safe (no-op since listener already removed)
      expect(() => cleanup()).not.toThrow();
    });
  });
});
