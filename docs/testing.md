# Testing

| Layer | Count / scope | Result |
|---|---|---|
| Unit + integration (GoogleTest) | 82 tests incl. 13 synthetic scenario fixtures | pass |
| ASan + UBSan | the same 82 (CI, amd64 and arm64) | clean |
| TSan | the same 82 (ASLR off via `setarch -R`, needed on 6.x arm64 kernels) | clean |
| Real-fault lab | 8 scenarios in network namespaces | see lab.md |
| Fuzzing | libFuzzer targets for JSON ingest, config, kmsg, procfs, netlink, DNS | 1 real crash found and fixed (kmsg parser); 60 s per target in CI; long campaigns not run yet |

Failure behaviour is written down before the test: duplicate batches leave the
row count unchanged; a process killed mid-transaction leaves committed batches
and a store that passes quick_check; a corrupt store is set aside and
recreated; disk-full fails the batch atomically and sheds low-priority events
first; an unreadable kernel log means OOM can never be ruled out.

Two sanitizer notes from this build: ASan's stack-use-after-return check made
one JSON ingest take 54 s instead of 0.09 s (fake-stack allocation on very
large nlohmann/json frames), so that one sub-check is off in the preset. TSan
refuses to start under the kernel's 6.x ASLR on arm64 until ASLR is disabled
for the test process.

## Release checks (14 Nov 2026)
- Clean `git clone` → build → 82 tests pass, 0 compiler warnings (`-Werror -Wconversion`).
- Debian package installed in a clean `ubuntu:24.04` container: `hostmortem` system
  user (no login shell), store `0640` in a `0750` directory, conffile kept on
  remove, everything removed on purge; `systemd-analyze verify` clean;
  `systemd-analyze security` exposure 2.2 (OK).
