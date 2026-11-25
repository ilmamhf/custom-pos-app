# Backups and restore drills

Encrypted PostgreSQL backups with a point-in-time recovery archive, and a
restore drill that proves the backups are readable.

| File | Purpose |
|---|---|
| `Dockerfile` | The PostgreSQL 16 image with `age`. It serves the database, the backup job, and the drill, so the tool and the server always speak the same major version |
| `backup.sh` | Takes the encrypted base backup, verifies it, and prunes the old ones |
| `archive-wal.sh` | The PostgreSQL `archive_command`: archives one WAL segment, encrypted |
| `restore-wal.sh` | The PostgreSQL `restore_command`: decrypts one archived WAL segment |
| `restore-drill.sh` | Restores the newest backup into a scratch instance, verifies it, and measures the RTO |
| `verify-backup.sh` | Checks the encrypted artifacts, the metadata, and the metrics |
| `lib.sh` | The shared helpers |
| `age-keygen.sh` | Generates the age keypair |
| `age-recipient.txt` | The public recipient. It is committed: it is not a secret |
| `age-identity.txt` | The private identity. It is git-ignored and must live in the secret store |
| `pg_hba.conf` | The client authentication rules of the container |

## What is protected, and how

The backup is a `pg_basebackup` in the tar format: a physical copy of the
data directory. It is encrypted with [age](https://age-encryption.org) before
it leaves the job.

The encryption uses an asymmetric keypair:

- The **public recipient** encrypts. The backup job and the database server
  only need it.
- The **private identity** decrypts. Only the restore drill gets it, and only
  for the length of the drill.

A backup that is only readable by the machine that wrote it is not a backup.
The private identity belongs in the operator's secret store, not in this
repository.

On top of the daily base backup, PostgreSQL archives every completed WAL
segment (`archive_mode=on`, `archive_timeout=300`). The archive is what
allows a restore to roll forward to any point in time, which is where the RPO
of 15 minutes comes from. A `pg_dump` alone could not do that.

## The targets

| Target | Value | Where it comes from |
|---|---|---|
| RPO | 15 minutes | The WAL archive closes the gap between two base backups |
| RTO | Under 1 hour | The measured drill takes seconds on the reference data set |
| Retention | 14 days / 14 backups | `BACKUP_RETENTION_DAYS` and `BACKUP_RETENTION_COUNT` |
| Drill frequency | Quarterly | The operations runbook asks for it |

## The keypair

The committed recipient was generated with the command below. To make your
own:

```bash
# Build the image first: the script runs from the image, never from a mount.
docker build -t pos-backup:latest -f deploy/backup/Dockerfile deploy/backup
docker run --rm \
  -e RECIPIENT_FILE=/keys/age-recipient.txt \
  -e IDENTITY_FILE=/keys/age-identity.txt \
  -v "$(pwd)/deploy/backup:/keys" \
  pos-backup:latest /usr/local/bin/age-keygen.sh
```

The script writes the public key to `age-recipient.txt` and the private key
to `age-identity.txt`. Move the private key into your secret store right
away:

```bash
# The identity is the file age-keygen wrote.
kubectl create secret generic pos-backup-age -n pos \
  --from-literal=recipient="$(cat deploy/backup/age-recipient.txt)" \
  --from-file=identity=deploy/backup/age-identity.txt
```

The Kubernetes manifest `deploy/k8s/71-restore-drill-cronjob.yaml` declares
the same Secret with placeholder values.

## Running it with Compose

The PostgreSQL container runs the backup image with the WAL archiving
enabled. The backup job and the drill live in the `backup` profile.

```bash
# The database (the WAL archive starts filling up right away)
docker compose up -d postgres

# The encrypted base backup
docker compose --profile backup run --rm backup

# The restore drill
docker compose --profile backup run --rm restore-drill
```

The drill writes its report to the `pos-drill-report` volume:

```bash
docker compose --profile backup run --rm --entrypoint cat restore-drill /drill/report.json
```

```json
{
  "status": "passed",
  "backup": "base-20261124T052332Z",
  "recovery_target_lsn": "0/22000100",
  "started_at": "2026-11-24T05:25:03Z",
  "finished_at": "2026-11-24T05:25:07Z",
  "rto_seconds": 4,
  "tables": 18,
  "stores": 2,
  "products": 25,
  "sales": 23,
  "tenders": 21,
  "archived_wal_segments": 34,
  "archived_wal_records_checked": 3
}
```

`verify-backup.sh` checks what can be checked without the private key: the
newest backup is an age file, its metadata is complete, the stored file
matches its checksum, and the metrics were published.

Right after the backup the drill has not run yet, so the verifier only expects
the backup timestamp. After the drill, run it with `VERIFY_EXPECT_DRILL=true`
so the drill metric and the drill report are required too:

```bash
docker run --rm \
  -e PROMETHEUS_TEXTFILE_DIR=/var/lib/node_exporter/textfile_collector \
  -e VERIFY_EXPECT_DRILL=true \
  -e DRILL_REPORT_DIR=/drill \
  -v pos_pos-backups:/backups \
  -v pos_pos-prometheus-textfile:/var/lib/node_exporter/textfile_collector \
  -v pos_pos-drill:/drill \
  --entrypoint /usr/local/bin/pos-entrypoint.sh \
  pos-backup:latest /usr/local/bin/verify-backup.sh
```

## Running it with Kubernetes

Two CronJobs:

| CronJob | Schedule | What it does |
|---|---|---|
| `pos-backup` | Daily at 01:17 UTC | The encrypted base backup |
| `pos-restore-drill` | The first day of January, April, July, and October at 02:23 UTC | The restore drill |

```bash
kubectl apply -f deploy/k8s/70-backup-cronjob.yaml
kubectl apply -f deploy/k8s/71-restore-drill-cronjob.yaml
```

Before applying the drill, fill in the `pos-backup-age` Secret with the
real recipient and the real private identity. The committed manifest carries
placeholders on purpose.

The manifests assume:

- a PostgreSQL server reachable at `postgres:5432` with a role that has the
  `REPLICATION` attribute,
- a PersistentVolumeClaim for the backups and one for the WAL archive.

The backup volume should point at storage that survives the loss of the
cluster. A PersistentVolume inside the same cluster is a copy, not a backup:
copy the encrypted files to an object store as well.

## What the backup job does

1. `pg_basebackup` with `-X stream`, so the backup is consistent and carries
   the WAL it needs.
2. The base backup, the bundled WAL, and the manifest are encrypted with
   age.
3. Each encrypted file is checked for a complete age header. The job only
   holds the public key, so it cannot decrypt what it wrote; the drill is
   where the round trip is proven.
4. The metadata file is written last. It holds the name of the files, the
   time, the size, and the SHA-256 of the encrypted base backup. The drill
   verifies the checksum, so a corrupted backup is reported as a storage
   failure instead of a restore failure.
5. The old backups are pruned: first by age, then by count.
6. The age of the newest backup is published as a Prometheus metric.

## What the restore drill does

The drill never touches the production database. It starts its own
PostgreSQL instance on port 55432 with its own data directory.

1. The newest backup is found and its checksum is verified against the
   metadata.
2. The base backup, the bundled WAL, and the manifest are decrypted and
   extracted.
3. The manifest names the WAL range the backup covers. The end of that range
   is the recovery target, so the recovery replays the archived WAL and
   stops at a known point instead of waiting for WAL that the production
   server has not written yet.
4. The instance is started with a `restore_command` that fetches the
   archived segments.
5. The restored data is checked: the tables the application needs exist,
   the row counts are readable, every sale has a grand total, and no tender
   points at a missing sale.
6. The newest archived WAL segment is decrypted and read with `pg_waldump`,
   which proves that the archive is intact and usable.
7. The elapsed time is the measured RTO, and it is written to the report and
   published as a Prometheus metric.

The drill fails loudly. A broken archive, a missing table, an orphaned
tender, or an unreadable WAL segment makes the job exit non-zero, which is
what the scheduler has to see.

## The metrics

The backup job and the drill publish their results through the
node_exporter textfile collector, so Prometheus can alert on them:

| Metric | Meaning |
|---|---|
| `pos_backup_last_success_timestamp_seconds` | When the last backup finished. The `PosBackupStale` alert fires when it is older than 26 hours |
| `pos_backup_last_drill_timestamp_seconds` | When the last restore drill finished |
| `pos_backup_last_drill_duration_seconds` | How long the last drill took. This is the measured RTO |

```bash
docker compose --profile monitoring up -d node-exporter
curl -s http://localhost:9100/metrics | grep pos_backup
```

## The configuration

| Variable | Default | Meaning |
|---|---|---|
| `BACKUP_DIR` | `/backups` | Where the encrypted backups are written |
| `WAL_ARCHIVE_DIR` | `/wal-archive` | Where the archived WAL segments live |
| `BACKUP_AGE_RECIPIENT` | – | The public recipient. Read from `BACKUP_AGE_RECIPIENT_FILE` when not set |
| `BACKUP_AGE_RECIPIENT_FILE` | `/etc/backup/age-recipient.txt` | The file with the public recipient |
| `BACKUP_AGE_IDENTITY` | `/run/secrets/backup-age-identity` | The private identity. Only the drill has it |
| `BACKUP_RETENTION_DAYS` | `14` | How long a backup is kept |
| `BACKUP_RETENTION_COUNT` | `14` | How many backups are kept |
| `PROMETHEUS_TEXTFILE_DIR` | – | Where the metrics are written. Empty disables them |
| `DRILL_PORT` | `55432` | The port of the scratch instance |
| `DRILL_REPORT_DIR` | – | Where the drill report is written |
| `VERIFY_EXPECT_DRILL` | `false` | `true` makes `verify-backup.sh` require the drill metric and the drill report |

## The authentication rules

`pg_hba.conf` replaces the rules that `initdb` writes, because the default
rules only allow a replication connection from localhost and the backup job
runs in its own container.

The committed file allows the replication connection for the `pos` role from
any address, with `scram-sha-256`. Narrow it to the address of the backup
runner in a real deployment:

```
host    replication     pos             10.0.0.0/24              scram-sha-256
```

## Limitations

- The backups are on a volume inside the deployment. Copy them to an object
  store to survive the loss of the host.
- The drill restores into a scratch instance on the same node. It proves
  that the backups are readable and that the data is complete; it does not
  prove that the recovery of the production cluster works.
- The drill measures the RTO of the restore, not of the whole incident. The
  runbook adds the time an operator needs to decide and to run the failover.
- `archive_mode=on` archives every segment, and nothing prunes the archive.
  A long-running deployment fills the WAL volume. Add a retention job for
  the archived segments, or use a managed PostgreSQL with its own archive
  lifecycle.
- The age keypair in this repository was generated for the local stack. The
  private identity is git-ignored, but a key that only exists on one machine
  cannot restore the backups after that machine is gone. Move it into a
  secret store before you rely on it.
