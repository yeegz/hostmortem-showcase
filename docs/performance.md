# Performance

Environment: Apple M1 Pro → Colima VM (4 vCPU, 8 GiB) → Ubuntu 24.04 container,
kernel 6.8.0 aarch64, GCC 13.3, RelWithDebInfo. Not a Raspberry Pi, not x86.

## Pipeline throughput (14 Nov 2026, every commit fsynced)

Four producer threads push events at a fixed rate through the real queue and
writer into SQLite on disk. Since the durability fix, every commit is fsynced,
and commits are spaced at least 200 ms apart under load so each fsync covers
many events. The host was also busy with other work.

| Offered | Runs | Achieved (median, min–max) | Dropped (each recorded as an event) |
|---|---|---|---|
| 20,000 events/s for 5 s | 10 | 19,996 (19,923–19,999) | **0 in every run** |
| 50,000 events/s for 5 s | 5 | 46,616 (36,210–49,985) | median 16,609 of ~250,000 |

Before the fix, 50,000/s dropped nothing, but its commits weren't really
durable. The research target was 20,000 events/s without silent loss.

## Agent footprint (13 Nov, before the durability fix)

`hmd` release build, default sampling (5 s) and probes (10 s), 60 s idle:

| Metric | Value | Target |
|---|---|---|
| RSS (VmRSS = VmHWM) | 6.0 MB | < 30 MB |
| CPU | 5 ticks in 60 s = 0.08 % of one core | < 1 % on a Pi 4 (not measured on a Pi) |
| Threads | 7 | — |

## Durability under a VM hard reset

`scripts/hard-reset-test.sh`: 0.59 s and 1.39 s of evidence lost in two runs
(+ ≤ 1 s tick resolution); incident spans both boots; store quick_check ok.

## Durability under SIGKILL (lab)

The agent was SIGKILLed mid-incident. The newest committed event was captured
1.97 s before the kill (bound: the 5 s commit interval; warnings commit at
once). The store passed `PRAGMA quick_check`, and the restarted agent continued the same incident.
