# Runtime Execution Model

This guide explains how the truST runtime drives Structured Text programs: what the built-in
event loop does, how cycle timing is configured, and what you never need to write manually in
your PLC code.

---

## TL;DR

**The runtime has a built-in event loop.** You do **not** write a loop in your ST programs.
Write your logic once; the runtime calls it repeatedly at the configured cycle interval.

---

## How the Runtime Loop Works

When `trust-runtime` starts, it launches a `ResourceRunner` that drives execution in a
dedicated OS thread.  The core loop in `scheduler.rs` looks like this (simplified):

```
loop {
    1. Read inputs from I/O drivers
    2. Run every due task (sorted by priority)
       → for each task: run its assigned programs and FBs
    3. Write outputs to I/O drivers
    4. Sleep until the next cycle deadline
}
```

This loop is started automatically by `ResourceRunner::spawn()`.  You never interact with it
directly from ST code.

---

## Configuring the Cycle Interval

The cycle interval (scan time) is set in `CONFIGURATION` / `TASK` in your `.st` source.
The standard `src/config.st` template shipped with every new project:

```iecst
CONFIGURATION Config
VAR_GLOBAL
    InSignal  AT %IX0.0 : BOOL;
    OutSignal AT %QX0.0 : BOOL;
END_VAR
RESOURCE trustplatform ON PLC
    TASK MainTask (INTERVAL := T#100ms, PRIORITY := 1);
    PROGRAM P1 WITH MainTask : Main;
END_RESOURCE
END_CONFIGURATION
```

| TASK attribute | Meaning |
|---|---|
| `INTERVAL` | How often the task runs (e.g. `T#100ms` = 100 ms scan) |
| `PRIORITY`  | Lower number = higher priority when multiple tasks are ready |

Programs assigned to a TASK run once per cycle whenever the task is due.
Programs that are **not** assigned to any TASK run as background (every cycle, lowest priority).

You can also configure the same values in `runtime.toml` under `[tasks]` if you prefer to
keep timing separate from the ST source.

---

## Writing PLC Programs (No Loop Needed)

A typical PROGRAM looks like this:

```iecst
PROGRAM Main
VAR
    Count : INT := 0;
END_VAR

VAR_EXTERNAL
    InSignal  : BOOL;
    OutSignal : BOOL;
END_VAR

IF InSignal THEN
    Count := Count + 1;
END_IF;
OutSignal := (Count MOD 2) = 1;
END_PROGRAM
```

The runtime calls `Main` every `T#100ms` (or whatever interval you set).  There is no
`WHILE TRUE DO` loop — that would block the scheduler and is a bug in PLC code.

---

## Periodic vs. Event-Driven Tasks

| TASK mode | How to activate |
|---|---|
| **Periodic** (`INTERVAL := T#100ms`) | Fires every N milliseconds automatically |
| **Event-driven** (`SINGLE := trigger_var`) | Fires once on the rising edge of `trigger_var` (BOOL) |

You can combine both: set `INTERVAL` and `SINGLE` together; whichever fires first runs the task.

---

## Clock Implementations

The scheduler supports pluggable clock backends:

| Clock | Usage |
|---|---|
| `StdClock` | Default — monotonic wall clock (`std::time::Instant`) |
| `ScaledClock` | Simulation time acceleration (e.g. `scale = 10` → 10× faster) |
| `ManualClock` | Deterministic testing — advance time step-by-step in unit tests |

When running `trust-runtime` normally the `StdClock` is used.  For simulation mode pass
`--simulation` (or set `time_scale > 1`).

---

## Cycle Phases in Detail

```
┌─────────────────────────────────────────────────────┐
│                    Runtime cycle                    │
│                                                     │
│  1. read_cycle_inputs()                             │
│     - Pull values from I/O drivers (GPIO, Modbus …) │
│     - Apply debug/force overrides                   │
│     - Map %I addresses → VAR_EXTERNAL globals       │
│                                                     │
│  2. collect_ready_tasks()                           │
│     - Check elapsed time for periodic tasks         │
│     - Check rising edges for event tasks            │
│     - Sort due tasks by (priority, due_at)          │
│                                                     │
│  3. execute_task() for each ready task              │
│     - execute_program() for each assigned PROGRAM   │
│     - execute_function_block_ref() for FB instances │
│                                                     │
│  4. execute_background_programs()                   │
│     - Run programs not assigned to any task         │
│                                                     │
│  5. write_cycle_outputs()                           │
│     - Map VAR_EXTERNAL globals → %Q addresses       │
│     - Push values to I/O drivers                    │
│                                                     │
│  6. Retain store flush (if dirty)                   │
│                                                     │
│  7. Sleep until next cycle deadline                 │
└─────────────────────────────────────────────────────┘
```

---

## Async / Tokio

The core runtime loop uses **OS threads** (`std::thread`), not Tokio.  Tokio is an optional
dependency used only when the `ethercat-wire` feature is enabled.  If you are integrating
`trust-runtime` as a library you do not need a Tokio runtime unless you use EtherCAT.

---

## Using the Harness in Unit Tests

For automated tests, use `TestHarness` to drive cycles manually:

```rust
use trust_runtime::harness::TestHarness;

let mut h = TestHarness::from_source(r#"
PROGRAM Main
VAR_EXTERNAL InSignal : BOOL; OutSignal : BOOL; END_VAR
OutSignal := InSignal;
END_PROGRAM
"#).unwrap();

h.set_input("InSignal", true);
h.tick();   // one cycle
assert_eq!(h.get_output("OutSignal"), Some(true.into()));
```

`TestHarness::tick()` calls `execute_cycle()` exactly once.  Time is controlled by your test.

---

## Summary

| Question | Answer |
|---|---|
| Is there a built-in event loop? | **Yes** — `ResourceRunner` drives it in its own OS thread |
| Do I write a loop in ST code? | **No** — write stateless logic; the runtime calls it each cycle |
| How do I set the cycle time? | `TASK MainTask (INTERVAL := T#100ms)` in `config.st` |
| Is Tokio / async required? | No — core runtime uses `std::thread` |
| How do I test without real hardware? | Use `TestHarness::tick()` (manual cycle control) |
