# Independent native acceptance — fb5bfa0fbad4c011d05583d89e947a6112f28370

Date: 2026-10-02. Executor: firefox_acceptance. Fixed source exported with git archive into work/acceptance/fb5bfa0. No main-repo source or Git history edits. Node 24.12.0, npm 11.6.2, native Firefox 157.0, Windows 10.0.19045, geckodriver 0.37.1. Browser sessions use newly generated account-free profiles; no user profile, cookies, credentials, or real ChatGPT session copied. Native suites use TOC_TEST_EXECUTOR=firefox_acceptance and independent evidence folders.

## Decision

No remaining blocking functional defect was found in the tested T07a/v0.1 experimental prototype scope. The prior SPA observer, natural-background-idle, and native disable/re-enable duplicate-root defects have independent passing regressions. This is approval to deliver an honestly scoped experimental prototype; it is not evidence that real long ChatGPT navigation or a signed daily-use release works.

## Independently executed native cases

| Suite | Command exit | Result | Evidence |
|---|---:|---|---|
| Main fixture | 0 | 8/8 PASS; 20/20 mounted IDs; p95 208.9554 ms; fixed return offset error 0 px | fixture.log; artifacts/independent-fixture/results.json |
| Optional permissions | 0 | 7/7 PASS | permissions.log; artifacts/independent-permissions/results.json |
| Native add-on lifecycle | 0 | 3/3 PASS | addon-lifecycle.log; artifacts/independent-addon-lifecycle/results.json |
| Independent SPA/unknown branch/trusted input | 0 | 3/3 PASS | independent-native.log; artifacts/independent-native/results.json |
| Independent natural idle | 0 | 35 seconds, background stopped, both visible UIs survive; wake preserves both | independent-open-port.log; artifacts/independent-open-port/results.json |
| Independent immediate force/wake | 0 | Two visible UIs and running background before force; terminate without disableResetIdleForTest preserves both; wake preserves both | independent-open-port-force.log; artifacts/independent-open-port-force/results.json |

Main fixture validates manual toolbar injection, repeated launch with one root, safe text and duplicate prompts, keyboard/search, light/dark/actual 500 px narrow viewport, synthetic earlier history and cancellation, branch/SPA changes, pending-refresh SPA repair, page-level dispose/restart. The browser constrained a requested 480 px window to actual innerWidth 500 px; evidence proves 500 px, not 480 px.

Permissions validate real native deny/grant, registered script with host.css, upgrade of an existing registration missing CSS, forced stopped-to-runtime-wake, reload with one root, natural idle with two visible content UIs and observer update to 21 entries, idle-then-revoke cleanup of two pages with disconnected original ports, no reload reinjection, settings-only storage, and rejected extra-key/unknown runtime schema.

Add-on lifecycle validates native disable hides the inert DOM and removes visible CSS highlight; native re-enable/action removes the obsolete root and owned markers, creates exactly one visible usable root, and successfully locates again; native uninstall hides UI/highlight, and page reload removes remaining inert DOM. Hidden DOM before reload is explicitly observed, not falsely reported as zero-DOM uninstall.

Independent extra cases confirm pending debounce plus SPA still allows a later insertion to update to 21; unknown branch drops unmounted prompts; trusted real input outside TOC cancels loading. Independent idle probes check visible UI via computed style, not merely root-node existence.

## Tooling and provenance

Offline npm ci from workspace work/npm-cache: exit 0, 347 packages. Typecheck, build and lint: exit 0; lint 0 errors/notices/warnings. Logs npm-ci.log, typecheck.log, build.log, lint.log. An unrelated web-ext update-check warning is not an add-on lint diagnostic.

Formal content.js SHA256 fde39cddd6587e0c25cda2c8fd2788e648e0588720f84b5740668f5002ea60c0.
Formal background.js bba203ccf71c5419898051ebd5de68c850830d3f84535d4d85e31a50f83b8977.
Fixture content.js 0424cc59c636b32fafd9c47db8d995502aad532198abf8a3c1dae552cf48a356.
Fixture background.js 8081a2f22c734deba874c64b5d68ac5e07814eac29efb4cc1a26e7a4e01bb7ff.
These match the parent-supplied fixed source build hashes.

The fb5 git-archive host.css contains CRLF: 268 bytes, 3 CR and 3 LF, raw SHA f3ac96f93a29de3bed06affeee5d902baf1cb4706f032d337a2fbb318a992ad4. UTF-8 CRLF-to-LF normalization yields SHA 5dfc4c888918275eb536a33e22a37f3153d8a1d273d60feb83a453c864bdc8bb. Earlier speculation naming raw f3ac as LF was corrected by actual byte counting. Options HTML has the same newline-sensitive raw-copy issue. The parent fixed build normalization in 5cf4764, whose separate canonical report records the final artifact and minimum native regression; do not falsely equate raw CSS/HTML bytes.

Core source blob bcb70434ee291897c36b8865ec3b54c56c87ff2a is unchanged; reuse the fc02 independent 13/13 CORE results solely for that identical source. Background, DOM adapter, CSS and integrated native results were rerun here and not inherited from older runtime builds.

## Outstanding scope and failure history

LIVE-01–07, real ChatGPT selectors and expected full-branch IDs, ten real unmounted remote targets, ESR, containers/workspaces, and REL-01 signed installation/restart/update remain PENDING. No authenticated live session/fixed long sample/signed XPI was used. CPU behavior of a live long page and complete UI search latency at 1,000 prompts were not measured; the reused core search benchmark is not a live UI measurement.

Old failure evidence remains intact: initial core defects in 0e8d6a/2cb; SPA pending-refresh failure in fc02; natural idle disappearance in 9afa; duplicate roots in 2cfe. Their passing follow-up cases are recorded separately, without rewriting the old FAIL results.
