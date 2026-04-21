import MarkdownIt from "markdown-it";
import TurndownService from "turndown";

// --- Content format detection ---

export interface ContentFormat {
  isJson: boolean;
  isXml: boolean;
  isMarkdown: boolean;
  isHtml: boolean;
}

const MAX_FORMAT_SIZE = 1_000_000; // 1MB limit

export function detectContentFormat(content: string): ContentFormat {
  const trimmed = content.trim();

  let isJson = false;
  try {
    const parsed = JSON.parse(trimmed);
    isJson = typeof parsed === "object" && parsed !== null;
  } catch {
    // not JSON
  }

  const isXml =
    trimmed.startsWith("<?xml") ||
    (trimmed.startsWith("<") && /<\/[\w.-]+>/.test(trimmed));

  const isHtml =
    /<[a-zA-Z][^>]*>/.test(trimmed) &&
    /<\/[a-zA-Z]+>/.test(trimmed) &&
    !isXml;

  const isMarkdown =
    !isJson &&
    !isXml &&
    !isHtml &&
    (/^#{1,6}\s/m.test(trimmed) ||
      /\*\*[^*]+\*\*/.test(trimmed) ||
      /`[^`]+`/.test(trimmed) ||
      /^```/m.test(trimmed) ||
      /^\s*[-*+]\s/m.test(trimmed) ||
      /^\s*\d+\.\s/m.test(trimmed) ||
      /\[[^\]]+\]\([^)]+\)/.test(trimmed));

  return { isJson, isXml, isMarkdown, isHtml };
}

// --- JSON tools ---

export interface FormatResult {
  result: string;
}

export interface FormatError {
  error: string;
  line?: number;
  column?: number;
}

function parseJsonError(msg: string): { line?: number; column?: number } {
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (!posMatch) {
    const lineMatch = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (lineMatch) {
      return { line: parseInt(lineMatch[1]), column: parseInt(lineMatch[2]) };
    }
    return {};
  }
  return {};
}

export function formatJson(content: string): FormatResult | FormatError {
  if (content.length > MAX_FORMAT_SIZE) {
    return { error: "Content too large for formatting (>1MB)" };
  }
  try {
    const parsed = JSON.parse(content.trim());
    return { result: JSON.stringify(parsed, null, 2) };
  } catch (e: unknown) {
    const msg = e instanceof SyntaxError ? e.message : String(e);
    const pos = parseJsonError(msg);
    return { error: msg, ...pos };
  }
}

export function minifyJson(content: string): FormatResult | FormatError {
  if (content.length > MAX_FORMAT_SIZE) {
    return { error: "Content too large for formatting (>1MB)" };
  }
  try {
    const parsed = JSON.parse(content.trim());
    return { result: JSON.stringify(parsed) };
  } catch (e: unknown) {
    const msg = e instanceof SyntaxError ? e.message : String(e);
    return { error: msg };
  }
}

export function validateJson(
  content: string
): { valid: true } | { valid: false; error: string; line?: number; column?: number } {
  if (content.length > MAX_FORMAT_SIZE) {
    return { valid: false, error: "Content too large for validation (>1MB)" };
  }
  try {
    JSON.parse(content.trim());
    return { valid: true };
  } catch (e: unknown) {
    const msg = e instanceof SyntaxError ? e.message : String(e);
    const pos = parseJsonError(msg);
    return { valid: false, error: msg, ...pos };
  }
}

// --- XML tools ---

export function formatXml(content: string): FormatResult | FormatError {
  if (content.length > MAX_FORMAT_SIZE) {
    return { error: "Content too large for formatting (>1MB)" };
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content.trim(), "application/xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) {
      return { error: errorNode.textContent || "XML parse error" };
    }
    const serializer = new XMLSerializer();
    let result = serializer.serializeToString(doc.documentElement);
    // Pretty print: add newlines and indentation
    result = result
      .replace(/></g, ">\n<")
      .split("\n")
      .reduce<{ lines: string[]; depth: number }>(
        (acc, line) => {
          const trimmed = line.trim();
          if (!trimmed) return acc;
          const isClosing = trimmed.startsWith("</");
          if (isClosing) acc.depth--;
          acc.lines.push("  ".repeat(Math.max(0, acc.depth)) + trimmed);
          const isSelfClosing = trimmed.endsWith("/>") || trimmed.endsWith("-->");
          const isOpening = trimmed.startsWith("<") && !trimmed.startsWith("</") && !trimmed.startsWith("<?") && !trimmed.startsWith("<!");
          if (isOpening && !isSelfClosing && !trimmed.includes("</")) acc.depth++;
          if (isClosing) acc.depth = Math.max(0, acc.depth);
          return acc;
        },
        { lines: [], depth: 0 }
      )
      .lines.join("\n");

    // Prepend XML declaration if the original had one
    if (content.trim().startsWith("<?xml")) {
      const decl = content.trim().match(/^<\?xml[^?]*\?>/)?.[0] || '<?xml version="1.0"?>';
      result = decl + "\n" + result;
    }
    return { result };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function validateXml(
  content: string
): { valid: true } | { valid: false; error: string; line?: number } {
  if (content.length > MAX_FORMAT_SIZE) {
    return { valid: false, error: "Content too large for validation (>1MB)" };
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content.trim(), "application/xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) {
      const msg = errorNode.textContent || "XML parse error";
      const lineMatch = msg.match(/line\s+(\d+)/i);
      return {
        valid: false,
        error: msg.slice(0, 200),
        line: lineMatch ? parseInt(lineMatch[1]) : undefined,
      };
    }
    return { valid: true };
  } catch (e: unknown) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- Format conversion ---

export type FormatType = "markdown" | "html" | "plaintext";

const md = new MarkdownIt();

export function convertFormat(
  content: string,
  from: FormatType,
  to: FormatType
): FormatResult | FormatError {
  if (content.length > MAX_FORMAT_SIZE) {
    return { error: "Content too large for conversion (>1MB)" };
  }
  if (from === to) return { result: content };

  try {
    let result = content;

    // Step 1: Convert source to intermediate HTML
    if (from === "markdown") {
      result = md.render(content);
    } else if (from === "plaintext") {
      result = content
        .split(/\n\n+/)
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("\n");
    }
    // from === "html" -> result is already content

    // Step 2: Convert intermediate HTML to target
    if (to === "html") {
      return { result };
    } else if (to === "markdown") {
      const td = new TurndownService();
      result = td.turndown(result);
      return { result };
    } else {
      // plaintext: strip all HTML tags
      result = result
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return { result };
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// --- Error highlighting ---

export function highlightJsonError(
  content: string,
  line?: number,
  error?: string
): string {
  if (!line) return content;
  const lines = content.split("\n");
  if (line < 1 || line > lines.length) return content;
  lines[line - 1] += `  // <-- ERROR: ${error || "parse error"}`;
  return lines.join("\n");
}
