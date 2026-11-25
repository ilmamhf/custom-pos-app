#!/usr/bin/env node
/**
 * Local CI runner — canonical entry point for `node scripts/ci.mjs <target>`
 *
 * Targets:
 *   ci                  Run all validation (default)
 *   api                 API: lint-free typecheck, unit, e2e
 *   react               React Admin: typecheck, test, build
 *   flutter             Flutter POS: analyze, test, web build
 *   containers          Container images: build + smoke test
 *   backup              Backups: encrypted backup + restore drill
 *   monitoring          Monitoring: Prometheus config + alert rules
 *   dependency-audit    Dependency audit (blocking)
 *   e2e-admin           React Admin E2E (Playwright)
 *   e2e-pos             Flutter POS E2E (legacy flutter drive)
 *   e2e-patrol          Flutter POS Patrol Web
 *
 * Environment:
 *   SKIP_CONTAINER_TESTS=1  Skip container/backup targets (Windows default)
 *   SKIP_PATROL=1           Skip Patrol Web (CI-only, no local ChromeDriver)
 *   SKIP_POS=1              Skip POS legacy (no ChromeDriver)
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IS_WINDOWS = process.platform === 'win32';

const TARGETS = [
  'ci',
  'api',
  'react',
  'flutter',
  'containers',
  'backup',
  'monitoring',
  'dependency-audit',
  'e2e-admin',
  'e2e-pos',
  'e2e-patrol',
];

function run(cmd, args, opts = {}) {
  const fullCmd = IS_WINDOWS ? 'cmd.exe' : cmd;
  const fullArgs = IS_WINDOWS ? ['/c', cmd, ...args] : args;
  const result = spawnSync(fullCmd, fullArgs, {
    cwd: opts.cwd ?? ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...opts.env },
    shell: IS_WINDOWS,
  });
  if (result.status !== 0) {
    console.error(`\n❌ Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
  return result;
}

function skip(msg) {
  console.log(`\n⏭️  SKIP: ${msg}`);
}

function section(name) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`'='.repeat(60)}`);
}

function checkDocker() {
  try {
    const result = spawnSync('docker', ['version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

function checkFlutter() {
  try {
    const result = spawnSync('flutter', ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

// ===== Target implementations =====

function targetApi() {
  section('API: lint-free typecheck, unit, e2e');
  const apiDir = resolve(ROOT, 'apps/api-nestjs');
  run('npm', ['ci'], { cwd: apiDir });
  run('npx', ['prisma', 'generate'], { cwd: apiDir });
  run('npx', ['prisma', 'validate'], { cwd: apiDir });
  run('npx', ['prisma', 'migrate', 'deploy'], { cwd: apiDir });
  run('npm', ['run', 'prisma:seed'], { cwd: apiDir });
  run('npm', ['run', 'build'], { cwd: apiDir });
  run('npm', ['test', '--', '--runInBand'], { cwd: apiDir });
  run('npm', ['run', 'test:e2e'], { cwd: apiDir });
}

function targetReact() {
  section('React Admin: typecheck, test, build');
  const reactDir = resolve(ROOT, 'apps/admin-react');
  run('npm', ['ci'], { cwd: reactDir });
  run('npm', ['run', 'typecheck'], { cwd: reactDir });
  run('npm', ['test'], { cwd: reactDir });
  run('npm', ['run', 'build'], { cwd: reactDir });
}

function targetFlutter() {
  section('Flutter POS: analyze, test, web build');
  if (!checkFlutter()) {
    skip('Flutter not installed');
    return;
  }
  const flutterDir = resolve(ROOT, 'apps/pos-flutter');
  run('flutter', ['pub', 'get'], { cwd: flutterDir });
  run('flutter', ['analyze', '--no-pub', '--no-fatal-infos'], { cwd: flutterDir });
  run('flutter', ['test'], { cwd: flutterDir });
  run('flutter', ['build', 'web', '--dart-define=API_BASE_URL=http://localhost:3000/api/v1'], { cwd: flutterDir });
}

function targetContainers() {
  section('Container images: build + smoke test');
  if (!checkDocker()) {
    skip('Docker not available');
    return;
  }
  if (process.env.SKIP_CONTAINER_TESTS === '1') {
    skip('SKIP_CONTAINER_TESTS=1 set');
    return;
  }
  // Build API image
  run('docker', ['build', '-t', 'pos-api:ci', '-f', 'apps/api-nestjs/Dockerfile', 'apps/api-nestjs'], { cwd: ROOT });
  // Build Admin image
  run('docker', ['build', '-t', 'pos-admin:ci', '-f', 'apps/admin-react/Dockerfile', 'apps/admin-react'], { cwd: ROOT });
  // Apply migrations with API image
  run('docker', ['run', '--rm', '--network', 'host', '-e', 'DATABASE_URL=postgresql://pos:pos@localhost:5432/pos?schema=public', 'pos-api:ci', 'npx', 'prisma', 'migrate', 'deploy'], { cwd: ROOT });
  // Start API and wait for readiness
  run('docker', ['run', '-d', '--name', 'pos-api-ci', '--network', 'host',
    '-e', 'DATABASE_URL=postgresql://pos:pos@localhost:5432/pos?schema=public',
    '-e', 'JWT_ACCESS_SECRET=ci-access-secret-at-least-32-characters-long',
    '-e', 'JWT_REFRESH_SECRET=ci-refresh-secret-at-least-32-characters-long',
    '-e', 'CORS_ORIGIN=https://admin.example.com',
    '-e', 'NODE_ENV=production', 'pos-api:ci'], { cwd: ROOT });
  // Wait for readiness
  for (let i = 1; i <= 30; i++) {
    const result = spawnSync('curl', ['-fsS', 'http://127.0.0.1:3000/api/v1/health/ready'], { stdio: 'ignore' });
    if (result.status === 0) break;
    if (i === 30) { run('docker', ['logs', 'pos-api-ci']); process.exit(1); }
    spawnSync('sleep', ['2'], { stdio: 'ignore' });
  }
  // Start Admin and check SPA + API proxy
  run('docker', ['run', '-d', '--name', 'pos-admin-ci', '--network', 'host', '--add-host', 'api:127.0.0.1', 'pos-admin:ci'], { cwd: ROOT });
  for (let i = 1; i <= 15; i++) {
    const result = spawnSync('curl', ['-fsS', 'http://127.0.0.1:8080/'], { stdio: 'ignore' });
    if (result.status === 0) break;
    if (i === 15) { run('docker', ['logs', 'pos-admin-ci']); process.exit(1); }
    spawnSync('sleep', ['2'], { stdio: 'ignore' });
  }
  run('curl', ['-fsS', 'http://127.0.0.1:8080/', '|', 'grep', '-q', '<div id="root">'], { cwd: ROOT, shell: true });
  run('curl', ['-fsS', 'http://127.0.0.1:8080/api/v1/health'], { cwd: ROOT });
  // Check Prometheus scrape endpoint
  run('curl', ['-fsS', 'http://127.0.0.1:3000/metrics', '|', 'grep', '-q', 'pos_http_requests_total'], { cwd: ROOT, shell: true });
  run('curl', ['-fsS', 'http://127.0.0.1:3000/metrics', '|', 'grep', '-q', 'pos_readiness_up 1'], { cwd: ROOT, shell: true });
  // Ensure metrics not under /api/v1
  const metricsCheck = spawnSync('curl', ['-fsS', 'http://127.0.0.1:3000/api/v1/metrics'], { stdio: 'ignore' });
  if (metricsCheck.status === 0) {
    console.error('the metrics endpoint must not be exposed under /api/v1');
    process.exit(1);
  }
  // Container logs (always)
  run('docker', ['logs', 'pos-api-ci'], { cwd: ROOT });
  run('docker', ['logs', 'pos-admin-ci'], { cwd: ROOT });
  // Cleanup
  run('docker', ['rm', '-f', 'pos-api-ci', 'pos-admin-ci'], { cwd: ROOT });
}

function targetBackup() {
  section('Backups: encrypted backup + restore drill');
  if (!checkDocker()) {
    skip('Docker not available');
    return;
  }
  if (process.env.SKIP_CONTAINER_TESTS === '1') {
    skip('SKIP_CONTAINER_TESTS=1 set');
    return;
  }
  const backupDir = resolve(ROOT, 'deploy/backup');
  // Build backup image
  run('docker', ['build', '-t', 'pos-backup:ci', '-f', 'Dockerfile', '.'], { cwd: backupDir });
  // Generate age keypair (run as root via --entrypoint sh)
  run('docker', ['run', '--rm', '--entrypoint', 'sh', 'pos-backup:ci', '-c', 'test -x /usr/local/bin/age-keygen.sh'], { cwd: ROOT });
  run('docker', ['run', '--rm', '--entrypoint', 'sh',
    '-e', 'RECIPIENT_FILE=/keys/age-recipient.txt',
    '-e', 'IDENTITY_FILE=/keys/age-identity.txt',
    '-v', `${backupDir}:/keys`,
    'pos-backup:ci', '/usr/local/bin/age-keygen.sh'], { cwd: ROOT });
  // Verify keys generated
  if (!existsSync(resolve(backupDir, 'age-recipient.txt')) || !readFileSync(resolve(backupDir, 'age-recipient.txt'), 'utf8').match(/^age1/)) {
    console.error('age-recipient.txt missing or invalid');
    process.exit(1);
  }
  if (!existsSync(resolve(backupDir, 'age-identity.txt')) || readFileSync(resolve(backupDir, 'age-identity.txt'), 'utf8').trim() === '') {
    console.error('age-identity.txt missing or empty');
    process.exit(1);
  }
  // Start PostgreSQL with WAL archiving
  run('docker', ['volume', 'create', 'pos-ci-wal'], { cwd: ROOT });
  run('docker', ['volume', 'create', 'pos-ci-backups'], { cwd: ROOT });
  run('docker', ['volume', 'create', 'pos-ci-textfile'], { cwd: ROOT });
  run('docker', ['run', '--rm', '-v', 'pos-ci-textfile:/data', 'alpine', 'sh', '-c', 'mkdir -p /data && chown -R 999:999 /data'], { cwd: ROOT });
  run('docker', ['run', '-d', '--name', 'pos-pg-ci', '--network', 'host',
    '-e', 'POSTGRES_USER=pos', '-e', 'POSTGRES_PASSWORD=pos', '-e', 'POSTGRES_DB=pos',
    '-e', 'BACKUP_AGE_RECIPIENT_FILE=/etc/backup/age-recipient.txt',
    '-v', 'pos-ci-wal:/wal-archive',
    '-v', `${backupDir}/age-recipient.txt:/etc/backup/age-recipient.txt:ro`,
    '-v', `${backupDir}/pg_hba.conf:/etc/postgresql/pg_hba.conf:ro`,
    'pos-backup:ci', 'postgres',
    '-c', 'archive_mode=on',
    '-c', 'archive_command=/usr/local/bin/archive-wal.sh "%p" "%f"',
    '-c', 'archive_timeout=300',
    '-c', 'hba_file=/etc/postgresql/pg_hba.conf'], { cwd: ROOT });
  for (let i = 1; i <= 30; i++) {
    const result = spawnSync('docker', ['exec', 'pos-pg-ci', 'pg_isready', '-U', 'pos', '-d', 'pos'], { stdio: 'ignore' });
    if (result.status === 0) break;
    if (i === 30) { run('docker', ['logs', 'pos-pg-ci']); process.exit(1); }
    spawnSync('sleep', ['2'], { stdio: 'ignore' });
  }
  // Build API image and apply migrations
  run('docker', ['build', '-t', 'pos-api:ci', '-f', 'apps/api-nestjs/Dockerfile', 'apps/api-nestjs'], { cwd: ROOT });
  run('docker', ['run', '--rm', '--network', 'host',
    '-e', 'DATABASE_URL=postgresql://pos:pos@127.0.0.1:5432/pos?schema=public',
    'pos-api:ci', 'npx', 'prisma', 'migrate', 'deploy'], { cwd: ROOT });
  run('docker', ['run', '--rm', '--network', 'host',
    '-e', 'DATABASE_URL=postgresql://pos:pos@127.0.0.1:5432/pos?schema=public',
    'pos-api:ci', 'npm', 'run', 'prisma:seed'], { cwd: ROOT });
  // Take encrypted backup
  run('docker', ['run', '--rm', '--network', 'host',
    '-e', 'PGHOST=127.0.0.1', '-e', 'PGPORT=5432', '-e', 'PGUSER=pos', '-e', 'PGPASSWORD=pos', '-e', 'PGDATABASE=pos',
    '-e', 'BACKUP_AGE_RECIPIENT_FILE=/etc/backup/age-recipient.txt',
    '-e', 'PROMETHEUS_TEXTFILE_DIR=/var/lib/node_exporter/textfile_collector',
    '-v', 'pos-ci-backups:/backups',
    '-v', 'pos-ci-wal:/wal-archive',
    '-v', 'pos-ci-textfile:/var/lib/node_exporter/textfile_collector',
    '-v', `${backupDir}/age-recipient.txt:/etc/backup/age-recipient.txt:ro`,
    '--entrypoint', '/usr/local/bin/pos-entrypoint.sh',
    'pos-backup:ci', '/usr/local/bin/backup.sh'], { cwd: ROOT });
  // Check backup (pre-drill contract: VERIFY_EXPECT_DRILL=false)
  run('docker', ['run', '--rm',
    '-e', 'PROMETHEUS_TEXTFILE_DIR=/var/lib/node_exporter/textfile_collector',
    '-e', 'VERIFY_EXPECT_DRILL=false',
    '-v', 'pos-ci-backups:/backups',
    '-v', 'pos-ci-textfile:/var/lib/node_exporter/textfile_collector',
    '--entrypoint', '/usr/local/bin/pos-entrypoint.sh',
    'pos-backup:ci', '/usr/local/bin/verify-backup.sh'], { cwd: ROOT });
  // Run restore drill
  run('docker', ['volume', 'create', 'pos-ci-drill'], { cwd: ROOT });
  run('docker', ['run', '--rm', '--network', 'host',
    '-e', 'PGUSER=pos', '-e', 'PGPASSWORD=pos', '-e', 'PGDATABASE=pos',
    '-e', 'BACKUP_AGE_IDENTITY=/run/secrets/backup-age-identity',
    '-e', 'DRILL_PORT=55432',
    '-e', 'DRILL_REPORT_DIR=/drill',
    '-e', 'PROMETHEUS_TEXTFILE_DIR=/var/lib/node_exporter/textfile_collector',
    '-v', 'pos-ci-backups:/backups',
    '-v', 'pos-ci-wal:/wal-archive',
    '-v', 'pos-ci-textfile:/var/lib/node_exporter/textfile_collector',
    '-v', 'pos-ci-drill:/drill',
    '-v', `${backupDir}/age-identity.txt:/run/secrets/backup-age-identity:ro`,
    '--entrypoint', '/usr/local/bin/pos-entrypoint.sh',
    'pos-backup:ci', '/usr/local/bin/restore-drill.sh'], { cwd: ROOT });
  // Check drill report (post-drill contract: VERIFY_EXPECT_DRILL=true)
  run('docker', ['run', '--rm',
    '-e', 'PROMETHEUS_TEXTFILE_DIR=/var/lib/node_exporter/textfile_collector',
    '-e', 'VERIFY_EXPECT_DRILL=true',
    '-e', 'DRILL_REPORT_DIR=/drill',
    '-v', 'pos-ci-backups:/backups',
    '-v', 'pos-ci-textfile:/var/lib/node_exporter/textfile_collector',
    '-v', 'pos-ci-drill:/drill',
    '--entrypoint', '/usr/local/bin/pos-entrypoint.sh',
    'pos-backup:ci', '/usr/local/bin/verify-backup.sh'], { cwd: ROOT });
  // Container logs (always)
  run('docker', ['logs', 'pos-pg-ci'], { cwd: ROOT });
  // Cleanup volumes
  run('docker', ['volume', 'rm', 'pos-ci-wal', 'pos-ci-backups', 'pos-ci-textfile', 'pos-ci-drill'], { cwd: ROOT });
}

function targetMonitoring() {
  section('Monitoring: Prometheus config + alert rules');
  if (!checkDocker()) {
    skip('Docker not available');
    return;
  }
  const monitorDir = resolve(ROOT, 'deploy/monitoring');
  // Validate Prometheus config
  run('docker', ['run', '--rm', '--entrypoint', 'promtool',
    '-v', `${monitorDir}/prometheus.yml:/etc/prometheus/prometheus.yml:ro`,
    '-v', `${monitorDir}/prometheus-rules.yaml:/etc/prometheus/rules/prometheus-rules.yaml:ro`,
    'prom/prometheus:v3.5.0', 'check', 'config', '/etc/prometheus/prometheus.yml'], { cwd: ROOT });
  // Run alert rule unit tests
  run('docker', ['run', '--rm', '--entrypoint', 'promtool',
    '-v', `${monitorDir}:/etc/prometheus:ro`,
    'prom/prometheus:v3.5.0', 'test', 'rules', '/etc/prometheus/prometheus-rules.test.yaml'], { cwd: ROOT });
  // Validate Kubernetes manifests (requires Python + PyYAML)
  try {
    run('pip', ['install', '--quiet', 'pyyaml'], { cwd: ROOT });
    run('python', ['.github/scripts/validate-k8s.py'], { cwd: ROOT });
  } catch {
    skip('Python/PyYAML not available for K8s validation');
  }
}

function targetDependencyAudit() {
  section('Dependency audit (blocking)');
  const apiDir = resolve(ROOT, 'apps/api-nestjs');
  const reactDir = resolve(ROOT, 'apps/admin-react');
  run('npm', ['audit', '--omit=dev'], { cwd: apiDir });
  run('npm', ['audit', '--omit=dev'], { cwd: reactDir });
}

function targetE2eAdmin() {
  section('React Admin E2E (Playwright)');
  const e2eDir = resolve(ROOT, 'e2e');
  const apiDir = resolve(ROOT, 'apps/api-nestjs');
  const reactDir = resolve(ROOT, 'apps/admin-react');
  run('npm', ['ci'], { cwd: apiDir });
  run('npx', ['prisma', 'generate'], { cwd: apiDir });
  run('npm', ['ci'], { cwd: reactDir });
  run('npm', ['ci', '--include=dev'], { cwd: e2eDir });
  run('npx', ['playwright', 'install', '--with-deps', 'chromium'], { cwd: e2eDir });
  run('npm', ['test'], { cwd: e2eDir });
}

function targetE2ePos() {
  section('Flutter POS E2E (legacy flutter drive)');
  if (!checkFlutter()) {
    skip('Flutter not installed');
    return;
  }
  if (process.env.SKIP_POS === '1') {
    skip('SKIP_POS=1 set');
    return;
  }
  // This requires chromedriver and a running API - typically CI-only
  skip('CI-only target (requires chromedriver + API on port 3100)');
}

function targetE2ePatrol() {
  section('Flutter POS Patrol Web');
  if (!checkFlutter()) {
    skip('Flutter not installed');
    return;
  }
  if (process.env.SKIP_PATROL === '1') {
    skip('SKIP_PATROL=1 set (CI-only, no local ChromeDriver)');
    return;
  }
  // This requires Patrol CLI and Playwright - typically CI-only
  skip('CI-only target (requires Patrol CLI + Playwright Chromium)');
}

// ===== Main =====

async function main() {
  const target = process.argv[2] ?? 'ci';
  if (!TARGETS.includes(target)) {
    console.error(`Unknown target: ${target}`);
    console.error(`Available targets: ${TARGETS.join(', ')}`);
    process.exit(1);
  }

  console.log(`🚀 Running CI target: ${target}`);

  switch (target) {
    case 'ci':
      // Full validation suite (in dependency order)
      targetDependencyAudit();
      targetApi();
      targetReact();
      targetFlutter();
      targetMonitoring();
      targetContainers();
      targetBackup();
      targetE2eAdmin();
      targetE2ePos();
      targetE2ePatrol();
      break;
    case 'api': targetApi(); break;
    case 'react': targetReact(); break;
    case 'flutter': targetFlutter(); break;
    case 'containers': targetContainers(); break;
    case 'backup': targetBackup(); break;
    case 'monitoring': targetMonitoring(); break;
    case 'dependency-audit': targetDependencyAudit(); break;
    case 'e2e-admin': targetE2eAdmin(); break;
    case 'e2e-pos': targetE2ePos(); break;
    case 'e2e-patrol': targetE2ePatrol(); break;
  }

  console.log(`\n✅ Target "${target}" completed successfully`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});