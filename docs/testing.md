# Testing

| Layer | Count / scope | Result |
|---|---|---|
| Unit + integration (GoogleTest) | 79 tests incl. 13 synthetic scenario fixtures | pass |
| ASan + UBSan | the same 79 | clean |
| TSan | the same 79 (ASLR off via `setarch -R`, needed on 6.x arm64 kernels) | clean |
| Real-fault lab | 8 scenarios in network namespaces | see lab.md |
| Fuzzing | libFuzzer targets for JSON ingest, config, kmsg, procfs, netlink, DNS | targets build in CI; long campaigns not run yet |

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
