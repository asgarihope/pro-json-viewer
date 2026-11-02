"""Release correctness: clean install archive, exact sources, links, and versions."""
from pathlib import Path
import hashlib
import json
import shutil
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build import build, verify, FILES, DOCS
from prepare_release import prepare


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / "extension", self.root / "extension")
        for name in (*DOCS, "package.json", "package-lock.json"):
            shutil.copyfile(ROOT / name, self.root / name)
        self.version = verify(self.root)

    def test_clean_deterministic_install_and_checksums(self):
        archive = build(self.root, f"v{self.version}")
        first = archive.read_bytes()
        with zipfile.ZipFile(archive) as z:
            self.assertIsNone(z.testzip())
            self.assertEqual(set(z.namelist()), {f"pro-json-viewer/{f}" for f in FILES} | {"INSTALL-English.md", "INSTALL-فارسی.md"})
            for name in FILES:
                self.assertEqual(z.read(f"pro-json-viewer/{name}"), (self.root / "extension" / name).read_bytes())
                self.assertEqual((self.root / "dist/pro-json-viewer" / name).read_bytes(), (self.root / "extension" / name).read_bytes())
            self.assertIn("INSTALL-فارسی.md", z.read("INSTALL-English.md").decode())
        self.assertEqual(first, (self.root / f"dist/pro-json-viewer-v{self.version}.zip").read_bytes())
        self.assertIn(hashlib.sha256(first).hexdigest(), (self.root / "dist/SHA256SUMS.txt").read_text())
        self.assertEqual(first, build(self.root).read_bytes())

    def test_reject_stale_docs_tag_or_permissions(self):
        with self.assertRaisesRegex(ValueError, "Tag"):
            verify(self.root, "mismatched-tag")
        guide = self.root / "INSTALL.fa.md"
        original = guide.read_text(encoding="utf-8")
        guide.write_text(original.replace(f"/v{self.version}/", "/v0.0.0/"), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Stale"):
            verify(self.root)
        guide.write_text(original, encoding="utf-8")
        manifest = self.root / "extension/manifest.json"
        data = json.loads(manifest.read_text())
        data["host_permissions"] = ["<all_urls>"]
        manifest.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "permissions"):
            verify(self.root)

    def test_unexpected_source_is_not_silently_released(self):
        (self.root / "extension/private.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "allowlist"):
            build(self.root)

    def test_prepare_updates_all_language_docs_and_metadata(self):
        next_version = "9.8.7" if self.version != "9.8.7" else "9.8.8"
        prepare(next_version, self.root)
        self.assertEqual(verify(self.root, f"v{next_version}"), next_version)
        for name in DOCS:
            content = (self.root / name).read_text(encoding="utf-8")
            self.assertIn(f"v{next_version}/pro-json-viewer-v{next_version}.zip", content)
            self.assertNotIn(f"v{self.version}/pro-json-viewer-v{self.version}.zip", content)

    def test_invalid_version_does_not_write_anything(self):
        original = (self.root / "package.json").read_bytes()
        for version in ("1.2", "01.2.3", "1.2.3-rc.1", "0.0.0", "1.65536.0", "../../bad"):
            with self.assertRaises(ValueError):
                prepare(version, self.root)
            self.assertEqual(original, (self.root / "package.json").read_bytes())

    def test_reject_mismatched_lockfile(self):
        path = self.root / "package-lock.json"
        lock = json.loads(path.read_text())
        lock["packages"][""]["version"] = "0.0.0"
        path.write_text(json.dumps(lock))
        with self.assertRaisesRegex(ValueError, "package-lock"):
            verify(self.root)

    def test_missing_release_marker_does_not_partially_update(self):
        guide = self.root / "INSTALL.fa.md"
        guide.write_text(guide.read_text(encoding="utf-8").replace("<!-- release-version:start -->", ""), encoding="utf-8")
        original = (self.root / "extension/manifest.json").read_bytes()
        with self.assertRaisesRegex(ValueError, "release marker"):
            prepare("9.9.9", self.root)
        self.assertEqual(original, (self.root / "extension/manifest.json").read_bytes())


if __name__ == "__main__":
    unittest.main()
