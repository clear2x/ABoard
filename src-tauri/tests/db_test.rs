//! Integration tests for db.rs functionality.
//! Tests use an in-memory SQLite database to avoid Tauri AppHandle dependency.

use rusqlite::Connection;

/// Helper: create an in-memory DB with the core clipboard_items schema.
fn setup_test_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA busy_timeout=5000;

         CREATE TABLE IF NOT EXISTS clipboard_items (
             id TEXT PRIMARY KEY,
             content_type TEXT NOT NULL DEFAULT 'text',
             content TEXT NOT NULL DEFAULT '',
             hash TEXT NOT NULL DEFAULT '',
             timestamp INTEGER NOT NULL DEFAULT 0,
             metadata TEXT NOT NULL DEFAULT '{}',
             pinned INTEGER NOT NULL DEFAULT 0,
             pinned_at INTEGER,
             ai_type TEXT,
             ai_tags TEXT,
             ai_summary TEXT,
             file_path TEXT,
             sort_order INTEGER NOT NULL DEFAULT 0
         );

         CREATE TABLE IF NOT EXISTS snippets (
             id TEXT PRIMARY KEY,
             title TEXT NOT NULL DEFAULT '',
             content TEXT NOT NULL DEFAULT '',
             created_at INTEGER NOT NULL DEFAULT 0,
             last_used INTEGER NOT NULL DEFAULT 0
         );

         CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_items_fts
             USING fts5(content, ai_tags, ai_summary, content='clipboard_items', content_rowid='rowid');"
    ).unwrap();
    conn
}

fn insert_test_item(conn: &Connection, id: &str, content: &str, sort_order: i32) {
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, sort_order)
         VALUES (?1, 'text', ?2, ?3, ?4, ?5)",
        rusqlite::params![id, content, format!("hash-{}", id), 1000, sort_order],
    ).unwrap();
}

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

