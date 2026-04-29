use crate::clipboard::ClipboardItem;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Manager;

/// Maximum search query length to prevent DoS.
const MAX_QUERY_LEN: usize = 200;

/// Maximum result count for a single query.
const MAX_LIMIT: u32 = 100;

/// Flag to signal auto-cleanup thread to stop gracefully.
static AUTO_CLEANUP_RUNNING: AtomicBool = AtomicBool::new(true);

/// Signal the auto-cleanup thread to stop.
pub fn stop_auto_cleanup() {
    AUTO_CLEANUP_RUNNING.store(false, Ordering::SeqCst);
}

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

    // Enable WAL mode for concurrent read/write and set busy timeout
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clipboard_items (
            id TEXT PRIMARY KEY,
            content_type TEXT NOT NULL,
            content TEXT NOT NULL,
            hash TEXT NOT NULL UNIQUE,
            timestamp INTEGER NOT NULL,
            metadata TEXT NOT NULL DEFAULT '{}',
            pinned INTEGER NOT NULL DEFAULT 0,
            pinned_at INTEGER,
            ai_type TEXT,
            ai_tags TEXT,
            ai_summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_clipboard_items_timestamp
            ON clipboard_items (timestamp DESC);

        CREATE INDEX IF NOT EXISTS idx_clipboard_items_pinned
            ON clipboard_items (pinned, pinned_at DESC);

        CREATE TABLE IF NOT EXISTS model_metadata (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'available',
            downloaded_at INTEGER NOT NULL,
            context_length INTEGER NOT NULL DEFAULT 2048,
            description TEXT
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS snippets (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
            action TEXT PRIMARY KEY,
            shortcut TEXT NOT NULL
        );

        ",
    )?;

    // Seed default cleanup_days if not set
    {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM app_settings WHERE key = 'cleanup_days')",
            [],
            |row| row.get(0),
        ).unwrap_or(false);
        if !exists {
            let _ = conn.execute(
                "INSERT INTO app_settings (key, value) VALUES ('cleanup_days', '30')",
                [],
            );
        }
    }

    // Seed default keyboard shortcuts
    {
        let defaults = vec![
            ("toggle_popup", "Command+Shift+V"),
            ("quick_cycle", "Command+Shift+J"),
        ];
        for (action, shortcut) in defaults {
            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM keyboard_shortcuts WHERE action = ?1)",
                rusqlite::params![action],
                |row| row.get(0),
            ).unwrap_or(false);
            if !exists {
                let _ = conn.execute(
                    "INSERT INTO keyboard_shortcuts (action, shortcut) VALUES (?1, ?2)",
                    rusqlite::params![action, shortcut],
                );
            }
        }
    }

    // Migrate: add AI metadata columns if they don't exist (compatible with existing databases)
    let migrations = [
        "ALTER TABLE clipboard_items ADD COLUMN ai_type TEXT",
        "ALTER TABLE clipboard_items ADD COLUMN ai_tags TEXT",
        "ALTER TABLE clipboard_items ADD COLUMN ai_summary TEXT",
        "ALTER TABLE clipboard_items ADD COLUMN file_path TEXT",
    ];
    for sql in &migrations {
        // Ignore error if column already exists
        let _ = conn.execute(sql, []);
    }

    // Migrate: add last_used column to snippets (compatible with existing databases)
    let _ = conn.execute("ALTER TABLE snippets ADD COLUMN last_used INTEGER NOT NULL DEFAULT 0", []);
    // Migrate: add sort_order column for manual reordering
    let _ = conn.execute(
        "ALTER TABLE clipboard_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        [],
    );

    // Migrate FTS5: rebuild with ai_tags and ai_summary columns if needed
    let fts_needs_rebuild = {
        let col_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('clipboard_items_fts') WHERE name IN ('ai_tags', 'ai_summary')",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        col_count < 2
    };

    if fts_needs_rebuild {
        // Drop old FTS table and triggers, recreate with enhanced schema
        conn.execute_batch(
            "DROP TABLE IF EXISTS clipboard_items_fts;
             DROP TRIGGER IF EXISTS clipboard_items_ai;
             DROP TRIGGER IF EXISTS clipboard_items_ad;
             DROP TRIGGER IF EXISTS clipboard_items_au;

             CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_items_fts
                 USING fts5(content, ai_tags, ai_summary, content='clipboard_items', content_rowid='rowid');

             CREATE TRIGGER IF NOT EXISTS clipboard_items_ai AFTER INSERT ON clipboard_items BEGIN
                 INSERT INTO clipboard_items_fts(rowid, content, ai_tags, ai_summary)
                 VALUES (new.rowid,
                     CASE WHEN new.content_type = 'image' THEN '' ELSE new.content END,
                     new.ai_tags, new.ai_summary);
             END;

             CREATE TRIGGER IF NOT EXISTS clipboard_items_ad AFTER DELETE ON clipboard_items BEGIN
                 INSERT INTO clipboard_items_fts(clipboard_items_fts, rowid, content, ai_tags, ai_summary)
                 VALUES('delete', old.rowid,
                     CASE WHEN old.content_type = 'image' THEN '' ELSE old.content END,
                     old.ai_tags, old.ai_summary);
             END;

             CREATE TRIGGER IF NOT EXISTS clipboard_items_au AFTER UPDATE ON clipboard_items BEGIN
                 INSERT INTO clipboard_items_fts(clipboard_items_fts, rowid, content, ai_tags, ai_summary)
                 VALUES('delete', old.rowid,
                     CASE WHEN old.content_type = 'image' THEN '' ELSE old.content END,
                     old.ai_tags, old.ai_summary);
                 INSERT INTO clipboard_items_fts(rowid, content, ai_tags, ai_summary)
                 VALUES (new.rowid,
                     CASE WHEN new.content_type = 'image' THEN '' ELSE new.content END,
                     new.ai_tags, new.ai_summary);
             END;

             INSERT INTO clipboard_items_fts(clipboard_items_fts) VALUES('rebuild');
             ",
        )?;
    }

    app.manage(DbState {
        conn: Mutex::new(conn),
    });

    Ok(())
}

