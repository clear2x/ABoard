import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export interface ClipboardItem {
  id: string;
  type: "text" | "image" | "file-paths";
  content: string;
  hash: string;
  timestamp: number;
  metadata: Record<string, unknown>;
  pinned: boolean;
  pinned_at?: number | null;
  ai_type?: string | null;
  ai_tags?: string[] | null;
  ai_summary?: string | null;
}

export type ViewMode = "list" | "grid";

// Reactive signals
const [items, setItems] = createSignal<ClipboardItem[]>([]);
const [loading, setLoading] = createSignal(false);
const [searchQuery, setSearchQuery] = createSignal("");
const [selectedId, setSelectedId] = createSignal<string | null>(null);
const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
const [viewModeInternal, setViewModeInternal] = createSignal<ViewMode>(
  (localStorage.getItem("aboard-view-mode") as ViewMode) || "list"
);
const [copiedId, setCopiedId] = createSignal<string | null>(null);

// Storage stats signals
const [storageSize, setStorageSize] = createSignal<number>(0);
const [itemCount, setItemCount] = createSignal<number>(0);

// Category and time filters for the new UI
const [categoryFilter, setCategoryFilter] = createSignal<string>("all");
const [timeFilter, setTimeFilter] = createSignal<string>("all");

export {
  items,
  setItems,
  loading,
  searchQuery,
  setSearchQuery,
  selectedId,
  setSelectedId,
  selectedIds,
  setSelectedIds,
  copiedId,
  categoryFilter,
  setCategoryFilter,
  timeFilter,
  setTimeFilter,
  storageSize,
  itemCount,
};

export function viewMode() { return viewModeInternal(); }

export function setViewMode(mode: ViewMode) {
  setViewModeInternal(mode);
  localStorage.setItem("aboard-view-mode", mode);
}

/// Copy item content to system clipboard. Shows brief "copied" feedback.
/// For images, uses Tauri command to write as a real image (not base64 text).
export async function copyItemContent(item: ClipboardItem): Promise<boolean> {
  try {
    if (item.type === "image" && item.content.startsWith("data:")) {
      // Use Tauri backend: pass item ID, Rust reads image from DB
      await invoke("copy_image_to_clipboard", { itemId: item.id });
    } else {
      await navigator.clipboard.writeText(item.content);
    }
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
    return true;
  } catch (e) {
    console.error("[store] Copy failed:", e);
    return false;
  }
}

export function toggleSelect(id: string) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

export function clearSelection() {
  setSelectedIds(new Set<string>());
}

export function selectAll() {
  setSelectedIds(new Set(items().map((i) => i.id)));
}

/// Normalize a raw item from Rust backend: parse ai_tags from JSON string to array.
function normalizeItem(raw: Record<string, unknown>): ClipboardItem {
  let aiTags: string[] | null = null;
  if (typeof raw.ai_tags === "string") {
    try { aiTags = JSON.parse(raw.ai_tags as string); } catch { aiTags = null; }
  } else if (Array.isArray(raw.ai_tags)) {
    aiTags = raw.ai_tags as string[];
  }
  return {
    id: raw.id as string,
    type: (raw.type || raw.content_type) as "text" | "image" | "file-paths",
    content: raw.content as string,
    hash: raw.hash as string,
    timestamp: raw.timestamp as number,
    metadata: (raw.metadata || {}) as Record<string, unknown>,
    pinned: !!raw.pinned,
    pinned_at: (raw.pinned_at as number) || null,
    ai_type: (raw.ai_type as string) || null,
    ai_tags: aiTags,
    ai_summary: (raw.ai_summary as string) || null,
  };
}

/// Load clipboard history from SQLite via Tauri command.
/// Includes 5-second timeout to prevent infinite loading.
export async function loadHistory(offset: number = 0, limit: number = 50) {
  console.log("[store] loadHistory: starting...");
  setLoading(true);
  try {
    const result = await Promise.race([
      invoke<Record<string, unknown>[]>("get_history", { offset, limit }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("get_history timed out after 5s")), 5000)
      ),
    ]);
    const items = result.map(normalizeItem);
    console.log("[store] loadHistory: got", items.length, "items");
    setItems(items);
  } catch (e) {
    console.error("[store] Failed to load history:", e);
  } finally {
    setLoading(false);
    console.log("[store] loadHistory: done, loading=false, items count:", items().length);
  }
}

