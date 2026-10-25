import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

for (const directory of ['dist', 'scripts']) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(js|mjs)$/.test(entry.name)) continue;
    const result = spawnSync(process.execPath, ['--check', resolve(directory, entry.name)], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('Sintaxis de la aplicación y los scripts verificada.');
