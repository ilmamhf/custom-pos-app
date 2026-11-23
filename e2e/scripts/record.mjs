import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const slowMo = process.env.E2E_SLOWMO ?? '250';

function run(command, args, env = process.env) {
  console.log(`[record] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
}

run('node', ['scripts/setup-db.mjs']);
run('npx', ['playwright', 'test'], {
  ...process.env,
  E2E_SLOWMO: slowMo,
});
run('node', ['scripts/export-videos.mjs']);

console.log(`[record] done (slowMo=${slowMo}ms)`);
