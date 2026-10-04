# CODESYS sources in truST: what to propose upstream

Status 4 Oct 2026: A1 = PR #123, A2 = PR #124, runtime CASE ranges on unsigned/bit-string
selectors (found while testing A1) = PR #125. A3 not proposed: truST models CTU/CTD/CTUD as
IEC overloaded FBs whose CV takes PV's type at runtime, so `c.CV` is genuinely ANY_INT
statically; accepting it would only move the error to a runtime TypeMismatch (design
question, issue at most). A4 not proposed: IEC requires the decimal point.

Source: the workarounds in damischa1/codesys23-tools (`internal/stcheck/dialect.go`,
`cds23.go`, `text.go`, `names.go`), each reproduced against the released trust-lsp
v0.24.69 with the probes in `probes/` (`python3 probes/lspdiag.py <trust-lsp> probes <file>`
pulls diagnostics like the editor, without didOpen). 4 Oct 2026.

`vendor_profile = "codesys"` currently only toggles warnings
(`crates/trust-lsp/src/config.rs`); it changes no semantics.

## A. Bugs by truST's own rules (issue + PR, no dialect discussion needed)

1. **Untyped literals to bit strings** (`t11_literal_assign.st`, `t05_bit_lit.st`).
   `b := 16#FF` / `b := 255` (BYTE), `w := 16#FFFF` (WORD), `dw AND 1`, `dw = 0` are errors,
   while `b : BYTE := 255` in a declaration is accepted. IEC_DECISIONS.md says representable
   untyped literals may initialize *or assign* to the target and are contextualized to the
   other operand. Assignment, comparison and bit operators skip that for ANY_BIT targets.
   Likely the most common false error in CODESYS code (corpus count not measured yet).
2. **Cross-file E104 leaks into every file** (`t07_type_var_same.st` + any other file).
   A duplicate declaration in one file is also reported in *every other* file as
   `duplicate imported declaration of 'J1939'`, at a position that does not exist there
   (the offset from the declaring file). One mistake = one error per project file.
3. **CTU/CTD/CTUD `CV` is `ANY_INT`** (`t08_ctu.st`): `n := c.CV` with `n : INT` is
   E203 `cannot assign 'ANY_INT' to 'INT'`. IEC: CV of CTU is INT (CTU_DINT etc. are the
   typed variants). Same root as `PV` expecting ANY_INT.
4. **`3E+38` lexes as `3`, `E`, `+38`** (`t01_real_noexp.st`): IEC requires the decimal
   point, so rejecting is fine, but the result is a phantom identifier `E` and E002.
   Propose: lex it as one malformed real literal with a clear message, or accept it under
   the codesys profile (CODESYS accepts it).

## B. CODESYS dialect, behind `vendor_profile = "codesys"` (open an issue first)

Ask the maintainer whether the profile may change semantics; IEC_DEVIATIONS.md already
has a precedent (optional VAR_EXTERNAL "for vendor-parity global access", 2026-04-11).
Ordered by value for real CODESYS projects:

5. **PROGRAM as callable instance** (`t06_prog.st`): `P(i := 1)`, `P.o`, `f(q => P.i)`
   (E103/E202). Every CODESYS project with more than one program does this. c23 rewrites
   PROGRAM -> FUNCTION_BLOCK + global instance.
6. **POU actions** (`ACTION A: ... END_ACTION` after the POU, `inst.A()`); c23 turns them
   into methods. Parser + HIR work; pairs with 5.
7. **Implicit integer/bit conversions** (`t09_implicit.st`): BYTE->INT, INT->WORD,
   BYTE index, `b * i`, CASE on BYTE. Proposal: under codesys, downgrade those E201/E203/E303
   cases to W005 (implicit conversion) instead of errors. Narrowing (WORD->BYTE) stays a
   warning, as CODESYS does.
8. **Empty output binding** `fb(a := 1, o =>)` (`t04_empty_out.st`): parse error cascade
   (5 errors). Small parser change.
9. **Type and variable with the same name** (`J1939 : J1939;`): CODESYS keeps separate
   namespaces. Fixing A2 first makes this one error instead of N.
10. **FUNCTION without assigning its result** (`t10_func_noret.st`, E206): CODESYS returns
    the default; downgrade to a warning under codesys.

