import { describe, it, expect } from "vitest";
import {
  detectContentFormat,
  formatJson,
  minifyJson,
  validateJson,
  formatXml,
  validateXml,
  convertFormat,
  highlightJsonError,
} from "../format-tools";

describe("format-tools", () => {
  describe("detectContentFormat()", () => {
    it("detects JSON object", () => {
      const result = detectContentFormat('{"key": "value"}');
      expect(result.isJson).toBe(true);
      expect(result.isXml).toBe(false);
      expect(result.isHtml).toBe(false);
    });

    it("detects JSON array", () => {
      const result = detectContentFormat("[1, 2, 3]");
      expect(result.isJson).toBe(true);
    });

    it("does not detect plain number as JSON", () => {
      const result = detectContentFormat("42");
      expect(result.isJson).toBe(false);
    });

    it("detects XML with declaration", () => {
      const result = detectContentFormat('<?xml version="1.0"?><root></root>');
      expect(result.isXml).toBe(true);
    });

    it("detects XML without declaration", () => {
      const result = detectContentFormat("<root><child>text</child></root>");
      expect(result.isXml).toBe(true);
    });

    it("detects HTML (not confused with XML)", () => {
      // Note: simple tag structures like <div><p>x</p></div> are classified as XML
      // because isXml matches first (starts with < and has closing tags).
      // HTML is detected when content doesn't start with < but has open/close tags.
      const result = detectContentFormat('Text <b>bold</b> and <i>italic</i>');
      expect(result.isHtml).toBe(true);
      expect(result.isXml).toBe(false);
    });

    it("classifies well-formed nested tags as XML", () => {
      const result = detectContentFormat("<root><child>text</child></root>");
      expect(result.isXml).toBe(true);
      expect(result.isHtml).toBe(false);
    });

    it("detects markdown headings", () => {
      const result = detectContentFormat("# Title\nSome text");
      expect(result.isMarkdown).toBe(true);
    });

    it("detects markdown bold", () => {
      const result = detectContentFormat("This is **bold** text");
      expect(result.isMarkdown).toBe(true);
    });

    it("detects markdown code", () => {
      const result = detectContentFormat("Use `console.log` to debug");
      expect(result.isMarkdown).toBe(true);
    });

    it("detects markdown fenced code blocks", () => {
      const result = detectContentFormat("```js\nconsole.log('hi')\n```");
      expect(result.isMarkdown).toBe(true);
    });

    it("detects markdown list items", () => {
      const result = detectContentFormat("- item one\n- item two");
      expect(result.isMarkdown).toBe(true);
    });

    it("detects markdown ordered list", () => {
      const result = detectContentFormat("1. first\n2. second");
      expect(result.isMarkdown).toBe(true);
    });

    it("detects markdown links", () => {
      const result = detectContentFormat("[click here](https://example.com)");
      expect(result.isMarkdown).toBe(true);
    });

    it("returns all false for plain text", () => {
      const result = detectContentFormat("Just some regular text");
      expect(result.isJson).toBe(false);
      expect(result.isXml).toBe(false);
      expect(result.isHtml).toBe(false);
      expect(result.isMarkdown).toBe(false);
    });

    it("does not detect markdown when content is JSON", () => {
      const result = detectContentFormat('{"heading": "# not a heading"}');
      expect(result.isJson).toBe(true);
      expect(result.isMarkdown).toBe(false);
    });
  });

  describe("formatJson()", () => {
    it("pretty-prints JSON", () => {
      const result = formatJson('{"name":"test","value":42}');
      expect(result).toHaveProperty("result");
      const formatted = (result as { result: string }).result;
      expect(formatted).toContain("\n");
      expect(formatted).toContain("  ");
    });

    it("returns error for invalid JSON", () => {
      const result = formatJson("{invalid}");
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toBeTruthy();
    });

    it("returns error for content over 1MB", () => {
      const big = "x".repeat(1_000_001);
      const result = formatJson(`"${big}"`);
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("too large");
    });

    it("formats arrays correctly", () => {
      const result = formatJson("[1,2,3]");
      expect(result).toHaveProperty("result");
      expect((result as { result: string }).result).toContain("[\n");
    });

    it("handles already-formatted JSON (idempotent)", () => {
      const pretty = '{\n  "a": 1\n}';
      const result = formatJson(pretty);
      expect((result as { result: string }).result).toBe(pretty);
    });
  });

  describe("minifyJson()", () => {
    it("minifies JSON", () => {
      const result = minifyJson('{\n  "name":  "test"\n}');
      expect(result).toHaveProperty("result");
      expect((result as { result: string }).result).toBe('{"name":"test"}');
    });

    it("returns error for invalid JSON", () => {
      const result = minifyJson("not json");
      expect(result).toHaveProperty("error");
    });

    it("returns error for content over 1MB", () => {
      const big = "x".repeat(1_000_001);
      const result = minifyJson(`"${big}"`);
      expect(result).toHaveProperty("error");
    });
  });

  describe("validateJson()", () => {
    it("returns valid: true for valid JSON", () => {
      const result = validateJson('{"key": "value"}');
      expect(result).toEqual({ valid: true });
    });

    it("returns valid: false with error for invalid JSON", () => {
      const result = validateJson("{bad}");
      expect(result).toHaveProperty("valid", false);
      expect((result as { error: string }).error).toBeTruthy();
    });

    it("returns error for content over 1MB", () => {
      const big = "x".repeat(1_000_001);
      const result = validateJson(`"${big}"`);
      expect(result).toHaveProperty("valid", false);
    });
  });

  describe("formatXml()", () => {
    it("formats XML with indentation", () => {
      const result = formatXml("<root><child>text</child></root>");
      expect(result).toHaveProperty("result");
      const formatted = (result as { result: string }).result;
      expect(formatted).toContain("\n");
      expect(formatted).toContain("  ");
    });

    it("preserves XML declaration", () => {
      const result = formatXml('<?xml version="1.0"?><root><a>1</a></root>');
      const formatted = (result as { result: string }).result;
      expect(formatted).toContain('<?xml version="1.0"?>');
    });

    it("returns error for invalid XML", () => {
      const result = formatXml("<root><unclosed>");
      expect(result).toHaveProperty("error");
    });

    it("returns error for content over 1MB", () => {
      const inner = "x".repeat(1_000_001);
      const result = formatXml(`<root>${inner}</root>`);
      expect(result).toHaveProperty("error");
    });
  });

  describe("validateXml()", () => {
    it("returns valid: true for valid XML", () => {
      const result = validateXml("<root><child>text</child></root>");
      expect(result).toEqual({ valid: true });
    });

    it("returns valid: false for invalid XML", () => {
      const result = validateXml("<root><unclosed>");
      expect(result).toHaveProperty("valid", false);
    });

    it("returns error for content over 1MB", () => {
      const inner = "x".repeat(1_000_001);
      const result = validateXml(`<root>${inner}</root>`);
      expect(result).toHaveProperty("valid", false);
    });
  });

  describe("convertFormat()", () => {
    it("returns content unchanged when from === to", () => {
      const result = convertFormat("hello", "markdown", "markdown");
      expect(result).toEqual({ result: "hello" });
    });

    it("converts markdown to HTML", () => {
      const result = convertFormat("# Hello", "markdown", "html");
      expect(result).toHaveProperty("result");
      const html = (result as { result: string }).result;
      expect(html).toContain("<h1>");
      expect(html).toContain("Hello");
    });

    it("converts markdown to plaintext", () => {
      const result = convertFormat("**bold** text", "markdown", "plaintext");
      expect(result).toHaveProperty("result");
      const text = (result as { result: string }).result;
      expect(text).toContain("bold");
    });

    it("converts HTML to plaintext", () => {
      const result = convertFormat("<p>Hello <b>world</b></p>", "html", "plaintext");
      expect(result).toHaveProperty("result");
      const text = (result as { result: string }).result;
      expect(text).toContain("Hello");
      expect(text).toContain("world");
      expect(text).not.toContain("<");
    });

    it("converts HTML to markdown", () => {
      const result = convertFormat("<h1>Title</h1><p>Paragraph</p>", "html", "markdown");
      expect(result).toHaveProperty("result");
      const md = (result as { result: string }).result;
      expect(md).toMatch(/Title/);
    });

    it("converts plaintext to HTML", () => {
      const result = convertFormat("Hello\n\nWorld", "plaintext", "html");
      expect(result).toHaveProperty("result");
      const html = (result as { result: string }).result;
      expect(html).toContain("<p>");
    });

    it("returns error for content over 1MB", () => {
      const big = "x".repeat(1_000_001);
      const result = convertFormat(big, "plaintext", "html");
      expect(result).toHaveProperty("error");
    });
  });

  describe("highlightJsonError()", () => {
    it("adds error annotation at the specified line", () => {
      const content = "line1\nline2\nline3";
      const result = highlightJsonError(content, 2, "unexpected token");
      expect(result).toContain("// <-- ERROR: unexpected token");
      expect(result.split("\n")[1]).toContain("// <-- ERROR:");
    });

    it("returns content unchanged when line is undefined", () => {
      const content = "some content";
      expect(highlightJsonError(content, undefined, "err")).toBe(content);
    });

    it("returns content unchanged when line is out of range", () => {
      const content = "line1\nline2";
      expect(highlightJsonError(content, 0, "err")).toBe(content);
      expect(highlightJsonError(content, 99, "err")).toBe(content);
    });

    it("uses default error message when not provided", () => {
      const result = highlightJsonError("a\nb", 1);
      expect(result).toContain("parse error");
    });
  });
});