/// Ensure the models/ subdirectory exists within the app data directory.
/// Returns the PathBuf to the models directory.
pub fn ensure_models_dir(app_data_dir: &Path) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let models_dir = app_data_dir.join("models");
    std::fs::create_dir_all(&models_dir)?;
    Ok(models_dir)
}

/// Insert a clipboard item into the database.
/// Uses INSERT OR IGNORE to handle hash-based deduplication silently.
pub fn insert_item(conn: &Mutex<rusqlite::Connection>, item: &ClipboardItem) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let metadata_str = serde_json::to_string(&item.metadata).unwrap_or_else(|_| "{}".to_string());
    conn.execute(
        "INSERT OR IGNORE INTO clipboard_items (id, content_type, content, hash, timestamp, metadata, file_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![item.id, item.content_type, item.content, item.hash, item.timestamp, metadata_str, item.file_path],
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
        ai_type: row.get(8)?,
        ai_tags: row.get(9)?,
        ai_summary: row.get(10)?,
        file_path: row.get(11)?,
    })
}

/// Get clipboard history with pagination.
/// Pinned items appear first (ordered by pinned_at DESC), then unpinned (by timestamp DESC).
#[tauri::command]
pub async fn get_history(
    state: tauri::State<'_, DbState>,
    offset: u32,
    limit: u32,
) -> Result<Vec<ClipboardItem>, String> {
    let limit = limit.min(MAX_LIMIT).max(1);
    let lock_result = state.conn.lock();
    let conn = match lock_result {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[db] get_history: mutex poisoned: {}", e);
            return Err(format!("DB lock error: {}", e));
        }
    };
    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary, file_path
             FROM clipboard_items
             ORDER BY sort_order ASC, pinned DESC, pinned_at DESC, timestamp DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| {
            eprintln!("[db] get_history: prepare error: {}", e);
            format!("Prepare error: {}", e)
        })?;
    let items: Vec<ClipboardItem> = stmt
        .query_map(rusqlite::params![limit, offset], row_to_item)
        .map_err(|e| {
            eprintln!("[db] get_history: query error: {}", e);
            format!("Query error: {}", e)
        })?
        .filter_map(|r| {
            match r {
                Ok(item) => Some(item),
                Err(e) => {
                    eprintln!("[db] get_history: row parse error: {}", e);
                    None
                }
            }
        })
        .collect();
    println!("[db] get_history: returning {} items", items.len());
    Ok(items)
}

