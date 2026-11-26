# Final independent canonical-build acceptance — 5cf4764741cca11cf9b52310007cb656fd5b9606

Date: 2026-10-02. Executor: firefox_acceptance. Fixed source independently git-archived into work/acceptance/5cf4764; main repo/source/Git unchanged. Node 24.12.0, npm 11.6.2, native Firefox 157.0, Windows 10.0.19045, geckodriver 0.37.1. All native execution used new isolated account-free profiles. No existing user profile/session/credentials were accessed.

## Delivery decision

The v0.1/T07a experimental prototype is reviewable and deliverable with no remaining blocking defect found in the tested scope. This conclusion combines the full fb5 native regression with independent verification of the canonical 5cf build and targeted native tests. Real ChatGPT LIVE, ESR, container/workspace and signing gates remain PENDING. Do not present this as a signed v1.0 daily-use extension or a proven solution to all long ChatGPT conversations.

## Full native evidence inherited from equivalent fb5 runtime

Source diff fb5 -> 5cf changes only scripts/build.mjs and docs/progress.md; runtime source and manifest are identical. Formal background.js/content.js/options.js/manifest.json were compared byte for byte and are identical. The HTML and CSS are equal after CRLF-to-LF normalization, rather than byte-identical. See runtime-equivalence.json. This supports reuse of the fb5 runtime results, with explicit targeted canonical coverage below.

| fb5 native suite | Result | Evidence base: ../fb5bfa0/ |
|---|---|---|
| Main navigation fixture | 8/8 PASS, exit 0 | artifacts/independent-fixture/results.json; fixture.log |
| Native optional permissions | 7/7 PASS, exit 0 | artifacts/independent-permissions/results.json; permissions.log |
| Native disable/re-enable/uninstall | 3/3 PASS, exit 0 | artifacts/independent-addon-lifecycle/results.json; addon-lifecycle.log |
| Independent SPA/unknown branch/trusted input | 3/3 PASS, exit 0 | artifacts/independent-native/results.json; independent-native.log |
| Independent natural 35-second idle | PASS, exit 0 | artifacts/independent-open-port/results.json |
| Independent active-UI immediate force/wake | PASS, exit 0 | artifacts/independent-open-port-force/results.json |

Mounted target sample: 20/20 correct and visible stable IDs, nearest-rank p95 208.9554 ms, fixed return-anchor error 0 px. Actual narrow viewport was 500 px. Search HTML remains text, same-text prompts retain distinct IDs, keyboard/theme/search clearing pass. SPA pending debounce continues observing after route changes. Unknown branch drops unmounted history. Trusted page input cancels loading. Page-level dispose removes root/highlight and restart creates one instance.

The seven permission cases include real native deny/grant, managed stylesheet registration, upgrading an old registration missing CSS, event-page stopped-to-runtime wake, reload, natural idle retaining two visible UIs and updating to 21 after append, idle-then-revoke clearing both pages with disconnected original ports, and runtime schema rejection. They do not establish real-site/login/container behavior.

## Direct 5cf canonical execution

| Command/case | Exit | Result / evidence |
|---|---:|---|
| npm ci --offline --cache workspace/work/npm-cache --no-audit --no-fund | 0 | 347 packages; npm-ci.log |
| npm run typecheck | 0 | typecheck.log |
| npm run build:firefox | 0 | build.log; dist/firefox/build-info.json |
| npm run lint:firefox | 0 | 0 errors, 0 notices, 0 warnings; lint.log |
| npm run test:firefox-addon-lifecycle | 0 | canonical CSS lifecycle 3/3 PASS; artifacts/canonical-addon-lifecycle/results.json; canonical-addon-lifecycle.log |
| Independent canonical native grant/auto UI/force/wake | 0 | active two-visible-UI precondition, stopped and awake both preserve UI; artifacts/canonical-open-port-force/results.json; canonical-open-port-force.log |
| npm run package:firefox | 0 | unsigned ZIP produced; package.log |

