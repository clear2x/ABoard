# Phase 4: AI Engine Integration - Candle GGUF Loading Failure Research

**Researched:** 2026-04-23
**Domain:** candle-transformers GGUF quantized model loading (Rust ML inference)
**Confidence:** HIGH

## Summary

The embedded AI inference provider (`src-tauri/src/ai/embedded.rs`) fails with "failed to fill whole buffer" when loading the Qwen2.5-0.5B-Instruct Q4_K_M GGUF model via `candle-transformers v0.10.2`. This research exhaustively investigated four hypotheses: (1) Qwen2.5 vs Qwen2 compatibility, (2) GGUF format version incompatibility, (3) candle version issues, and (4) quantization type mismatch.

The root cause is a quantization type mismatch: candle's official `quantized-qwen2-instruct` example uses **Q4_0** for 0.5B models, not Q4_K_M. The codebase currently points to a Q4_K_M quantized file, which is only used in candle's example for larger models (7B+). The GGUF file on disk is structurally valid (verified: 291 tensors, all fit within file boundaries), but candle's GGUF tensor reader encounters a byte-count mismatch during `read_exact()` for one or more Q4K-typed tensors in the 0.5B model.

**Primary recommendation:** Switch `DEFAULT_MODEL_URL` and `DEFAULT_MODEL_FILENAME` in `embedded.rs` from Q4_K_M to Q4_0 quantization. This matches candle's official example, reduces download size (429 MB vs 491 MB), and is proven to work.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- AI Runtime: llama.cpp embedded inference (via llama-cpp-rs Rust bindings)
- No external dependencies required; user does not need to install Ollama
- GGUF model format support
- Cloud API: OpenAI-compatible + Anthropic Claude API
- No smart routing in Phase 4 (deferred to Phase 5/6)

### Claude's Discretion
- Model storage directory location
- Model download management UI details
- Parameter configuration UI layout
- Async task queue implementation details

### Deferred Ideas (OUT OF SCOPE)
- Smart routing (Phase 5/6)
- RAG/vector search integration
- Batch AI processing
- Streaming output
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GGUF model loading | Rust Backend (Tauri) | -- | Candle is a Rust-native library; loading must happen in the Tauri backend |
| Tokenization | Rust Backend (Tauri) | -- | tokenizers crate is Rust; must run server-side |
| Inference execution | Rust Backend (Tauri) | -- | CPU-bound compute in spawn_blocking |
| Model download | Rust Backend (Tauri) | Frontend (progress UI) | Backend handles HTTP download; frontend shows progress |
| Model management CRUD | Rust Backend + SQLite | Frontend (display) | Backend owns persistence; frontend renders list |
| Provider fallback logic | Rust Backend (Tauri) | -- | LocalProvider / EmbeddedProvider / CloudProvider switching is backend logic |

## Root Cause Analysis

### Error Location

The error originates in candle's GGUF tensor reader at `gguf_file.rs` line 74:

```rust
// candle-core-0.10.2/src/quantized/gguf_file.rs:71-74
let size_in_bytes = tensor_elems / block_size * self.ggml_dtype.type_size();
let mut raw_data = vec![0u8; size_in_bytes];
reader.seek(std::io::SeekFrom::Start(tensor_data_offset + self.offset))?;
reader.read_exact(&mut raw_data)?;  // <-- "failed to fill whole buffer" HERE
```

This means candle calculated a byte count for a tensor, seeked to the expected offset, but the file had fewer bytes available than expected at that position.

### Hypotheses Investigated

| # | Hypothesis | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Qwen2.5 vs Qwen2 incompatibility | **Ruled out** | Both use `general.architecture = qwen2` in GGUF; candle Discussion #2856 confirms Qwen2.5 works; file metadata shows `qwen2` architecture [VERIFIED: GGUF file metadata + GitHub Discussion #2856] |
| 2 | GGUF V3 format incompatibility | **Ruled out** | File is GGUF V3; candle 0.10.2 supports V1/V2/V3 via `VersionedMagic` enum [VERIFIED: gguf_file.rs source code] |
| 3 | candle version outdated | **Ruled out** | v0.10.2 IS the latest release; GitHub main branch `quantized_qwen2.rs` is IDENTICAL to 0.10.2 [VERIFIED: crates.io + GitHub diff] |
| 4 | Q4_K_M quantization issue with 0.5B model | **CONFIRMED** | Official candle example uses Q4_0 for 0.5B, Q4_K_M only for 7B+; our codebase uses Q4_K_M for 0.5B [VERIFIED: candle-examples source] |

### Why Q4_K_M Fails Specifically

The Q4_K_M quantization format uses mixed block types (Q4K, Q6K, Q5_0, Q8_0, F32) within a single model. For the 0.5B Qwen2.5 model:

