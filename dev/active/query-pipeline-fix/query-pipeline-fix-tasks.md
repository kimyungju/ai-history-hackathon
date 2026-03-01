# Query Pipeline Fix — Task Tracker

**Last Updated: 2026-03-01**

---

## Agent Assignment

| Agent | Tasks | Mode | Files Owned |
|-------|-------|------|-------------|
| **config-fix** | A1-A3 | `bypassPermissions` | `.env`, `vector_search.py`, `test_vector_search_config.py` |
| **entity-hints** | B1-B3 | `bypassPermissions` | `hybrid_retrieval.py`, `test_hybrid_retrieval.py` |
| **verifier** | C1-C3 | read-only | None (queries only) |

---

## Phase A: Vector Search Config Fix (config-fix agent)

- [x] **A1: Fix .env configuration**
  - Change `VECTOR_SEARCH_ENDPOINT` from `1005598664...vdb.vertexai.goog` to `7992877787885076480`
  - Change `VECTOR_SEARCH_DEPLOYED_INDEX_ID` from `colonial-archives-deployed` to `colonial_archives_deployed_1772349960200`
  - Acceptance: `.env` has correct values
  - Effort: S | Depends: None

- [x] **A2: Add resilient endpoint parsing to vector_search.py**
  - Add `_parse_endpoint_name()` static method that handles domain name, numeric ID, and full resource name formats
  - Update `endpoint` property to use `_parse_endpoint_name()`
  - Write 3 unit tests in `tests/test_vector_search_config.py`
  - Acceptance: `python -m pytest tests/test_vector_search_config.py -v` → 3 passed
  - Effort: S | Depends: None

- [x] **A3: Verify vector search works end-to-end**
  - Run diagnostic script: embed query → `vector_search_service.search()` → results
  - Acceptance: Returns 5+ results with chunk IDs and distances > 0.3
  - Effort: S | Depends: A1, A2

---

## Phase B: Entity Hint Extraction Fix (entity-hints agent)

- [x] **B1: Write failing tests for case-insensitive hints**
  - Add `TestExtractEntityHints` class with 4 tests to `test_hybrid_retrieval.py`
  - Tests: lowercase query, mixed case, stop-word exclusion, already-capitalized
  - Acceptance: Tests exist and FAIL before implementation
  - Effort: S | Depends: None

- [x] **B2: Fix `_extract_entity_hints()` for case-insensitive input**
  - Apply `question.title()` as fallback for regex matching
  - Expand stop-word list with lowercase common words
  - Filter stop words from multi-word matches
  - Acceptance: `python -m pytest tests/test_hybrid_retrieval.py::TestExtractEntityHints -v` → 4 passed
  - Effort: M | Depends: B1

- [x] **B3: Run full test suite**
  - All existing + new tests pass
  - Acceptance: `python -m pytest tests/ -v` → 31 passed (24 existing + 3 config + 4 hints)
  - Effort: S | Depends: A2, B2

---

## Phase C: End-to-End Verification (verifier — sequential after A+B)

- [x] **C1: Restart backend and test original failing query**
  - Restart uvicorn to pick up .env changes
  - `curl POST /query {"question":"explain strait settlement"}`
  - Acceptance: Answer is NOT the fallback message; `citations.length > 0`; `source_type` is `"archive"` or `"mixed"`
  - Effort: S | Depends: A3, B3

- [x] **C2: Test capitalized query (regression check)**
  - `curl POST /query {"question":"What is the Straits Settlements colonial administration?"}`
  - Acceptance: Returns substantive answer with citations (no regression)
  - Effort: S | Depends: C1

- [x] **C3: Test from frontend UI**
  - Open frontend (`npm run dev`), type "explain strait settlement"
  - Acceptance: Response displays in chat with source citations visible
  - Effort: S | Depends: C1

---

## Summary

| Phase | Tasks | Status | Agent |
|-------|-------|--------|-------|
| A: Config Fix | A1-A3 | COMPLETE | config-fix |
| B: Entity Hints | B1-B3 | COMPLETE | entity-hints |
| C: Verification | C1-C3 | COMPLETE | team-lead |

**Total new tests**: 7 (3 config + 4 hints)
**Total tests after fix**: 31
**Estimated time**: ~20 minutes with parallel agents
