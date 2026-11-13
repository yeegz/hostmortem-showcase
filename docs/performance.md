# Performance

Environment: Apple M1 Pro → Colima VM (4 vCPU, 8 GiB) → Ubuntu 24.04 container,
kernel 6.8.0 aarch64, GCC 13.3, RelWithDebInfo. Not a Raspberry Pi, not x86.

## Pipeline throughput (`bench/bench_pipeline.cpp`, `bench/run_bench.sh`)

Four producer threads push events at a fixed offered rate through the real
bounded queue and writer into SQLite (WAL) on disk, with the production commit
policy (500 events or 5 s).

| Offered | Runs | Achieved (median, min–max) | Dropped | Commits per run |
|---|---|---|---|---|
| 20,000 events/s for 5 s | 10 | 19,998 (19,749–19,999) | 0 in every run | 200 |
| 50,000 events/s for 5 s | 5 | 49,996 (48,135–49,997) | 0 in every run | 497 |

The research target was 20,000 events/s without silent loss on an x86 VM.
Drops are never silent anyway: each one becomes a `pipeline.drop` event.

## Agent footprint

`hmd` release build, default sampling (5 s) and probes (10 s), 60 s idle:

| Metric | Value | Target |
|---|---|---|
| RSS (VmRSS = VmHWM) | 6.0 MB | < 30 MB |
| CPU | 5 ticks in 60 s = 0.08 % of one core | < 1 % on a Pi 4 (not measured on a Pi) |
| Threads | 7 | — |

## Durability under SIGKILL (lab)

The agent was SIGKILLed mid-incident. The newest committed event was captured
1.97 s before the kill (bound: the 5 s commit interval; warnings commit at
once). The store passed `PRAGMA quick_check`, and the restarted agent continued the same incident.
