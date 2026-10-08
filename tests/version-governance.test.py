import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("restore", "scripts/restore-version-refs.py")
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)
# Keep the one-time seven-tag recovery program pinned to its original input.
# A new delivery extends the current catalog without broadening recovery scope.
frozen = subprocess.run(["git", "-c", "safe.directory=" + Path.cwd().as_posix(), "show", "73a2908390bae11e98af99fba407797466cb2550:docs/version-catalog.json"], capture_output=True, text=True, encoding="utf-8", check=True)
catalog = json.loads(frozen.stdout)
current_catalog = json.loads(Path("docs/version-catalog.json").read_text(encoding="utf-8"))
tags = {version["tag"]: version["tagObject"] for version in catalog["versions"]}
source = "a" * 40


def local_git(*args, check=True):
    if args == ("show", source + ":docs/version-catalog.json"):
        return json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    result = subprocess.run(["git", "-c", "safe.directory=" + Path.cwd().as_posix(), *args], capture_output=True, text=True, encoding="utf-8")
    if check:
        if result.returncode:
            raise RuntimeError(result.stderr)
        return result.stdout
    return result.returncode


class Governance(unittest.TestCase):
    def test_current_catalog_tracks_the_product_and_immutable_delivery_objects(self):
        versions = current_catalog["versions"]
        package = json.loads(Path("package.json").read_text(encoding="utf-8"))
        self.assertEqual(current_catalog["currentVersion"], package["version"])
        if current_catalog.get("redevelopment"):
            rebuild = current_catalog["redevelopment"]
            self.assertEqual(rebuild["currentRevision"], package["tocRevision"])
            self.assertEqual(rebuild["baselineTag"], "v0.3.4")
            self.assertTrue(rebuild["preserveHistoricalObjects"])
            self.assertFalse(rebuild["legacyCompatibility"])
            for tag in rebuild["deprecatedTags"]:
                self.assertEqual(local_git("cat-file", "-t", tag).strip(), "tag")
        else:
            self.assertEqual(versions[-1]["version"], package["version"])
        self.assertEqual(len({v["tag"] for v in versions}), len(versions))
        self.assertEqual(versions[:len(catalog["versions"])], catalog["versions"])
        self.assertEqual(current_catalog["withdrawal"], catalog["withdrawal"])
        for version in versions:
            tag = "refs/tags/" + version["tag"]
            self.assertEqual(local_git("cat-file", "-t", tag).strip(), "tag")
            self.assertEqual(local_git("rev-parse", tag).strip(), version["tagObject"])
            self.assertEqual(local_git("rev-parse", tag + "^{}").strip(), version["deliveryCommit"])
            self.assertEqual(local_git("merge-base", "--is-ancestor", version["runtimeCommit"], version["deliveryCommit"], check=False), 0)
            for path in ["package.json", "package-lock.json", "manifests/firefox.json"]:
                data = json.loads(local_git("show", version["deliveryCommit"] + ":" + path))
                self.assertEqual(data["version"], version["version"])
                if path == "package-lock.json":
                    self.assertEqual(data["packages"][""]["version"], version["version"])
            for report in version["acceptance"]:
                self.assertEqual(local_git("cat-file", "-e", version["deliveryCommit"] + ":" + report, check=False), 0)

    def test_entrypoint_refuses_local_execution_before_network_or_git(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(restore.urllib.request, "urlopen") as network, patch.object(restore.subprocess, "run") as process:
            with self.assertRaises(SystemExit):
                restore.main()
            network.assert_not_called()
            process.assert_not_called()

    def test_seven_real_local_annotated_tags_match_original_snapshots(self):
        restore.verify_source(local_git, source, catalog, tags)

    def test_withdrawn_history_cannot_be_promoted_by_catalog(self):
        for change in [lambda c: c["versions"][2].update(status="experimental"), lambda c: c.pop("withdrawal")]:
            bad = copy.deepcopy(catalog)
            change(bad)
            with self.assertRaises(ValueError):
                restore.verify_catalog(bad)

    def test_ref_updates_allow_equal_or_fast_forward_and_reject_rewrite(self):
        old, new = "b" * 40, "c" * 40
        restore.validate_ref_update(None, new, lambda *_: False)
        restore.validate_ref_update(new, new, lambda *_: False)
        restore.validate_ref_update(old, new, lambda *_: True)
        with self.assertRaises(ValueError):
            restore.validate_ref_update(old, new, lambda *_: False)

    def test_tag_object_or_delivery_identity_cannot_change(self):
        bad = dict(tags)
        bad["v0.1.0"] = "0" * 40
        with self.assertRaises(ValueError):
            restore.verify_source(local_git, source, catalog, bad)

    def test_product_revision_build_and_ancestry_changes_are_rejected(self):
        runtime = catalog["versions"][0]["runtimeCommit"]
        for field in ["tocRevision", "build:firefox", "ancestry"]:
            def changed_git(*args, check=True):
                if field == "ancestry" and args[0] == "merge-base":
                    return 1
                result = local_git(*args, check=check)
                if args == ("show", runtime + ":package.json"):
                    package = json.loads(result)
                    if field == "tocRevision":
                        package["tocRevision"] = "unexpected-product-revision"
                    elif field == "build:firefox":
                        package["scripts"]["build:firefox"] = "node unexpected-build.mjs"
                    return json.dumps(package)
                return result
            with self.assertRaises(ValueError):
                restore.verify_source(changed_git, source, catalog, tags)


    def test_explicit_same_version_revision_preserves_canonical_tag_and_snapshot_identity(self):
        for revision in current_catalog.get("sameVersionRevisions", []):
            canonical = next(v for v in current_catalog["versions"] if v["version"] == revision["version"])
            self.assertTrue(revision["userRequestedSameVersion"])
            self.assertNotEqual(revision["snapshotTag"], canonical["tag"])
            self.assertEqual(local_git("rev-parse", canonical["tag"]).strip(), canonical["tagObject"])
            self.assertEqual(local_git("cat-file", "-t", revision["snapshotTag"]).strip(), "tag")
            self.assertEqual(local_git("rev-parse", revision["snapshotTag"]).strip(), revision["tagObject"])
            self.assertEqual(local_git("rev-parse", revision["snapshotTag"] + "^{}").strip(), revision["deliveryCommit"])
            self.assertEqual(local_git("merge-base", "--is-ancestor", revision["runtimeCommit"], revision["deliveryCommit"], check=False), 0)
            package = json.loads(local_git("show", revision["deliveryCommit"] + ":package.json"))
            self.assertEqual(package["version"], revision["version"])
            self.assertEqual(package["tocRevision"], revision["revision"])
            for path in ["manifests/firefox.json", "package-lock.json"]:
                self.assertEqual(json.loads(local_git("show", revision["deliveryCommit"] + ":" + path))["version"], revision["version"])
            for report in revision["acceptance"]:
                self.assertEqual(local_git("cat-file", "-e", revision["deliveryCommit"] + ":" + report, check=False), 0)

if __name__ == "__main__":
    unittest.main()
