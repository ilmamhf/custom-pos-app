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
const outDir = path.join(root, 'patrol_videos');
const wantMp4 = process.argv.includes('--mp4');

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

const inputs = [
  path.join(root, 'playwright-report', 'data'),
  path.join(root, 'test-results'),
];

const videos = inputs
  .flatMap((dir) => walk(dir))
  .filter((file) => file.toLowerCase().endsWith('.webm'));

if (videos.length === 0) {
  console.log('No Patrol videos found. Run `patrol test --web-video=on` first.');
  process.exit(0);
}

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    'ffmpeg',
    path.join(
      root,
      '..',
      '..',
      'e2e',
      'node_modules',
      'ffmpeg-static',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    ),
  ].filter(Boolean);

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

mkdirSync(outDir, { recursive: true });
const ffmpeg = wantMp4 ? findFfmpeg() : undefined;
const canMp4 = ffmpeg ? supportsH264(ffmpeg) : false;

if (wantMp4) {
  console.log(
    ffmpeg
      ? `Using ffmpeg: ${ffmpeg}${canMp4 ? '' : ' (no libx264; MP4 skipped)'}`
      : 'No ffmpeg found; MP4 skipped'
  );
}

videos.sort();
let mp4Count = 0;
videos.forEach((video, index) => {
  const slug = `video-${index + 1}`;
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
      mp4Count++;
      console.log(`[mp4]  ${mp4Out}`);
    }
  }
});

console.log(
  `Exported ${videos.length} Patrol recording(s) to ${outDir}` +
    (canMp4 ? ` (${mp4Count} MP4).` : ' as WebM.')
);
