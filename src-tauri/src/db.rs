use crate::clipboard::ClipboardItem;
use std::path::{Path, PathBuf};
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
        ",
    )?;

    // Migrate: add AI metadata columns if they don't exist (compatible with existing databases)
    let migrations = [
        "ALTER TABLE clipboard_items ADD COLUMN ai_type TEXT",
        "ALTER TABLE clipboard_items ADD COLUMN ai_tags TEXT",
        "ALTER TABLE clipboard_items ADD COLUMN ai_summary TEXT",
    ];
    for sql in &migrations {
        // Ignore error if column already exists
        let _ = conn.execute(sql, []);
    }

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
                 VALUES (new.rowid, new.content, new.ai_tags, new.ai_summary);
             END;

             CREATE TRIGGER IF NOT EXISTS clipboard_items_ad AFTER DELETE ON clipboard_items BEGIN
                 INSERT INTO clipboard_items_fts(clipboard_items_fts, rowid, content, ai_tags, ai_summary)
                 VALUES('delete', old.rowid, old.content, old.ai_tags, old.ai_summary);
             END;

             CREATE TRIGGER IF NOT EXISTS clipboard_items_au AFTER UPDATE ON clipboard_items BEGIN
                 INSERT INTO clipboard_items_fts(clipboard_items_fts, rowid, content, ai_tags, ai_summary)
                 VALUES('delete', old.rowid, old.content, old.ai_tags, old.ai_summary);
                 INSERT INTO clipboard_items_fts(rowid, content, ai_tags, ai_summary)
                 VALUES (new.rowid, new.content, new.ai_tags, new.ai_summary);
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
        ai_type: row.get(8)?,
        ai_tags: row.get(9)?,
        ai_summary: row.get(10)?,
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
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary
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
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary
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
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary
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
    // Also update FTS index: delete old entry and insert new one
    conn.execute(
        "UPDATE clipboard_items SET content = ?1 WHERE id = ?2",
        rusqlite::params![content, id],
    )
    .map_err(|e| format!("Update content error: {}", e))?;
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
            "SELECT id, content_type, content, hash, timestamp, metadata, pinned, pinned_at, ai_type, ai_tags, ai_summary
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
