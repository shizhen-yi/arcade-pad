import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const gamesPath = path.join(root, 'host/public/games.json');
const manifestPath = path.join(root, 'host/public/covers/manifest.json');
const outDir = path.join(root, 'host/public/covers/title-screens');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseUrl = process.env.VIRTUALPAD_HOST_URL || 'http://127.0.0.1:5173';

function slugRom(romPath) {
  return romPath
    .replace(/^roms\//, '')
    .replace(/\.nes$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function runChrome(url, output) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless',
      '--disable-gpu',
      '--mute-audio',
      '--no-first-run',
      '--disable-background-networking',
      '--window-size=768,720',
      '--virtual-time-budget=6200',
      `--screenshot=${output}`,
      url
    ];
    const child = spawn(chromePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Chrome exited ${code}: ${stderr}`));
    });
  });
}

await fs.mkdir(outDir, { recursive: true });

const data = JSON.parse(await fs.readFile(gamesPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const missing = data.games.filter((game) => !manifest[game.path]);

let captured = 0;
let skipped = 0;
let failed = 0;

for (const [index, game] of missing.entries()) {
  const file = `${slugRom(game.path)}.png`;
  const output = path.join(outDir, file);
  const publicPath = `/covers/title-screens/${file}`;

  try {
    await fs.access(output);
    manifest[game.path] = publicPath;
    skipped += 1;
    console.log(`[${index + 1}/${missing.length}] reuse ${game.name}`);
    continue;
  } catch {}

  const url = `${baseUrl}/fcgame/index.html?tv=1&cover=1&rom=${encodeURIComponent(game.path)}`;
  try {
    console.log(`[${index + 1}/${missing.length}] capture ${game.name}`);
    await runChrome(url, output);
    manifest[game.path] = publicPath;
    captured += 1;
  } catch (error) {
    failed += 1;
    console.warn(`[failed] ${game.name}: ${error.message}`);
  }
}

await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Captured ${captured}, reused ${skipped}, failed ${failed}.`);
console.log(`Manifest coverage: ${Object.keys(manifest).length}/${data.games.length}.`);
