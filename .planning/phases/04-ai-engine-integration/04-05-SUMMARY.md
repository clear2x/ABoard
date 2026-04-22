---
phase: 04-ai-engine-integration
plan: 05
subsystem: ai
tags: [routing, auto-provider, complexity-assessment, heuristic, smart-routing]

requires:
  - phase: 04-ai-engine-integration
    provides: LocalProvider with Ollama HTTP inference, InferenceProvider trait, AiConfig
provides:
  - ComplexityRouter with heuristic-based prompt complexity assessment
  - ProviderType::Auto variant for smart routing mode
  - ai_infer_auto Tauri command with routing decision metadata
  - InferenceAutoResponse struct for auto-routed inference results
affects: [ai-engine, provider-routing, ai-config]

tech-stack:
  added: []
  patterns: [heuristic-complexity-routing, keyword-based-task-detection, auto-provider-fallback]

key-files:
  created:
    - src-tauri/src/ai/router.rs
  modified:
    - src-tauri/src/ai/config.rs
    - src-tauri/src/ai/mod.rs
    - src-tauri/src/lib.rs

key-decisions:
  - "Heuristic routing based on prompt length thresholds and keyword detection rather than ML-based classification to keep complexity low and latency zero"
  - "Auto mode defaults to LocalProvider at init; actual per-request routing creates ephemeral providers to avoid state corruption"
  - "Medium complexity prefers cloud when available for higher quality output; falls back to local when cloud is absent"

requirements-completed: [AIEN-05]

duration: 5min
completed: 2026-04-15
---

# Phase 4 Plan 05: Smart Routing Module + Auto Provider Mode Summary

**Create ComplexityRouter for heuristic-based provider routing and add Auto mode with ai_infer_auto command**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-15T14:40:48Z
- **Completed:** 2026-04-15T14:46:27Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- ComplexityRouter assesses prompt complexity via length thresholds and keyword detection (English + Chinese)
- Routing rules: Simple -> local, Complex -> cloud, Medium -> cloud if available else local
- ProviderType::Auto variant added to config, serializes as "auto" for frontend compatibility
- ai_infer_auto command routes requests through ComplexityRouter in Auto mode, returns routing decision metadata
- Non-Auto mode requests delegate directly to the current provider with no routing overhead
- 9 unit tests covering all routing decision paths in router.rs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ComplexityRouter with heuristic rules** - `1fb6aaf` (feat)
2. **Task 2: Add Auto provider mode and ai_infer_auto command** - `b73a3c7` (feat)

## Files Created/Modified
- `src-tauri/src/ai/router.rs` - New file: ComplexityRouter with route(), assess_complexity(), availability checks, 9 unit tests (272 lines)
- `src-tauri/src/ai/config.rs` - Added ProviderType::Auto variant to enum
- `src-tauri/src/ai/mod.rs` - Added pub mod router, InferenceAutoResponse struct, ProviderType::Auto match branches in init_ai/ai_set_provider/ai_set_config, new ai_infer_auto command
- `src-tauri/src/lib.rs` - Registered ai::ai_infer_auto in invoke_handler

## Decisions Made
- Used heuristic rules (prompt length + keyword detection) instead of ML-based routing to keep latency at zero and avoid additional model dependencies
- Auto mode creates ephemeral provider instances per inference call to avoid mutating shared state -- the default provider held in AiState is LocalProvider as a safe fallback
- Medium complexity tasks prefer cloud when available for better quality; only fall back to local when cloud is absent
- Keyword lists include both English and Chinese terms (e.g., "classify"/"分类", "translate"/"翻译") to support the app's bilingual user base
- System prompt content is included in keyword analysis to detect task type from instructions

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness
- AIEN-05 requirement satisfied: system routes based on task complexity automatically
- Auto mode is fully functional and can be selected via ai_set_config or ai_set_provider
- Frontend can use ai_infer_auto to get both inference results and routing metadata
- AiSettings.tsx can add "auto" to the provider dropdown in a future frontend update

## Self-Check: PASSED

- router.rs exists and contains ComplexityRouter::route
- pub mod router present in mod.rs
- ProviderType::Auto present in config.rs
- ai_infer_auto registered in lib.rs
- Both commits (1fb6aaf, b73a3c7) verified in git log
- cargo check passes with only pre-existing switch_model warning

---
*Phase: 04-ai-engine-integration*
*Completed: 2026-04-15*
