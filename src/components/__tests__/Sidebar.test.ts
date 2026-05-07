import { describe, it, expect, vi } from "vitest";
import { formatSize } from "../Sidebar";

// Mock Tauri for imports
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("Sidebar utilities", () => {
  describe("formatSize()", () => {
    it("formats bytes", () => {
      expect(formatSize(500)).toBe("500 B");
    });

    it("formats zero bytes", () => {
      expect(formatSize(0)).toBe("0 B");
    });

    it("formats kilobytes", () => {
      expect(formatSize(1536)).toBe("1.5 KB");
    });

    it("formats exactly 1 KB", () => {
      expect(formatSize(1024)).toBe("1.0 KB");
    });

    it("formats megabytes", () => {
      expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
    });

    it("formats 1.5 MB", () => {
      expect(formatSize(1536 * 1024)).toBe("1.5 MB");
    });

    it("formats gigabytes", () => {
      expect(formatSize(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
    });

    it("formats 1.5 GB", () => {
      expect(formatSize(1536 * 1024 * 1024)).toBe("1.5 GB");
    });

    it("formats 1023 B (boundary)", () => {
      expect(formatSize(1023)).toBe("1023 B");
    });

    it("formats just over 1 MB boundary", () => {
      expect(formatSize(1024 * 1024 + 1)).toBe("1.0 MB");
    });
  });
});
