# Archive-First Query Pipeline — Task Tracker

**Last Updated: 2026-03-01**
**Status: COMPLETE ✅ — All tasks done, committed, pushed**

---

## Phase A: Scoring Fix + Archive-First Orchestration — COMPLETE ✅

- [x] **A1: Fix distance-to-similarity conversion**
- [x] **A2: Rewrite web fallback to archive-first approach**
- [x] **A3: Write tests for archive-first behavior** (3 new tests)
- [x] **A4: Run full test suite** — 34/34 pass

## Phase B: LLM Prompt Updates — COMPLETE ✅

- [x] **B1: Update archive prompt + add web fallback prompt**
- [x] **B2: Add `prompt_template` parameter to `generate_answer()`**
- [x] **B3: Verify `test_llm_mixed.py` passes**

## Phase C: End-to-End Verification — COMPLETE ✅

- [x] **C1: Restart backend server**
- [x] **C2: Test archive query** — "explain strait settlement" → `source_type=archive`, 10 archive citations, 0 web
- [x] **C3: Test web fallback** — "population of Singapore 2025" → `source_type=web_fallback`, disclaimer + 5 web citations
- [x] **C4: Test original query** — "expenditure in 1932" → web fallback (archive OCR too tabular)

## Summary

| Phase | Status | Agent | Commits |
|-------|--------|-------|---------|
| A: Scoring + Orchestration | COMPLETE ✅ | scoring-fix | `4d24e38` |
| B: LLM Prompts | COMPLETE ✅ | prompt-fix | `4d24e38` |
| C: Verification | COMPLETE ✅ | team-lead | — |