/// Search clipboard history using FTS5 full-text search.
/// Splits query into words for OR-based fuzzy matching, with LIKE fallback.
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

    // Sanitize: remove FTS5 special characters
    let sanitized: String = trimmed
        .chars()
        .filter(|c| !matches!(c, '"' | '*' | '^' | '#' | ':'))
        .collect();
    if sanitized.trim().is_empty() {
        return Ok(vec![]);
    }

    // Split into words and join with OR for fuzzy matching
    let words: Vec<&str> = sanitized.split_whitespace().filter(|w| !w.is_empty()).collect();
    if words.is_empty() {
        return Ok(vec![]);
    }
    let fts_query = words.join(" OR ");

    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Try FTS5 search first
    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary, file_path
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
    let items: Vec<ClipboardItem> = stmt
        .query_map(rusqlite::params![fts_query, limit, offset], row_to_item)
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // If FTS5 found results, return them
    if !items.is_empty() {
        return Ok(items);
    }

    // Fallback: LIKE substring matching for fuzzy search
    let like_pattern = format!("%{}%", trimmed.replace('%', "\\%").replace('_', "\\_"));
    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary, file_path
             FROM clipboard_items
             WHERE content LIKE ?1 ESCAPE '\\'
             ORDER BY pinned DESC, pinned_at DESC, timestamp DESC
             LIMIT ?2 OFFSET ?3",
        )
        .map_err(|e| format!("Prepare fallback error: {}", e))?;
    let items = stmt
        .query_map(rusqlite::params![like_pattern, limit, offset], row_to_item)
        .map_err(|e| format!("Fallback query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

/// Delete one or more clipboard items by their IDs.
/// Removes from both the main table and the FTS5 index.
#[tauri::command]
pub fn delete_items(
    state: tauri::State<'_, DbState>,
    app: tauri::AppHandle,
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

    // Collect file paths to clean up after deletion
    let file_paths: Vec<String> = ids.iter().filter_map(|id| {
        conn.query_row(
            "SELECT file_path FROM clipboard_items WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        ).ok()
    }).collect();

    for id in &ids {
        conn.execute("DELETE FROM clipboard_items WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Delete error: {}", e))?;
    }
    drop(conn);

    // Clean up associated files from data directory
    if !file_paths.is_empty() {
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            for rel_path in file_paths {
                if !rel_path.is_empty() {
                    let full_path = app_data_dir.join(&rel_path);
                    let _ = std::fs::remove_file(full_path);
                }
            }
        }
    }

    Ok(())
}

/// Delete unpinned items older than N days. Returns count of deleted items.
#[tauri::command]
pub fn clean_old_items(
    state: tauri::State<'_, DbState>,
    app: tauri::AppHandle,
    days: u32,
) -> Result<u64, String> {
    let cutoff = chrono::Utc::now()
        .checked_sub_signed(chrono::Duration::days(days as i64))
        .ok_or("Invalid days value")?
        .timestamp_millis();
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Collect file paths to clean up
    let file_paths: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT file_path FROM clipboard_items WHERE pinned = 0 AND timestamp < ?1 AND file_path IS NOT NULL AND file_path != ''"
        ).map_err(|e| format!("Prepare error: {}", e))?;
        let rows = stmt.query_map(rusqlite::params![cutoff], |row| row.get(0)).ok();
        rows.map(|r| r.filter_map(|v| v.ok()).collect()).unwrap_or_default()
    };

    let count = conn
        .execute(
            "DELETE FROM clipboard_items WHERE pinned = 0 AND timestamp < ?1",
            rusqlite::params![cutoff],
        )
        .map_err(|e| format!("Clean error: {}", e))?;
    drop(conn);

    // Clean up associated files
    if !file_paths.is_empty() {
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            for rel_path in file_paths {
                let full_path = app_data_dir.join(&rel_path);
                let _ = std::fs::remove_file(full_path);
            }
        }
    }

    Ok(count as u64)
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
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary, file_path
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

/// Update the content of an existing clipboard item.
/// Used by AI operations (e.g., "replace original content" with AI result).
#[tauri::command]
pub fn update_item_content(
    state: tauri::State<'_, DbState>,
    id: String,
    content: String,
) -> Result<(), String> {
    if id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("Invalid ID format: {}", id));
    }
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let hash = crate::clipboard::compute_hash(content.as_bytes());
    // Also update FTS index: delete old entry and insert new one
    conn.execute(
        "UPDATE clipboard_items SET content = ?1, hash = ?2 WHERE id = ?3",
        rusqlite::params![content, hash, id],
    )
    .map_err(|e| format!("Update content error: {}", e))?;
    Ok(())
}

/// Update the sort_order of clipboard items in bulk.
/// Accepts an array of [id, sort_order] pairs.
#[tauri::command]
pub fn update_sort_order(state: tauri::State<'_, DbState>, orders: Vec<[String; 2]>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    for pair in &orders {
        let id = &pair[0];
        let sort_str = &pair[1];
        let order: i32 = sort_str.parse().map_err(|e| format!("Invalid sort order: {}", e))?;
        // Validate ID looks like UUID
        if !id.contains('-') { continue; }
        conn.execute("UPDATE clipboard_items SET sort_order = ?1 WHERE id = ?2", rusqlite::params![order, id])
            .map_err(|e| format!("Update error: {}", e))?;
    }
    Ok(())
}

/// Insert a new clipboard item from the frontend (e.g., AI result appended as new entry).
#[tauri::command]
pub fn insert_clipboard_item(
    state: tauri::State<'_, DbState>,
    id: String,
    content_type: String,
    content: String,
    hash: String,
    timestamp: i64,
    metadata: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "INSERT OR IGNORE INTO clipboard_items (id, content_type, content, hash, timestamp, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, content_type, content, hash, timestamp, metadata],
    ).map_err(|e| format!("Insert error: {}", e))?;
    Ok(())
}