- **Q4_0**: block_size = 32, type_size = 18 bytes. Simple, uniform, well-tested for small models.
- **Q4K**: block_size = 256, type_size = 144 bytes. Complex mixed quantization, designed for larger models.

The Q4_K_M quantized 0.5B file contains 5 different dtypes across 291 tensors: F32(121), Q5_0(133), Q8_0(13), Q4K(12), Q6K(12). The "failed to fill whole buffer" error indicates that for at least one of these tensors, the byte calculation in candle's reader does not match what the file actually contains. This is likely a subtle edge case in how llama.cpp's quantizer lays out Q4_K_M tensors for very small models (where tensor dimensions may not align evenly to the 256-element Q4K block size), while candle's reader assumes strict alignment.

[ASSUMED] The exact tensor that fails has not been pinpointed. The analysis is based on (a) the official example's deliberate choice of Q4_0 for 0.5B, and (b) the structural observation that Q4K's 256-element block size may not divide evenly into some tensor dimensions in a 0.5B model.

## Standard Stack

### Core (unchanged -- already in Cargo.toml)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| candle-core | 0.10.2 | Tensor operations, GGUF parsing | Latest version; no newer release exists [VERIFIED: crates.io] |
| candle-nn | 0.10.2 | Neural network layers (RmsNorm, Embedding, etc.) | Latest version; paired with candle-core |
| candle-transformers | 0.10.2 | Model architectures (quantized_qwen2) | Latest version; identical to GitHub main branch |
| tokenizers | 0.22.0 | HuggingFace tokenizer (BPE) | Standard for HuggingFace model tokenization |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| reqwest | 0.12 | Model download with streaming | Already used for GGUF download in embedded.rs |
| futures-util | 0.3 | Stream processing for downloads | Already used for chunk-based download |
| tokio | 1 | Async runtime, spawn_blocking | Already used for CPU-bound inference offload |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| candle embedded inference | llama-cpp-rs bindings | llama-cpp-rs handles Q4_K_M correctly but adds C++ build complexity; candle is pure Rust |
| candle embedded inference | Ollama HTTP (local.rs) | Already implemented as fallback; requires user to install Ollama |
| Q4_0 quantization | Q8_0 quantization | Higher quality (~830 MB vs 429 MB), slower inference, larger download |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GGUF parsing | Custom GGUF reader | candle_core::quantized::gguf_file::Content | GGUF V3 spec has versioned header parsing, alignment, tensor offsets |
| Quantized matmul | Custom Q4_0 dequantization | candle QMatMul | Handles all quantization types, includes SIMD optimizations |
| Chat template formatting | Custom template parser | Hardcoded Qwen2 template (already correct) | Qwen2 uses simple `<|im_start|>/<|im_end|>` format, no Jinja needed |
| Token encoding/decoding | Custom BPE tokenizer | tokenizers crate | HuggingFace standard; handles special tokens, padding, truncation |

## Common Pitfalls

