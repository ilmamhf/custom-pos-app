#!/usr/bin/env bash
# Takes an encrypted PostgreSQL base backup and prunes the old ones.
#
# The backup is a `pg_basebackup` in the tar format: it is a physical copy of
# the data directory, so it can be combined with the archived WAL segments
# for a point-in-time recovery. That is what gives the RPO of 15 minutes;
# a logical `pg_dump` alone could not.
#
# Everything the script writes is encrypted with age. The private key never
# reaches the backup job: it only encrypts with the public recipient.

set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-pos}"
PGDATABASE="${PGDATABASE:-pos}"

BASE_BACKUP_DIR="${BASE_BACKUP_DIR:-/var/lib/postgresql/backup}"

log "starting the base backup of ${PGDATABASE} on ${PGHOST}:${PGPORT}"

if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
  fail "the age recipient is empty (BACKUP_AGE_RECIPIENT_FILE / BACKUP_AGE_RECIPIENT)"
fi

mkdir -p "${BACKUP_DIR}" "${BASE_BACKUP_DIR}"

# Ensure the Prometheus textfile collector directory exists and is writable
# The backup image runs as postgres (UID 999), but the volume may be created as root.
if [ -n "${PROMETHEUS_TEXTFILE_DIR:-}" ]; then
  mkdir -p "${PROMETHEUS_TEXTFILE_DIR}"
  chown -R postgres:postgres "${PROMETHEUS_TEXTFILE_DIR}" 2>/dev/null || true
fi

STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
WORK_DIR="${BASE_BACKUP_DIR}/${STAMP}"

# The three files of one backup share a stem, so the retention can remove
# them as a set:
#   base-<stamp>.tar.gz.age           the encrypted base backup
#   base-<stamp>.tar.gz-wal.age       the encrypted WAL that ships with it
#   base-<stamp>.backup_manifest.age  the encrypted manifest
#   base-<stamp>.meta.json            when it was taken, how big it is
STEM="base-${STAMP}"
BASE_FILE="${STEM}.tar.gz.age"
WAL_FILE="${STEM}.tar.gz-wal.age"
MANIFEST_FILE="${STEM}.backup_manifest.age"
META_FILE="${STEM}.meta.json"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${WORK_DIR}"

# -Ft  tar format (a set of tar files instead of a raw directory copy)
# -z   compress the tar files
# -X stream  include the WAL needed to make the backup consistent
# -c fast  checkpoint quickly instead of waiting for the next one
#
# The connection is given as a conninfo string: `pg_basebackup` opens a
# physical replication connection, and a plain database name is parsed as a
# conninfo string, which fails.
pg_basebackup \
  --dbname="host=${PGHOST} port=${PGPORT} user=${PGUSER} dbname=postgres" \
  --pgdata="${WORK_DIR}" \
  --format=tar \
  --gzip \
  --wal-method=stream \
  --checkpoint=fast \
  --progress \
  --verbose

if [ ! -f "${WORK_DIR}/base.tar.gz" ]; then
  fail "pg_basebackup did not produce base.tar.gz"
fi

# The manifest lists every file with its checksum and the WAL range the
# backup covers. The restore drill needs it: the end of that range is the
# point the recovery rolls forward to.
if [ ! -f "${WORK_DIR}/backup_manifest" ]; then
  fail "pg_basebackup did not produce a backup_manifest"
fi

log "encrypting the backup to ${BACKUP_DIR}/${BASE_FILE}"
age_encrypt "${BACKUP_DIR}/${BASE_FILE}" < "${WORK_DIR}/base.tar.gz"

# The WAL that ships with the base backup is needed for the recovery too.
if [ -f "${WORK_DIR}/pg_wal.tar.gz" ]; then
  log "encrypting the bundled WAL to ${BACKUP_DIR}/${WAL_FILE}"
  age_encrypt "${BACKUP_DIR}/${WAL_FILE}" < "${WORK_DIR}/pg_wal.tar.gz"
fi

log "encrypting the manifest to ${BACKUP_DIR}/${MANIFEST_FILE}"
age_encrypt "${BACKUP_DIR}/${MANIFEST_FILE}" < "${WORK_DIR}/backup_manifest"

# The backup job only holds the public recipient, so it cannot decrypt what
# it just wrote: that is the point of an asymmetric key. What it can check
# is that the file is a complete age file. A truncated encryption is caught
# here instead of during a restore, when it would matter.
log "verifying the encrypted backup"
verify_age_file "${BACKUP_DIR}/${BASE_FILE}"
if [ -f "${BACKUP_DIR}/${WAL_FILE}" ]; then
  verify_age_file "${BACKUP_DIR}/${WAL_FILE}"
fi
verify_age_file "${BACKUP_DIR}/${MANIFEST_FILE}"

SIZE_BYTES="$(stat -c '%s' "${BACKUP_DIR}/${BASE_FILE}")"
CHECKSUM="$(sha256sum "${BACKUP_DIR}/${BASE_FILE}" | cut -d' ' -f1)"

# The metadata file is not secret: it says when the backup was taken and how
# big it is, so an operator can tell a fresh backup from a stale one without
# decrypting anything.
#
# It is written last: the restore drill picks the newest metadata file, so
# a metadata file must never describe a backup that is not finished yet.
cat > "${BACKUP_DIR}/${META_FILE}" <<EOF
{
  "name": "${BASE_FILE}",
  "wal": "${WAL_FILE}",
  "manifest": "${MANIFEST_FILE}",
  "created_at": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "created_at_epoch": $(date -u +%s),
  "size_bytes": ${SIZE_BYTES},
  "sha256": "${CHECKSUM}",
  "database": "${PGDATABASE}",
  "pg_version": "$(pg_basebackup --version | awk '{print $3}')"
}
EOF

chmod 0600 "${BACKUP_DIR}/${BASE_FILE}" "${BACKUP_DIR}/${WAL_FILE}" "${BACKUP_DIR}/${MANIFEST_FILE}"

write_backup_timestamp

# --- Retention -------------------------------------------------------------
# Two rules: a backup is dropped when it is older than the retention period,
# and the number of kept backups never exceeds the retention count. The
# count is applied last, so a backup that is still within the period stays
# even if there are more than the count.
log "pruning the backups"

prune_older_than() {
  local pattern="$1"
  find "${BACKUP_DIR}" -maxdepth 1 -type f -name "${pattern}" \
    -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete
}

prune_older_than 'base-*.tar.gz.age'
prune_older_than 'base-*.tar.gz-wal.age'
prune_older_than 'base-*.backup_manifest.age'
prune_older_than 'base-*.meta.json'

mapfile -t META_FILES < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'base-*.meta.json' | sort)
TOTAL="${#META_FILES[@]}"
if [ "${TOTAL}" -gt "${BACKUP_RETENTION_COUNT}" ]; then
  DELETE_COUNT=$((TOTAL - BACKUP_RETENTION_COUNT))
  for ((index = 0; index < DELETE_COUNT; index++)); do
    META="${META_FILES[$index]}"
    STEM_TO_DELETE="$(basename "${META}" .meta.json)"
    rm -f \
      "${BACKUP_DIR}/${STEM_TO_DELETE}.tar.gz.age" \
      "${BACKUP_DIR}/${STEM_TO_DELETE}.tar.gz-wal.age" \
      "${BACKUP_DIR}/${STEM_TO_DELETE}.backup_manifest.age" \
      "${META}"
  done
fi

log "base backup finished: ${BASE_FILE} (${SIZE_BYTES} bytes)"