/// Update AI metadata (type, tags, summary) for a clipboard item.
#[tauri::command]
pub fn update_ai_metadata(
    state: tauri::State<'_, DbState>,
    id: String,
    ai_type: Option<String>,
    ai_tags: Option<String>,
    ai_summary: Option<String>,
) -> Result<(), String> {
    if id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("Invalid ID format: {}", id));
    }

    // Validate ai_type is within allowed enum (T-05-03 mitigation)
    const ALLOWED_TYPES: &[&str] = &["code", "link", "json", "xml", "image", "text"];
    if let Some(ref t) = ai_type {
        if !ALLOWED_TYPES.contains(&t.as_str()) {
            return Err(format!("Invalid ai_type: {}. Allowed: {:?}", t, ALLOWED_TYPES));
        }
    }

    // Validate ai_tags is a valid JSON array with items <= 50 chars each (T-05-03 mitigation)
    if let Some(ref tags_str) = ai_tags {
        let parsed: serde_json::Value = serde_json::from_str(tags_str)
            .map_err(|e| format!("ai_tags must be valid JSON: {}", e))?;
        if let serde_json::Value::Array(arr) = &parsed {
            for item in arr {
                if let serde_json::Value::String(s) = item {
                    if s.len() > 50 {
                        return Err(format!("Tag too long (max 50 chars): {}", s));
                    }
                }
            }
        }
    }

    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "UPDATE clipboard_items SET ai_type = ?1, ai_tags = ?2, ai_summary = ?3 WHERE id = ?4",
        rusqlite::params![ai_type, ai_tags, ai_summary, id],
    )
    .map_err(|e| format!("Update AI metadata error: {}", e))?;
    Ok(())
}

/// Validate that a relative path does not escape the allowed data directories.
/// Returns Ok(()) if the path is safe, Err with a description otherwise.
pub fn validate_data_path(app_data_dir: &std::path::Path, relative_path: &str) -> Result<(), String> {
    let full_path = app_data_dir.join(relative_path);

    // Security: ensure the path doesn't escape the data or thumbs directories
    let canonical_data = app_data_dir.join("data").canonicalize()
        .unwrap_or_else(|_| app_data_dir.join("data"));
    let canonical_thumbs = app_data_dir.join("thumbs").canonicalize()
        .unwrap_or_else(|_| app_data_dir.join("thumbs"));
    if let Ok(canonical_file) = full_path.canonicalize() {
        if !canonical_file.starts_with(&canonical_data) && !canonical_file.starts_with(&canonical_thumbs) {
            return Err("Path traversal not allowed".to_string());
        }
    }

    Ok(())
}

/// Read a file from the data directory and return it as a base64 data URL.
/// Used by the frontend to display images stored as files.
#[tauri::command]
pub fn read_data_file(app: tauri::AppHandle, relative_path: String) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("App data dir error: {}", e))?;

    validate_data_path(&app_data_dir, &relative_path)?;

    let full_path = app_data_dir.join(&relative_path);
    let bytes = std::fs::read(&full_path)
        .map_err(|e| format!("Read error: {}", e))?;

    let mime_type = match full_path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("mp4") => "video/mp4",
        Some("mov") => "video/quicktime",
        _ => "application/octet-stream",
    };

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Ok(format!("data:{};base64,{}", mime_type, b64))
}

/// Get storage statistics: database file size and item count.
#[tauri::command]
pub fn get_storage_stats(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("App data dir error: {}", e))?;
    let db_path = app_data_dir.join("aboard.db");

    let db_size = if db_path.exists() {
        std::fs::metadata(&db_path)
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    let state = app.state::<DbState>();
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let item_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| row.get(0))
        .unwrap_or(0);

    Ok(serde_json::json!({
        "db_size_bytes": db_size,
        "item_count": item_count,
    }))
}

