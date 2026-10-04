<!-- Issue draft for johannesPettersson80/trust-platform (discuss before a PR). The first changes are in PR-1. -->

# Whole-project diagnostics are quadratic in the number of files

## Symptom

A client that pulls `textDocument/diagnostic` for every file of a project (CI, batch
checkers, "problems" views) needs time quadratic in the number of files.
`scripts/perf/project_scaling.py` (synthetic project: per file one struct, one GVL, one
function and one function block calling into the previous file):

| files | v0.24.69 | after the changes below |
|------:|---------:|------------------------:|
| 51  | 369 ms   | 199 ms   |
| 101 | 1325 ms  | 645 ms   |
| 201 | 5246 ms  | 2584 ms  |
| 401 | 22549 ms | 10569 ms |

Per-file time grows linearly with the project (7 ms at 50 files, 26 ms at 400).

## Cause

Every file's analysis works on a `SymbolTable` that contains copies of all other files'
symbols (`merge_project_symbols` → `SymbolImporter::import_table` for every other file).
That is O(project) per file, and it happens twice per file: in
`merged_project_symbols_query` (for every file at once, through
`project_used_symbols_query`, which `analyze_query` needs for unused-symbol warnings) and
again inside `analyze_query`.

Two more per-file scans over the whole project made it worse and are fixed on this
branch:

1. `import_table` rebuilt its namespace-path map by scanning the whole (growing) target
   table for every imported table, which made a single merge quadratic.
2. Constant precollection walked every project syntax tree for every file
   (`project_symbol_tables_query`, `analyze_query`).

## Changes on this branch (`perf/project-symbol-index`)

- namespace map built once per importer and kept up to date
- source symbols iterated by reference in ID order (`SymbolTable::iter_in_id_order`);
  no clone of every source symbol, no sort per import, parents looked up in the source
  instead of a copied map
- project constants collected once per project (a salsa query of positions for
  `analyze_query`, because syntax nodes are not `Send`)

Verification: `trust-hir` tests pass; diagnostics are byte-identical on 72 real-world
CODESYS projects (3661 diagnostics) before and after.

## Remaining: shared project symbol index (proposal)

The quadratic term is the copy itself. A possible direction, in the spirit of
rust-analyzer's per-crate `DefMap`:

- A salsa query builds one immutable `ProjectSymbols` (all files' importable symbols,
  their scopes and types) once per project revision.
- A file's table becomes a layer over it: local symbols and scopes in the file table,
  lookups falling back to the shared layer (`get`, `lookup`, `lookup_in_scope`,
  `resolve_qualified`, type lookups). Imported symbols keep stable project IDs, so no
  per-file ID remapping (`import_type`, parameter remapping) is needed.
- Import collisions (`record_import_collision`) are computed per file against the
  shared layer instead of during the copy.
- `project_used_symbols_query` resolves each file's references against the layered
  table, so it no longer forces N merges.

Expected effect: per-file cost independent of the project size, i.e. linear total time.
It touches `SymbolTable` and the importer at the core of `trust-hir`, so it is worth
agreeing on the shape before a pull request.
