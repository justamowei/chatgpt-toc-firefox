# Historical version snapshot audit

2026-10-07 (Asia/Taipei). This is a read-only audit of local Git objects and already committed acceptance evidence. It does not rerun product tests or verify remote publishing.

All seven proposed historical snapshots are suitable. Each contains the matching acceptance report, correct manifest/package/package-lock version, and the fixed accepted runtime. No replacement commit is required.

| Tag | Snapshot (full SHA) | Runtime (full SHA) | Status |
| --- | --- | --- | --- |
| v0.1.0 | 30835220edef18266605ce3b897e58da0aff9e6a | 5cf4764741cca11cf9b52310007cb656fd5b9606 | experimental; LIVE PENDING |
| v0.1.1 | 07137cdd811d6a32d87c14921750eac32afb84a4 | 5aa5102e2cc5e605196f6edfce2fb6d6b4faf649 | experimental; LIVE PENDING |
| v0.2.0 | 27ecb23cb2d27e235734b60c387c3d9a7ceb326a | 95c2694e03185f66a1a0dc19a62bc8280b61420e | withdrawn; LIVE FAIL; WITHDRAWN |
| v0.3.0 | 288f3b0e868e0d3dfd8bc94cb717094b64ce4991 | 4c3d838d187b0e2771bbf58d6ba00ddc0b07a4b2 | experimental-candidate; LIVE PENDING |
| v0.3.1 | 99c3b064a55e3b36707c83630dc89c59bedcd585 | f9974ec368d81e4a25cc9e2583ebf6e55dbcb63d | experimental-candidate; LIVE PENDING |
| v0.3.2 | 5fd1d4dd8dfc1c12342e0a4ccbf01dc31365f748 | 2c9d0d2aa9f95336c449981d58d4360bc7d16d3f | experimental; LIVE PENDING |
| v0.3.3 | 56951988cb7d258eafeadacfa02174226a824093 | 567dfda645d113449eece4932519da98e59e7118 | experimental; LIVE PENDING |

The JSON contains report Git blob IDs, exact changed paths, runtime tree/blob identities, package differences and version checks. Git source trees, manifests, scripts, tsconfig and package-lock are byte-identical as Git objects between each runtime and chosen snapshot. Package content also matches after removing only test: script entries.

v0.3.2 is the sole snapshot with changes outside documentation: package.json adds test:background; tests/firefox-v032.mjs waits for asynchronous content-script registration and adds unknown-branch persistence coverage. These are test setup changes. All product source and build inputs match runtime 2c9d0d2.

v0.3.0 selects 288f3b0 rather than earlier acceptance-only c9df382 because the later documentation records the verified temporary-load candidate folder. Runtime remains 4c3d838.

v0.2.0 keeps the original delivered runtime 95c2694 and first acceptance snapshot 27ecb23. The snapshot predates the real LIVE failure and withdrawal. Any published tag annotation and catalog must say WITHDRAWN / LIVE FAIL and reference later failure documentation at 5c035c3 and withdrawal at 08f7867. Historical synthetic PASS remains visible; no historical report is rewritten.

v0.3.1 stays at its initial accepted delivery 99c3b06 / f9974ec. r2 through r5 changed runtime without increasing manifest/package version. Preserve them as archive metadata, with no new semantic version tags and no moving v0.3.1.

| Legacy revision | Snapshot | Runtime | Revision string |
| --- | --- | --- | --- |
| r2 | fe20ec7e6bf9827046282b98120df4d5ca7ddbbd | 31608f2c3766d282f66c65a6d15ab63ceaf894a1 | 2026-10-05-r2 |
| r3 | b8e25f97c9b8c50baed169cee01e7b2a48c216f9 | 535a4ffe0fbde463b97c687e4e8dab93f7814bf0 | 2026-10-05-r3 |
| r4 | 16b2009b32c856426140cfaf53cd9b8c9e418da5 | 8f2daab1536ad9e30abc74479a8dfa3854766d57 | 2026-10-06-r4 |
| r5 | 6339100400da8c995aa864126386675e72222742 | 992757435d30459be80586ee4e2682a3abc99f39 | 2026-10-06-r5 |

All r2-r5 retain LIVE PENDING. r5 latest Firefox native UI 7 is additionally PENDING due to its recorded environment restriction; static/build/hash and core/geometry PASS must not be used as native UI PASS.

Every retained semantic version is experimental or a candidate, not a signed or fully LIVE-accepted daily release. v0.3.2 and v0.3.3 independent reviewers did not run native Firefox; their fixed-source/artifact agreement and the primary native synthetic results have separate provenance.

Audit wrote only historical-audit.json and this file under artifacts/version-governance. No source, docs, Git refs or Git history were changed. No Git network, GCM, or personal Firefox access was used. Remote restoration and annotated-tag/ref publishing need a separate cloud result check.
