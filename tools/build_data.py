#!/usr/bin/env python3
"""Builds site/data/incidents.js from the Hostmortem lab's real output.

Input: <hostmortem>/lab/out/<scenario>.explain.json, as written by
`hm explain --json` during `scripts/lab.sh`. Diagnoses are copied as-is;
the only edits are shortening (routine samples dropped), boot ids replaced
by ordinals, and lane assignment for drawing.
Usage: tools/build_data.py ~/Documents/hostmortem
"""
import json
import os
import sys

SRC = os.path.join(sys.argv[1], "lab", "out")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "site", "data", "incidents.js")

SCENARIOS = [
    ("dns_upstream", "Upstream DNS down", "iptables drops UDP 53 at the upstream DNS server for 20\u00a0s."),
    ("dns_local", "Local resolver broken", "resolv.conf on the box points at a dead stub for 20 s; the upstream server is fine."),
    ("link_down", "Cable pulled", "The box’s network interface is taken down for 20 s, then brought back."),
    ("kill9", "kill -9", "A watched process is killed with SIGKILL. Nothing else changes."),
    ("missing_kmsg", "kill -9, kernel log hidden", "The same kill, but the agent runs without CAP_SYSLOG and CAP_SYS_ADMIN, so it cannot read the kernel log."),
    ("packet_loss", "50% packet loss", "tc netem drops half the packets from the gateway for 30\u00a0s."),
    ("latency", "Latency spike", "tc netem adds 300\u00a0ms ±\u00a050\u00a0ms of delay at the gateway for 20\u00a0s."),
    ("agent_crash", "Agent killed mid-incident", "During a DNS outage the agent itself is SIGKILLed, restarted 3\u00a0s later, and keeps the same incident."),
    ("oom_kill", "Out of memory", "A process in a cgroup capped at 64\u00a0MiB allocates until the kernel's OOM killer ends it."),
    ("cpu_saturation", "CPU starved", "Twelve busy loops on four vCPUs for 30\u00a0s."),
    ("restart_loop", "Crash-restart loop", "A watched service is killed with SIGKILL and restarted four times in about 20\u00a0s."),
]

HIDE = ("sys.", "net.tcp", "net.udp", "net.conntrack", "clock.state")


def lane(kind):
    if kind.startswith("probe.dns"):
        return 0
    if kind.startswith(("probe.icmp", "probe.tcp", "link.", "route.", "addr.", "kernel.link_down", "kernel.netdev")):
        return 1
    if kind.startswith(("process.", "kernel.oom", "cgroup.")):
        return 2
    if kind.startswith(("kernel.", "clock.")):
        return 3
    return 4


def brief(attrs):
    keep = []
    for k, v in attrs.items():
        if k in ("initial", "ts_source"):
            continue
        if isinstance(v, bool):
            v = "true" if v else "false"
        elif isinstance(v, float):
            v = round(v, 1)
        keep.append(f"{k}={v}")
    return " ".join(keep)[:160]