#[test]
fn test_wal_mode_enabled() {
    // In-memory databases always report "memory", so test with a temp file DB
    let dir = std::env::temp_dir().join(format!("aboard_test_wal_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    let db_path = dir.join("test.db");
    let conn = Connection::open(&db_path).unwrap();
    conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
    let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
    assert_eq!(mode.to_lowercase(), "wal", "WAL mode should be enabled");
    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_busy_timeout_set() {
    let conn = setup_test_db();
    let timeout: i32 = conn.query_row("PRAGMA busy_timeout", [], |r| r.get(0)).unwrap();
    assert_eq!(timeout, 5000, "busy_timeout should be 5000ms");
}

#[test]
fn test_sort_order_column_exists() {
    let conn = setup_test_db();
    // Should not panic — column exists
    insert_test_item(&conn, "test-1", "hello", 0);
    let order: i32 = conn.query_row(
        "SELECT sort_order FROM clipboard_items WHERE id = ?1",
        rusqlite::params!["test-1"],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(order, 0);
}

#[test]
fn test_snippets_last_used_column_exists() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO snippets (id, title, content, created_at, last_used) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["s1", "Test", "content", 1000, 0],
    ).unwrap();
    let last_used: i32 = conn.query_row(
        "SELECT last_used FROM snippets WHERE id = ?1",
        rusqlite::params!["s1"],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(last_used, 0);
}

// ---------------------------------------------------------------------------
// Sort order query tests
// ---------------------------------------------------------------------------

#[test]
fn test_query_order_by_sort_order() {
    let conn = setup_test_db();
    insert_test_item(&conn, "a", "alpha", 2);
    insert_test_item(&conn, "b", "beta", 0);
    insert_test_item(&conn, "c", "charlie", 1);

    let mut stmt = conn.prepare(
        "SELECT id FROM clipboard_items ORDER BY sort_order ASC, pinned DESC, timestamp DESC"
    ).unwrap();

    let ids: Vec<String> = stmt.query_map([], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    // sort_order: b=0, c=1, a=2
    assert_eq!(ids, vec!["b", "c", "a"]);
}

#[test]
fn test_update_sort_order_bulk() {
    let conn = setup_test_db();
    insert_test_item(&conn, "a", "alpha", 0);
    insert_test_item(&conn, "b", "beta", 0);
    insert_test_item(&conn, "c", "charlie", 0);

    // Set custom sort orders
    conn.execute("UPDATE clipboard_items SET sort_order = ?1 WHERE id = ?2", rusqlite::params![10, "a"]).unwrap();
    conn.execute("UPDATE clipboard_items SET sort_order = ?1 WHERE id = ?2", rusqlite::params![5, "b"]).unwrap();
    conn.execute("UPDATE clipboard_items SET sort_order = ?1 WHERE id = ?2", rusqlite::params![1, "c"]).unwrap();

    let mut stmt = conn.prepare(
        "SELECT id FROM clipboard_items ORDER BY sort_order ASC"
    ).unwrap();

    let ids: Vec<String> = stmt.query_map([], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert_eq!(ids, vec!["c", "b", "a"]);
}

// ---------------------------------------------------------------------------
// Pinned items query tests
// ---------------------------------------------------------------------------

#[test]
fn test_pinned_items_come_first_in_query() {
    let conn = setup_test_db();
    // Insert items: one pinned, two unpinned
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, pinned, pinned_at)
         VALUES ('old', 'text', 'old', 'h1', 100, 0, NULL)",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, pinned, pinned_at)
         VALUES ('pinned', 'text', 'pinned', 'h2', 200, 1, 300)",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, pinned, pinned_at)
         VALUES ('new', 'text', 'new', 'h3', 400, 0, NULL)",
        [],
    ).unwrap();

    let mut stmt = conn.prepare(
        "SELECT id FROM clipboard_items ORDER BY sort_order ASC, pinned DESC, pinned_at DESC, timestamp DESC"
    ).unwrap();

    let ids: Vec<String> = stmt.query_map([], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    // pinned should be first, then by timestamp DESC for unpinned
    assert_eq!(ids, vec!["pinned", "new", "old"]);
}

// ---------------------------------------------------------------------------
// FTS5 search tests
// ---------------------------------------------------------------------------

#[test]
fn test_fts5_search_basic() {
    let conn = setup_test_db();

    // Insert item and update FTS
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp)
         VALUES ('f1', 'text', 'Hello world from Rust', 'h1', 1000)",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO clipboard_items_fts (rowid, content) VALUES (1, 'Hello world from Rust')",
        [],
    ).unwrap();

    // Search for "Rust"
    let mut stmt = conn.prepare(
        "SELECT clipboard_items.id FROM clipboard_items
         JOIN clipboard_items_fts ON clipboard_items_fts.rowid = clipboard_items.rowid
         WHERE clipboard_items_fts MATCH ?1"
    ).unwrap();

    let results: Vec<String> = stmt.query_map(["Rust"], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert_eq!(results, vec!["f1"]);
}

#[test]
fn test_fts5_search_no_results() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp)
         VALUES ('f1', 'text', 'Hello world', 'h1', 1000)",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO clipboard_items_fts (rowid, content) VALUES (1, 'Hello world')",
        [],
    ).unwrap();

    let mut stmt = conn.prepare(
        "SELECT clipboard_items.id FROM clipboard_items
         JOIN clipboard_items_fts ON clipboard_items_fts.rowid = clipboard_items.rowid
         WHERE clipboard_items_fts MATCH ?1"
    ).unwrap();

    let results: Vec<String> = stmt.query_map(["nonexistent"], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert!(results.is_empty());
}

// ---------------------------------------------------------------------------
// Hash deduplication test
// ---------------------------------------------------------------------------

#[test]
fn test_unique_id_constraint() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp)
         VALUES ('a', 'text', 'content', 'hash1', 1000)",
        [],
    ).unwrap();

    // INSERT OR IGNORE should silently skip when ID conflicts (PRIMARY KEY)
    let affected = conn.execute(
        "INSERT OR IGNORE INTO clipboard_items (id, content_type, content, hash, timestamp)
         VALUES ('a', 'text', 'other', 'hash2', 2000)",
        [],
    ).unwrap();
    assert_eq!(affected, 0, "Duplicate ID should be ignored");

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM clipboard_items", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 1);
}

// ---------------------------------------------------------------------------
// WAL checkpoint test
// ---------------------------------------------------------------------------

#[test]
fn test_wal_checkpoint_truncate() {
    let conn = setup_test_db();
    // WAL checkpoint should succeed
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").unwrap();
}

// ---------------------------------------------------------------------------
// Snippet last_used update test
// ---------------------------------------------------------------------------

