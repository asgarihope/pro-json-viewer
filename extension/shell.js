const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  folder: '<path d="M3 7h6l2 2h10v10H3zM3 7V5h7l2 2h8v2"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H4v13h4"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/>',
  external: '<path d="M14 3h7v7m0-7L11 13M10 4H4v16h16v-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="M12 3 2 21h20zM12 9v5m0 3v1"/>',
  file: '<path d="M13 3H5v18h14V9zM13 3v6h6M8 13h8m-8 4h6"/>',
  clipboard: '<path d="M8 5H4v16h16V5h-4"/><rect x="8" y="3" width="8" height="4" rx="1"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  compress: '<path d="m4 8 4 4-4 4m16-8-4 4 4 4M10 4l4 16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v1"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.4 1.4 0 0 1 1-2.4H17a4 4 0 0 0 4-4A8.3 8.3 0 0 0 12 3Z"/><circle cx="7" cy="11" r=".8"/><circle cx="10" cy="7" r=".8"/><circle cx="15" cy="7" r=".8"/><circle cx="17" cy="11" r=".8"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'
};
export const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
export function shell() {
  return `<svg class="icon-defs" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${Object.entries(paths).map(([name, path]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${path}</symbol>`).join('')}</defs></svg>
  <header class="header">
    <div class="brand"><span class="brand-mark" aria-hidden="true">{ }</span><h1>JSON Viewer</h1><span class="quick-badge">QUICK PANEL</span></div>
    <div class="file-chip" title="Current file">${icon('file')}<span id="filename">Untitled.json</span></div>
    <span class="header-spacer"></span>
    <div class="header-actions">
      <button id="theme-toggle" class="button icon-button" title="Appearance and themes" aria-label="Choose theme" aria-expanded="false" aria-controls="appearance-panel">${icon('palette')}</button>
      <button id="open-file" class="button secondary" title="Open a JSON file">${icon('folder')}<span>Open file</span></button>
      <button id="copy" class="button secondary" title="Copy JSON">${icon('copy')}<span>Copy</span></button>
      <button id="download" class="button secondary" title="Download JSON">${icon('download')}<span>Download</span></button>
      <button id="open-full" class="button icon-button" title="Open in full viewer" aria-label="Open in full viewer">${icon('external')}</button>
      <button id="help" class="button icon-button" title="Keyboard shortcuts and help" aria-label="Keyboard shortcuts and help">${icon('help')}</button>
    </div>
    <input id="file-input" type="file" accept=".json,.jsonl,.txt,application/json,text/plain" hidden>
  </header>
  <div class="toolbar">
    <div class="search-tools">
      <div class="search-field">${icon('search')}<input id="search" type="search" autocomplete="off" spellcheck="false" aria-label="Search JSON" placeholder="Search keys and values…"><button id="clear-search" class="bare" title="Clear search" aria-label="Clear search">${icon('close')}</button></div>
      <output id="match-count" class="match-count" aria-live="polite">0 matches</output>
      <button id="previous" class="button icon-button" aria-label="Previous match" title="Previous match (Shift + Enter)">${icon('up')}</button>
      <button id="next" class="button icon-button" aria-label="Next match" title="Next match (Enter)">${icon('down')}</button>
      <select id="scope" aria-label="Search scope"><option value="all">Keys + values</option><option value="keys">Keys only</option><option value="values">Values only</option></select>
      <button id="case-sensitive" class="button case-button" aria-label="Match case" title="Match case" aria-pressed="false">Aa</button>
    </div>
    <button id="beautify" class="button primary">${icon('sparkles')}<span>Beautify</span><kbd>⇧ Alt F</kbd></button>
  </div>
  <div class="contextbar">
    <div class="view-tabs" role="tablist" aria-label="JSON view"><button id="tree-tab" role="tab" aria-controls="tree" aria-selected="false">Tree</button><button id="raw-tab" role="tab" aria-controls="editor-wrap" aria-selected="true">Raw / Edit</button></div>
    <div class="tree-actions"><button id="expand" class="text-button">Expand all</button><button id="collapse" class="text-button">Collapse all</button></div>
    <span class="context-spacer"></span>
    <button id="toggle-visual" class="text-button" aria-pressed="true" title="Show or hide the visual graph">◇ <span>Visual graph</span></button>
    <button id="minify" class="text-button" title="Remove unnecessary whitespace">${icon('compress')}<span>Minify</span></button>
    <button id="clear-document" class="text-button" title="Clear this document">${icon('trash')}<span>Clear</span></button>
    <select id="indent" aria-label="Indentation"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tabs</option></select>
  </div>
  <div class="depthbar" role="group" aria-label="Tree depth controls">
    <button id="collapse-level" class="button depth-button" title="Show one fewer nesting level">${icon('up')}Collapse level</button>
    <label class="depth-picker" title="Root is depth 0. Each property or array item adds one level.">Shown depth <select id="shown-depth" aria-label="Shown tree depth"><option value="0">0</option></select><span>/ <output id="max-depth">—</output></span></label>
    <button id="expand-level" class="button depth-button" title="Show one more nesting level">${icon('down')}Expand level</button>
    <span class="depth-hint">Root = 0 · each nested item adds 1</span>
  </div>
  <main id="workspace" class="workspace">
    <section class="document" aria-label="JSON document">
      <div id="error-banner" class="error-banner" role="alert" hidden>${icon('alert')}<span id="error-message"></span><button id="go-error" class="text-button">Go to error</button></div>
      <div id="editor-wrap" class="editor-wrap" role="tabpanel" aria-labelledby="raw-tab"><div id="editor-lines" class="editor-lines" aria-hidden="true"></div><textarea id="editor" aria-label="JSON source editor" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" placeholder="Paste your JSON here…"></textarea></div>
      <div id="tree" class="tree" tabindex="0" role="tree" aria-label="JSON tree" hidden><div id="tree-content" class="tree-content"></div></div>
      <div id="empty-state" class="empty-state"><div class="empty-icon" aria-hidden="true">{ }</div><p class="eyebrow">A LITTLE CLARITY FOR YOUR DATA</p><h2>Your JSON, clearly.</h2><p>Paste, explore, and find exactly what you need.</p><div class="empty-actions"><button id="paste" class="button primary">${icon('clipboard')}Paste JSON</button><button id="example" class="button secondary">Try an example</button></div><p class="empty-hint">or drop a JSON file anywhere · Ctrl / ⌘ V</p><div class="privacy-note"><span class="privacy-dot"></span>Private by default. Everything stays on your device.</div></div>
    </section>
    <div id="pane-divider" class="pane-divider" role="separator" aria-label="Resize JSON and visual panes" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="70" aria-valuenow="30" tabindex="0"><span>⋮</span></div>
    <aside id="side-panel" class="side-panel" aria-label="Visual graph and search results">
      <div class="side-heading"><div class="side-tabs" role="tablist" aria-label="Right pane"><button id="graph-tab" role="tab" aria-selected="true" aria-controls="graph-panel">Visual graph</button><button id="results-tab" role="tab" aria-selected="false" aria-controls="results-panel">Search results <span id="results-tab-count">(0)</span></button></div><span class="side-spacer"></span><button id="graph-show-all" class="button" title="Expand the complete JSON with a compact automatic layout">⊞ Show all</button><button id="graph-collapse-all" class="button icon-button" title="Collapse every graph node" aria-label="Collapse every graph node">⊟</button><button id="graph-arrange" class="button icon-button" title="Reset dragged positions and compact the current graph" aria-label="Compact layout">▦</button><button id="graph-fit" class="button" title="Fit the current graph in view">⛶ <span>Fit to view</span></button><button id="graph-maximize" class="button icon-button" title="Maximize visual pane" aria-label="Maximize visual pane" aria-pressed="false">⛶</button></div>
      <section id="graph-panel" class="graph-panel" role="tabpanel" aria-labelledby="graph-tab">
        <div id="graph-breadcrumb" class="graph-breadcrumb">root</div>
        <div id="graph-viewport" class="graph-viewport" tabindex="0" aria-label="JSON visual graph. Drag background to pan; scroll to zoom."><canvas id="graph-connections" aria-hidden="true"></canvas><div id="graph-layer" class="graph-layer"></div><div id="graph-empty" class="graph-empty"><span>{ }</span><strong>Your JSON, connected.</strong><p>Paste or open JSON to explore its complete structure.</p></div></div>
        <div class="graph-bottom"><span id="graph-hint">Drag canvas to pan · Scroll to zoom</span><button id="graph-minimap-button" class="graph-minimap" aria-label="Recenter graph using minimap"><canvas id="graph-minimap" width="168" height="88" aria-hidden="true"></canvas></button><div class="graph-zoom"><button id="graph-zoom-out" aria-label="Zoom out">−</button><output id="graph-zoom-label">100%</output><button id="graph-zoom-in" aria-label="Zoom in">+</button></div></div>
      </section>
      <aside id="results-panel" class="results-panel" role="tabpanel" aria-labelledby="results-tab" aria-label="Search results" hidden><div class="results-heading"><h2>Search results</h2><span id="results-count"></span></div><div id="results-list" class="results-list"></div><div class="results-help"><span><kbd>Enter</kbd> next match</span><span><kbd>Esc</kbd> clear</span></div></aside>
    </aside>
    <div id="drop-overlay" class="drop-overlay" hidden>${icon('folder')}Drop your JSON file here</div>
  </main>
  <footer class="statusbar"><div id="validity" class="validity"><span class="status-dot"></span><span id="validity-text">Ready for JSON</span></div><div id="breadcrumb" class="breadcrumb">Paste or open a file to get started</div><div class="status-right"><span id="save-status">Saved locally</span><span id="node-depth" title="Current item depth / maximum document depth. Root is depth 0.">Depth —</span><span id="size">0 B</span><span class="encoding">UTF-8</span><span id="position">Ln 1, Col 1</span></div></footer>
  <div id="toast" class="toast" role="status" hidden></div>
  <div id="graph-tooltip" class="graph-tooltip" role="dialog" aria-label="Attribute value" hidden><div class="graph-tooltip-header"><span id="graph-tooltip-path" tabindex="-1"></span><button id="graph-copy-path" class="bare" title="Copy attribute path" aria-label="Copy attribute path">${icon('copy')}</button><span id="graph-tooltip-type"></span></div><pre id="graph-tooltip-value" tabindex="0"></pre><div class="graph-tooltip-actions"><button id="graph-copy-value" class="button secondary">${icon('copy')}Copy value</button><button id="graph-close-tooltip" class="bare" aria-label="Close value panel" title="Close">${icon('close')}</button></div></div>
  <section id="appearance-panel" class="appearance-panel" role="dialog" aria-label="Appearance" hidden><div class="appearance-heading"><h2>Appearance</h2><button id="appearance-close" class="bare" aria-label="Close appearance">${icon('close')}</button></div><p>Choose your workspace colors.</p><div id="theme-options" class="theme-options" role="radiogroup" aria-label="Color theme"></div><span class="appearance-note">Saved on this device · shared with the quick panel</span></section>
  <div id="attribute-menu" class="attribute-menu" role="menu" aria-label="Attribute actions" hidden>
    <div class="attribute-preview" role="presentation"><span>ATTRIBUTE PATH</span><input id="attribute-path" type="text" readonly tabindex="-1" spellcheck="false" aria-label="Attribute path"></div>
    <button id="copy-attribute-path" role="menuitem">${icon('copy')}Copy attribute path</button>
  </div>
  <dialog id="help-dialog"><div class="dialog-heading"><h2>A faster way through JSON</h2><button id="close-help" class="button icon-button" aria-label="Close help">${icon('close')}</button></div><p>Open a file, paste JSON, or drop a file into the workspace. Beautify preserves number precision and duplicate keys.</p><dl><dt>Find</dt><dd><kbd>Ctrl / ⌘ F</kbd></dd><dt>Next / previous match</dt><dd><kbd>Enter / Shift Enter</kbd></dd><dt>Beautify</dt><dd><kbd>Shift Alt F</kbd></dd><dt>Navigate tree</dt><dd><kbd>↑ ↓ ← →</kbd></dd><dt>Clear search</dt><dd><kbd>Esc</kbd></dd></dl><p>Search matches the displayed JSON text. Keys + values, keys only, values only, and case matching are available.</p><p class="muted">Up to 5 MiB per document and 256 nested levels. Your latest draft is saved locally and shared with the quick panel. No account, network requests, or analytics.</p></dialog>`;
}