/// Export selected clipboard items as a ZIP archive.
/// Text items → `text/{index}.txt`, images → `images/{filename}.png`,
/// videos → `videos/{filename}.mp4`.
#[tauri::command]
pub fn export_items(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    ids: Vec<String>,
    path: String,
) -> Result<(), String> {
    use std::io::{Cursor, Write as IoWrite};

    if ids.is_empty() {
        return Err("No items selected for export".to_string());
    }
    for id in &ids {
        if id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(format!("Invalid ID format: {}", id));
        }
    }

    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!(
        "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary, file_path
         FROM clipboard_items WHERE id IN ({})
         ORDER BY pinned DESC, pinned_at DESC, timestamp DESC",
        placeholders.join(",")
    );
    let params: Vec<&dyn rusqlite::types::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
    let items: Vec<ClipboardItem> = {
        let mut stmt = conn.prepare(&sql).map_err(|e| format!("Prepare error: {}", e))?;
        let rows: Vec<Result<ClipboardItem, _>> = stmt
            .query_map(params.as_slice(), row_to_item)
            .map_err(|e| format!("Query error: {}", e))?
            .collect();
        rows.into_iter().filter_map(|r| r.ok()).collect()
    };
    drop(conn);

    let app_data_dir = app.path().app_data_dir().map_err(|e| format!("App data dir error: {}", e))?;
    let buf = Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(buf);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut text_idx = 0u32;

    for item in &items {
        let content_type = item.content_type.as_str();
        match content_type {
            "image" => {
                // Method 1: read from data/ directory (file_path exists)
                let written = if let Some(ref fp) = item.file_path {
                    let full_path = app_data_dir.join(fp);
                    if full_path.exists() {
                        if let Ok(bytes) = std::fs::read(&full_path) {
                            let ext = full_path.extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("png");
                            let name = format!("images/{}.{}", item.id, ext);
                            zip.start_file(&name, options)
                                .map_err(|e| format!("ZIP write error: {}", e))?;
                            zip.write_all(&bytes)
                                .map_err(|e| format!("ZIP write error: {}", e))?;
                            true
                        } else { false }
                    } else { false }
                } else { false };

                // Method 2: decode from base64 data URL in content
                if !written {
                    if let Some(b64_start) = item.content.find(";base64,") {
                        let b64 = &item.content[b64_start + 8..];
                        if let Ok(bytes) = base64::Engine::decode(
                            &base64::engine::general_purpose::STANDARD, b64
                        ) {
                            // Detect extension from data URL prefix
                            let ext = if item.content.contains("image/png") { "png" }
                                else if item.content.contains("image/jpeg") { "jpg" }
                                else if item.content.contains("image/gif") { "gif" }
                                else if item.content.contains("image/webp") { "webp" }
                                else { "png" };
                            let name = format!("images/{}.{}", item.id, ext);
                            zip.start_file(&name, options)
                                .map_err(|e| format!("ZIP write error: {}", e))?;
                            zip.write_all(&bytes)
                                .map_err(|e| format!("ZIP write error: {}", e))?;
                        }
                    }
                }
            }
            "video" => {
                let written = if let Some(ref fp) = item.file_path {
                    let full_path = app_data_dir.join(fp);
                    if full_path.exists() {
                        if let Ok(bytes) = std::fs::read(&full_path) {
                            let ext = full_path.extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("mp4");
                            let name = format!("videos/{}.{}", item.id, ext);
                            zip.start_file(&name, options)
                                .map_err(|e| format!("ZIP write error: {}", e))?;
                            zip.write_all(&bytes)
                                .map_err(|e| format!("ZIP write error: {}", e))?;
                            true
                        } else { false }
                    } else { false }
                } else { false };

                // Fallback: decode from base64 data URL
                if !written {
                    if let Some(b64_start) = item.content.find(";base64,") {
                        let b64 = &item.content[b64_start + 8..];
                        if let Ok(bytes) = base64::Engine::decode(
                            &base64::engine::general_purpose::STANDARD, b64
                        ) {
                            let ext = if item.content.contains("video/mp4") { "mp4" }
                                else if item.content.contains("video/webm") { "webm" }
                                else if item.content.contains("video/quicktime") { "mov" }
                                else { "mp4" };
                            let name = format!("videos/{}.{}", item.id, ext);
                            zip.start_file(&name, options)
                                .map_err(|e| format!("ZIP write error: {}", e))?;
                            zip.write_all(&bytes)
                                .map_err(|e| format!("ZIP write error: {}", e))?;
                        }
                    }
                }
            }
            _ => {
                // Text, code, link, file-paths — write as .txt
                let time = chrono::DateTime::from_timestamp_millis(item.timestamp)
                    .map(|t| t.format("%Y-%m-%d_%H-%M-%S").to_string())
                    .unwrap_or_else(|| format!("item_{}", text_idx));
                let name = format!("text/{}_{}.txt", text_idx, time);
                let content = if item.content.is_empty() { "(empty)" } else { &item.content };
                zip.start_file(&name, options)
                    .map_err(|e| format!("ZIP write error: {}", e))?;
                zip.write_all(content.as_bytes())
                    .map_err(|e| format!("ZIP write error: {}", e))?;
                text_idx += 1;
            }
        }
    }

    let buf = zip.finish().map_err(|e| format!("ZIP finalize error: {}", e))?;
    std::fs::write(&path, buf.into_inner())
        .map_err(|e| format!("File write error: {}", e))?;

    Ok(())
}