Lower value / CODESYS 2.3 only (keep in c23): Standard.lib counter inputs RESET/LOAD,
INDEXOF/BITADR, CODESYS-reserved names that truST accepts.

Not reproducible any more in a small probe (already fixed upstream or context-dependent):
REAL literal in REAL arithmetic (`r := 6.8 * r`), FB instance input initializer in a
declaration (`x : FB := (a := 99)`); check again against the corpus before dropping the
c23 rules.

## Suggested order

1. Issue + PR for A1 (literal contextualization for ANY_BIT): small, cites their own
   decision record, largest effect.
2. Issue + PR for A2 (E104 leaking into other files): clear bug, possibly in the
   imported-symbol diagnostics of `merge_project_symbols`, overlaps with #121.
3. Issue for A3 (counter types) with PR.
4. One discussion issue "CODESYS profile semantics" listing B5–B10 with c23's corpus
   numbers; implement only what the maintainer accepts. Wait for #121/#122 first.

## C. Runtime (trust-harness) findings from the c23 visualization simulator (4 Oct 2026)

c23 `visu sim` runs CODESYS V3.5 display projects (Epec) in trust-harness. Probes were
loaded through the harness protocol (`{"cmd":"load","sources":[...]}`).

Fixed on fork branches (merged into `integration`, upstream PR only on request):

- `fix/wide-untyped-integer-literals`: an untyped integer literal beyond DINT
  (`color : DWORD := 16#FF4F4F4F`, `UDINT := 4283387727`) failed the runtime compile
  with "integer literal out of range" and no position (the LSP accepts it). Lowered as
  LINT and narrowed by the expected type; test `wide_untyped_integer_literals.rs`.
- `fix/default-value-error-name`: "default value error: type mismatch" now names the
  variable; it had neither position nor name.

Not fixed (c23 works around them):

1. **Arrays of function block instances do not initialize**: `VAR_GLOBAL a : ARRAY[1..3]
   OF Fb; END_VAR` → "default value error for 'a': type mismatch"; in a PROGRAM → "init
   failed for P.a: type mismatch". An array of structures works. Common in CODESYS code
   (CANopen OD entries, parameter tables). Bug by truST's own rules (A).
2. **Runtime faults have no location**: `runtime_cycle_error` gives
   `["null reference dereference"]` / `["arithmetic overflow"]` without POU or statement,
   although the debugger has statement locations (`statement_index`). c23 finds the code
   by blanking bodies one by one. Bug-ish (A); a location in `RuntimeError` reports
   would help every harness user.
3. **Integer overflow faults the cycle** (spec 10: never wraps); CODESYS wraps. `k := k +
   32767` with `k : INT := 2` stops the program. Dialect (B).
4. **Conversions IEC lacks or defines differently** (B): `REAL_TO_BYTE/WORD/LWORD/BOOL`,
   `LREAL_TO_BYTE/WORD/DWORD/BOOL`, `INT/DINT/UINT_TO_BOOL` → E205 "cannot convert";
   `REAL_TO_DWORD(3.7)` = 1080872141 (bit copy, IEC binary transfer), CODESYS gives 4;
   `REAL_TO_INT(2.5)` = 2 and `REAL_TO_DINT(-2.5)` = -2 (half to even; CODESYS not yet
   compared).
5. **Implicit numeric conversions** are errors in the runtime compile (E203 `cannot
   assign 'BYTE' to 'INT'`, widening); CODESYS converts. The LSP with
   `warn_implicit_conversion` reports the same category.
6. **FB `VAR` is PROTECTED** (E202 "cannot access PROTECTED member"): CODESYS lets the
   visualization and other POUs read and write instance variables
   (`DisplayController.Valve := 0`, PROGRAM locals included). `VAR PUBLIC` works.
7. **Assigning one's own VAR_INPUT** inside the POU is E301; CODESYS allows it.
8. **Located variables**: `%MX2.8` (bit > 7 in CODESYS word-oriented flag addressing) is
   "invalid I/O address" without position; located `%M` variables are refreshed from the
   I/O image every cycle, so `set_input` on them does not stay.
9. **Untyped REAL literal to a REAL parameter**: `REAL_TO_INT(2.5)` → E205 "expected 'REAL'
   for parameter 'IN'" (the literal is LREAL).
