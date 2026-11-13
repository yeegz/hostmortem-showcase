<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/hero-dark.png">
  <img alt="The Hostmortem replay: a recorder tape with five lanes showing a real upstream DNS outage, and the verdict underneath" src="docs/hero-light.png">
</picture>

# Hostmortem

**A flight recorder for Linux edge boxes.** When a gateway loses DNS, its link
or a service and someone reboots it, the evidence usually goes with it.
Hostmortem writes kernel, network and service evidence to disk, keeps it
through the reboot, and answers with what it **knows**, what it **suspects**
and what it **could not see**.

**[Replay real incidents →](https://yousofselim.com/hostmortem-showcase/)**

## What is public

| Public | Private |
|---|---|
| This repository: the site, its data-generation and verification scripts, docs | The C++ source, tests, lab scripts and CI (`yeegz/hostmortem`) |
| Unedited lab output: incident data and `hm explain --html` reports | Benchmark raw data and the engineering log (summarised here) |

There is no released binary or package yet. Whether the source becomes public is the owner's decision.

## What makes it different

- **Says “unknown” when that’s the truth.** Twelve deterministic playbooks score
  evidence for and against. If nothing is supported, or two explanations tie,
  the answer is unknown, along with what it could not see. No AI decides anything.
- **Every claim cites an event.** Each hypothesis links to stored event ids (`#112`);
  a release gate rejects any that does not.
- **Time it can trust.** Boot order first, then CLOCK_BOOTTIME. Wall time is
  display-only, because RTC-less boxes wake up in 1970.
- **Loss is evidence.** A bounded two-lane queue never blocks a collector. Every
  dropped event is counted and written down as an event of its own.

## Real faults, real output

Eight faults injected into Linux network namespaces (iptables, `ip link`, tc
netem, `kill -9`, dropped capabilities, SIGKILL of the agent itself): **8 of 8
diagnosed as expected**, including two honest “unknown”s.
Details and the bugs the lab caught: [docs/lab.md](docs/lab.md).
Unedited `hm explain --html` reports: [site/reports](site/reports/).

| | |
|---|---|
| Hard reset mid-incident (VM) | **0.6 s** of evidence lost; the incident survived the reboot (after fixing a durability bug this test found) |
| Throughput | being re-measured after that fix (earlier figures were taken without per-commit fsync) |
| Agent memory | **6.0 MB** RSS idle (target < 30 MB) |
| Agent CPU | **0.08 %** of one core idle |
| SIGKILL mid-incident | 1.97 s of evidence lost (bound 5 s), store intact, same incident |
| Tests | 80, clean under ASan + UBSan and TSan (CI on amd64 and arm64) |

Environment and method: [docs/performance.md](docs/performance.md) ·
[docs/testing.md](docs/testing.md). Measured on an arm64 VM, not yet on a Raspberry Pi.

## How it is built

C++20 agent (`hmd`) and CLI (`hm`). Five collectors (procfs, rtnetlink,
`/dev/kmsg`, active DNS/ICMP/TCP probes, process watch) feed a bounded queue.
One writer commits to SQLite in WAL mode, a detector opens incidents, and
`hm explain` writes text, JSON or a self-contained HTML report. It runs as a
dedicated user with two capabilities. eBPF tracepoints come in v0.2.

## Status

| Working | Not yet |
|---|---|
| Engine, CLI, 12 playbooks, reports | Physical power-cut test on real hardware |
| VM hard-reset test | Throughput re-measured after the durability fix |
| 8-scenario real-fault lab | eBPF probes (v0.2) |
| Sanitizer and fuzz targets | Raspberry Pi and x86 numbers |
| Hardened systemd unit | Packages and a tagged release; web UI (v1.0) |

## This site

One HTML page, no framework, about 30 KB of code plus about 100 KB of self-hosted fonts.
The page data is generated from the lab's own output by
[`tools/build_data.py`](tools/build_data.py) and checked in headless Chrome
(screenshots, axe WCAG 2.2 scan, phone overflow, reduced motion) by
[`tools/verify.mjs`](tools/verify.mjs). Type: Schibsted Grotesk (everything you read)
and IBM Plex Mono (raw event data only),
all from Google Fonts under the SIL Open Font License, subset and self-hosted.

Built by [Yousof Selim](https://yousofselim.com).
