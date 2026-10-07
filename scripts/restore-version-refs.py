"""One-time GitHub Linux job: restore unchanged Git objects and publish refs.

The entry point intentionally refuses local execution. No stored credentials,
personal browser data, force pushes, ref deletion or public releases are used.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

REPOSITORY = "justamowei/chatgpt-toc-firefox"
OPERATIONAL_REF = "refs/heads/chore/version-governance-sync"
PRODUCT_REF = "refs/heads/feat/firefox-prototype"
MAINTENANCE_REF = "refs/heads/release/v0.3"
DOC_MAP = {
    "docs/main-readme.md": "README.md",
    "docs/version-policy.md": "docs/version-policy.md",
    "docs/version-catalog.json": "docs/version-catalog.json",
    "docs/versions.md": "docs/versions.md",
    "docs/main-development-plan.md": "docs/development-plan.md",
}


def require_sha(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ValueError("Invalid Git SHA")
    return value


def verify_catalog(catalog):
    if catalog.get("schemaVersion") != 1 or catalog.get("currentVersion") != "0.3.3":
        raise ValueError("Unexpected version catalog")
    versions = catalog.get("versions", [])
    expected = ["0.1.0", "0.1.1", "0.2.0", "0.3.0", "0.3.1", "0.3.2", "0.3.3"]
    if [v.get("version") for v in versions] != expected:
        raise ValueError("Unexpected delivery selection")
    for v in versions:
        if v.get("tag") != "v" + v["version"] or not v.get("acceptance"):
            raise ValueError("Untraceable delivery tag")
        require_sha(v["deliveryCommit"])
        require_sha(v["runtimeCommit"])
    if versions[2].get("status") != "withdrawn" or not catalog.get("withdrawal"):
        raise ValueError("Withdrawn v0.2.0 must stay explicitly withdrawn")
    return versions


def validate_ref_update(current, desired, is_ancestor):
    require_sha(desired)
    if current is not None:
        require_sha(current)
        if current != desired and not is_ancestor(current, desired):
            raise ValueError("Ref is not a fast-forward; no force update permitted")


def verify_source(git, source, catalog, tag_objects):
    for v in verify_catalog(catalog):
        tag = "refs/tags/" + v["tag"]
        if git("cat-file", "-t", tag).strip() != "tag":
            raise ValueError("Delivery tag must be annotated: " + v["tag"])
        if git("rev-parse", tag).strip() != require_sha(tag_objects[v["tag"]]):
            raise ValueError("Tag object differs from original local object")
        if git("rev-parse", tag + "^{}").strip() != v["deliveryCommit"]:
            raise ValueError("Tag points to a different delivery")
        if git("merge-base", "--is-ancestor", v["runtimeCommit"], v["deliveryCommit"], check=False) != 0:
            raise ValueError("Runtime is not an ancestor of delivery")
        for path in ["manifests/firefox.json", "package.json", "package-lock.json"]:
            data = json.loads(git("show", v["deliveryCommit"] + ":" + path))
            if data["version"] != v["version"]:
                raise ValueError("Snapshot package version mismatch")
            if path == "package-lock.json" and data["packages"][""]["version"] != v["version"]:
                raise ValueError("Root lockfile package version mismatch")
        # Selection allows documentation and test setup changes, not runtime drift.
        if git("diff", "--name-only", v["runtimeCommit"], v["deliveryCommit"], "--", "src", "manifests", "scripts", "tsconfig.json", "package-lock.json").strip():
            raise ValueError("Delivery contains a different product runtime")
        def product_package(commit):
            package = json.loads(git("show", commit + ":package.json"))
            package["scripts"] = {key: value for key, value in package.get("scripts", {}).items() if not key.startswith("test:")}
            return package
        if product_package(v["runtimeCommit"]) != product_package(v["deliveryCommit"]):
            raise ValueError("Delivery package changes product build or revision")
        for report in v["acceptance"]:
            git("cat-file", "-e", v["deliveryCommit"] + ":" + report)
        annotation = git("cat-file", "-p", tag)
        if v["status"] == "withdrawn" and "WITHDRAWN" not in annotation:
            raise ValueError("Withdrawn tag annotation is missing")
    if git("show", source + ":docs/version-catalog.json") != json.dumps(catalog, ensure_ascii=False, indent=2) + "\n":
        # Compare data rather than platform-specific JSON formatting.
        if json.loads(git("show", source + ":docs/version-catalog.json")) != catalog:
            raise ValueError("Source catalog does not match job catalog")


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true" or sys.platform != "linux":
        raise SystemExit("Ref restoration runs only in the authorized GitHub Linux job; local execution refused")
    if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY or os.environ.get("GITHUB_REF") != OPERATIONAL_REF:
        raise SystemExit("Unexpected repository or operational branch")
    bootstrap = require_sha(os.environ.get("GITHUB_SHA"))
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("Job token unavailable")

    def api(path, missing=False):
        url = "https://api.github.com/repos/" + REPOSITORY + "/" + path
        request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "User-Agent": "toc-version-governance"})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if missing and error.code == 404:
                return None
            raise RuntimeError("GitHub API failed with HTTP " + str(error.code)) from None

    def content(path):
        record = api("contents/" + path + "?ref=" + bootstrap)
        if record.get("encoding") != "base64":
            raise ValueError("Expected bounded base64 repository file")
        return base64.b64decode(record["content"], validate=False)

    meta = json.loads(content("recovery/version-governance.json"))
    source = require_sha(meta["sourceCommit"])
    bundle = content("recovery/version-governance.bundle")
    if hashlib.sha256(bundle).hexdigest() != meta["bundleSha256"]:
        raise ValueError("Git bundle checksum mismatch")
    catalog = json.loads(content("docs/version-catalog.json"))
    versions = verify_catalog(catalog)
    if set(meta["tags"]) != {v["tag"] for v in versions}:
        raise ValueError("Unexpected tag object set")

    with tempfile.TemporaryDirectory(prefix="toc-git-recovery-") as temporary:
        root = Path(temporary)
        repo = root / "repository.git"
        bundle_path = root / "recovery.bundle"
        bundle_path.write_bytes(bundle)
        environment = dict(os.environ)
        for key in list(environment):
            if key.startswith("GIT_TRACE") or key.startswith("GIT_CONFIG_"):
                environment.pop(key)
        auth = base64.b64encode(("x-access-token:" + token).encode()).decode()
        environment.update({"GIT_TERMINAL_PROMPT": "0", "GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "http.https://github.com/.extraheader", "GIT_CONFIG_VALUE_0": "AUTHORIZATION: basic " + auth})

        def git(*args, cwd=None, check=True):
            command = ["git", "-c", "credential.helper=", "-c", "core.askpass="]
            if cwd is None:
                command.extend(["--git-dir", str(repo)])
            result = subprocess.run(command + list(args), cwd=cwd, env=environment, capture_output=True, text=True)
            if check and result.returncode:
                # Never log authentication headers or raw subprocess environment.
                raise RuntimeError("Git step failed: " + args[0] + "; " + result.stderr.replace(token, "[masked]").replace(auth, "[masked]"))
            return result.stdout if check else result.returncode

        git("init", "--bare", str(repo))
        git("remote", "add", "origin", "https://github.com/" + REPOSITORY + ".git")
        git("fetch", "--no-tags", "origin", "+refs/heads/*:refs/remotes/origin/*", "refs/tags/*:refs/tags/*")
        git("bundle", "verify", str(bundle_path))
        git("fetch", str(bundle_path), "HEAD:refs/heads/recovered", "refs/tags/*:refs/tags/*")
        if git("rev-parse", "refs/heads/recovered").strip() != source:
            raise ValueError("Restored HEAD differs from original source")
        verify_source(git, source, catalog, meta["tags"])

        def remote_ref(ref):
            record = api("git/ref/" + ref.removeprefix("refs/"), missing=True)
            return record["object"]["sha"] if record else None

        def ancestor(old, new):
            return git("merge-base", "--is-ancestor", old, new, check=False) == 0

        product = remote_ref(PRODUCT_REF)
        if product not in [meta["expectedProductHead"], source]:
            raise ValueError("Product branch changed since preparation")
        validate_ref_update(product, source, ancestor)
        validate_ref_update(remote_ref(MAINTENANCE_REF), source, ancestor)
        for v in versions:
            current = remote_ref("refs/tags/" + v["tag"])
            if current is not None and current != meta["tags"][v["tag"]]:
                raise ValueError("Existing annotated tag cannot be replaced")

        # Main receives the reviewed documentation subset only, never the addon
        # runtime, withdrawn source, recovery bundle or bootstrap workflow.
        main_head = remote_ref("refs/heads/main")
        if main_head != meta["expectedMainHead"]:
            raise ValueError("Main changed since preparation")
        worktree = root / "main-docs"
        git("worktree", "add", "-b", "main-docs", str(worktree), main_head)
        for original, destination in DOC_MAP.items():
            output = worktree / destination
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(git("show", source + ":" + original).encode("utf-8"))
        git("add", "--", *DOC_MAP.values(), cwd=worktree)
        if git("diff", "--cached", "--quiet", cwd=worktree, check=False) != 0:
            git("-c", "user.name=GitHub Actions", "-c", "user.email=github-actions[bot]@users.noreply.github.com", "commit", "-m", "docs: define version policy and historical delivery catalog", cwd=worktree)
        desired_main = git("rev-parse", "HEAD", cwd=worktree).strip()
        changed = set(git("diff", "--name-only", main_head, desired_main).splitlines())
        if not changed.issubset(set(DOC_MAP.values())):
            raise ValueError("Unexpected main mutation")

        refspecs = [source + ":" + PRODUCT_REF, source + ":" + MAINTENANCE_REF, desired_main + ":refs/heads/main"]
        refspecs += ["refs/tags/" + v["tag"] + ":refs/tags/" + v["tag"] for v in versions]
        git("push", "--atomic", "origin", *refspecs)
        expected = {PRODUCT_REF: source, MAINTENANCE_REF: source, "refs/heads/main": desired_main}
        expected.update({"refs/tags/" + v["tag"]: meta["tags"][v["tag"]] for v in versions})
        for ref, wanted in expected.items():
            if remote_ref(ref) != wanted:
                raise ValueError("Remote ref verification failed: " + ref)
        for v in versions:
            annotated = api("git/tags/" + meta["tags"][v["tag"]])
            if annotated["object"]["type"] != "commit" or annotated["object"]["sha"] != v["deliveryCommit"]:
                raise ValueError("Remote tag points to a different source")
        result = {"status": "SYNC_VERIFIED", "sourceCommit": source, "refs": expected, "tags": [v["tag"] for v in versions], "mainFiles": sorted(changed), "forcePush": False, "localGcmUsed": False}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text("## Version refs restored\n\nOriginal commits and seven annotated tags verified. No force push; main received reviewed documentation only.\n\n```json\n" + json.dumps(result, indent=2) + "\n```\n")


if __name__ == "__main__":
    main()