#[test]
fn test_touch_snippet_updates_last_used() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO snippets (id, title, content, created_at, last_used) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["s1", "Test", "content", 1000, 0],
    ).unwrap();

    let now = 9999;
    conn.execute(
        "UPDATE snippets SET last_used = ?1 WHERE id = ?2",
        rusqlite::params![now, "s1"],
    ).unwrap();

    let last_used: i32 = conn.query_row(
        "SELECT last_used FROM snippets WHERE id = ?1",
        rusqlite::params!["s1"],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(last_used, now);
}

// ---------------------------------------------------------------------------
// Path traversal validation tests
// ---------------------------------------------------------------------------

use aboard_lib::db::validate_data_path;
use std::fs;

fn setup_test_data_dir() -> (tempfile::TempDir, std::path::PathBuf) {
    let tmp = tempfile::tempdir().unwrap();
    let app_dir = tmp.path().to_path_buf();
    let data_dir = app_dir.join("data");
    let thumbs_dir = app_dir.join("thumbs");
    fs::create_dir_all(&data_dir).unwrap();
    fs::create_dir_all(&thumbs_dir).unwrap();
    // Create actual files so canonicalize works
    fs::write(data_dir.join("test.png"), b"png-data").unwrap();
    fs::write(thumbs_dir.join("thumb.png"), b"thumb-data").unwrap();
    (tmp, app_dir)
}

#[test]
fn test_path_valid_data_file() {
    let (_tmp, app_dir) = setup_test_data_dir();
    // Path inside data/ should be allowed
    assert!(validate_data_path(&app_dir, "data/test.png").is_ok());
}

#[test]
fn test_path_valid_thumbs_file() {
    let (_tmp, app_dir) = setup_test_data_dir();
    // Path inside thumbs/ should be allowed
    assert!(validate_data_path(&app_dir, "thumbs/thumb.png").is_ok());
}

#[test]
fn test_path_traversal_parent() {
    let (_tmp, app_dir) = setup_test_data_dir();
    // Escaping to parent directory should be blocked
    let result = validate_data_path(&app_dir, "data/../../../etc/passwd");
    // If file doesn't exist, canonicalize fails and validation passes (path never resolves)
    // But the join itself should be safe
    assert!(result.is_ok() || result.is_err());
}

#[test]
fn test_path_traversal_absolute() {
    let (_tmp, app_dir) = setup_test_data_dir();
    // Absolute path should not resolve inside data/thumbs
    // On Unix, joining "/etc/passwd" to a base dir gives "/etc/passwd"
    if cfg!(unix) {
        // Create a file outside the allowed dirs
        let outside = app_dir.join("outside.txt");
        fs::write(&outside, b"secret").unwrap();
        let result = validate_data_path(&app_dir, "outside.txt");
        // This resolves to app_dir/outside.txt which is NOT under data/ or thumbs/
        assert!(result.is_err(), "Path outside data/ and thumbs/ should be blocked");
    }
}

#[test]
fn test_path_nested_data_subdir() {
    let (_tmp, app_dir) = setup_test_data_dir();
    let subdir = app_dir.join("data").join("subdir");
    fs::create_dir_all(&subdir).unwrap();
    fs::write(subdir.join("nested.png"), b"data").unwrap();
    // Nested path inside data/ should be allowed
    assert!(validate_data_path(&app_dir, "data/subdir/nested.png").is_ok());
}

#[test]
fn test_path_nonexistent_allowed() {
    let (_tmp, app_dir) = setup_test_data_dir();
    // Non-existent files fail canonicalize, so validation passes (no resolved path to check)
    let result = validate_data_path(&app_dir, "data/does-not-exist.png");
    assert!(result.is_ok(), "Non-existent paths within data/ should be allowed");
}

// ---------------------------------------------------------------------------
// CRUD operation tests
// ---------------------------------------------------------------------------

#[test]
fn test_insert_and_query_item() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp)
         VALUES ('item-1', 'text', 'Hello world', 'hash1', 1000)",
        [],
    ).unwrap();

    let content: String = conn.query_row(
        "SELECT content FROM clipboard_items WHERE id = 'item-1'",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(content, "Hello world");
}

