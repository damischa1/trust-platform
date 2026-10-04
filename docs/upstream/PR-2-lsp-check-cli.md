<!-- Opened as https://github.com/johannesPettersson80/trust-platform/pull/122 (4.10.2026) -->

# feat(lsp): `trust-lsp check`, editor diagnostics from the command line

## Summary

Adds a `check` subcommand to `trust-lsp` that prints the diagnostics the language
server would show for every file of a project, without an LSP client. CI pipelines,
pre-commit hooks and batch tools get exactly the editor's view of the project.

```
trust-lsp check [--project DIR] [--format text|json] [--file PATH]... [--deny-warnings]
```

## Motivation

The existing ways to get project diagnostics outside an editor do not quite fit CI:

- **an LSP session** (`initialize`, then `textDocument/diagnostic` per file): needs a
  JSON-RPC client in every tool.
- **`trust-dev agent serve` + `lsp.diagnostics`:** JSON-RPC as well, and it runs through
  the web IDE analysis engine. On a 130-file project with `[diagnostics]
  warn_nondeterminism = false` it still reports the 100 W010/W011 warnings that the
  editor hides.
- **`trust-runtime check`:** compiles for the runtime, which is stricter than (and
  different from) editor diagnostics.

## Behavior

- The project is loaded as a workspace folder exactly as `initialize`/`initialized` do
  (`ProjectConfig::load`, `index_workspace`): include paths, libraries, vendor profile,
  `[diagnostics]` toggles and severity overrides.
- Every indexed file is reported through the same `collect_diagnostics_with_ticket` path
  that answers `textDocument/diagnostic`.
- Text output is `path:line:column: severity[code]: message` (one-based; columns in
  UTF-16 code units as in LSP), with a summary on stderr. JSON output is one object:
  `version`, `project`, `files`, `errors`, `warnings` and `diagnostics[]` with `path`, `line`,
  `column`, `endLine`, `endColumn`, `severity`, `code` and `message`. Output is sorted and
  deterministic.
- `--file` limits the report to some files, while the whole project is still analyzed,
  so cross-file results stay correct.
- Exit status `0` without errors, `1` with errors (or warnings under `--deny-warnings`),
  `2` on usage or I/O problems.
- Logging is reduced to warnings for this subcommand. The silent client's dropped
  notifications are not logged.

## Scope

This is command-line only and does not change the server's behavior. Editor
performance is handled separately (perf PR: whole-project rescans). It also helps this
command, since `check` analyzes every file.

## Implementation

- `crates/trust-lsp/src/check.rs`: argument parsing, a `Client` from an `LspService` whose
  socket is dropped (as in `test_support`), indexing, collection and output.
- `main.rs`: dispatch on `check` before starting the server.
- `handlers/mod.rs`: `index_workspace` (previously `#[cfg(test)]`) and
  `collect_diagnostics_with_ticket` are now reachable from the crate.
- Docs: `docs/specs/14-lsp.md` §7.7 and `docs/guides/PLC_CI_CD.md`.

## Verification

- New unit tests: argument parsing, usage errors, and a two-file project with a
  cross-file type and an undefined name (exit 1).
- `cargo test -p trust-lsp` (454 tests) and clippy `--all-targets -D warnings`: clean.
- **Same results as an editor:** on a 130-file project, the set of diagnostics equals
  pulling every file over LSP (340 diagnostics). Takes 0.8 s, against 1.8 s over LSP.
- Used by an external CODESYS 2.3/3.5 checker on a 72-project corpus, with results
  identical to its LSP path.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
