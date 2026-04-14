---
phase: 01-clipboard-core-tray
plan: 02
subsystem: tray
tags: [tauri-v2, system-tray, global-shortcut, window-management, cursor-position, close-to-tray]

# Dependency graph
requires:
  - phase: 01-clipboard-core-tray/01
    provides: "Tauri v2 project skeleton with Rust clipboard monitoring and toggle_monitoring command"
provides:
  - "System tray icon with 3-item context menu (Show Window, Pause/Resume Monitoring, Quit)"
  - "Global shortcut Cmd+Shift+V (macOS) / Ctrl+Shift+V (Win/Linux) to toggle window visibility"
  - "Window close-to-tray behavior (hides instead of quitting)"
  - "Popup window centered on cursor position when shown via shortcut"
affects: [01-clipboard-core-tray, 03-ui-foundation]

# Tech tracking
tech-stack:
  added: [tauri-tray-icon, tauri-global-shortcut-handler]
  patterns: [tray-menu-with-dynamic-text, global-shortcut-window-toggle, cursor-centered-popup, close-to-tray-frontend-intercept]

key-files:
  created:
    - src-tauri/src/tray.rs
  modified:
    - src-tauri/src/lib.rs
    - src/App.tsx
    - src-tauri/capabilities/default.json
    - src-tauri/gen/schemas/capabilities.json

key-decisions:
  - "Used show_menu_on_left_click instead of deprecated menu_on_left_click for tray icon"
  - "Cloned MenuItem reference for pause_i to enable set_text() in menu event handler"
  - "Cursor position centering done in Rust global shortcut handler before show(), using PhysicalPosition from webview_window.cursor_position()"
  - "Window close-to-tray implemented in frontend via onCloseRequested event with preventDefault()"

patterns-established:
  - "Tray menu pattern: MenuItem::with_id + clone for handler + set_text() for dynamic labels"
  - "Global shortcut pattern: Builder::new().with_handler() + register() in setup closure"
  - "Window toggle pattern: is_visible check, hide if visible, position-then-show if hidden"
  - "Close-to-tray pattern: Frontend onCloseRequested with event.preventDefault() + window.hide()"

requirements-completed: [CLIP-07, CLIP-08]

# Metrics
duration: 5min
completed: 2026-04-14
---

# Phase 1 Plan 02: System Tray + Global Shortcut + Window Management Summary

**System tray with context menu, Cmd+Shift+V global shortcut for window toggle with cursor-centered popup, and close-to-tray behavior**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-14T17:32:23Z
- **Completed:** 2026-04-14T17:37:55Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- System tray icon with 3-item context menu: Show Window, Pause/Resume Monitoring, Quit
- Left-click tray icon also shows and focuses main window
- Pause/Resume menu item dynamically updates its text based on monitoring state
- Global shortcut Cmd+Shift+V (macOS) / Ctrl+Shift+V (Win/Linux) toggles window visibility
- Window centers on cursor position when shown via global shortcut
- Window close button hides to tray instead of quitting the application
- All 6 existing clipboard unit tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement system tray with menu and window show/hide/quit** - `a195423` (feat)
2. **Task 2: Implement global shortcut + window close-to-tray + cursor-centered popup** - `1320052` (feat)

**Plan metadata:** `b796b4e` (chore: update generated capabilities schema)

## Files Created/Modified
- `src-tauri/src/tray.rs` - System tray setup with TrayIconBuilder, 3 menu items, left-click show, dynamic pause/resume text
- `src-tauri/src/lib.rs` - Added mod tray, tray::setup_tray() call, global shortcut handler with window toggle and cursor centering
- `src/App.tsx` - Added close-to-tray via onCloseRequested with event.preventDefault() + window.hide()
- `src-tauri/capabilities/default.json` - Added window permissions: show, hide, set-focus, inner-size, set-position, close, is-visible, cursor-position
- `src-tauri/gen/schemas/capabilities.json` - Regenerated capabilities schema

## Decisions Made
- Used `show_menu_on_left_click` instead of deprecated `menu_on_left_click` -- Tauri v2.10.3 deprecates the old method
- Cloned `pause_i` MenuItem reference into the menu event closure to enable `set_text()` calls for dynamic Pause/Resume label switching
- Cursor centering implemented in Rust handler before `show()` using `webview_window.cursor_position()` returning `PhysicalPosition<f64>` and `inner_size()` for centering calculation
- Window close-to-tray uses frontend `onCloseRequested` with `event.preventDefault()` + `getCurrentWindow().hide()` -- this is the Tauri v2 recommended pattern
- Removed `core:window:allow-on-close-requested` permission (does not exist in Tauri v2.10.3) -- `onCloseRequested` works through `core:default`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced deprecated menu_on_left_click with show_menu_on_left_click**
- **Found during:** Task 1 (cargo check produced deprecation warning)
- **Issue:** Tauri v2.10.3 deprecated `menu_on_left_click` in favor of `show_menu_on_left_click`
- **Fix:** Changed to `show_menu_on_left_click(true)`
- **Files modified:** src-tauri/src/tray.rs
- **Verification:** cargo check passes with zero warnings
- **Committed in:** a195423 (Task 1 commit)

**2. [Rule 3 - Blocking] Added tauri::Manager import for get_webview_window in global shortcut handler**
- **Found during:** Task 2 (cargo check failed: E0599 no method named get_webview_window)
- **Issue:** Global shortcut handler closure did not have `tauri::Manager` trait in scope
- **Fix:** Added `use tauri::Manager;` inside the `#[cfg(desktop)]` block
- **Files modified:** src-tauri/src/lib.rs
- **Verification:** cargo check passes
- **Committed in:** 1320052 (Task 2 commit)

**3. [Rule 1 - Bug] Removed non-existent permission core:window:allow-on-close-requested**
- **Found during:** Task 2 (cargo check failed: permission not found in Tauri v2.10.3)
- **Issue:** Plan referenced `core:window:allow-on-close-requested` which does not exist in Tauri v2
- **Fix:** Removed the invalid permission; `onCloseRequested` works through core:default
- **Files modified:** src-tauri/capabilities/default.json
- **Verification:** cargo check passes, capabilities schema regenerated
- **Committed in:** 1320052 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 bug)
**Impact on plan:** All fixes necessary for correct compilation. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- System tray fully functional with menu and event handling
- Global shortcut registered and working (Cmd+Shift+V / Ctrl+Shift+V)
- Window management (show/hide/toggle/close-to-tray) complete
- Cursor-centered popup positioning implemented
- Next plan (01-03) can build storage layer on top of the clipboard monitoring infrastructure

## Self-Check: PASSED

All 5 key files verified present on disk. All 3 task commits (a195423, 1320052, b796b4e) verified in git log.

---
*Phase: 01-clipboard-core-tray*
*Completed: 2026-04-14*
