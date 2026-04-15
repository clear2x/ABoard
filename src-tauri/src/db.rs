use crate::clipboard::ClipboardItem;
use std::sync::Mutex;
use tauri::Manager;

/// Maximum search query length to prevent DoS.
const MAX_QUERY_LEN: usize = 200;

/// Maximum result count for a single query.
const MAX_LIMIT: u32 = 100;

/// Wrapper for the SQLite connection, managed as Tauri state.
pub struct DbState {
    pub conn: Mutex<rusqlite::Connection>,
}

/// Initialize the SQLite database at the Tauri app data directory.
/// Creates the schema (tables, indexes, FTS5, triggers) and manages the connection as Tauri state.
pub fn init_db(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("aboard.db");
    let conn = rusqlite::Connection::open(&db_path)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clipboard_items (
            id TEXT PRIMARY KEY,
            content_type TEXT NOT NULL,
            content TEXT NOT NULL,
            hash TEXT NOT NULL UNIQUE,
            timestamp INTEGER NOT NULL,
            metadata TEXT NOT NULL DEFAULT '{}',
            pinned INTEGER NOT NULL DEFAULT 0,
            pinned_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_clipboard_items_timestamp
            ON clipboard_items (timestamp DESC);

        CREATE INDEX IF NOT EXISTS idx_clipboard_items_pinned
            ON clipboard_items (pinned, pinned_at DESC);

        CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_items_fts
            USING fts5(content, content='clipboard_items', content_rowid='rowid');

        CREATE TRIGGER IF NOT EXISTS clipboard_items_ai AFTER INSERT ON clipboard_items BEGIN
            INSERT INTO clipboard_items_fts(rowid, content) VALUES (new.rowid, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS clipboard_items_ad AFTER DELETE ON clipboard_items BEGIN
            INSERT INTO clipboard_items_fts(clipboard_items_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        END;
        ",
    )?;

    app.manage(DbState {
        conn: Mutex::new(conn),
    });

    Ok(())
}

/// Insert a clipboard item into the database.
/// Uses INSERT OR IGNORE to handle hash-based deduplication silently.
pub fn insert_item(conn: &Mutex<rusqlite::Connection>, item: &ClipboardItem) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let metadata_str = serde_json::to_string(&item.metadata).unwrap_or_else(|_| "{}".to_string());
    conn.execute(
        "INSERT OR IGNORE INTO clipboard_items (id, content_type, content, hash, timestamp, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![item.id, item.content_type, item.content, item.hash, item.timestamp, metadata_str],
    ).map_err(|e| format!("Insert error: {}", e))?;
    Ok(())
}

/// Parse a database row into a ClipboardItem.
fn row_to_item(row: &rusqlite::Row<'_>) -> Result<ClipboardItem, rusqlite::Error> {
    let metadata_str: String = row.get(5)?;
    let metadata: serde_json::Value =
        serde_json::from_str(&metadata_str).unwrap_or(serde_json::json!({}));
    let pinned: i32 = row.get(6)?;
    Ok(ClipboardItem {
        id: row.get(0)?,
        content_type: row.get(1)?,
        content: row.get(2)?,
        hash: row.get(3)?,
        timestamp: row.get(4)?,
        metadata,
        pinned: pinned != 0,
        pinned_at: row.get(7)?,
    })
}

/// Get clipboard history with pagination.
/// Pinned items appear first (ordered by pinned_at DESC), then unpinned (by timestamp DESC).
#[tauri::command]
pub fn get_history(
    state: tauri::State<'_, DbState>,
    offset: u32,
    limit: u32,
) -> Result<Vec<ClipboardItem>, String> {
    let limit = limit.min(MAX_LIMIT).max(1);
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at
             FROM clipboard_items
             ORDER BY pinned DESC, pinned_at DESC, timestamp DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| format!("Prepare error: {}", e))?;
    let items = stmt
        .query_map(rusqlite::params![limit, offset], row_to_item)
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

/// Search clipboard history using FTS5 full-text search.
/// Wraps query in double quotes for phrase matching. Sanitizes special FTS5 syntax.
#[tauri::command]
pub fn search_history(
    state: tauri::State<'_, DbState>,
    query: String,
    offset: u32,
    limit: u32,
) -> Result<Vec<ClipboardItem>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    if trimmed.len() > MAX_QUERY_LEN {
        return Err(format!(
            "Query too long (max {} characters)",
            MAX_QUERY_LEN
        ));
    }
    let limit = limit.min(MAX_LIMIT).max(1);

    // Sanitize: remove FTS5 special characters, wrap in double quotes for phrase matching
    let sanitized: String = trimmed
        .chars()
        .filter(|c| !matches!(c, '"' | '*' | '^' | '#' | ':'))
        .collect();
    if sanitized.trim().is_empty() {
        return Ok(vec![]);
    }
    let fts_query = format!("\"{}\"", sanitized);

    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at
             FROM clipboard_items
             WHERE id IN (
                 SELECT rowid FROM clipboard_items_fts
                 WHERE clipboard_items_fts MATCH ?1
                 ORDER BY rank
             )
             ORDER BY pinned DESC, pinned_at DESC, timestamp DESC
             LIMIT ?2 OFFSET ?3",
        )
        .map_err(|e| format!("Prepare error: {}", e))?;
    let items = stmt
        .query_map(rusqlite::params![fts_query, limit, offset], row_to_item)
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

/// Delete one or more clipboard items by their IDs.
/// Removes from both the main table and the FTS5 index.
#[tauri::command]
pub fn delete_items(
    state: tauri::State<'_, DbState>,
    ids: Vec<String>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    // Validate all IDs look like UUIDs (T-02-01 mitigation)
    for id in &ids {
        if id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(format!("Invalid ID format: {}", id));
        }
    }

    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    for id in &ids {
        conn.execute("DELETE FROM clipboard_items WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Delete error: {}", e))?;
    }
    Ok(())
}

/// Pin a clipboard item. Sets pinned=1 and pinned_at to current time.
#[tauri::command]
pub fn pin_item(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<(), String> {
    if id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("Invalid ID format: {}", id));
    }
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE clipboard_items SET pinned = 1, pinned_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )
    .map_err(|e| format!("Pin error: {}", e))?;
    Ok(())
}

/// Unpin a clipboard item. Sets pinned=0 and pinned_at=NULL.
#[tauri::command]
pub fn unpin_item(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<(), String> {
    if id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("Invalid ID format: {}", id));
    }
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "UPDATE clipboard_items SET pinned = 0, pinned_at = NULL WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("Unpin error: {}", e))?;
    Ok(())
}

/// Get all pinned clipboard items, ordered by pinned_at DESC.
#[tauri::command]
pub fn get_pinned(state: tauri::State<'_, DbState>) -> Result<Vec<ClipboardItem>, String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at
             FROM clipboard_items
             WHERE pinned = 1
             ORDER BY pinned_at DESC",
        )
        .map_err(|e| format!("Prepare error: {}", e))?;
    let items = stmt
        .query_map([], row_to_item)
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}