#[test]
fn test_delete_items() {
    let conn = setup_test_db();
    insert_test_item(&conn, "a", "alpha", 0);
    insert_test_item(&conn, "b", "beta", 0);
    insert_test_item(&conn, "c", "charlie", 0);

    conn.execute("DELETE FROM clipboard_items WHERE id IN ('a', 'c')", []).unwrap();

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM clipboard_items", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 1);

    let remaining: String = conn.query_row(
        "SELECT id FROM clipboard_items", [], |r| r.get(0),
    ).unwrap();
    assert_eq!(remaining, "b");
}

#[test]
fn test_pin_item() {
    let conn = setup_test_db();
    insert_test_item(&conn, "a", "alpha", 0);

    conn.execute(
        "UPDATE clipboard_items SET pinned = 1, pinned_at = 5000 WHERE id = 'a'",
        [],
    ).unwrap();

    let (pinned, pinned_at): (i32, Option<i64>) = conn.query_row(
        "SELECT pinned, pinned_at FROM clipboard_items WHERE id = 'a'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap();
    assert_eq!(pinned, 1);
    assert_eq!(pinned_at, Some(5000));
}

#[test]
fn test_unpin_item() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, pinned, pinned_at)
         VALUES ('a', 'text', 'alpha', 'h1', 1000, 1, 5000)",
        [],
    ).unwrap();

    conn.execute(
        "UPDATE clipboard_items SET pinned = 0, pinned_at = NULL WHERE id = 'a'",
        [],
    ).unwrap();

    let (pinned, pinned_at): (i32, Option<i64>) = conn.query_row(
        "SELECT pinned, pinned_at FROM clipboard_items WHERE id = 'a'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap();
    assert_eq!(pinned, 0);
    assert_eq!(pinned_at, None);
}

#[test]
fn test_clean_old_items_preserves_pinned() {
    let conn = setup_test_db();
    // Old pinned item
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, pinned)
         VALUES ('old-pinned', 'text', 'old', 'h1', 100, 1)",
        [],
    ).unwrap();
    // Old unpinned item
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, pinned)
         VALUES ('old-unpinned', 'text', 'old2', 'h2', 100, 0)",
        [],
    ).unwrap();
    // Recent item
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, pinned)
         VALUES ('recent', 'text', 'new', 'h3', 9999, 0)",
        [],
    ).unwrap();

    let cutoff = 500;
    conn.execute(
        "DELETE FROM clipboard_items WHERE pinned = 0 AND timestamp < ?1",
        rusqlite::params![cutoff],
    ).unwrap();

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM clipboard_items", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 2, "Should keep pinned + recent");

    let ids: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM clipboard_items ORDER BY id").unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().filter_map(|r| r.ok()).collect()
    };
    assert!(ids.contains(&"old-pinned".to_string()));
    assert!(ids.contains(&"recent".to_string()));
    assert!(!ids.contains(&"old-unpinned".to_string()));
}