Canonical lifecycle proves native disable leaves no visible UI/highlight; re-enable/action removes old inert DOM/markers, creates one visible usable root, and locates again; native uninstall hides UI/highlight and reload removes inert root. We explicitly accept the documented hidden inert DOM before reload. The canonical auto probe uses the normalized options HTML for a real permission grant and exercises managed automatic stylesheet injection, then stops background without disableResetIdleForTest and wakes it while two visible UIs survive.

## Asset normalization and hashes

fb5 raw host.css SHA f3ac96f93a29de3bed06affeee5d902baf1cb4706f032d337a2fbb318a992ad4 contains three CRLF endings. Canonical LF host.css SHA is 5dfc4c888918275eb536a33e22a37f3153d8a1d273d60feb83a453c864bdc8bb. Raw fb5 options.html SHA 7a1be5b8663fe9ddb2d24fff5f3475acfb5c4665c0d8836dd064882953fedab8 becomes canonical SHA 163c1dfbc82b785e03b0075dfaac686bcfbf544d1a69a0439297e9902c43bbbf. Normalized equality of both files was explicitly checked; their raw bytes are not identical.

Final formal hashes:
- content.js: fde39cddd6587e0c25cda2c8fd2788e648e0588720f84b5740668f5002ea60c0
- background.js: bba203ccf71c5419898051ebd5de68c850830d3f84535d4d85e31a50f83b8977
- options.js: a986be9a94429358b8a9fd6871e3ab0672cc75fdb1c020cdd1878f8076350ad4
- options.html: 163c1dfbc82b785e03b0075dfaac686bcfbf544d1a69a0439297e9902c43bbbf
- host.css: 5dfc4c888918275eb536a33e22a37f3153d8a1d273d60feb83a453c864bdc8bb
- manifest.json: 267ec122e1922cd12a7a00fe9af0da4ee9fb34d463920d698982a37d6c3eddc1

Final fixture JS also matches fb5: content 0424cc59c636b32fafd9c47db8d995502aad532198abf8a3c1dae552cf48a356; background 8081a2f22c734deba874c64b5d68ac5e07814eac29efb4cc1a26e7a4e01bb7ff. Full fixture hashes in dist/fixture/build-info.json.

Independent unsigned ZIP SHA cdf120c571bb801dd8ba9395a0f246900c97e4e42b664f4d0e76691957e9219a differs from the parent's timestamp-dependent ZIP. All seven ZIP members were streamed and hashed independently and match corresponding rebuilt dist files: background.js, build-info.json, options.js, host.css, content.js, manifest.json, options.html. See artifacts/packages/independent-member-hashes.json, which records matches_dist=true for every member. No signing claim is made.

## Source review and remaining gates

Runtime schema and sender checks remain narrow; text is rendered through textContent; normal content lifecycle, epoch/task cancellation, unknown-branch invalidation and return offsets have scoped regression evidence. Formal manifest uses activeTab/scripting/storage plus optional chatgpt.com permission; fixture localhost permission exists only in the fixture manifest. No page bridge, cookie access, third-party chat transport, or persisted chat index was introduced. Settings alone use storage.local.

Unchanged core blob bcb70434ee291897c36b8865ec3b54c56c87ff2a reuses fc02 independent 13/13 CORE evidence. No new core run is claimed. Indexing/CPU and real UI performance for a live long ChatGPT page were not measured; core search p95 is not a live UI benchmark.

LIVE-01–07 remain PENDING: no real authenticated Firefox ChatGPT session, fixed expected full-branch ID sample, ten preselected unmounted remote targets, real branch/workspace/container evidence, or live return/cancel samples. ESR and REL-01 signed installation/restart/update remain PENDING. These external gates do not prevent the explicitly allowed experimental T07a delivery, and they prevent declaring the original long-conversation problem fully solved or the product a signed daily-use release.

Old failures are retained in earlier scratch directories and reports: core defects, fc02 SPA debounce, 9afa natural idle disappearance, and 2cfe duplicate roots. The current passing regressions resolve their tested triggers; no historical FAIL was deleted or rewritten. No further runtime/source changes are needed for this scoped acceptance conclusion; later changes require provenance review and relevant regression.
