FUNCTION_BLOCK T11
VAR b : BYTE := 255; w : WORD := 16#FFFF; END_VAR
b := 16#FF;   (* E203 cannot assign 'USINT' to 'BYTE', the initializer above is accepted *)
w := 16#FFFF; (* E203 cannot assign 'UINT' to 'WORD' *)
b := 255;     (* E203 cannot assign 'INT' to 'BYTE' *)
IF w = 16#FFFF THEN b := 0; END_IF (* E201 types are not comparable *)
END_FUNCTION_BLOCK
