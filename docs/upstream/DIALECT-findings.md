# CODESYS sources in truST: what to propose upstream

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
