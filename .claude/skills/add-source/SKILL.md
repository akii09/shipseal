---
name: add-source
description: Add a Shipseal data collector in src/sources/. Use when new facts are needed.
---

1. Read plan §9 and §12. Confirm the API or file format against current docs.
2. Return partial `Facts`; wrap every value with `fact(value, { source, ref, fetchedAt })`.
3. `ref` must be precise enough to re-check by hand (endpoint + field, file + key, git command).
4. Missing optional data returns nothing. Throw only for invalid input, with a fix-it message.
5. Network: plain `fetch`, clear rate-limit errors, in-memory cache per run, no retries loops without limits.
6. Add the SourceId to the schema if new. Test with fixtures; no live network in tests.
