const extensionStorage = globalThis.chrome?.storage?.local;
export async function readStored(key) {
  try {
    if (extensionStorage) return (await extensionStorage.get(key))[key];
    return JSON.parse(localStorage.getItem(`json-viewer:${key}`) || 'null');
  } catch { return null; }
}
export async function writeStored(key, value) {
  if (extensionStorage) await extensionStorage.set({ [key]: value });
  else localStorage.setItem(`json-viewer:${key}`, JSON.stringify(value));
}
