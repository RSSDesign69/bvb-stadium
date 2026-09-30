// Explorer asset pipeline (docs/explorer-fidelity-task-list.md, Task 1). Turns the approved CC0 originals listed in
// scripts/explorer-assets.json into KTX2 files under public/assets/explorer/<tier>/ plus index.json. Deterministic and
// rerunnable: originals are verified by SHA-256, every encode is single-threaded with --testrun, and the output hashes
// are printed so two runs can be compared. Needs no npm packages; the only tool is KTX-Software's `ktx` (build time only).
//   node scripts/process-assets.mjs [--check]     (--check: verify originals and report, write nothing)
// It also rewrites the provenance/inventory.json entries for public/assets/explorer/** (one per shipped file, traced to
// its CC0 source record in provenance/inputs.json, the originals' SHA-256 and the processing applied).
// Environment: KTX (default .cache/tools/ktx/bin/ktx), ASSET_SRC (default .cache/assets-src).
//
// Encodings (colour maps sRGB, everything else linear; every tiling map filtered with wrap-around mipmaps):
//   colour, ORM (R ambient occlusion, G roughness, B metalness: the glTF convention) → ETC1S / BasisLZ
//   normal (OpenGL +Y) → UASTC with RDO + zstd;  leaf atlases → ETC1S RGBA, colour dilated under transparent texels
//   sky → E5B9G9R9 shared-exponent float + zstd (no UASTC HDR encoder in ktx 4.4.2), rows stored bottom-up,
//         with the sun disc clamped out of the image; its direction and strength are recorded for the sun light.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/explorer-assets.json'), 'utf8'));
const KTX = path.resolve(root, process.env.KTX || '.cache/tools/ktx/bin/ktx');
const SRC = path.resolve(root, process.env.ASSET_SRC || '.cache/assets-src');
const WORK = path.join(root, '.cache/assets-work'), OUT = path.join(root, 'public/assets/explorer');
const TIERS = ['desktop', 'phone'], check = process.argv.includes('--check');
// Budgets from the task list: downloads after first frame, and GPU memory once transcoded.
const BUDGET = { desktop: { bytes: 14e6, gpu: 160e6 }, phone: { bytes: 6e6, gpu: 64e6 } };
// Sun clamp: radiance above this many times the brightest non-sun sky texel counts as sun.
const SUN_CLAMP = 1.5;