/// Semantic search: uses AI to expand a natural language query into FTS5 keywords,
/// then searches across content, ai_tags, and ai_summary.
#[tauri::command]
pub async fn semantic_search(
    ai_state: tauri::State<'_, crate::ai::AiState>,
    db_state: tauri::State<'_, DbState>,
    query: String,
    offset: u32,
    limit: u32,
) -> Result<Vec<ClipboardItem>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    if trimmed.len() > MAX_QUERY_LEN {
        return Err(format!("Query too long (max {} characters)", MAX_QUERY_LEN));
    }
    let limit = limit.min(MAX_LIMIT).max(1);

    // Use AI to expand the query into search keywords
    let expand_prompt = format!(
        "Extract 3-5 concise search keywords from this query. Return ONLY the keywords separated by spaces, nothing else. Query: {}",
        trimmed
    );
    let request = crate::ai::InferenceRequest {
        prompt: expand_prompt,
        system_prompt: Some("You are a search keyword extractor. Return only space-separated keywords.".to_string()),
        max_tokens: Some(50),
        temperature: Some(0.3),
        top_p: None,
    };

    let expanded_keywords = match crate::ai::ai_infer_auto(ai_state, request).await {
        Ok(response) => response.response.text.trim().to_string(),
        Err(_) => trimmed.to_string(), // Fallback to original query if AI fails
    };

    // Build FTS5 query: combine original and expanded keywords
    let all_terms = format!("{} {}", trimmed, expanded_keywords);
    let sanitized: String = all_terms
        .chars()
        .filter(|c| !matches!(c, '"' | '^' | '#' | ':'))
        .collect();
    if sanitized.trim().is_empty() {
        return Ok(vec![]);
    }
    // Split into individual words and join with OR for broader matching
    let fts_terms: Vec<String> = sanitized
        .split_whitespace()
        .filter(|w| w.len() >= 2)
        .map(|w| w.to_string())
        .collect();
    if fts_terms.is_empty() {
        return Ok(vec![]);
    }
    let fts_query = fts_terms.join(" OR ");

    let conn = db_state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary, file_path
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

/// Get the total count of clipboard items.
#[tauri::command]
pub fn get_item_count(state: tauri::State<'_, DbState>) -> Result<u32, String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let count: u32 = conn.query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| row.get(0)).unwrap_or(0);
    Ok(count)
}

// --- Settings ---

#[tauri::command]
pub fn get_setting(state: tauri::State<'_, DbState>, key: String) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    ).map_err(|e| format!("Setting not found: {}", e))
}

#[tauri::command]
pub fn set_setting(state: tauri::State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        rusqlite::params![key, value],
    ).map_err(|e| format!("Save setting error: {}", e))?;
    Ok(())
}

/// Start a background task that runs auto-cleanup every 6 hours.
pub fn start_auto_cleanup(app: tauri::AppHandle) {
    let app_clone = app.clone();
    std::thread::spawn(move || {
        // Initial delay: 5 minutes after startup
        std::thread::sleep(std::time::Duration::from_secs(300));
        loop {
            if !AUTO_CLEANUP_RUNNING.load(Ordering::SeqCst) {
                break;
            }

            // Read cleanup_days from DB
            let db_state = app_clone.state::<DbState>();
            let days: u32 = {
                let conn = db_state.conn.lock().ok();
                match conn {
                    Some(c) => c.query_row(
                        "SELECT value FROM app_settings WHERE key = 'cleanup_days'",
                        [],
                        |row| row.get::<_, String>(0),
                    ).ok().and_then(|v| v.parse().ok()).unwrap_or(30),
                    None => 30,
                }
            };

            if days > 0 {
                match clean_old_items_internal(&app_clone, days) {
                    Ok(count) if count > 0 => {
                        eprintln!("[auto-cleanup] Cleaned {} old items ({} day retention)", count, days);
                    }
                    Ok(_) => {}
                    Err(e) => eprintln!("[auto-cleanup] Error: {}", e),
                }
            }

            // Sleep in short intervals so we can check the stop flag
            for _ in 0..360 {
                if !AUTO_CLEANUP_RUNNING.load(Ordering::SeqCst) {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_secs(60));
            }
        }
    });
}

/// Internal cleanup function that takes AppHandle (for use from background task).
fn clean_old_items_internal(app: &tauri::AppHandle, days: u32) -> Result<u64, String> {
    let cutoff = chrono::Utc::now()
        .checked_sub_signed(chrono::Duration::days(days as i64))
        .ok_or("Invalid days value")?
        .timestamp_millis();

    let db_state = app.state::<DbState>();
    let conn = db_state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let file_paths: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT file_path FROM clipboard_items WHERE pinned = 0 AND timestamp < ?1 AND file_path IS NOT NULL AND file_path != ''"
        ).map_err(|e| format!("Prepare error: {}", e))?;
        let rows = stmt.query_map(rusqlite::params![cutoff], |row| row.get(0)).ok();
        rows.map(|r| r.filter_map(|v| v.ok()).collect()).unwrap_or_default()
    };

    let count = conn
        .execute(
            "DELETE FROM clipboard_items WHERE pinned = 0 AND timestamp < ?1",
            rusqlite::params![cutoff],
        )
        .map_err(|e| format!("Clean error: {}", e))?;
    if count > 0 { let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)"); }
    drop(conn);

    if !file_paths.is_empty() {
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            for rel_path in &file_paths {
                let _ = std::fs::remove_file(app_data_dir.join(rel_path));
            }
        }
    }
    Ok(count as u64)
}