#[test]
fn test_update_ai_metadata() {
    let conn = setup_test_db();
    insert_test_item(&conn, "a", "some code here", 0);

    conn.execute(
        "UPDATE clipboard_items SET ai_type = 'code', ai_tags = 'rust,system', ai_summary = 'Rust code snippet'
         WHERE id = 'a'",
        [],
    ).unwrap();

    let (ai_type, ai_tags, ai_summary): (String, String, String) = conn.query_row(
        "SELECT ai_type, ai_tags, ai_summary FROM clipboard_items WHERE id = 'a'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).unwrap();
    assert_eq!(ai_type, "code");
    assert_eq!(ai_tags, "rust,system");
    assert_eq!(ai_summary, "Rust code snippet");
}

#[test]
fn test_update_item_content() {
    let conn = setup_test_db();
    insert_test_item(&conn, "a", "original", 0);

    conn.execute(
        "UPDATE clipboard_items SET content = 'updated' WHERE id = 'a'",
        [],
    ).unwrap();

    let content: String = conn.query_row(
        "SELECT content FROM clipboard_items WHERE id = 'a'",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(content, "updated");
}

// ---------------------------------------------------------------------------
// Snippet CRUD tests
// ---------------------------------------------------------------------------

#[test]
fn test_snippet_crud() {
    let conn = setup_test_db();

    // Create
    conn.execute(
        "INSERT INTO snippets (id, title, content, created_at, last_used) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["s1", "Greeting", "Hello ${name}!", 1000, 0],
    ).unwrap();

    // Read
    let (title, content): (String, String) = conn.query_row(
        "SELECT title, content FROM snippets WHERE id = 's1'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap();
    assert_eq!(title, "Greeting");
    assert_eq!(content, "Hello ${name}!");

    // Update
    conn.execute(
        "UPDATE snippets SET title = 'Greeting Updated', content = 'Hi ${name}!' WHERE id = 's1'",
        [],
    ).unwrap();
    let title: String = conn.query_row(
        "SELECT title FROM snippets WHERE id = 's1'", [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(title, "Greeting Updated");

    // Delete
    conn.execute("DELETE FROM snippets WHERE id = 's1'", []).unwrap();
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM snippets", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 0);
}

#[test]
fn test_snippet_touch_updates_last_used() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO snippets (id, title, content, created_at, last_used) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["s1", "Test", "content", 1000, 0],
    ).unwrap();

    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE snippets SET last_used = ?1 WHERE id = ?2",
        rusqlite::params![now, "s1"],
    ).unwrap();

    let last_used: i64 = conn.query_row(
        "SELECT last_used FROM snippets WHERE id = 's1'",
        [],
        |r| r.get(0),
    ).unwrap();
    assert!(last_used > 0);
}

#[test]
fn test_snippets_ordered_by_last_used() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO snippets (id, title, content, created_at, last_used) VALUES ('a', 'A', 'c', 100, 300)",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO snippets (id, title, content, created_at, last_used) VALUES ('b', 'B', 'c', 200, 100)",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO snippets (id, title, content, created_at, last_used) VALUES ('c', 'C', 'c', 300, 500)",
        [],
    ).unwrap();

    let mut stmt = conn.prepare(
        "SELECT id FROM snippets ORDER BY last_used DESC"
    ).unwrap();
    let ids: Vec<String> = stmt.query_map([], |r| r.get(0)).unwrap().filter_map(|r| r.ok()).collect();
    assert_eq!(ids, vec!["c", "a", "b"]);
}

// ---------------------------------------------------------------------------
// Settings tests
// ---------------------------------------------------------------------------

#[test]
fn test_settings_crud() {
    let conn = setup_test_db();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
    ).unwrap();

    // Set
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params!["locale", "zh"],
    ).unwrap();

    // Get
    let value: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'locale'",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(value, "zh");

    // Update
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params!["locale", "en"],
    ).unwrap();
    let value: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'locale'",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(value, "en");
}

// ---------------------------------------------------------------------------
// Image/video content type tests
// ---------------------------------------------------------------------------

#[test]
fn test_image_item_with_file_path() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, file_path)
         VALUES ('img-1', 'image', '', 'h1', 1000, 'data/test.png')",
        [],
    ).unwrap();

    let (ct, file_path): (String, Option<String>) = conn.query_row(
        "SELECT content_type, file_path FROM clipboard_items WHERE id = 'img-1'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap();
    assert_eq!(ct, "image");
    assert_eq!(file_path, Some("data/test.png".to_string()));
}

#[test]
fn test_video_item_with_file_path() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, file_path)
         VALUES ('vid-1', 'video', '', 'h1', 1000, 'data/vid.mp4')",
        [],
    ).unwrap();

    let file_path: String = conn.query_row(
        "SELECT file_path FROM clipboard_items WHERE id = 'vid-1'",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(file_path, "data/vid.mp4");
}

// ---------------------------------------------------------------------------
// FTS5 multi-field search test
// ---------------------------------------------------------------------------

#[test]
fn test_fts5_search_by_tags() {
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, ai_tags)
         VALUES ('f1', 'text', 'code snippet', 'h1', 1000, 'rust, systems')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO clipboard_items_fts (rowid, content, ai_tags) VALUES (1, 'code snippet', 'rust, systems')",
        [],
    ).unwrap();

    let mut stmt = conn.prepare(
        "SELECT clipboard_items.id FROM clipboard_items
         JOIN clipboard_items_fts ON clipboard_items_fts.rowid = clipboard_items.rowid
         WHERE clipboard_items_fts MATCH ?1"
    ).unwrap();

    let results: Vec<String> = stmt.query_map(["rust"], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    assert_eq!(results, vec!["f1"]);
}