/// Search clipboard history using FTS5 full-text search.
export async function searchHistory(query: string) {
  if (!query.trim()) {
    await loadHistory();
    return;
  }
  setLoading(true);
  try {
    const result = await invoke<Record<string, unknown>[]>("search_history", {
      query,
      offset: 0,
      limit: 50,
    });
    setItems(result.map(normalizeItem));
  } catch (e) {
    console.error("[store] Search failed:", e);
  } finally {
    setLoading(false);
  }
}

/// Semantic search: uses AI to expand query into keywords, then FTS5 search.
export async function semanticSearchHistory(query: string) {
  if (!query.trim()) {
    await loadHistory();
    return;
  }
  setLoading(true);
  try {
    const result = await invoke<Record<string, unknown>[]>("semantic_search", {
      query,
      offset: 0,
      limit: 50,
    });
    setItems(result.map(normalizeItem));
  } catch (e) {
    console.error("[store] Semantic search failed:", e);
  } finally {
    setLoading(false);
  }
}

/// Load storage stats from backend (DB size and item count).
export async function loadStorageStats() {
  try {
    const stats = await invoke<{ db_size_bytes: number; item_count: number }>("get_storage_stats");
    setStorageSize(stats.db_size_bytes);
    setItemCount(stats.item_count);
  } catch (e) {
    console.error("[store] Failed to load storage stats:", e);
  }
}

/// Delete one or more clipboard items by ID. Optimistically removes from local state.
export async function deleteItems(ids: string[]) {
  try {
    await invoke("delete_items", { ids });
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    loadStorageStats();
  } catch (e) {
    console.error("[store] Delete failed:", e);
  }
}

/// Pin a clipboard item. Optimistically updates local state.
export async function pinItem(id: string) {
  try {
    await invoke("pin_item", { id });
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, pinned: true } : i));
    loadStorageStats();
  } catch (e) {
    console.error("[store] Pin failed:", e);
  }
}

/// Unpin a clipboard item. Optimistically updates local state.
export async function unpinItem(id: string) {
  try {
    await invoke("unpin_item", { id });
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, pinned: false } : i));
    loadStorageStats();
  } catch (e) {
    console.error("[store] Unpin failed:", e);
  }
}

/// Add item to the reactive signal array for immediate display.
export function addItem(item: ClipboardItem) {
  setItems((prev) => {
    if (prev.some((i) => i.hash === item.hash)) return prev;
    return [item, ...prev];
  });
}

/// Reorder items by moving an item from fromIndex to toIndex.
export function reorderItems(fromIndex: number, toIndex: number) {
  setItems((prev) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return prev;
    const next = [...prev];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  });
}

let unlistenFn: (() => void) | null = null;
let unlistenAiFn: (() => void) | null = null;

/// Start listening to Tauri clipboard events.
export async function startClipboardListener() {
  if (unlistenFn) return;
  unlistenFn = await listen<Record<string, unknown>>("clipboard-update", (event) => {
    addItem(normalizeItem(event.payload));
    loadStorageStats(); // Refresh stats after new clipboard capture
  });

  unlistenAiFn = await listen<{ item_id: string; ai_type: string; ai_tags: string[]; ai_summary?: string | null }>("ai-processed", (event) => {
    setItems(prev => prev.map(item =>
      item.id === event.payload.item_id
        ? { ...item, ai_type: event.payload.ai_type, ai_tags: event.payload.ai_tags, ai_summary: event.payload.ai_summary ?? item.ai_summary }
        : item
    ));
  });
}

export function stopClipboardListener() {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
  if (unlistenAiFn) {
    unlistenAiFn();
    unlistenAiFn = null;
  }
}
