# Install Pro JSON Viewer in Chrome

[فارسی](INSTALL.fa.md) · [Project](https://github.com/asgarihope/pro-json-viewer)

No programming knowledge or commands needed. Use desktop Chrome on Windows, macOS, or Linux.

<!-- release-version:start -->
Version: **1.6.0** · [This version's ZIP](https://github.com/asgarihope/pro-json-viewer/releases/download/v1.6.0/pro-json-viewer-v1.6.0.zip)
<!-- release-version:end -->

## 1. Download

**[CLICK HERE TO DOWNLOAD](https://github.com/asgarihope/pro-json-viewer/releases/latest/download/pro-json-viewer.zip)**

The file is called **pro-json-viewer.zip**. If you are on a GitHub Release page, open **Assets** and choose that exact file. The automatic **Source code** downloads are for developers.

## 2. Extract the ZIP

On Windows: right-click **pro-json-viewer.zip** → **Extract All…** → **Extract**.

On macOS: double-click the ZIP. On Linux: right-click → extract with your file manager.

Put the extracted files in a permanent place such as Documents. Inside, find the folder **pro-json-viewer**. Open it: you should see **manifest.json**. Remember this folder. Keep it after installation.

## 3. Open Chrome's extension page

Open Chrome. Click the **address bar at the top**. Type:

```text
chrome://extensions
```

Press **Enter**. This is an address; type it in the address bar, not the Google search box.

## 4. Switch on Developer mode

At the **upper right**, turn **Developer mode** on. Extra buttons appear.

## 5. Load the folder

Click **Load unpacked** at the upper left.

In the folder picker, select the **pro-json-viewer folder containing manifest.json**, then click **Select Folder** (or **Select/Open** on your operating system).

Select the folder itself. Do not select the ZIP. Do not open or select manifest.json.

Success: a card named **JSON Viewer — Search & Beautify** appears and is enabled.

## 6. Open and use it

Click Chrome's **puzzle-piece icon** at the upper right. Find **JSON Viewer — Search & Beautify**, then click its **pin**.

Click the extension's **{ }** icon. A small panel opens. Click **Example** to try it. For the large page, click **Open in full viewer** at the panel's upper right.

To use your JSON: click **Raw / Edit**, paste it, then click **Beautify**. Search using the search field. The palette icon changes the saved color theme. The interface buttons are currently in English; this guide explains their labels.

## Updating an installed copy

1. Download the latest ZIP from the same download link above and extract it.
2. Copy the **contents** of its new `pro-json-viewer` folder into the **same folder Chrome already uses**. Replace existing files. Do not put a second nested folder inside it.
3. Open `chrome://extensions`, find JSON Viewer, and click its circular-arrow **Reload** button.
4. Refresh open viewer tabs and reopen the popup. Your saved draft and theme remain in the same installed extension.

## If it does not work

| What you see | What to do |
| --- | --- |
| No Load unpacked button | Turn on Developer mode, upper right. |
| Manifest file is missing/unreadable | Extract the ZIP first. Select the inner folder where `manifest.json` is directly visible. |
| Icon is missing | Click the puzzle-piece icon and pin JSON Viewer. |
| Files disappeared after installation | Restore the folder to its original location, then Reload. Keep it in Documents rather than a temporary folder. |
| This browser is managed and Developer mode is unavailable | Ask your organization's browser administrator; local policy may block unpacked extensions. |
| You are using a phone/tablet | These steps require desktop Chrome; mobile Chrome does not load this unpacked extension. |

For Microsoft Edge, the same steps use `edge://extensions`. No account, payment, terminal, or extra software is required for installation. See [Chrome's official instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Purpose, technical notes, and pull requests

**Purpose:** quickly search, format, and visually explore JSON while preserving its contents. **Implementation:** a self-contained Manifest V3 extension using local HTML/CSS/JavaScript and browser storage; no server or runtime packages. The installed folder contains only extension files. **For a pull request:** work in `extension/`, explain the problem and change, include relevant tests/screenshots, and check native text selection and popup behavior. Development and release instructions are in the [repository](https://github.com/asgarihope/pro-json-viewer), `CONTRIBUTING.md`, and `docs/RELEASING.md`; they are not installation steps.
