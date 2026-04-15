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
}

// Reactive signals
const [items, setItems] = createSignal<ClipboardItem[]>([]);
const [loading, setLoading] = createSignal(false);
const [searchQuery, setSearchQuery] = createSignal("");
const [selectedId, setSelectedId] = createSignal<string | null>(null);
const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());

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
};

export function toggleSelect(id: string) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

export function clearSelection() {
  setSelectedIds(new Set());
}

export function selectAll() {
  setSelectedIds(new Set(items().map((i) => i.id)));
}

/// Load clipboard history from SQLite via Tauri command.
/// Called on app startup and after mutations (delete, pin, unpin).
export async function loadHistory(offset: number = 0, limit: number = 50) {
  setLoading(true);
  try {
    const result = await invoke<ClipboardItem[]>("get_history", {
      offset,
      limit,
    });
    setItems(result);
  } catch (e) {
    console.error("[store] Failed to load history:", e);
  } finally {
    setLoading(false);
  }
}

/// Search clipboard history using FTS5 full-text search.
/// If query is empty, falls back to loadHistory().
export async function searchHistory(query: string) {
  if (!query.trim()) {
    await loadHistory();
    return;
  }
  setLoading(true);
  try {
    const result = await invoke<ClipboardItem[]>("search_history", {
      query,
      offset: 0,
      limit: 50,
    });
    setItems(result);
  } catch (e) {
    console.error("[store] Search failed:", e);
  } finally {
    setLoading(false);
  }
}

/// Delete one or more clipboard items by ID, then refresh the list.
export async function deleteItems(ids: string[]) {
  try {
    await invoke("delete_items", { ids });
    await loadHistory();
  } catch (e) {
    console.error("[store] Delete failed:", e);
  }
}

/// Pin a clipboard item, then refresh the list.
export async function pinItem(id: string) {
  try {
    await invoke("pin_item", { id });
    await loadHistory();
  } catch (e) {
    console.error("[store] Pin failed:", e);
  }
}

/// Unpin a clipboard item, then refresh the list.
export async function unpinItem(id: string) {
  try {
    await invoke("unpin_item", { id });
    await loadHistory();
  } catch (e) {
    console.error("[store] Unpin failed:", e);
  }
}

/// Add item to the reactive signal array for immediate display.
/// The item was already persisted to SQLite by the Rust clipboard monitor.
/// Keeps a hash dedup check for the signal array.
export function addItem(item: ClipboardItem) {
  setItems((prev) => {
    if (prev.some((i) => i.hash === item.hash)) return prev;
    return [item, ...prev];
  });
}

let unlistenFn: (() => void) | null = null;

/// Start listening to Tauri clipboard events.
/// Call once from App's onMount. Safe to call multiple times (idempotent).
export async function startClipboardListener() {
  if (unlistenFn) return; // Already listening
  unlistenFn = await listen<ClipboardItem>("clipboard-update", (event) => {
    addItem(event.payload);
  });
}

export function stopClipboardListener() {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
}
