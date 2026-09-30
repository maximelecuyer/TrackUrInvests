// Accès au dossier d'exports. Chrome et Edge savent mémoriser le dossier
// (File System Access API) ; les autres navigateurs passent par un sélecteur
// classique à rouvrir à chaque visite.

const DB_NAME = 'trackurinvests';
const STORE = 'handles';
const EXPORT_PATTERN = /\.(xlsx|xls|csv|txt)$/i;

export const canRememberFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function pickFolder() {
  const handle = await window.showDirectoryPicker({ id: 'fortuneo-exports', mode: 'read' });
  try {
    await idb('readwrite', (s) => s.put(handle, 'folder'));
  } catch {
    // Pas d'IndexedDB (navigation privée) : le dossier ne sera pas mémorisé.
  }
  return handle;
}

/** Dossier mémorisé : { handle, granted } ou null. */
export async function getRememberedFolder() {
  if (!canRememberFolder()) return null;
  try {
    const handle = await idb('readonly', (s) => s.get('folder'));
    if (!handle) return null;
    const granted = (await handle.queryPermission({ mode: 'read' })) === 'granted';
    return { handle, granted };
  } catch {
    return null;
  }
}

/** Doit être appelé depuis un clic (exigence du navigateur). */
export async function requestAccess(handle) {
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

export async function forgetFolder() {
  try {
    await idb('readwrite', (s) => s.delete('folder'));
  } catch {
    // Rien à oublier.
  }
}

/** Lit tous les exports du dossier (sous-dossiers compris). */
export async function readFolder(handle, prefix = '') {
  const files = [];
  for await (const entry of handle.values()) {
    const path = `${prefix}${entry.name}`;
    if (entry.kind === 'directory') {
      files.push(...await readFolder(entry, `${path}/`));
    } else if (EXPORT_PATTERN.test(entry.name) && !entry.name.startsWith('~$')) {
      const file = await entry.getFile();
      files.push({ name: path, lastModified: file.lastModified, data: await file.arrayBuffer() });
    }
  }
  return files;
}

/** Même chose pour une sélection faite avec <input type="file" webkitdirectory>. */
export async function readFileList(fileList) {
  const files = [];
  for (const file of fileList) {
    if (!EXPORT_PATTERN.test(file.name) || file.name.startsWith('~$')) continue;
    files.push({
      name: file.webkitRelativePath || file.name,
      lastModified: file.lastModified,
      data: await file.arrayBuffer(),
    });
  }
  return files;
}