// --- Snippets ---

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct Snippet {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub fn create_snippet(state: tauri::State<'_, DbState>, title: String, content: String) -> Result<Snippet, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let snippet = Snippet { id: id.clone(), title, content, created_at: now, updated_at: now };
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "INSERT INTO snippets (id, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![snippet.id, snippet.title, snippet.content, snippet.created_at, snippet.updated_at],
    ).map_err(|e| format!("Insert snippet error: {}", e))?;
    Ok(snippet)
}

#[tauri::command]
pub fn update_snippet(state: tauri::State<'_, DbState>, id: String, title: String, content: String) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "UPDATE snippets SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![title, content, now, id],
    ).map_err(|e| format!("Update snippet error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn delete_snippet(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute("DELETE FROM snippets WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Delete snippet error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_snippets(state: tauri::State<'_, DbState>) -> Result<Vec<Snippet>, String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let mut stmt = conn.prepare(
        "SELECT id, title, content, created_at, updated_at FROM snippets ORDER BY last_used DESC, updated_at DESC"
    ).map_err(|e| format!("Prepare error: {}", e))?;
    let rows = stmt.query_map([], |row| Ok(Snippet {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })).map_err(|e| format!("Query error: {}", e))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Update last_used timestamp for a snippet.
#[tauri::command]
pub fn touch_snippet(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute("UPDATE snippets SET last_used = ?1 WHERE id = ?2", rusqlite::params![now, id])
        .map_err(|e| format!("Update error: {}", e))?;
    Ok(())
}

// --- Video Thumbnail ---

#[tauri::command]
pub fn generate_video_thumbnail(app: tauri::AppHandle, item_id: String) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| format!("{:?}", e))?;

    // Find the item's file_path
    let db_state = app.state::<DbState>();
    let file_path: Option<String> = {
        let conn = db_state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
        conn.query_row(
            "SELECT file_path FROM clipboard_items WHERE id = ?1",
            rusqlite::params![item_id],
            |row| row.get::<_, Option<String>>(0),
        ).unwrap_or(None)
    };

    let fp = file_path.ok_or("No file_path for this item")?;
    let full_path = app_data_dir.join(&fp);
    if !full_path.exists() {
        return Err("Video file not found".to_string());
    }

    let thumbs_dir = app_data_dir.join("thumbs");
    let _ = std::fs::create_dir_all(&thumbs_dir);
    let thumb_path = thumbs_dir.join(format!("{}.jpg", item_id));

    // Use ffmpeg to extract first frame
    let output = std::process::Command::new("ffmpeg")
        .args([
            "-i", full_path.to_str().unwrap_or(""),
            "-vframes", "1",
            "-q:v", "2",
            "-y",
            thumb_path.to_str().unwrap_or(""),
        ])
        .output();

    match output {
        Ok(o) if o.status.success() && thumb_path.exists() => {
            Ok(format!("thumbs/{}.jpg", item_id))
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            // ffmpeg not found or extraction failed - return empty gracefully
            eprintln!("[video-thumb] ffmpeg failed: {}", stderr.chars().take(200).collect::<String>());
            Ok(String::new())
        }
        Err(_) => {
            // ffmpeg not installed
            Ok(String::new())
        }
    }
}

// --- Import ZIP ---

#[tauri::command]
pub fn import_items(app: tauri::AppHandle, state: tauri::State<'_, DbState>, path: String) -> Result<u32, String> {
    let file = std::fs::File::open(&path).map_err(|e| format!("Open ZIP error: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("ZIP read error: {}", e))?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| format!("{:?}", e))?;
    let data_dir = app_data_dir.join("data");
    let _ = std::fs::create_dir_all(&data_dir);

    // Phase 1: Extract all entries and do file I/O WITHOUT holding the DB lock
    struct PendingItem {
        id: String,
        content_type: String,
        content: String,
        hash: String,
        timestamp: i64,
        file_path: Option<String>,
    }

    let mut pending: Vec<PendingItem> = Vec::new();

    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.name().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        let id = uuid::Uuid::new_v4().to_string();

        if name.starts_with("text/") {
            let mut content = String::new();
            if std::io::Read::read_to_string(&mut entry, &mut content).is_ok() && !content.is_empty() {
                let hash = crate::clipboard::compute_hash(content.as_bytes());
                pending.push(PendingItem {
                    id, content_type: "text".into(), content, hash, timestamp: now, file_path: None,
                });
            }
        } else if name.starts_with("images/") || name.starts_with("videos/") {
            let content_type = if name.starts_with("images/") { "image" } else { "video" };
            let default_ext = if content_type == "image" { "png" } else { "mp4" };
            let mut buf = Vec::new();
            if std::io::Read::read_to_end(&mut entry, &mut buf).is_ok() && !buf.is_empty() {
                let hash = crate::clipboard::compute_hash(&buf);
                let ext = name.rsplit('.').next().unwrap_or(default_ext);
                let file_name = format!("{}.{}", id, ext);
                let file_full = data_dir.join(&file_name);
                if std::fs::write(&file_full, &buf).is_ok() {
                    let relative = format!("data/{}", file_name);
                    pending.push(PendingItem {
                        id, content_type: content_type.into(), content: String::new(),
                        hash, timestamp: now, file_path: Some(relative),
                    });
                }
            }
        }
    }

    // Phase 2: Insert into DB with brief lock per item
    let mut imported = 0u32;
    for item in pending {
        let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM clipboard_items WHERE hash = ?1)",
            rusqlite::params![item.hash],
            |row| row.get(0),
        ).unwrap_or(false);
        if !exists {
            match item.file_path {
                Some(ref fp) => {
                    let _ = conn.execute(
                        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, metadata, pinned, file_path) VALUES (?1, ?2, ?3, ?4, ?5, '{}', 0, ?6)",
                        rusqlite::params![item.id, item.content_type, item.content, item.hash, item.timestamp, fp],
                    );
                }
                None => {
                    let _ = conn.execute(
                        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, metadata, pinned) VALUES (?1, ?2, ?3, ?4, ?5, '{}', 0)",
                        rusqlite::params![item.id, item.content_type, item.content, item.hash, item.timestamp],
                    );
                }
            }
            imported += 1;
        }
        drop(conn); // Release lock before next iteration
    }

    Ok(imported)
}

