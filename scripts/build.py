"""Build the install-only release using Python's standard library."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/asgarihope/pro-json-viewer"
DOCS = ("README.md", "README.fa.md", "INSTALL.md", "INSTALL.fa.md")
FILES = (
    "manifest.json", "viewer.html", "popup.html", "app.js", "shell.js",
    "core.js", "storage.js", "styles.css", "graph.js", "graph-model.js",
    "graph-motion.js", "graph.css", "themes.js", "themes.css",
    "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png",
)


def version_at(root=ROOT):
    manifest = json.loads((root / "extension/manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if not re.fullmatch(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)", version):
        raise ValueError("Use a stable X.Y.Z version without leading zeros")
    if any(int(part) > 65535 for part in version.split(".")) or version == "0.0.0":
        raise ValueError("Version must be nonzero and each Chrome version part <= 65535")
    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    if package["version"] != version:
        raise ValueError("package.json and extension/manifest.json versions differ")
    lock_path = root / "package-lock.json"
    if lock_path.exists():
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        if lock.get("version") != version or lock.get("packages", {}).get("", {}).get("version") != version:
            raise ValueError("package-lock.json version differs")
    if manifest["manifest_version"] != 3 or manifest.get("permissions") != ["storage"]:
        raise ValueError("Review changed manifest permissions before changing the build policy")
    if manifest.get("host_permissions") or manifest.get("optional_permissions") or manifest.get("optional_host_permissions"):
        raise ValueError("Unexpected host/optional permissions")
    return version


def verify(root=ROOT, tag=None):
    version = version_at(root)
    if tag is not None and tag != f"v{version}":
        raise ValueError(f"Tag must be v{version}, got {tag!r}")
    expected = {str(p.relative_to(root / "extension")).replace("\\", "/")
                for p in (root / "extension").rglob("*") if p.is_file()}
    if expected != set(FILES):
        raise ValueError(f"Review extension allowlist: missing={set(FILES)-expected}, unexpected={expected-set(FILES)}")
    for relative in FILES:
        if (root / "extension" / relative).is_symlink():
            raise ValueError(f"Symlinks are not packaged: {relative}")
    latest = f"{REPOSITORY}/releases/latest/download/pro-json-viewer.zip"
    specific = f"{REPOSITORY}/releases/download/v{version}/pro-json-viewer-v{version}.zip"
    for name in DOCS:
        content = (root / name).read_text(encoding="utf-8")
        blocks = re.findall(r"<!-- release-version:start -->(.*?)<!-- release-version:end -->", content, re.S)
        if len(blocks) != 1 or f"**{version}**" not in blocks[0] or specific not in blocks[0] or latest not in content:
            raise ValueError(f"Stale version/download link in {name}; run scripts/prepare_release.py")
        links = re.findall(r"https://github.com/asgarihope/pro-json-viewer/releases/download/[^\s)]+", content)
        if any(link != specific for link in links):
            raise ValueError(f"Stale explicit download link in {name}")
    return version


def build(root=ROOT, tag=None):
    version = verify(root, tag)
    dist = root / "dist"
    install = dist / "pro-json-viewer"
    if dist.is_symlink() or dist.resolve().parent != root.resolve():
        raise ValueError("Unsafe dist output path")
    dist.mkdir(exist_ok=True)
    # Only replace our generated install folder after verifying its absolute boundary.
    if install.resolve().parent != dist.resolve() or install.is_symlink():
        raise ValueError("Unsafe install output path")
    if install.exists():
        shutil.rmtree(install)
    for relative in FILES:
        target = install / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / "extension" / relative, target)

    archive = dist / "pro-json-viewer.zip"
    # A fixed timestamp/permissions makes the same source produce the same archive.
    entries = {f"pro-json-viewer/{name}": (root / "extension" / name).read_bytes() for name in FILES}
    for language, source in (("English", "INSTALL.md"), ("فارسی", "INSTALL.fa.md")):
        text = (root / source).read_text(encoding="utf-8")
        # Language switches also work when opening guides beside the extracted folder.
        text = text.replace("](" + ("INSTALL.fa.md" if source == "INSTALL.md" else "INSTALL.md") + ")",
                            "](" + ("INSTALL-فارسی.md" if source == "INSTALL.md" else "INSTALL-English.md") + ")")
        entries[f"INSTALL-{language}.md"] = text.encode("utf-8")
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for name, content in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            output.writestr(info, content)
    with zipfile.ZipFile(archive) as output:
        if output.testzip() is not None:
            raise ValueError("ZIP integrity failure")
    versioned = dist / f"pro-json-viewer-v{version}.zip"
    shutil.copyfile(archive, versioned)
    checksum = "".join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in (archive, versioned))
    (dist / "SHA256SUMS.txt").write_text(checksum, encoding="utf-8", newline="\n")
    notes = f"""# Pro JSON Viewer {version}

## English — download and install
Download **pro-json-viewer.zip** below. Extract it, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the inner **pro-json-viewer** folder containing `manifest.json`. Keep that folder in place.

[Easy installation]({REPOSITORY}/blob/v{version}/INSTALL.md) · [Features and implementation]({REPOSITORY}/blob/v{version}/README.md)

## فارسی — دانلود و نصب
فایل **pro-json-viewer.zip** پایین را دانلود و استخراج کنید. در کروم به `chrome://extensions` بروید، **Developer mode** را روشن کنید، **Load unpacked** را بزنید و پوشهٔ داخلی **pro-json-viewer** که `manifest.json` داخلش است را انتخاب کنید. این پوشه را نگه دارید.

[راهنمای نصب ساده]({REPOSITORY}/blob/v{version}/INSTALL.fa.md) · [امکانات و پیاده‌سازی]({REPOSITORY}/blob/v{version}/README.fa.md)

Both ZIP assets contain the same installable files; choose either, not both. **Source code** assets are for development. See the tagged READMEs for this version's features and technical details.
هر دو ZIP محتوای یکسان دارند؛ فقط یکی را بگیرید. فایل‌های **Source code** برای توسعه هستند.
"""
    (dist / "RELEASE_NOTES.md").write_text(notes, encoding="utf-8", newline="\n")
    print(f"Built v{version}: {archive.stat().st_size:,} bytes; {len(entries)} files")
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", help="Require a matching release tag, e.g. v1.6.0")
    parser.add_argument("--check", action="store_true", help="Validate without building")
    args = parser.parse_args()
    if args.check:
        print(f"Verified v{verify(tag=args.tag)}")
    else:
        build(tag=args.tag)