const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel = file => path.relative(root, file);
const ktx = args => execFileSync(KTX, ['create', '--testrun', '--threads', '1', ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

// ── Originals ────────────────────────────────────────────────────────────────
function verifyOriginals() {
  const problems = [];
  const expect = (file, hash) => { const full = path.join(SRC, file); if (!fs.existsSync(full)) problems.push(`missing ${file}`); else if (sha256(full) !== hash) problems.push(`hash mismatch ${file}`); };
  for (const asset of [...manifest.materials, ...manifest.atlases]) {
    const dir = asset.source;
    if (asset.archive) {
      expect(`${dir}/${asset.archive.file}`, asset.archive.sha256);
      const unpacked = path.join(SRC, dir, asset.archive.file.replace(/\.zip$/, ''));
      if (!fs.existsSync(unpacked) && !problems.length) execFileSync('unzip', ['-oq', path.join(SRC, dir, asset.archive.file), '-d', unpacked]);
    }
    for (const f of Object.values(asset.files)) expect(`${dir}/${f.file}`, f.sha256);
  }
  for (const f of Object.values(manifest.sky.files)) expect(`polyhaven/${f.file}`, f.sha256);
  if (problems.length) throw new Error(`Originals do not match scripts/explorer-assets.json:\n  ${problems.join('\n  ')}`);
}
const source = (asset, map) => path.join(SRC, asset.source, asset.files[map].file);

// ── Pixels: libktx decodes, a minimal PNG writer re-encodes packed maps ──────
// Decodes a JPEG through ktx itself (uncompressed RGB8, no colour conversion) so packing uses the encoder's own decoder.
function decode(file) {
  const tmp = path.join(WORK, `decode-${path.basename(file)}.ktx2`);
  ktx(['--format', 'R8G8B8_UNORM', '--assign-tf', 'linear', '--assign-primaries', 'none', file, tmp]);
  const b = fs.readFileSync(tmp), width = b.readUInt32LE(20), height = b.readUInt32LE(24);
  const offset = Number(b.readBigUInt64LE(80)), length = Number(b.readBigUInt64LE(88));
  fs.rmSync(tmp); return { width, height, rgb: b.subarray(offset, offset + length) };
}
function png(file, width, height, channels, pixels) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body)); return Buffer.concat([len, body, crc]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = channels === 4 ? 6 : 2;
  const stride = width * channels, raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
  return file;
}
// ambientCG ships AO and roughness separately: pack them as ORM (metalness 0).
function packOrm(asset) {
  const out = path.join(WORK, `${asset.role}-orm.png`);
  const ao = decode(source(asset, 'ao')), rough = decode(source(asset, 'roughness')), n = ao.width * ao.height, px = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) { px[i * 3] = ao.rgb[i * 3]; px[i * 3 + 1] = rough.rgb[i * 3]; px[i * 3 + 2] = 0; }
  return png(out, ao.width, ao.height, 3, px);
}
// Leaf atlas: colour + opacity as RGBA. Colour is dilated from opaque texels into transparent ones so filtered
// mip levels do not pull the (dark) background into the leaf edges.
function packLeaves(asset) {
  const out = path.join(WORK, `${asset.role}.png`);
  const color = decode(source(asset, 'color')), alpha = decode(source(asset, 'opacity')), { width: w, height: h } = color, n = w * h;
  const rgb = Float32Array.from(color.rgb), known = new Uint8Array(n);
  for (let i = 0; i < n; i++) known[i] = alpha.rgb[i * 3] >= 128 ? 1 : 0;
  for (let pass = 0; pass < 24; pass++) {
    const next = known.slice(); let grown = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (known[i]) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (known[j]) { r += rgb[j * 3]; g += rgb[j * 3 + 1]; b += rgb[j * 3 + 2]; c++; } }
      if (c) { rgb[i * 3] = r / c; rgb[i * 3 + 1] = g / c; rgb[i * 3 + 2] = b / c; next[i] = 1; grown++; }
    }
    known.set(next); if (!grown) break;
  }
  const px = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) { px[i * 4] = Math.round(rgb[i * 3]); px[i * 4 + 1] = Math.round(rgb[i * 3 + 1]); px[i * 4 + 2] = Math.round(rgb[i * 3 + 2]); px[i * 4 + 3] = alpha.rgb[i * 3]; }
  return png(out, w, h, 4, px);
}

// ── Texture encodes ──────────────────────────────────────────────────────────
const mips = (size, wrap = 'wrap') => ['--width', String(size), '--height', String(size), '--generate-mipmap', '--mipmap-filter', 'lanczos4', '--mipmap-wrap', wrap];
const ENCODE = {
  color: (input, size, out) => ktx(['--format', 'R8G8B8_SRGB', '--encode', 'basis-lz', '--clevel', '2', '--qlevel', '160', ...mips(size), input, out]),
  orm: (input, size, out) => ktx(['--format', 'R8G8B8_UNORM', '--assign-tf', 'linear', '--encode', 'basis-lz', '--clevel', '2', '--qlevel', '160', ...mips(size), input, out]),
  normal: (input, size, out) => ktx(['--format', 'R8G8B8_UNORM', '--assign-tf', 'linear', '--normalize', '--encode', 'uastc', '--uastc-quality', '2', '--uastc-rdo', '--uastc-rdo-l', '.5', '--uastc-rdo-m', '--zstd', '20', ...mips(size), input, out]),
  rgba: (input, size, out) => ktx(['--format', 'R8G8B8A8_SRGB', '--encode', 'basis-lz', '--clevel', '2', '--qlevel', '192', ...mips(size, 'clamp'), input, out]),
};

