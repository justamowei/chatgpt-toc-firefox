# Independent cloud restore review

2026-10-07. **PASS within reviewed scope; both findings resolved.** No remaining actionable defect found in the reviewed catalog, restore script or five-file main documentation payload.

Final reviewed script SHA-256: `ee695cc0ec2bd93d67c0dfcf8ebc8130dea6c3e657bc2caf40b3ced71b37da9e`.

## Resolved findings

- R1: complete runtime/delivery package comparison now strips only test: script entries; compiled revision, build scripts and dependency changes are rejected. Runtime ancestry is now required.
- R2: acceptance links pin their original delivery commits; withdrawal evidence pins its later failure commit. Main receives a compact development-plan document, and all relative Markdown links in the five-document payload resolve within that payload or existing main.

## Independent verification

12/12 pure check groups passed:

- SHA validation good/bad inputs.
- Ref create/equal/fast-forward and divergence refusal.
- Catalog fixed seven versions and malformed input refusals.
- Catalog exactly agrees with independent historical audit.
- Source validator accepts valid protected objects and test-only package change.
- Reject changed compiled tocRevision.
- Reject changed product build script.
- Reject changed dependency setting.
- Reject runtime that is not a delivery ancestor.
- Reject changed protected runtime path.
- Reject missing WITHDRAWN annotation.
- All five main-doc markdown relative links resolve; eight evidence URLs pin intended commits.

Version selections, withdrawal and legacy revision metadata exactly match the earlier independent audit. Static review still supports exact cloud/repository/ref guards, job-environment authentication with helpers disabled, explicit atomic non-force product/maintenance/main/tag refspecs, existing-tag immutability, five-path main staging and post-push ref/tag-object/peeled-source verification.

The first review reproduced package-drift and absent-ancestry acceptance and identified relative links that would break on main. Those historical findings are retained as RESOLVED in the JSON.

No cloud entrypoint, subprocess, network or Git method was invoked by Python tests; all Git function inputs were mocks. Separate local read-only Git inspection established main baseline b1d2ea0. No source/docs/Git mutations, GCM or personal Firefox access occurred. This final review overwrote only restore-review.json and restore-review.md.

This is not remote SYNC_VERIFIED evidence. Actual bundle upload/restoration, workflow trigger, remote ref/tag object agreement, permissions and job result need separate cloud verification.
