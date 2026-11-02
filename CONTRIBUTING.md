# Contributing / مشارکت

[English README](README.md) · [README فارسی](README.fa.md)

## Development

Use Node.js 20+ and Python 3.10+. No packages are needed to run the unit tests or release tooling:

```sh
npm test
python -m unittest discover -s tests -p "test_*.py"
python scripts/build.py
```

Load `extension/` directly in Chrome for development. Load `dist/pro-json-viewer/` to verify the package users receive. After source changes, reload the extension at `chrome://extensions` and refresh viewer tabs. To preview a regular page, run `python -m http.server 8000 --directory extension` and visit `http://localhost:8000/viewer.html`; actual popup/tab transfer requires installing the extension.

## Browser regression tests

Five included suites cover 196 browser checks. They use an isolated test profile, real extension loading, actual mouse/keyboard input, native clipboard, file/download APIs, animation frames, and theme persistence. They have been verified with desktop Edge on Windows. Other Chromium configurations may need adjustment; branded Chrome versions may restrict command-line extension loading.

```sh
npm ci
npm run test:browser
```

The helper locates installed Windows Edge automatically. For another extension-capable executable, set `BROWSER_PATH` in your shell. To test the packaged folder, set `EXTENSION_PATH` to `dist/pro-json-viewer` before running. For example in PowerShell:

```powershell
$env:EXTENSION_PATH = 'dist/pro-json-viewer'
npm run test:browser
```

Suites run sequentially because they share the OS clipboard. They replace the clipboard while checking copy behavior; do not use the clipboard during the run. Profiles, reports, and screenshots stay in ignored `.test-output/`, never in your personal browser profile. Close other copies of these tests before rerunning. Playwright is only a development dependency; no Playwright installation or browser download is needed by users.

CI runs the 32 JavaScript tests, Python release tests, and clean package build. The full interactive suites are run locally on the documented Windows/Edge setup; CI does not claim browser coverage.

## راهنمای کوتاه فارسی

برای تغییر کد در `extension/` کار کنید. برای توسعه Node.js نسخهٔ ۲۰ به بالا و Python نسخهٔ ۳٫۱۰ به بالا کافی است. سه دستور بخش اول، تست و بیلد را اجرا می‌کنند؛ نصب بسته برای کاربران هیچ‌کدام را لازم ندارد.

برای تست مرورگر، `npm ci` و سپس `npm run test:browser` را در ویندوز با Edge نصب‌شده اجرا کنید. تست‌ها پروفایل جدا دارند و محتوای کلیپ‌بورد را عوض می‌کنند؛ هنگام اجرا از کلیپ‌بورد استفاده نکنید. خروجی تست‌ها در `.test-output/` می‌ماند. برای بررسی بستهٔ نهایی، متغیر `EXTENSION_PATH` را مثل مثال بالا روی `dist/pro-json-viewer` بگذارید.

برای انتشار، [docs/RELEASING.md](docs/RELEASING.md) را بخوانید. فقط فایل‌های مربوط به تغییر را کامیت کنید؛ دادهٔ شخصی، پروفایل مرورگر و `dist/` نباید وارد ریپوزیتوری شوند.

## Purpose, implementation, and pull requests / هدف، پیاده‌سازی و PR

**Purpose:** keep JSON exploration fast, private, and lossless. **Implementation:** source changes belong in small ES modules under `extension/`; packaging and tests stay separate. Preserve original token data and reuse DOM nodes where selection depends on identity. Avoid adding runtime packages or permissions without a concrete need and an explanation.

**PR contents:** explain the problem, final behavior, implementation tradeoff, commands/results, and material limitations. Include before/after images for UI changes. Run checks appropriate to the change; selection, precision, popup, graph motion, clipboard fallbacks, and reduced motion are established regression risks. Use the [bilingual PR template](.github/pull_request_template.md).

**هدف:** بررسی سریع، خصوصی و بدون تغییر دادهٔ JSON. **پیاده‌سازی:** ماژول‌های کوچک در `extension/`، جدا از تست و بسته‌بندی؛ توکن اصلی و هویت DOM مؤثر در انتخاب متن را حفظ کنید. **PR:** مشکل، نتیجه، تصمیم فنی، دستورها و نتیجهٔ تست و محدودیت واقعی را بنویسید. برای UI تصویر قبل و بعد بگذارید و از قالب دوزبانهٔ PR استفاده کنید.
