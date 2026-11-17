import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

let revision = process.env.BUILD_REVISION || process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA;
if (!revision || revision === 'unknown') {
  try { revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { revision = 'source'; }
}
const version = `${revision}-${new Date().toISOString()}`;
const result = spawnSync(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build', '--define', `IRIS_BUILD_VERSION=${JSON.stringify(version)}`, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
const destination = 'dist/FrontAuthIRIS/browser';
mkdirSync(destination, { recursive: true });
writeFileSync(`${destination}/version.json`, JSON.stringify({ version, authSchema: 1 }) + '\n');
console.log(`Frontend build version: ${version}`);
