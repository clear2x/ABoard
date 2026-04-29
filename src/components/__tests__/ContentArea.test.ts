import { describe, it, expect, vi } from "vitest";
import { isToday, isYesterday, isLast7Days } from "../ContentArea";

// Mock Tauri for imports
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("ContentArea utilities", () => {
  describe("isToday()", () => {
    it("returns true for current timestamp", () => {
      expect(isToday(Date.now())).toBe(true);
    });

    it("returns false for yesterday", () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      expect(isToday(yesterday)).toBe(false);
    });

    it("returns false for a week ago", () => {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      expect(isToday(weekAgo)).toBe(false);
    });
  });

  describe("isYesterday()", () => {
    it("returns true for yesterday timestamp", () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      expect(isYesterday(yesterday)).toBe(true);
    });

    it("returns false for today", () => {
      expect(isYesterday(Date.now())).toBe(false);
    });

    it("returns false for two days ago", () => {
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
      expect(isYesterday(twoDaysAgo)).toBe(false);
    });
  });

  describe("isLast7Days()", () => {
    it("returns true for recent timestamp", () => {
      expect(isLast7Days(Date.now())).toBe(true);
    });

    it("returns true for 6 days ago", () => {
      const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
      expect(isLast7Days(sixDaysAgo)).toBe(true);
    });

    it("returns false for 8 days ago", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      expect(isLast7Days(eightDaysAgo)).toBe(false);
    });

    it("returns true for yesterday", () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      expect(isLast7Days(yesterday)).toBe(true);
    });
  });
});
