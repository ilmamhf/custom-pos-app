#!/usr/bin/env bash
# Shared helpers for the backup tooling.
#
# Sourced by backup.sh, archive-wal.sh, restore-wal.sh, and restore-drill.sh.
# The scripts run inside the PostgreSQL image, so bash, age, and the
# PostgreSQL client tools are always available.

set -euo pipefail

# The public key of the age keypair the backups are encrypted with. The
# matching private key never leaves the operator's secret store.
#
# The recipient can be given directly (`BACKUP_AGE_RECIPIENT`) or read from
# a file (`BACKUP_AGE_RECIPIENT_FILE`). The two are kept apart: the value is
# the key itself, the file is only where it comes from.
BACKUP_AGE_RECIPIENT_FILE="${BACKUP_AGE_RECIPIENT_FILE:-/etc/backup/age-recipient.txt}"
if [ -z "${BACKUP_AGE_RECIPIENT:-}" ] && [ -s "${BACKUP_AGE_RECIPIENT_FILE}" ]; then
  BACKUP_AGE_RECIPIENT="$(grep -m 1 -o 'age1[0-9a-z]*' "${BACKUP_AGE_RECIPIENT_FILE}")"
fi

# The private identity, needed to decrypt. Only the restore drill has it.
BACKUP_AGE_IDENTITY="${BACKUP_AGE_IDENTITY:-/run/secrets/backup-age-identity}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/wal-archive}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"
# Where the Prometheus textfile collector reads the metrics from. Empty
# disables the metric.
PROMETHEUS_TEXTFILE_DIR="${PROMETHEUS_TEXTFILE_DIR:-}"

log() {
  printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

# Encrypts stdin to the file given as the first argument.
#
# The write goes to a temporary name that is moved into place, so a crash
# halfway through never leaves a truncated file that looks complete.
age_encrypt() {
  local target="$1"
  if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
    fail "the age recipient is empty (BACKUP_AGE_RECIPIENT_FILE / BACKUP_AGE_RECIPIENT)"
  fi
  # The recipient is the public key, so it is not a secret. age has no
  # "read the recipient from stdin" mode, so it is passed as an argument.
  if ! age --recipient "${BACKUP_AGE_RECIPIENT}" --output "${target}.tmp"; then
    rm -f "${target}.tmp"
    fail "the encryption of ${target} failed"
  fi
  mv "${target}.tmp" "${target}"
}

# Decrypts the file given as the first argument to stdout.
age_decrypt() {
  local source="$1"
  if [ ! -f "${BACKUP_AGE_IDENTITY}" ]; then
    fail "the age identity ${BACKUP_AGE_IDENTITY} is missing: the restore drill needs the private key"
  fi
  age --decrypt --identity "${BACKUP_AGE_IDENTITY}" "${source}"
}

# Checks that a file is a complete age file.
#
# The backup job only holds the public recipient, so it cannot decrypt what
# it wrote. What it can check is the file header: a truncated or empty
# encryption is caught here rather than during a restore, when it would
# matter.
verify_age_file() {
  local source="$1"
  if [ ! -s "${source}" ]; then
    fail "${source} is empty: the encryption did not write anything"
  fi
  local header
  header="$(head -c 22 "${source}")"
  if [ "${header}" != 'age-encryption.org/v1' ]; then
    fail "${source} does not start with the age file header"
  fi
}

# Writes a metric into the Prometheus textfile collector directory.
#
# Every metric gets its own file: the node_exporter textfile collector reads
# every `*.prom` file in the directory, and one file per metric keeps the
# backup job and the restore drill from overwriting each other's value.
write_metric() {
  local name="$1"
  local value="$2"
  local help="$3"
  if [ -z "${PROMETHEUS_TEXTFILE_DIR}" ]; then
    return 0
  fi
  mkdir -p "${PROMETHEUS_TEXTFILE_DIR}"
  local target="${PROMETHEUS_TEXTFILE_DIR}/${name}.prom"
  {
    printf '# HELP %s %s\n' "${name}" "${help}"
    printf '# TYPE %s gauge\n' "${name}"
    printf '%s %s\n' "${name}" "${value}"
  } > "${target}.tmp"
  mv "${target}.tmp" "${target}"
}

# Writes the timestamp of the last successful backup.
write_backup_timestamp() {
  write_metric \
    pos_backup_last_success_timestamp_seconds \
    "$(date -u +%s)" \
    'Unix timestamp of the last successful encrypted database backup.'
}

# Writes the duration and the timestamp of the last successful restore drill.
write_drill_duration() {
  local seconds="$1"
  write_metric \
    pos_backup_last_drill_duration_seconds \
    "${seconds}" \
    'Duration of the last successful restore drill in seconds.'
  write_metric \
    pos_backup_last_drill_timestamp_seconds \
    "$(date -u +%s)" \
    'Unix timestamp of the last successful restore drill.'
}