// --- Smart Dedup ---

use std::collections::HashSet;

#[tauri::command]
pub fn find_similar_items(state: tauri::State<'_, DbState>, id: String, limit: u32) -> Result<Vec<ClipboardItem>, String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let source_content: String = conn.query_row(
        "SELECT content FROM clipboard_items WHERE id = ?1",
        rusqlite::params![id],
        |row| row.get(0),
    ).map_err(|e| format!("Item not found: {}", e))?;

    let source_tokens: HashSet<String> = source_content
        .split_whitespace()
        .map(|s| s.to_lowercase())
        .collect();
    if source_tokens.is_empty() {
        return Ok(vec![]);
    }

    let mut stmt = conn.prepare(
        "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary, file_path
         FROM clipboard_items WHERE id != ?1 AND content_type = 'text'
         ORDER BY timestamp DESC LIMIT 100"
    ).map_err(|e| format!("Prepare error: {}", e))?;

    let rows: Vec<ClipboardItem> = stmt.query_map(rusqlite::params![id], row_to_item)
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);
    drop(conn);

    let mut scored: Vec<(f64, ClipboardItem)> = rows.into_iter().filter_map(|item| {
        let tokens: HashSet<String> = item.content
            .split_whitespace()
            .map(|s| s.to_lowercase())
            .collect();
        if tokens.is_empty() { return None; }
        let intersection = source_tokens.intersection(&tokens).count() as f64;
        let union = source_tokens.union(&tokens).count() as f64;
        let jaccard = intersection / union;
        if jaccard > 0.7 {
            Some((jaccard, item))
        } else {
            None
        }
    }).collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    Ok(scored.into_iter().take(limit as usize).map(|(_, item)| item).collect())
}

// --- Window State ---

#[tauri::command]
pub fn save_window_state(app: tauri::AppHandle, x: f64, y: f64, width: f64, height: f64, is_maximized: bool) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| format!("{:?}", e))?;
    let state_file = app_data_dir.join("window_state.json");
    let data = serde_json::json!({ "x": x, "y": y, "width": width, "height": height, "is_maximized": is_maximized });
    std::fs::write(&state_file, data.to_string()).map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_window_state(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| format!("{:?}", e))?;
    let state_file = app_data_dir.join("window_state.json");
    if !state_file.exists() { return Ok(None); }
    let content = std::fs::read_to_string(&state_file).map_err(|e| format!("Read error: {}", e))?;
    let val: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))?;
    Ok(Some(val))
}

// --- Keyboard Shortcuts ---

#[derive(serde::Serialize)]
pub struct ShortcutEntry {
    pub action: String,
    pub shortcut: String,
}

#[tauri::command]
pub fn get_shortcuts(state: tauri::State<'_, DbState>) -> Result<Vec<ShortcutEntry>, String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let mut stmt = conn.prepare("SELECT action, shortcut FROM keyboard_shortcuts")
        .map_err(|e| format!("Prepare error: {}", e))?;
    let rows = stmt.query_map([], |row| Ok(ShortcutEntry {
        action: row.get(0)?,
        shortcut: row.get(1)?,
    })).map_err(|e| format!("Query error: {}", e))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn update_shortcut(state: tauri::State<'_, DbState>, action: String, shortcut: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "INSERT INTO keyboard_shortcuts (action, shortcut) VALUES (?1, ?2)
         ON CONFLICT(action) DO UPDATE SET shortcut = ?2",
        rusqlite::params![action, shortcut],
    ).map_err(|e| format!("Update shortcut error: {}", e))?;
    Ok(())
}
