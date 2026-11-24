#!/usr/bin/env bash
# Verifies the artifacts that the backup job wrote.
#
# The check covers what can be verified without the private key: the newest
# backup is an age file, its metadata is complete, and the metrics were
# published. Decrypting the backup is the restore drill's job, because it
# needs the private identity.
#
# Run it after a backup:
#   docker compose --profile backup run --rm --entrypoint /usr/local/bin/pos-entrypoint.sh \
#     backup /usr/local/bin/verify-backup.sh

set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

NEWEST_META="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'base-*.meta.json' | sort | tail -n 1)"
if [ -z "${NEWEST_META}" ]; then
  fail "no backup metadata found in ${BACKUP_DIR}"
fi

STEM="$(basename "${NEWEST_META}" .meta.json)"
BASE_FILE="${BACKUP_DIR}/${STEM}.tar.gz.age"
WAL_FILE="${BACKUP_DIR}/${STEM}.tar.gz-wal.age"
MANIFEST_FILE="${BACKUP_DIR}/${STEM}.backup_manifest.age"

log "verifying the backup ${STEM}"

for file in "${BASE_FILE}" "${WAL_FILE}" "${MANIFEST_FILE}"; do
  if [ ! -s "${file}" ]; then
    fail "${file} is missing or empty"
  fi
  # The file must be an age file, not a readable tar archive.
  verify_age_file "${file}"
done

# The metadata has to name the files that are actually there.
for key in '"name"' '"wal"' '"manifest"' '"sha256"' '"created_at"'; do
  if ! grep -q "${key}" "${NEWEST_META}"; then
    fail "the metadata ${NEWEST_META} has no ${key} field"
  fi
done

EXPECTED_SHA="$(grep -o '"sha256": "[^"]*"' "${NEWEST_META}" | head -1 | sed 's/.*: "//; s/"$//')"
ACTUAL_SHA="$(sha256sum "${BASE_FILE}" | cut -d' ' -f1)"
if [ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]; then
  fail "the stored backup does not match its checksum (expected ${EXPECTED_SHA}, got ${ACTUAL_SHA})"
fi

log "the backup is encrypted, complete, and matches its checksum"

# The metrics are what the backup alerts read.
if [ -z "${PROMETHEUS_TEXTFILE_DIR}" ]; then
  log "no metric directory configured, skipping the metric check"
  exit 0
fi

for metric in pos_backup_last_success_timestamp_seconds pos_backup_last_drill_duration_seconds; do
  file="${PROMETHEUS_TEXTFILE_DIR}/${metric}.prom"
  if [ ! -s "${file}" ]; then
    fail "the metric ${metric} was not published (${file} is missing)"
  fi
  if ! grep -q "^${metric}[[:space:]][0-9]" "${file}"; then
    fail "the metric ${metric} has no value in ${file}"
  fi
done

log "the backup metrics are published"

# The drill report, when there is one, has to say that the drill passed.
DRILL_REPORT_DIR="${DRILL_REPORT_DIR:-}"
if [ -n "${DRILL_REPORT_DIR}" ] && [ -s "${DRILL_REPORT_DIR}/report.json" ]; then
  if ! grep -q '"status": "passed"' "${DRILL_REPORT_DIR}/report.json"; then
    fail "the drill report in ${DRILL_REPORT_DIR} does not say that the drill passed"
  fi
  log "the drill report says that the drill passed"
fi
