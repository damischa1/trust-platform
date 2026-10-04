FUNCTION_BLOCK T09
VAR b : BYTE; i : INT; w : WORD; x : BOOL; r : REAL; a : ARRAY[0..3] OF INT; END_VAR
i := b;
w := i;
b := w;
x := 1;
i := a[b];
CASE b OF 0: i := 1; END_CASE
i := b * i;
END_FUNCTION_BLOCK
