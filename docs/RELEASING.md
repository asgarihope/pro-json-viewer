# Releases / انتشار نسخه

## Maintainer steps

From a clean checkout on `main`, choose a new stable version `X.Y.Z`. Replace the example number below with that version:

```sh
python scripts/prepare_release.py 1.7.0
npm test
python -m unittest discover -s tests -p "test_*.py"
python scripts/build.py --tag v1.7.0
```

The preparation script updates `extension/manifest.json`, `package.json`, `package-lock.json` when present, and the marked version/download sections in `README.md`, `README.fa.md`, `INSTALL.md`, and `INSTALL.fa.md`. Review the changes, update feature descriptions for the release, run relevant browser regressions, then commit and publish:

```sh
git add extension/manifest.json package.json package-lock.json README.md README.fa.md INSTALL.md INSTALL.fa.md
git commit -m "Prepare release 1.7.0"
git push origin main
git tag v1.7.0
git push origin v1.7.0
```

The tag-triggered workflow verifies the tag against metadata and all four documents, runs tests, builds, and creates a GitHub Release with a stable asset name, a versioned copy, checksums, and bilingual installation notes. Stable releases are marked latest; the documented process is for publishing a new current version, not historical backfills. Watch the repository's **Actions** tab until it succeeds.

## Downloads that stay current

The primary link in all four user documents is:

https://github.com/asgarihope/pro-json-viewer/releases/latest/download/pro-json-viewer.zip

GitHub resolves that URL to the latest release's asset of the same name, so it updates as soon as a new release is published. This follows [GitHub's documented release-link format](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases). Version-specific links change automatically during preparation and are checked during CI/build. A release's tagged documents continue linking to that version; the default branch describes the current release.

Generated outputs, kept out of Git:

- `dist/pro-json-viewer/`: only runtime extension files; select this in Chrome.
- `dist/pro-json-viewer.zip`: runtime folder plus English and Persian installation guides outside it.
- `dist/pro-json-viewer-vX.Y.Z.zip`: identical bytes under a versioned name.
- `dist/SHA256SUMS.txt`: hashes for both ZIPs.
- `dist/RELEASE_NOTES.md`: bilingual installation notes for GitHub.

The package allowlist makes accidental personal JSON, tests, dependency folders, and browser profiles fail the build rather than enter a release. Update the allowlist intentionally when adding a runtime asset. ZIP timestamps and permissions are fixed for reproducible output.

## Recovery and manual publication

If a tagged workflow fails, inspect Actions logs, fix and validate the cause, and publish a new version if the tagged code needs a change. Do not move a tag users may already have downloaded. If the only failure is publication and no release exists yet, a maintainer with GitHub CLI access can publish the already-tested tag locally:

```sh
python scripts/build.py --tag v1.7.0
gh release create v1.7.0 dist/pro-json-viewer.zip dist/pro-json-viewer-v1.7.0.zip dist/SHA256SUMS.txt --verify-tag --latest --title "Pro JSON Viewer v1.7.0" --notes-file dist/RELEASE_NOTES.md
```

This command assumes the checkout is exactly the tagged, tested source. If a release already exists, inspect its assets before changing anything; do not overwrite a published package with different bytes. For verification, download `pro-json-viewer.zip`, check its SHA-256, extract it, and load the inner folder in a fresh test browser profile.

## مراحل فارسی

روی شاخهٔ `main` و با تغییرات ذخیره‌شده شروع کنید. شمارهٔ جدید را با `python scripts/prepare_release.py X.Y.Z` تنظیم کنید. تست‌ها و بیلد را اجرا کنید، تغییر امکانات در متن را بنویسید، تغییرات را بررسی و کامیت کنید و تگ `vX.Y.Z` را push کنید. مثال‌های بالا با شمارهٔ فرضی ۱٫۷ هستند؛ شمارهٔ واقعی را جایگزین کنید.

اسکریپت نسخه و لینک هر دو README و هر دو راهنمای نصب را عوض می‌کند. workflow با دریافت تگ، تست و بیلد می‌گیرد و Release شامل ZIP نصب و چک‌سام می‌سازد. لینک ثابت «آخرین نسخه» با انتشار جدید خودکار به همان فایل تازه می‌رسد. موفقیت را در تب **Actions** بررسی کنید. اگر فایل جدیدی برای اجرای افزونه اضافه کردید، allowlist بیلد را هم به‌عمد به‌روز کنید.

در صورت خطا، گزارش workflow را بررسی کنید؛ تگ منتشرشده را جابه‌جا نکنید. برای انتشار دستی فقط از همان کد تست‌شده و تگ‌شده و دستور بخش بالا استفاده کنید. بستهٔ منتشرشده را با محتوای متفاوت بازنویسی نکنید.

## Purpose, implementation, and PR notes / هدف، پیاده‌سازی و PR

**Purpose:** users download one small, clearly named install package and follow six simple steps. **Implementation:** standard-library Python copies an explicit runtime allowlist, checks versions and bilingual links, creates reproducible ZIPs and hashes; GitHub Actions publishes on stable tags. **PR notes:** describe packaging or workflow changes, include unit/build results, verify extracted installation and all four download blocks, and state whether publication itself was tested.

**هدف:** یک بستهٔ کوچک و مشخص برای نصب سادهٔ کاربر. **پیاده‌سازی:** Python با allowlist مشخص، کنترل نسخه و لینک‌های دوزبانه، ZIP تکرارپذیر و چک‌سام؛ انتشار با تگ در GitHub Actions. **PR:** تغییر بسته‌بندی یا workflow، نتیجهٔ تست/بیلد، نصب پوشهٔ استخراج‌شده و کنترل چهار بخش دانلود را توضیح دهید؛ مشخص کنید خود انتشار هم آزمایش شده یا نه.
