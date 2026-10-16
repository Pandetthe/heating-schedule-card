import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

// One readable ES module: HA loads it as a dashboard resource, and an
// unminified file is easier to debug in the browser.
await build({
    entryPoints: [path.join(rootDir, 'src', 'heating-schedule-card.js')],
    outfile: path.join(rootDir, 'dist', 'heating-schedule-card.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    charset: 'utf8',
    define: { __VERSION__: JSON.stringify(version) },
    logLevel: 'warning',
});
