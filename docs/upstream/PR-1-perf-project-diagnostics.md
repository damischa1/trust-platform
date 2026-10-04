<!-- PR draft. Branch: damischa1/trust-platform pr/perf-project-diagnostics -> johannesPettersson80/trust-platform main -->

# perf(hir): remove per-file whole-project rescans (2x faster whole-project diagnostics)

## Summary

Pulling `textDocument/diagnostic` for every file of a project (CI, batch checkers,
"problems" views) takes time quadratic in the number of files. This PR removes two
per-file scans over the whole project and one per-import sort. Whole-project
diagnostics get about 2x faster; results are unchanged.

## Problem

`scripts/perf/project_scaling.py` (added here) generates projects of N files (per file a
struct, a GVL, a function and a function block that calls into the previous file) and
pulls every file's diagnostics over LSP:

| files | v0.24.69 | this PR | per file (before → after) |
|------:|---------:|--------:|--------------------------:|
| 51  | 369 ms   | 199 ms   | 7.2 → 3.9 ms  |
| 101 | 1325 ms  | 645 ms   | 13.1 → 6.4 ms |
| 201 | 5246 ms  | 2584 ms  | 26.1 → 12.9 ms |
| 401 | 22549 ms | 10569 ms | 56.2 → 26.4 ms |

Profiling (`perf`) on 130- and 200-file projects pointed at
`SymbolImporter::import_table`, `Symbol::clone`, sorting and hash-map growth, and at
`precollect_constants` / rowan tree walks.

## Changes

1. **Namespace map built once per importer** (`db/symbol_import.rs`). `import_table` rebuilt
   its namespace-path → symbol map by scanning the whole target table for every imported
   table. The target grows with every import, so a single merge was quadratic in the
   number of files. The map is now built on first use and kept up to date as namespaces
   are imported.
2. **No clone of every source symbol.** Source symbols are iterated by reference; only the
   imported ones are cloned (as before).
3. **Project constants collected once** (`db/queries/collector/mod.rs`, `salsa_backend.rs`).
   `collect_with_project_const_roots` / `collect_for_project_with_const_roots` walked every
   project syntax tree for every file. `SymbolCollector::project_const_exprs` collects
   them once. `project_symbol_tables_query` uses it directly, and `analyze_query` uses a new
   `project_const_index_query` (key, file, kind, range), because syntax nodes are not
   `Send`. Nodes are looked up again in the file roots. Order and first-declaration-wins
   are the same as before (file-id order in `analyze_query`, file order in
   `project_symbol_tables_query`).
4. **ID order without sorting** (`symbols/table.rs`). `SymbolTable` keeps symbol IDs in
   insertion order, which is ID order because IDs are handed out increasingly and
   symbols are never removed (`iter_in_id_order`). The importer no longer sorts every
   imported table and looks parents up in the source table instead of copying them
   into a map.

## Verification

- `cargo test -p trust-hir` and `cargo test -p trust-lsp`: all pass.
- `cargo clippy -p trust-hir -p trust-lsp --all-targets -- -D warnings`: clean.
- **Same diagnostics:** 72 real-world CODESYS projects (2.3, converted to ST, 3661
  diagnostics incl. warnings): byte-identical diagnostic output with v0.24.69 and with
  this PR.

## Not in this PR

Total time is still quadratic: every file's analysis merges a copy of all other files'
symbol tables (`merge_project_symbols`), twice per file (`merged_project_symbols_query`
via `project_used_symbols_query`, and in `analyze_query`). Removing that needs a shared
project symbol layer and touches `SymbolTable` itself. That is proposed separately for
discussion (issue draft "Whole-project diagnostics are quadratic").

## Checklist

- [x] `cargo fmt`
- [x] clippy `-D warnings`
- [x] tests
- [x] no behavior change (no docs/specs update needed)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