def build(key, label, injected):
    path = os.path.join(SRC, key + ".explain.json")
    d = json.load(open(path))
    inc = d["incident"]
    open_boot, open_mono = inc["opened_boot_ordinal"], inc["opened_mono_ns"]
    boots = {}
    events, splices = [], []
    starts_seen = 0
    for e in d["events"]:
        b = e["boot_ordinal"]
        t = (e["mono_ns"] - open_mono) / 1e9 if b == open_boot else None
        if t is None:
            continue  # this page never spans a real reboot (not run yet)
        if any(e["kind"].startswith(h) for h in HIDE):
            continue
        a = e.get("attrs", {})
        if e["kind"] == "agent.start":
            starts_seen += 1
            if starts_seen > 1:  # the first start is just the recording beginning
                splices.append({"t": t, "label": "agent restarted"})
        bad = (e["kind"].startswith("probe.") and a.get("ok") is False) or e["severity"] in ("warning", "error", "critical")
        bad = bad and e["kind"] not in ("collector.status",)
        info = e["kind"] in ("agent.start", "agent.stop", "link.state", "route.add", "route.del", "process.start", "collector.status")
        attrs = {k: v for k, v in a.items() if k not in ("boot_ordinal", "kernel", "version")}
        events.append({"id": e["id"], "t": round(t, 3), "boot": 1, "lane": lane(e["kind"]), "kind": e["kind"],
                       "subject": e.get("subject", ""), "brief": brief(attrs), "bad": bool(bad), "info": info})
    win = d["window"]
    close_t = (win["end_mono_ns"] - open_mono) / 1e9
    ts = [e["t"] for e in events]
    lo, hi = min(ts + [-5]), max(ts + [close_t])
    pad = (hi - lo) * 0.02
    hyps = []
    for hy in d["hypotheses"]:
        hyps.append({"playbook": hy["playbook"], "title": hy["title"], "verdict": hy["verdict"], "score": hy["score"],
                     "explanation": hy["explanation"],
                     "missing": [ev["note"] for ev in hy["evidence"] if ev["role"] == "missing"]})
    if d.get("synthetic"):
        raise SystemExit(f"{key}: refusing synthetic data on the real-lab page")
    return {"key": key.replace("_", "-"), "label": label, "injected": injected, "report": f"reports/{key}.html",
            "conclusion": {"verdict": d["conclusion"]["verdict"], "reason": d["conclusion"]["reason"]},
            "hypotheses": hyps, "unobservable": d["unobservable"],
            "window": {"open": 0, "close": close_t}, "range": [lo - pad, hi + pad],
            "splices": splices, "events": events}


MEASURED = [
    {"value": "11 of 11", "label": "real injected faults diagnosed as expected, including two honest “unknown”s", "how": "https://github.com/yeegz/hostmortem-showcase/blob/main/docs/lab.md"},
    {"value": "0 dropped", "label": "at 20,000 events/s, with every commit fsynced to disk (10 runs)", "how": "https://github.com/yeegz/hostmortem-showcase/blob/main/docs/performance.md"},
    {"value": "≤ 1.4 s", "label": "of evidence lost when a VM running it was hard-reset mid-incident (2 runs); the incident survived the reboot", "how": "https://github.com/yeegz/hostmortem-showcase/blob/main/docs/lab.md"},
    {"value": "6.4 MB", "label": "agent memory (RSS) after 60 s idle (3 runs); research target < 30 MB", "how": "https://github.com/yeegz/hostmortem-showcase/blob/main/docs/performance.md"},
    {"value": "1.9 s", "label": "of evidence lost when the agent itself was SIGKILLed mid-incident (bound: 5 s)", "how": "https://github.com/yeegz/hostmortem-showcase/blob/main/docs/lab.md"},
    {"value": "84", "label": "unit, integration and scenario tests, clean under ASan + UBSan and TSan in CI on amd64 and arm64", "how": "https://github.com/yeegz/hostmortem-showcase/blob/main/docs/testing.md"},
]
STATUS = {
    "working": [
        "C++20 agent and CLI: queue, SQLite WAL store, five collectors, detector, 12 playbooks",
        "Real-fault lab: 11 scenarios, including a real OOM kill",
        "Hard reset of a VM mid-incident: evidence and the incident survive",
        "v0.1.0 packages for amd64 and arm64, install-tested in CI (private release)",
        "Text, JSON and self-contained HTML incident reports",
        "Fuzz targets for every parser; sanitizer CI on amd64 and arm64",
    ],
    "not": [
        "A physical power-cut test on real hardware",
        "A public release: v0.1.0 exists, but privately",
        "eBPF tracepoints (v0.2)",
        "Raspberry Pi and x86 hardware measurements",
        "Web UI (v1.0) and the optional ESP32 peer",
    ],
}

if __name__ == "__main__":
    incidents = [build(*s) for s in SCENARIOS if os.path.exists(os.path.join(SRC, s[0] + ".explain.json"))]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    payload = {"incidents": incidents, "measured": MEASURED, "status": STATUS}
    with open(OUT, "w") as f:
        f.write("// Generated by tools/build_data.py from real lab output. Do not edit.\n")
        f.write("window.HM_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"{len(incidents)} incidents, {os.path.getsize(OUT)//1024} KiB -> {OUT}")