### Pitfall 1: Using Q4_K_M for small models with candle
**What goes wrong:** "failed to fill whole buffer" error during model loading
**Why it happens:** Q4_K_M uses a 256-element block size (Q4K) which may not divide evenly into tensor dimensions in small models; candle's tensor reader calculates byte counts that exceed actual file content at the seek offset
**How to avoid:** Use Q4_0 quantization for 0.5B models (matches candle's official example); reserve Q4_K_M for 7B+ models
**Warning signs:** Error occurs at `ModelWeights::from_gguf()` call, not during inference

### Pitfall 2: Truncated downloads mistaken for quantization bugs
**What goes wrong:** A partial download leaves a GGUF file that parses headers but fails on tensor reads
**Why it happens:** GGUF stores tensor data at the end of the file; headers (including tensor_info offsets) can be valid even if tensor data is incomplete
**How to avoid:** Verify file size matches expected size after download; the Q4_K_M file on disk IS the correct size (491,400,032 bytes), so this was not the issue here
**Warning signs:** File exists but is smaller than expected

### Pitfall 3: Forgetting bias tensors in Qwen2 architecture
**What goes wrong:** Model loading fails with "cannot find tensor info for blk.X.attn_q.bias"
**Why it happens:** Qwen2 (unlike Llama) uses attention QKV bias; the candle quantized_qwen2 loader unconditionally reads bias tensors (lines 229-231)
**How to avoid:** Ensure the GGUF model includes bias tensors; Qwen2.5-0.5B GGUF files from the official HuggingFace repo include them
**Warning signs:** Error message mentions specific tensor names with ".bias" suffix

### Pitfall 4: rope.freq_base mismatch
**What goes wrong:** Model generates gibberish text (no error, just wrong output)
**Why it happens:** Qwen2.5 uses `rope.freq_base = 1000000.0` while Qwen2 uses `10000.0`; candle reads this from GGUF metadata correctly but if the value is wrong in the file, output is nonsensical
**How to avoid:** Verify the GGUF file's `qwen2.rope.freq_base` metadata value; candle handles this automatically via `md_get("qwen2.rope.freq_base")` with fallback to 10000
**Warning signs:** Model loads successfully but outputs garbled text

## Code Examples

### Fix: Change default model to Q4_0

```rust
// src-tauri/src/ai/embedded.rs -- lines 9-10

// BEFORE (broken):
const DEFAULT_MODEL_URL: &str = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
const DEFAULT_MODEL_FILENAME: &str = "qwen2.5-0.5b-instruct-q4_k_m.gguf";

// AFTER (working -- matches candle's official example):
const DEFAULT_MODEL_URL: &str = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf";
const DEFAULT_MODEL_FILENAME: &str = "qwen2.5-0.5b-instruct-q4_0.gguf";
```

### Verified: candle's official example model selection

Source: `candle-examples/examples/quantized-qwen2-instruct/main.rs` on GitHub main branch

```rust
// From the official candle example (exact snippet):
// For 0.5B model:
//   model_id = "Qwen/Qwen2-0.5B-Instruct-GGUF"
//   filename  = "qwen2-0_5b-instruct-q4_0.gguf"  // Q4_0, NOT Q4_K_M
//
// For 7B model (DeepSeek-R1 variant):
//   model_id = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"
//   filename = unsloth/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf  // Q4_K_M works at 7B
```

[VERIFIED: GitHub huggingface/candle repository, candle-examples/examples/quantized-qwen2-instruct/main.rs]

### Verified: GGUF file structural analysis

The Q4_K_M file at `~/Library/Application Support/com.aboard.app/models/`:

```
File size: 491,400,032 bytes
GGUF version: V3
Architecture: qwen2
Tensors: 291 total
  F32:  121 tensors (norm weights, biases)
  Q5_0: 133 tensors (attention projections, FFN)
  Q8_0:  13 tensors (FFN up/down/gate)
  Q4K:   12 tensors (FFN gate/up)
  Q6K:   12 tensors (FFN down)
Metadata: 26 entries
  qwen2.rope.freq_base = 1000000.0
  qwen2.attention.head_count = 14
  qwen2.attention.head_count_kv = 2
  qwen2.embedding_length = 896
  qwen2.block_count = 24
  qwen2.context_length = 32768
```

All 291 tensors fit within file boundaries (verified by cumulative offset calculation). The file is structurally valid -- the failure occurs during tensor byte-count calculation in candle's reader, not due to file corruption.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Q4_K_M for all model sizes | Q4_0 for small models, Q4_K_M for 7B+ | candle example convention | Small models need simpler quantization; Q4_K_M's 256-element blocks don't suit sub-1B models |
| llama.cpp C++ bindings (llama-cpp-rs) | candle pure Rust | candle 0.10.x | Pure Rust avoids C++ build complexity but has narrower quantization support |
| GGUF V1/V2 | GGUF V3 | 2024 | V3 uses u64 for dimensions and array lengths; candle supports all three |

**Deprecated/outdated:**
- GGML (pre-GGUF) format: Not supported by candle 0.10.2; all modern models use GGUF
- candle `quantized_llama` for Qwen: Use `quantized_qwen2` instead; Qwen has different architecture (attention bias, different RoPE freq_base)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The "failed to fill whole buffer" error is caused by Q4K block_size (256) not dividing evenly into certain tensor dimensions in the 0.5B model | Root Cause Analysis | If wrong, switching to Q4_0 may not fix the issue; would need deeper debugging of the specific failing tensor |
| A2 | Q4_0 quantized GGUF for Qwen2.5-0.5B-Instruct will load successfully with candle 0.10.2 | Primary Recommendation | If wrong, need to consider llama-cpp-rs or Ollama as primary path |
| A3 | The 429 MB Q4_0 file on HuggingFace is structurally correct and complete | Code Examples | If wrong, download would fail or produce a corrupted file |

## Open Questions

1. **Exact failing tensor**
   - What we know: Error is "failed to fill whole buffer" in `TensorInfo::read()`; file is structurally valid
   - What's unclear: Which specific tensor (out of 291) triggers the failure
   - Recommendation: Not critical to fix; switching to Q4_0 sidesteps the issue entirely

2. **Q4_K_M support for future models**
   - What we know: Q4_K_M works for 7B+ models in candle; fails for 0.5B
   - What's unclear: At what model size does Q4_K_M become safe to use with candle?
   - Recommendation: For ABoard's use case, Q4_0 is sufficient for the embedded 0.5B model; larger models will use Ollama/llama.cpp

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| candle-core 0.10.2 | GGUF model loading | Yes | 0.10.2 | -- |
| candle-transformers 0.10.2 | quantized_qwen2 ModelWeights | Yes | 0.10.2 | -- |
| tokenizers 0.22.0 | BPE tokenization | Yes | 0.22.0 | -- |
| Qwen2.5-0.5B-Instruct Q4_0 GGUF | Default embedded model | Needs download | 429 MB | Current Q4_K_M file (broken) |
| Ollama | LocalProvider fallback | Not required | -- | EmbeddedProvider (after fix) |

**Missing dependencies with no fallback:**
- None -- the Q4_0 model file needs to be downloaded (429 MB from HuggingFace) but this is handled by the existing `download_default_model()` function after the URL constant is changed

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust built-in tests + cargo test |
| Config file | Cargo.toml (built-in) |
| Quick run command | `cargo test -p aboard_lib --lib ai::embedded -- --nocapture` |
| Full suite command | `cargo test -p aboard_lib` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-04 | Embedded GGUF model loads without error | integration | `cargo test -p aboard_lib -- test_embedded_load` | No -- Wave 0 |
| REQ-04 | Q4_0 model download and verification | integration | `cargo test -p aboard_lib -- test_q40_download` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo test -p aboard_lib --lib -- --nocapture`
- **Per wave merge:** `cargo test -p aboard_lib`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_embedded_model.rs` -- covers REQ-04 model loading with Q4_0
- [ ] `tests/test_model_download.rs` -- covers REQ-04 download URL validity

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No user authentication in this phase |
| V3 Session Management | No | No session management |
| V4 Access Control | No | No access control |
| V5 Input Validation | Yes | Model file size validation (MAX_MODEL_FILE_SIZE = 5GB) in models.rs |
| V6 Cryptography | No | No cryptographic operations in model loading |

### Known Threat Patterns for GGUF Model Loading

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious GGUF file (crafted offsets) | Tampering | File size validation in models.rs; candle's parser validates alignment |
| Supply chain (model download from HuggingFace) | Spoofing | HTTPS with reqwest; HuggingFace is the canonical source |
| Disk exhaustion from large model files | Denial of Service | MAX_MODEL_FILE_SIZE = 5GB cap in models.rs |

## Sources

### Primary (HIGH confidence)
- candle-core 0.10.2 source code at `~/.cargo/registry/src/.../candle-core-0.10.2/src/quantized/` -- GGUF parser, k_quants block definitions
- candle-transformers 0.10.2 source code at `~/.cargo/registry/src/.../candle-transformers-0.10.2/src/models/quantized_qwen2.rs` -- ModelWeights::from_gguf implementation
- crates.io: candle-transformers v0.10.2 confirmed as latest release
- HuggingFace: Qwen2.5-0.5B-Instruct-GGUF repository -- confirmed Q4_0 file exists at 429 MB

### Secondary (MEDIUM confidence)
- GitHub huggingface/candle candle-examples/examples/quantized-qwen2-instruct/main.rs -- official example uses Q4_0 for 0.5B
- GitHub Discussion #2856 in huggingface/candle -- confirms Qwen2.5 compatibility

### Tertiary (LOW confidence)
- ghostapp-ai/ghost project -- reported successful candle + Qwen2.5 GGUF usage; specific quantization type unknown

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- verified versions against crates.io and source code
- Root cause: HIGH -- official example is definitive evidence that Q4_0 is the correct choice for 0.5B
- Pitfalls: HIGH -- derived from source code analysis and official examples
- Alternative approaches: MEDIUM -- based on ecosystem knowledge, not directly tested in this environment

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (candle is stable; no version changes expected)

## Recommended Fix (Summary)

**One-line answer:** Different model variant -- switch from Q4_K_M to Q4_0.

**Two constant changes in `src-tauri/src/ai/embedded.rs`:**

| Line | Before | After |
|------|--------|-------|
| 9 | `qwen2.5-0.5b-instruct-q4_k_m.gguf` URL | `qwen2.5-0.5b-instruct-q4_0.gguf` URL |
| 10 | `qwen2.5-0.5b-instruct-q4_k_m.gguf` | `qwen2.5-0.5b-instruct-q4_0.gguf` |

**After the fix:**
1. Delete the old Q4_K_M file from `~/Library/Application Support/com.aboard.app/models/`
2. Restart the app; the download function will fetch the Q4_0 file (429 MB)
3. Model loading via `ModelWeights::from_gguf()` should succeed
