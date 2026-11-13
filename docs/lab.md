# The fault-injection lab

Every incident on the showcase page comes from this lab. Real faults are
injected into Linux network namespaces, the real agent records them, and the
real `hm explain --json` output is copied into the page by `tools/build_data.py`.

```
 hm-client (192.0.2.2) ── veth ── hm-up (192.0.2.1: gateway, dnsmasq DNS, TCP :8080)
     hmd runs here
```

Each scenario: fresh store → pre-flight (DNS, ping and TCP must work) → healthy
baseline → inject → recover → wait for the incident to close → compare the
diagnosis with what the scenario expects.

| Scenario | Injection | Expected diagnosis | Result (13 Nov 2026) |
|---|---|---|---|
| Upstream DNS down | `iptables -j DROP` UDP 53 at the server | upstream DNS supported; local resolver and link ruled out | pass |
| Local resolver broken | resolv.conf points at a dead stub; server fine | local resolver supported; link ruled out | pass |
| Cable pulled | `ip link set down` on the box's interface | link/gateway supported; upstream DNS ruled out | pass |
| kill -9 | SIGKILL a watched process | **unknown**; OOM ruled out (kernel log readable, no OOM record) | pass |
| kill -9, kernel log hidden | same, agent without CAP_SYSLOG and CAP_SYS_ADMIN | **unknown**; OOM stays *possible*, gap listed | pass |
| 50% packet loss | `tc netem loss 50%` | path degradation supported | pass |
| Latency spike | `tc netem delay 300ms 50ms` | path degradation supported | pass |
| Agent killed mid-incident | SIGKILL `hmd` during a DNS outage, restart 3 s later | same incident continues; store passes quick_check; ≤ 5 s lost | pass (1.97 s lost, quick_check ok, 1 incident) |

## Bugs the lab found (and the fixes)

- **A false pass.** The first "upstream DNS" run passed because dnsmasq had
  never started: DNS was down for the whole run. The lab now refuses to inject
  anything until DNS, ping and TCP all work.
- **Upstream outage looked local.** Healthy probes from just before the fault
  counted as "concurrent". Probes are now paired with their nearest neighbour in time.
- **Hiding the kernel log needs two capabilities.** Dropping CAP_SYSLOG was not
  enough: the kernel still lets CAP_SYS_ADMIN read `/dev/kmsg` "for historical
  reasons". The agent had been right to rule OOM out. The lab now drops both.
- **50% loss scored only "possible".** Interleaved loss (replies between
  failures) now counts as supported, and a solid outage block does not.

Not covered yet: a real reboot or power cut (a VM hard reset), CPU and memory
pressure with stress-ng, and a systemd restart loop.
