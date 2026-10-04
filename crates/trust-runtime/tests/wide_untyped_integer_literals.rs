use trust_runtime::harness::TestHarness;
use trust_runtime::value::Value;

// Untyped integer literals beyond DINT (32-bit ARGB colors, UDINT/LINT constants).
#[test]
fn untyped_integer_literals_beyond_dint_in_initializers_and_expressions() {
    let source = r#"
PROGRAM Main
VAR
    color : DWORD := 16#FF4F4F4F;
    big : UDINT := 4283387727;
    wide : LINT := 10000000000;
    sum : LINT;
END_VAR
sum := wide + 5000000000;
END_PROGRAM
"#;

    let mut harness = TestHarness::from_source(source).unwrap();
    harness.cycle();

    assert_eq!(harness.get_output("color"), Some(Value::DWord(0xFF4F4F4F)));
    assert_eq!(harness.get_output("big"), Some(Value::UDInt(4283387727)));
    assert_eq!(harness.get_output("wide"), Some(Value::LInt(10000000000)));
    assert_eq!(harness.get_output("sum"), Some(Value::LInt(15000000000)));
}
