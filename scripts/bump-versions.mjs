import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const packagePath = path.join(rootDir, 'package.json');

function parseVersion(v) {
    return v.split('.').map(n => parseInt(n, 10) || 0);
}

function compareVersions(v1, v2) {
    const a = parseVersion(v1);
    const b = parseVersion(v2);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const valA = a[i] ?? 0;
        const valB = b[i] ?? 0;
        if (valA > valB) return 1;
        if (valA < valB) return -1;
    }
    return 0;
}

function getNextCalVer(currentMax) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    let next = `${year}.${month}.0`;

    if (currentMax) {
        const parts = parseVersion(currentMax);
        const lastYear = parts[0];
        const lastMonth = parts[1];
        const lastPatch = parts[2] ?? 0;

        if (lastYear === year && lastMonth === month) {
            next = `${year}.${month}.${lastPatch + 1}`;
        } else if (compareVersions(currentMax, next) >= 0) {
            next = `${parts[0]}.${parts[1]}.${(parts[2] ?? 0) + 1}`;
        }
    }

    return next;
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
let version = process.argv[2];

if (!version || !/^\d{4}\.\d{1,2}\.\d+$/.test(version)) {
    version = getNextCalVer(pkg.version);
}

console.log(`Setting the version to: ${version}`);

if (pkg.version !== version) {
    execSync(`npm version ${version} --no-git-tag-version`, { cwd: rootDir, stdio: 'inherit' });
} else {
    console.log(`Version is already ${version}, skipping npm version.`);
}

if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_version=${version}\n`);
}

console.log(`Successfully set the version to ${version}`);
