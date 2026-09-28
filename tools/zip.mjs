// Packs dist/ into release/map-pop-<version>-<commit>[-ads|-web].zip with index.html
// at the root of the zip, as Poki requires. No dependencies (zlib + CRC32).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'release');
const flavour = process.argv[2] === 'ads' ? '-ads' : process.argv[2] === 'web' ? '-web' : '';

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html missing: run the build first');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let commit = 'nogit';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  // not a git checkout
}

// Refuse to ship anything that is not the game (docs, maps, tests).
const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else files.push(path.relative(DIST, full).split(path.sep).join('/'));
  }
})(DIST);
const banned = files.filter((f) => /\.(map|md|txt)$/i.test(f));
if (banned.length) {
  console.error('refusing to zip non-game files:', banned);
  process.exit(1);
}
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.includes('game-cdn.poki.com'));
if (external.length) {
  console.error('external requests found in index.html:', external);
  process.exit(1);
}

const table = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
const locals = [];
const centrals = [];
let offset = 0;
for (const name of files) {
  const data = fs.readFileSync(path.join(DIST, name));
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  locals.push(local, nameBuf, deflated);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);
  offset += local.length + nameBuf.length + deflated.length;
}
const centralSize = centrals.reduce((s, b) => s + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `map-pop-${pkg.version}-${commit}${flavour}.zip`);
fs.writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`${path.relative(ROOT, out)}  ${kb} KB  (${files.join(', ')})`);
console.log(`Tag this build: git tag poki-${pkg.version}-${commit}${flavour} && git push --tags`);