// ── Sky: Radiance RGBE → sun analysis → clamped E5B9G9R9 ─────────────────────
function readHdr(file) {
  const b = fs.readFileSync(file); let p = 0; const line = () => { const s = p; while (b[p] !== 10) p++; return b.toString('latin1', s, p++); };
  if (!line().startsWith('#?')) throw new Error(`${file}: not a Radiance file`);
  for (let l = line(); l !== ''; l = line()) if (l.startsWith('FORMAT=') && l !== 'FORMAT=32-bit_rle_rgbe') throw new Error(`${file}: ${l}`);
  const [, height, , width] = line().split(' ').map((v, i) => i % 2 ? Number(v) : v);
  const rgb = new Float32Array(width * height * 3), row = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    if (b[p] !== 2 || b[p + 1] !== 2 || ((b[p + 2] << 8) | b[p + 3]) !== width) throw new Error(`${file}: only new-style RLE scanlines are supported`);
    p += 4;
    for (let c = 0; c < 4; c++) for (let x = 0; x < width;) { let n = b[p++]; if (n > 128) { n -= 128; const v = b[p++]; while (n--) row[(x++) * 4 + c] = v; } else while (n--) row[(x++) * 4 + c] = b[p++]; }
    for (let x = 0; x < width; x++) { const e = row[x * 4 + 3], f = e ? Math.pow(2, e - 136) : 0, i = (y * width + x) * 3; rgb[i] = row[x * 4] * f; rgb[i + 1] = row[x * 4 + 1] * f; rgb[i + 2] = row[x * 4 + 2] * f; }
  }
  return { width, height, rgb };
}
const luminance = (rgb, i) => .2126 * rgb[i] + .7152 * rgb[i + 1] + .0722 * rgb[i + 2];
// three's equirectangular convention (equirectUv): u = atan2(z, x) / 2π + .5, v = asin(y) / π + .5, v = 1 at the zenith.
const direction = (width, height, x, yTop) => { const phi = ((x + .5) / width - .5) * 2 * Math.PI, theta = (.5 - (yTop + .5) / height) * Math.PI; return [Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi)]; };
function analyseSky({ width, height, rgb }) {
  let peak = 0, at = 0;
  for (let i = 0; i < width * height; i++) { const l = luminance(rgb, i * 3); if (l > peak) { peak = l; at = i; } }
  // The sun disc: texels within 3° of the peak. The clamp level is the brightest sky texel outside 6°.
  const sun = direction(width, height, at % width, Math.floor(at / width)), angle = (x, y) => { const d = direction(width, height, x, y); return Math.acos(Math.min(1, d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2])); };
  let sky = 0; const texel = (x, y) => (2 * Math.PI / width) * (Math.PI / height) * Math.cos((.5 - (y + .5) / height) * Math.PI);
  for (let y = 0; y < height / 2; y++) for (let x = 0; x < width; x++) if (angle(x, y) > 6 * Math.PI / 180) sky = Math.max(sky, luminance(rgb, (y * width + x) * 3));
  const cap = sky * SUN_CLAMP, removed = [0, 0, 0], centroid = [0, 0, 0]; let upward = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3, l = luminance(rgb, i), dw = texel(x, y), d = direction(width, height, x, y);
    if (l > cap && angle(x, y) < 3 * Math.PI / 180) {
      const k = cap / l; for (let c = 0; c < 3; c++) { const excess = rgb[i + c] * (1 - k); removed[c] += excess * dw; rgb[i + c] *= k; }
      for (let c = 0; c < 3; c++) centroid[c] += d[c] * (l - cap) * dw;
    }
    if (d[1] > 0) upward += luminance(rgb, i) * d[1] * dw;
  }
  const len = Math.hypot(...centroid), dir = centroid.map(v => +(v / len).toFixed(5));
  return {
    direction: dir, elevationDeg: +(Math.asin(dir[1]) * 180 / Math.PI).toFixed(2), azimuthDeg: +(Math.atan2(dir[0], -dir[2]) * 180 / Math.PI).toFixed(2),
    // Irradiance the removed disc delivers on a surface facing the sun, and the clamped sky's irradiance on the ground, in the file's radiance units.
    sunIrradianceRGB: removed.map(v => +v.toFixed(4)), skyIrradianceUp: +upward.toFixed(4), peakLuminance: +peak.toFixed(1), clampLuminance: +cap.toFixed(3),
  };
}
function packE5B9G9R9({ width, height, rgb }) {
  const out = Buffer.alloc(width * height * 4), MAX = (511 / 512) * 2 ** 16;
  for (let yTop = 0; yTop < height; yTop++) for (let x = 0; x < width; x++) {
    const i = (yTop * width + x) * 3, o = ((height - 1 - yTop) * width + x) * 4; // bottom-up: GL t = 0 is the nadir row
    const [r, g, b] = [0, 1, 2].map(c => Math.min(Math.max(rgb[i + c], 0), MAX)), m = Math.max(r, g, b);
    let e = Math.max(-16, Math.floor(Math.log2(m || 2 ** -17))) + 16;
    if (Math.round(m / 2 ** (e - 24)) === 512) e++;
    const s = 2 ** (e - 24), word = (Math.round(r / s)) | (Math.round(g / s) << 9) | (Math.round(b / s) << 18) | (e << 27);
    out.writeUInt32LE(word >>> 0, o);
  }
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────
verifyOriginals();
console.log('Originals verified against scripts/explorer-assets.json');
if (check) process.exit(0);
fs.rmSync(WORK, { recursive: true, force: true }); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(WORK, { recursive: true });
const index = { schemaVersion: 1, generator: 'scripts/process-assets.mjs', sources: 'scripts/explorer-assets.json', tool: `KTX-Software ${manifest.tool.version}`, tiers: {}, materials: {}, atlases: {}, sky: null };
const outputs = [];
const emit = (tier, name, encode, input, size, asset, map) => {
  const file = path.join(OUT, tier, name); fs.mkdirSync(path.dirname(file), { recursive: true });
  encode(input, size, file); outputs.push({ tier, file, size, bpp: 1, asset, map });
  return `assets/explorer/${tier}/${name}`;
};
for (const m of manifest.materials) {
  index.materials[m.role] = { source: `${m.source}:${m.id}`, tileMeters: m.tileMeters, tiers: {} };
  for (const tier of TIERS) {
    const t = m.tiers[tier], maps = {};
    maps.color = emit(tier, `${m.role}-color.ktx2`, ENCODE.color, source(m, 'color'), t.color, m, 'color');
    maps.orm = emit(tier, `${m.role}-orm.ktx2`, ENCODE.orm, m.files.orm ? source(m, 'orm') : packOrm(m), t.orm, m, 'orm');
    if (t.normal) maps.normal = emit(tier, `${m.role}-normal.ktx2`, ENCODE.normal, source(m, 'normal'), t.normal, m, 'normal');
    index.materials[m.role].tiers[tier] = maps;
    console.log(tier, m.role, Object.keys(maps).join(' '));
  }
}
for (const a of manifest.atlases) {
  index.atlases[a.role] = { source: `${a.source}:${a.id}`, tiers: {} };
  for (const tier of TIERS) index.atlases[a.role].tiers[tier] = emit(tier, `${a.role}.ktx2`, ENCODE.rgba, packLeaves(a), a.tiers[tier].rgba, a, 'rgba');
  console.log('atlas', a.role);
}
index.sky = { source: `polyhaven:${manifest.sky.id}`, format: 'E5B9G9R9_UFLOAT_PACK32, zstd, rows bottom-up (t = 0 at the nadir), sun disc clamped', clampFactor: SUN_CLAMP, tiers: {} };
for (const tier of TIERS) {
  const hdr = readHdr(path.join(SRC, 'polyhaven', manifest.sky.files[manifest.sky.tiers[tier]].file)), sun = analyseSky(hdr);
  const raw = path.join(WORK, `sky-${tier}.raw`); fs.writeFileSync(raw, packE5B9G9R9(hdr));
  const file = path.join(OUT, tier, 'sky.ktx2');
  ktx(['--raw', '--width', String(hdr.width), '--height', String(hdr.height), '--format', 'E5B9G9R9_UFLOAT_PACK32', '--assign-tf', 'linear', '--assign-primaries', 'bt709', '--assign-texcoord-origin', 'bottom-left', '--zstd', '20', raw, file]);
  outputs.push({ tier, file, bytesPerTexel: 4, texels: hdr.width * hdr.height, asset: manifest.sky, map: 'sky', source: manifest.sky.tiers[tier], width: hdr.width });
  index.sky.tiers[tier] = { file: `assets/explorer/${tier}/sky.ktx2`, width: hdr.width, height: hdr.height, sun };
  console.log('sky', tier, JSON.stringify(sun));
}
// The Basis transcoder is not copied here (Task 12): KTX2Loader loads the copy Vite emits into dist/assets/ from its
// own new URL(…, import.meta.url), so one copy ships. Its bytes still count toward each tier's download budget.
const TRANSCODER = ['basis_transcoder.js', 'basis_transcoder.wasm'].map(f => path.join(root, 'node_modules/three/examples/jsm/libs/basis', f));
fs.rmSync(path.join(OUT, 'basis'), { recursive: true, force: true });

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
// Budgets: bytes on the wire (gzip is not assumed), and GPU memory once transcoded (1 byte per texel for BC7 / ASTC /
// ETC2 RGBA, a third more for mipmaps; the sky at 4 bytes per texel without mipmaps).
let failed = false;
for (const tier of TIERS) {
  // Every tier also fetches the manifest and the Basis transcoder.
  const shared = [path.join(OUT, 'index.json'), ...TRANSCODER].reduce((s, f) => s + (fs.existsSync(f) ? fs.statSync(f).size : 0), 0);
  const files = outputs.filter(o => o.tier === tier), bytes = shared + files.reduce((s, o) => s + fs.statSync(o.file).size, 0);
  const gpu = files.reduce((s, o) => s + (o.texels ? o.texels * o.bytesPerTexel : o.size * o.size * 4 / 3), 0);
  index.tiers[tier] = { files: files.length, bytes, gpuBytesEstimate: Math.round(gpu) };
  const ok = bytes <= BUDGET[tier].bytes && gpu <= BUDGET[tier].gpu; failed ||= !ok;
  console.log(`${tier}: ${files.length} files, ${(bytes / 1e6).toFixed(2)} MB (budget ${BUDGET[tier].bytes / 1e6}), GPU ≈ ${(gpu / 1e6).toFixed(1)} MB (budget ${BUDGET[tier].gpu / 1e6}) ${ok ? 'OK' : 'OVER BUDGET'}`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
syncProvenance();
const hashes = [...outputs.map(o => o.file), path.join(OUT, 'index.json')].map(f => `${sha256(f)}  ${rel(f)}`).sort((a, b) => a.slice(66).localeCompare(b.slice(66)));
fs.writeFileSync(path.join(WORK, 'outputs.sha256'), hashes.join('\n') + '\n');
console.log(`Output hashes: ${rel(path.join(WORK, 'outputs.sha256'))}`);
if (failed) process.exit(1);

// ── Provenance: one inventory entry per shipped file ─────────────────────────
function syncProvenance() {
  const inputId = a => `CC0-${a.source === 'polyhaven' ? 'PH' : 'ACG'}-${a.id.toUpperCase().replaceAll('_', '-')}`;
  const originalSize = a => a.source === 'ambientcg' && /_1K-JPG/.test(a.archive?.file) ? 1024 : 2048;
  const tool = `KTX-Software ${manifest.tool.version} via scripts/process-assets.mjs`;
  const how = (o) => {
    const a = o.asset, from = originalSize(a), resample = o.size === from ? `${o.size}² (source size)` : `resampled ${from}² → ${o.size}² (lanczos4)`;
    switch (o.map) {
      case 'color': return `Colour map: ${resample}, wrap-around mipmaps, ETC1S/BasisLZ sRGB (${tool}).`;
      case 'orm': return a.files.orm ? `ARM map (R occlusion, G roughness, B metalness): ${resample}, wrap-around mipmaps, ETC1S/BasisLZ linear (${tool}).`
        : `AmbientOcclusion → R and Roughness → G packed with metalness 0 in B (glTF ORM); ${resample}, wrap-around mipmaps, ETC1S/BasisLZ linear (${tool}).`;
      case 'normal': return `OpenGL (+Y) normal map renormalised; ${resample}, wrap-around mipmaps, UASTC with RDO (lambda 0.5) and zstd 20, linear (${tool}).`;
      case 'rgba': return `Colour and Opacity packed as RGBA; colour dilated from opaque texels into transparent ones; ${resample}, clamped mipmaps, ETC1S/BasisLZ sRGB (${tool}).`;
      case 'sky': return `Radiance RGBE (${o.source}) decoded; texels within 3° of the sun brighter than ${SUN_CLAMP}× the brightest other sky texel clamped (sun direction and energy recorded in index.json); repacked as E5B9G9R9 float with rows bottom-up, zstd 20 (${tool}).`;
    }
  };
  const originals = (a, map) => Object.fromEntries(Object.entries(a.files).filter(([k]) => map === 'rgba' || (map === 'orm' && !a.files.orm ? k === 'ao' || k === 'roughness' : k === map)).map(([, f]) => [f.file, f.sha256]));
  const entries = outputs.map(o => {
    const a = o.asset, orig = o.map === 'sky' ? { [a.files[o.source].file]: a.files[o.source].sha256 } : originals(a, o.map);
    return {
      path: rel(o.file), kind: 'texture-asset', origin: 'third-party', license: 'CC0-1.0', source_ids: [inputId(a), 'KTX-SOFTWARE'],
      author: a.authors.join(', '), source_url: a.page, license_page: a.licensePage, sha256: sha256(o.file), original_sha256: orig,
      modifications: how(o), attribution: `"${a.name}" ${a.source === 'polyhaven' ? `by ${a.authors.join(', ')}, Poly Haven` : 'from ambientCG'} (${a.page}), CC0 1.0. No attribution required; credited in public/credits.html.`,
      redistribution: 'Permitted: CC0 1.0 public-domain dedication. Shipped as a processed derivative; the originals stay out of the repository.',
    };
  });
  entries.push({ path: rel(path.join(OUT, 'index.json')), kind: 'generated-metadata', origin: 'original', license: 'UNLICENSED', source_ids: ['TASK-BRIEF', 'DESIGN-BRIEF'], sha256: sha256(path.join(OUT, 'index.json')),
    notes: 'Generated by scripts/process-assets.mjs: shipped file list per quality tier, real-world tile sizes, byte and GPU-memory totals, and the sky sun analysis. Describes the CC0 derivatives; contains no third-party content.' });
  const file = path.join(root, 'provenance/inventory.json'), inventory = JSON.parse(fs.readFileSync(file, 'utf8')), prefix = rel(OUT) + '/';
  inventory.files = [...inventory.files.filter(e => !e.path.startsWith(prefix)), ...entries].sort((x, y) => x.path < y.path ? -1 : x.path > y.path ? 1 : 0);
  // Same layout as the Python tooling writes (indent 2, non-ASCII escaped), so reruns produce no unrelated diff.
  fs.writeFileSync(file, JSON.stringify(inventory, null, 2).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`) + '\n');
  console.log(`provenance/inventory.json: ${entries.length} entries under ${prefix}`);
}
