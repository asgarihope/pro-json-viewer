"""Update metadata and bilingual download links before committing a release."""
import argparse
import json
import re
from build import ROOT, DOCS, REPOSITORY, verify


def prepare(version, root=ROOT):
    if not re.fullmatch(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)", version):
        raise ValueError("Version must be X.Y.Z without leading zeros")
    if version == "0.0.0" or any(int(x) > 65535 for x in version.split(".")):
        raise ValueError("Invalid Chrome version")
    changes = {}
    for name in ("package.json", "extension/manifest.json", "package-lock.json"):
        path = root / name
        if not path.exists() and name == "package-lock.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        data["version"] = version
        if name == "package-lock.json":
            data["packages"][""]["version"] = version
        changes[path] = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    for name in DOCS:
        path = root / name
        content = path.read_text(encoding="utf-8")
        pattern = r"(<!-- release-version:start -->)(.*?)(<!-- release-version:end -->)"
        if len(re.findall(pattern, content, flags=re.S)) != 1:
            raise ValueError(f"Missing/duplicate release marker in {name}")
        def replace(match):
            block = re.sub(r"\*\*\d+\.\d+\.\d+\*\*", f"**{version}**", match[2])
            block = re.sub(r"https://github.com/asgarihope/pro-json-viewer/releases/download/[^\s)]+",
                           f"{REPOSITORY}/releases/download/v{version}/pro-json-viewer-v{version}.zip", block)
            return match[1] + block + match[3]
        changes[path] = re.sub(pattern, replace, content, flags=re.S)
    # Parse every file before writing so an invalid document cannot cause a half update.
    for path, text in changes.items():
        path.write_text(text, encoding="utf-8", newline="\n")
    verify(root, f"v{version}")
    print(f"Prepared v{version}; review, test, commit, then push tag v{version}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version")
    prepare(parser.parse_args().version)
