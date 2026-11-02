const fs = require('node:fs');
const path = require('node:path');

const candidates = [process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const browserPath = candidates.find(p => p && fs.existsSync(p));
if (!browserPath) throw new Error('Install desktop Edge on Windows or set BROWSER_PATH to an extension-capable Chromium executable. See CONTRIBUTING.md.');
const extensionRoot = path.resolve(process.env.EXTENSION_PATH || 'extension');
fs.mkdirSync('.test-output', { recursive: true });
module.exports = { browserPath, extensionRoot };
