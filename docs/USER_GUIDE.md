# JSON Viewer — Search & Beautify

[Download the latest install-only ZIP](https://github.com/asgarihope/pro-json-viewer/releases/latest/download/pro-json-viewer.zip) · [Easy installation](../INSTALL.md) · [نصب فارسی](../INSTALL.fa.md)

A self-contained Chrome Manifest V3 extension with a full-page JSON workspace and a 460 × 580 px toolbar popup. No build step, account, CDN, telemetry, or server is needed.

## Version 1.6 — centered nodes, copy controls, and saved themes

- Opening a graph card keeps its header anchored during expansion, then smoothly centers the opened card in the visual viewport without changing zoom. The source tree follows the selected node. Manual panning/dragging can interrupt the camera as before.
- Clicking an empty array gives an explicit empty-array message in both the graph and source tree. Empty objects also give feedback in the graph.
- The full-value panel has **Copy value**, a **Copy attribute path** button beside its path, and a close button. Hover a long value or click any scalar value to open it; clicking pins the panel so you can use its buttons. String values copy their complete decoded text, including Unicode and line breaks; number values retain their original spelling. Native clipboard line endings follow your operating system.
- Every graph card also has a copy button beside its footer path, including the root path `$`. Native-copy fallback remains available when clipboard API access is blocked.
- Graph expand/collapse controls now use SVG chevrons with a clear expanded state and a short rotation animation.
- Use the palette icon in the header to choose **Midnight**, **Daylight**, **Ocean**, **Forest**, **Plum**, or **Sepia**. Daylight and Sepia are light themes; the others are dark. Colors cover the complete workspace, graph connections, minimap, dialogs and popup. Your choice is saved locally, restored on reload, and synchronized between open viewer/popup pages. Draft and indentation settings are preserved separately.

## Smooth expansion and camera guidance

Opening and closing graph nodes animates the card height, attribute visibility, descendant cards, and connecting lines. The clicked header stays anchored during the layout transition and **your zoom level is preserved**. Individual branch toggles do not run an automatic Fit-to-view operation. After expansion, the camera smoothly centers the opened card.

Search navigation, minimap recentering, Fit to view, and automatic arrangement use smooth camera transitions. Manual panning, zooming, and card dragging take control immediately; rapid open/close clicks retarget the current transition. Native text selection uses the same DOM nodes throughout the animation. The system's reduced-motion setting is respected. Large expansions avoid expensive offscreen card morphs while keeping the clicked node anchored.

## One column per JSON depth

The automatic layout places every node at the same JSON depth in one shared vertical column, even when the nodes belong to different parents. Deeper levels appear in successive columns to the right. This applies when opening branches, using **Show all**, or resetting manual positions. Cards retain their compact spacing and scrollable attribute lists. Dragging an individual object can override its automatic position; **Compact layout** restores the depth-column arrangement.

## Compact graph and movable objects

The graph starts with a **closed root**. Click a card's title bar (without dragging), its chevron, or its closed summary to open it. Initially each child remains closed, so you explore one level at a time. Search can reveal the branch containing your requested match. The existing source tree and popup keep their previous behavior.

- **Show all** opens every graph node and arranges the complete structure by depth, with all nodes at each level in one column.
- **Move an object** by dragging its title bar. Its connecting lines and minimap update as you move. Moving cards does not pan the canvas, collapse the node, edit JSON, or interfere with selecting attribute text. Manual positions survive zoom and branch collapse/reopening within the current document.
- **Compact layout** (the grid button) resets dragged positions while keeping the current expansion state. **Show all** also resets dragged positions; a new or reformatted document starts a fresh layout.
- **Collapse every graph node** (the minus-box button) returns to a closed root. **Fit to view** frames the currently visible nodes without opening hidden ones.
- Cards use smaller spacing and show up to eight attribute rows at once. Longer lists scroll inside the card, with all fields retained. Scrolling a list scrolls its attributes; scrolling the background zooms the graph. Search scrolls the card to reveal the matching field.

## Visual graph

The full-page viewer now opens with the source tree on the left and a connected **Visual graph** on the right, matching the proposed design. Every object and array has a rectangular card; its properties and scalar values appear as compact rows. Array indexes, empty containers and primitive roots are supported. Long values have shortened previews; hover or focus a value to read its complete text in a selectable, scrollable tooltip.

- **Navigate:** drag empty canvas to pan, use the mouse wheel on the background or **− / +** to zoom, and click **Fit to view** to frame visible nodes. The minimap recenters the viewport. When the canvas has keyboard focus, use arrow keys to pan, +/− to zoom, and 0 to fit.
- **Select and copy:** selecting a graph row reveals its exact path in the source tree. Keys and values remain selectable text, including through zoom changes. Native Ctrl/Cmd+C copies selected text; right-click a graph key for **Copy attribute path**.
- **Search:** matching fields are highlighted in both views. Next/previous navigation reveals hidden graph ancestors and focuses the matching card. The existing results list is available under the **Search results** tab beside **Visual graph**.
- **Collapse:** graph header chevrons hide or restore that card's descendant cards. Existing level/depth controls set both views to the chosen depth. Individual tree and graph branches can also be explored separately.
- **Arrange:** drag the middle divider, or focus it and use arrow keys, to resize the panes. The upper-right graph button maximizes/restores the pane. The **Visual graph** button in the main toolbar hides/shows the right pane for a full-width source view.
- **Large JSON:** the model retains the entire document. At very small zoom levels, large structures use a lightweight overview of all container boxes; zoom in or search to read the fields. Cards and attribute rows render as they enter view, with active text selections retained. This also covers huge flat arrays whose attributes belong to one card.

The toolbar popup keeps its compact existing interface; its **Open in full viewer** action opens the complete graph workspace with the current draft. No new permissions or network access were added.

## Version 1.2.1 — stable text selection

Fixed JSON keys and values losing their selection on mouse release. You can drag-select text, double-click a word, select across multiple rows, and copy the selection with **Ctrl/Cmd+C** in both views. Selection stays intact while scrolling or resizing, including when selected text scrolls offscreen. The toolbar **Copy** button continues to copy the whole document.

## Copy attribute paths

In **Tree** view, right-click any property key and choose **Copy attribute path**. The menu previews the exact address, for example `data.users[0].email`. Array indexes are included. Names containing spaces, dots, quotes, Unicode or empty strings use escaped bracket notation, such as `$["a.b"]["display name"]`. This works on collapsed object keys and on search-highlighted keys in both the full viewer and quick panel. Copying a path leaves your JSON unchanged.

For keyboard access, select a property in the tree, press **Shift+F10** (or the Menu key), and press **Enter** to copy. **Esc** dismisses the menu and restores tree focus. If the browser blocks clipboard API access, the menu selects the path so you can copy it with **Ctrl/Cmd+C**.

To update an installed unpacked copy, replace the files in your existing extension folder with this version, open `chrome://extensions`, click **Reload** on JSON Viewer, and reopen the popup or refresh existing viewer tabs.

## Depth controls

Both the full viewer and popup include **Collapse level** and **Expand level** to hide or reveal one nesting level at a time. **Shown depth N / M** shows the deepest visible level and the maximum depth of the entire document. Use the dropdown to jump to any level. These global controls set all branches to the chosen depth. The status bar shows **Depth N / M** for the currently selected item (or the cursor position in Raw / Edit).

Depth starts at **0 for the root**. Each property value or array item adds 1, including primitive values and empty containers. For example, `{"user":{"name":"Alex"}}` has maximum depth **2**. Search and manual tree expansion update the visible-depth indicator automatically. Formatting and depth changes preserve the document's contents. Depth controls are disabled in Raw / Edit and for invalid JSON.

## Install in Chrome

1. Extract `pro-json-viewer.zip` if you downloaded the archive. Keep the extracted folder in a permanent location.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** at the upper right.
4. Click **Load unpacked**, then select the `pro-json-viewer` folder containing `manifest.json`.
5. In Chrome's Extensions menu (the puzzle icon), pin **JSON Viewer — Search & Beautify**.
6. Click its `{ }` toolbar icon to open the quick panel. Click the upper-right **Open in full viewer** icon for the full-page workspace.

The same unpacked extension also works in Microsoft Edge through `edge://extensions`.

## Use

- Paste JSON into **Raw / Edit**, use **Paste JSON**, open a file, or drop a file into either workspace. Clipboard access can depend on browser settings; ordinary Ctrl/Cmd+V always works in the editor.
- **Beautify** formats the document and opens its syntax-highlighted, collapsible tree. Choose 2 spaces, 4 spaces, or tabs. **Minify** removes unnecessary whitespace and returns to Raw / Edit.
- **Search** finds literal text in the displayed JSON tokens, including escaped string representations. Search keys and values, keys only, or values only; use **Aa** for case matching. The full viewer adds a results sidebar.
- Use the arrows or Enter/Shift+Enter to navigate matches. A match inside a collapsed object opens its ancestors automatically.
- Click a tree chevron to expand/collapse. Arrow keys navigate the tree. The full viewer also includes **Expand all** and **Collapse all**.
- **Copy** copies the current source; **Download** saves it as a JSON file. Validation errors keep your source editable and include **Go to error** when a location is available.
- The latest draft, search and view mode are saved locally as you edit. Reopening the popup restores that draft; **Open in full viewer** saves and transfers it to a new full-page tab. Existing tabs keep their own in-memory edits, and the last tab/popup you edit becomes the latest saved draft. They are not collaborative live-synced editors.
- **Clear** empties the current document and saved draft. It does not clear another already-open tab's in-memory copy.

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Focus search | Ctrl+F / Cmd+F |
| Next match | Enter in search, or F3 |
| Previous match | Shift+Enter in search, or Shift+F3 |
| Beautify | Shift+Alt+F |
| Clear search | Esc |
| Navigate tree | Up / Down / Left / Right, Home / End |
| Open attribute path menu for selected property | Shift+F10 / Menu key |
| Insert indentation in editor | Tab |

## Data and permissions

The only requested extension permission is **storage**, for the draft, appearance, and indentation preference. The extension makes no network requests and cannot read websites or your browsing history. It opens files only when you select or drop them. Clipboard operations happen through explicit buttons or native paste.

Formatting uses the original JSON tokens instead of serializing parsed JavaScript values. Large integers, negative zero, exponent spellings, escaped strings, duplicate keys, and key order are preserved. Limits: 5 MiB of UTF-8 per document, 256 nested levels, and 10,000 search matches per query. Refine broad queries to find additional matches. The results sidebar displays up to 250 matches at a time; next/previous traverses all collected matches. The virtualized tree mounts visible rows and retains rows needed to preserve an active text selection.

This extension is a dedicated JSON workspace. It does not automatically replace JSON responses on websites.

## Source and verification

- `manifest.json`: extension metadata and popup entry point.
- `viewer.html`, `popup.html`, `app.js`, `styles.css`, `shell.js`: shared responsive UI.
- `core.js`: strict validation, lossless formatting, search, and tree model.
- `graph-model.js`, `graph-motion.js`, `graph.js`, `graph.css`: complete container model, layout, anchored transitions, camera guidance, connections, viewport, minimap, cards and full-value tooltips.
- `storage.js`: local persistence (and a localStorage fallback for browser-based development).
- `themes.js`, `themes.css`: saved appearance presets and full-workspace palettes, including canvas colors.
- `icons/`: packaged toolbar icons.
- `tests/unit/`: run from the repository root with Node 20+ using `npm test`. The extension itself has no dependencies.

Runtime files are in `extension/`; tests are in `tests/`. To preview without installing the extension, serve `extension/` over localhost and visit `viewer.html` or `popup.html`. The real toolbar popup and opening a Chrome extension tab require installation.

## Purpose, implementation, and pull requests

The goal is fast, private JSON exploration with exact-value preservation and native text selection. Plain JavaScript modules implement the token-based editor, virtualized tree/graph, canvas connectors, animated camera, and local persistence. For a pull request, describe the problem and resulting behavior, supply relevant verification and UI screenshots, and check selection, popup, numeric precision, and permissions. See [CONTRIBUTING.md](../CONTRIBUTING.md) and the [PR template](../.github/pull_request_template.md).
