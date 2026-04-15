---
phase: 02-storage-history-management
plan: 01
subsystem: storage
tags: [sqlite, rusqlite, fts5, tauri-commands, persistence, crud, pinning]

# Dependency graph
requires:
  - phase: 01-clipboard-core-tray/01
    provides: "Tauri v2 project skeleton with Rust clipboard monitoring, SHA256 dedup, and clipboard-update event emission"
provides:
  - "SQLite database layer with FTS5 full-text search and CRUD operations (init_db, insert_item, get_history, search_history, delete_items, pin_item, unpin_item, get_pinned)"
  - "Clipboard monitoring loop persists every captured item to SQLite"
  - "All 6 storage Tauri commands registered in invoke_handler"
  - "ClipboardItem struct extended with pinned and pinned_at fields"
affects: [02-storage-history-management, 03-ui-foundation]

# Tech tracking
tech-stack:
  added: [rusqlite-0.31-bundled]
  patterns: [mutex-guarded-connection, fts5-external-content-triggers, parameterized-queries, input-validation-uuid-format, query-length-limit]

key-files:
  created:
    - src-tauri/src/db.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/clipboard.rs
    - src-tauri/src/lib.rs

key-decisions:
  - "Used state() instead of try_state() for DbState access in clipboard.rs -- Tauri v2 AppHandle requires Manager trait import for state access"
  - "FTS5 external content table with AFTER INSERT/AFTER DELETE triggers for automatic index sync"
  - "INSERT OR IGNORE for hash-based dedup at database level (double protection with in-memory SHA256 dedup)"
  - "UUID format validation for delete_items, pin_item, unpin_item commands (T-02-01 mitigation)"
  - "Query length limit of 200 chars and result limit of 100 for search_history (T-02-03 mitigation)"
  - "FTS5 query sanitization by removing special characters and wrapping in double quotes (T-02-04 mitigation)"

patterns-established:
  - "SQLite state pattern: Mutex<Connection> wrapped in DbState struct, managed by Tauri app.manage()"
  - "DB initialization in setup closure before monitoring starts"
  - "Parameterized queries exclusively (rusqlite prepared statements) for SQL injection prevention (T-02-05)"

requirements-completed: [CLIP-02, CLIP-03, CLIP-04, CLIP-05, CLIP-06]

# Metrics
duration: 4min
completed: 2026-04-15
---

# Phase 2 Plan 01: SQLite Storage Layer + Tauri Commands Summary

**SQLite persistence with FTS5 full-text search, paginated history queries, CRUD operations, pinning support, and automatic clipboard-to-database writing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-15T00:44:02Z
- **Completed:** 2026-04-15T00:48:24Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- SQLite database module (db.rs) with init_db, insert_item, and 6 Tauri commands: get_history, search_history, delete_items, pin_item, unpin_item, get_pinned
- FTS5 virtual table with insert/delete triggers for automatic search index synchronization
- Paginated history query with pinned-first ordering (pinned_at DESC, then timestamp DESC)
- Full-text search with phrase matching, query length limits (200 chars), and special character sanitization
- ClipboardItem struct extended with pinned (bool) and pinned_at (Option<i64>) fields
- Clipboard monitoring loop persists every new capture to SQLite via db::insert_item
- All 6 database Tauri commands registered in invoke_handler
- UUID format validation on delete/pin/unpin commands, parameterized queries for all operations
- cargo check passes with zero errors, all 6 existing tests still pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SQLite storage module with FTS5 and all CRUD operations** - `fc46fcf` (feat)
2. **Task 2: Wire storage into clipboard monitoring and register Tauri commands** - `c95622d` (feat)

## Files Created/Modified
- `src-tauri/src/db.rs` - SQLite storage module with DbState, init_db, insert_item, 6 Tauri commands, FTS5 triggers
- `src-tauri/Cargo.toml` - Added rusqlite 0.31 with bundled feature
- `src-tauri/src/clipboard.rs` - Added db::insert_item call in monitoring loop, pinned/pinned_at fields, Manager import
- `src-tauri/src/lib.rs` - Added mod db, init_db call before monitoring, 6 db commands in invoke_handler

## Decisions Made
- Used `app.state::<DbState>()` instead of `try_state()` -- Tauri v2 AppHandle provides state() via the Manager trait, and try_state() is only available on App (not AppHandle)
- FTS5 external content mode with AFTER INSERT/AFTER DELETE triggers -- keeps FTS index in sync automatically without manual management
- INSERT OR IGNORE for hash dedup at database level -- provides a second layer of deduplication beyond the in-memory SHA256 hash comparison
- UUID format validation on all commands that accept item IDs -- mitigates T-02-01 (spoofing via crafted IDs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] try_state() not available on AppHandle in Tauri v2**
- **Found during:** Task 2 (cargo check compilation error)
- **Issue:** `app.try_state::<DbState>()` does not exist on `AppHandle<R>` in Tauri v2
- **Fix:** Changed to `app.state::<DbState>()` with `use tauri::Manager` trait import
- **Files modified:** src-tauri/src/clipboard.rs
- **Commit:** c95622d

**2. [Rule 3 - Blocking] mod db needed in lib.rs for db.rs to compile**
- **Found during:** Task 1 (db.rs not being compiled without module declaration)
- **Issue:** db.rs exists but without `mod db;` in lib.rs, the module is not compiled or checked
- **Fix:** Added `mod db;` to lib.rs as part of Task 1 commit
- **Files modified:** src-tauri/src/lib.rs
- **Commit:** fc46fcf

---

**Total deviations:** 2 auto-fixed (2 blocking issues)
**Impact on plan:** All fixes necessary for compilation. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SQLite storage layer fully operational with all CRUD and search commands
- Frontend can call get_history, search_history, delete_items, pin_item, unpin_item, get_pinned via Tauri invoke
- Clipboard monitoring automatically persists every captured item
- Next plan (02-02) can build the frontend history UI consuming these commands
- Next plan (02-03) can add search UI, right-click menus, and pin/unpin interactions

## Self-Check: PASSED

All 4 key files verified present on disk. Both task commits (fc46fcf, c95622d) verified in git log.

---
*Phase: 02-storage-history-management*
*Completed: 2026-04-15*
