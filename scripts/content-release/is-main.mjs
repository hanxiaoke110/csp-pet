import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Node resolves import.meta.url through symlinks, while argv can retain /tmp
 * or another symlink spelling. Compare actual files so CLIs never silently skip. */
export function isMainModule(moduleUrl, entry = process.argv[1]) {
  if (!entry) return false;
  try { return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(moduleUrl)); }
  catch { return false; }
}
