import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const resultsDir = path.join(root, 'test-results');
const outDir = path.join(root, 'videos');

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function findPlaywrightFfmpeg() {
  const base =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
      : path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
  if (!existsSync(base)) return undefined;
  const candidates = walk(base).filter((file) =>
    process.platform === 'win32'
      ? /ffmpeg.*\.exe$/i.test(path.basename(file))
      : /\/ffmpeg$/i.test(file)
  );
  return candidates.sort().at(-1);
}

function findFfmpeg() {
  const candidates = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  // Optional local install: `npm i --no-save ffmpeg-static`.
  candidates.push(
    path.join(
      root,
      'node_modules',
      'ffmpeg-static',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    )
  );
  candidates.push('ffmpeg');
  const bundled = findPlaywrightFfmpeg();
  if (bundled) candidates.push(bundled);

  for (const candidate of candidates) {
    if (candidate !== 'ffmpeg' && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['-version'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  return undefined;
}

function supportsH264(ffmpeg) {
  const probe = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], {
    encoding: 'utf8',
  });
  return probe.status === 0 && /libx264/.test(probe.stdout ?? '');
}

function slugFor(file) {
  const dir = path.basename(path.dirname(file));
  return dir.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

const videos = walk(resultsDir).filter((file) => path.basename(file) === 'video.webm');
if (videos.length === 0) {
  console.log('No videos found. Run the Playwright suite first (npm test).');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const wantMp4 = process.argv.includes('--mp4');
const ffmpeg = findFfmpeg();
const canMp4 = wantMp4 && ffmpeg ? supportsH264(ffmpeg) : false;

if (wantMp4) {
  console.log(
    ffmpeg
      ? `Using ffmpeg: ${ffmpeg}${canMp4 ? '' : ' (no libx264; MP4 skipped)'}`
      : 'No ffmpeg found; MP4 skipped'
  );
} else {
  console.log('Exporting WebM only (pass --mp4 to also transcode H.264)');
}

const used = new Set();
let exported = 0;
for (const video of videos) {
  const baseSlug = slugFor(video) || 'video';
  let slug = baseSlug;
  let i = 2;
  while (used.has(slug)) slug = `${baseSlug}-${i++}`;
  used.add(slug);

  const webmOut = path.join(outDir, `${slug}.webm`);
  copyFileSync(video, webmOut);
  console.log(`[webm] ${webmOut}`);

  if (canMp4) {
    const mp4Out = path.join(outDir, `${slug}.mp4`);
    const result = spawnSync(
      ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        video,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        mp4Out,
      ],
      { stdio: 'inherit' }
    );
    if (result.status === 0) {
      console.log(`[mp4]  ${mp4Out}`);
      exported++;
    } else {
      console.warn(`[mp4]  failed for ${slug}`);
    }
  }
}

console.log(
  `Exported ${videos.length} recording(s) to ${outDir}` +
    (canMp4 ? ` (${exported} MP4).` : ' as WebM.')
);