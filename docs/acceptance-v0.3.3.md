# v0.3.3 independent fixed snapshot acceptance

Result: **PASS**. Commit: `567dfda645d113449eece4932519da98e59e7118`.

Snapshot: `C:/Users/Andy/Documents/Codex/2026-10-02/new-chat-2/work/acceptance/567dfda`. Created with local git archive using core.autocrlf=false to retain exact blob bytes; dependencies reused through a node_modules junction. No runtime edits or commits were made by this reviewer.

- Tracked Git blobs: 147 checked before and after validation; PASS.
- Current package.json pure test suites: 88/88 passing; 0 failures.
- TypeScript typecheck, production build, fixture build, extension lint: typecheck PASS; build-production PASS; build-fixture PASS; lint PASS.
- Artifact SHA-256: 12/12 match the primary workspace dist bytes.
- Actual compiled DomAdapter/Navigator: 6 cases pass, including older×3→newer success, only one reversal when absent, confirmed-hint no-reversal, operation reset, unchanged total deadline, and cancellation. Geometry/load/locate are stubs in this pure check.

The earlier disconnected-direction defect is resolved in this fixed snapshot. Native evidence belongs to the primary task: this independent reviewer did not run a browser or inspect a personal Firefox profile. The artifact agreement ties primary fixture/production output to the independently checked Git snapshot; it does not claim ChatGPT LIVE validation.

An additional discovery run included three legacy suites absent from current package.json scripts (dom-history, full-index, history). Those suites could not initialize because esbuild tried to read a sandbox-denied ancestor directory. That run had 88 passing assertions and three initialization failures; its output is preserved as fixed-all-discovered-pure.log. This is recorded separately from the current 88-test acceptance set.
