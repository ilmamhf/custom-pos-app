#!/usr/bin/env bash
# Verifies the artifacts that the backup job wrote.
#
# The check covers what can be verified without the private key: the newest
# backup is an age file, its metadata is complete, and the metrics were
# published. Decrypting the backup is the restore drill's job, because it
# needs the private identity.
#
# Run it after a backup (no drill metric is expected yet):
#   docker compose --profile backup run --rm --entrypoint /usr/local/bin/pos-entrypoint.sh \
#     backup /usr/local/bin/verify-backup.sh
#
# Run it again after the restore drill, with `VERIFY_EXPECT_DRILL=true`, so the
# drill metric and the drill report are checked as well:
#   docker run --rm \
#     -e VERIFY_EXPECT_DRILL=true \
#     -e PROMETHEUS_TEXTFILE_DIR=/var/lib/node_exporter/textfile_collector \
#     -e DRILL_REPORT_DIR=/drill \
#     -v pos-backups:/backups -v pos-textfile:/var/lib/node_exporter/textfile_collector \
#     -v pos-drill:/drill \
#     --entrypoint /usr/local/bin/pos-entrypoint.sh \
#     pos-backup /usr/local/bin/verify-backup.sh

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

# The metrics are what the backup alerts read. Which metrics are expected
# depends on where in the pipeline this runs:
#   * right after the backup the drill has not run yet, so only the backup
#     timestamp exists;
#   * after the restore drill the drill metric has to exist too.
# `VERIFY_EXPECT_DRILL=true` selects the post-drill contract.
VERIFY_EXPECT_DRILL="${VERIFY_EXPECT_DRILL:-false}"
if [ "${VERIFY_EXPECT_DRILL}" != "true" ] && [ "${VERIFY_EXPECT_DRILL}" != "false" ]; then
  fail "VERIFY_EXPECT_DRILL must be 'true' or 'false', got '${VERIFY_EXPECT_DRILL}'"
fi

if [ -z "${PROMETHEUS_TEXTFILE_DIR}" ]; then
  if [ "${VERIFY_EXPECT_DRILL}" = "true" ]; then
    fail "VERIFY_EXPECT_DRILL=true but PROMETHEUS_TEXTFILE_DIR is empty: the drill metric cannot be checked"
  fi
  log "no metric directory configured, skipping the metric check"
else
  REQUIRED_METRICS="pos_backup_last_success_timestamp_seconds"
  if [ "${VERIFY_EXPECT_DRILL}" = "true" ]; then
    REQUIRED_METRICS="${REQUIRED_METRICS} pos_backup_last_drill_duration_seconds"
  fi

  for metric in ${REQUIRED_METRICS}; do
    file="${PROMETHEUS_TEXTFILE_DIR}/${metric}.prom"
    if [ ! -s "${file}" ]; then
      fail "the metric ${metric} was not published (${file} is missing)"
    fi
    if ! grep -q "^${metric}[[:space:]][0-9]" "${file}"; then
      fail "the metric ${metric} has no value in ${file}"
    fi
  done

  if [ "${VERIFY_EXPECT_DRILL}" = "true" ]; then
    # A zero-second drill means the metric was written before the drill ran, so
    # it must not be treated as a successful drill.
    drill_value="$(grep "^pos_backup_last_drill_duration_seconds[[:space:]]" \
      "${PROMETHEUS_TEXTFILE_DIR}/pos_backup_last_drill_duration_seconds.prom" \
      | awk '{print $2}' | tail -n 1)"
    if [ -z "${drill_value}" ] || [ "${drill_value}" = "0" ]; then
      fail "the drill duration metric is not a positive number (got '${drill_value}')"
    fi
  fi

  log "the backup metrics are published"
fi

# The drill report has to say that the drill passed. It is optional for a
# backup-only check, but required when the drill metric is expected.
DRILL_REPORT_DIR="${DRILL_REPORT_DIR:-}"
if [ "${VERIFY_EXPECT_DRILL}" = "true" ]; then
  if [ -z "${DRILL_REPORT_DIR}" ]; then
    fail "VERIFY_EXPECT_DRILL=true but DRILL_REPORT_DIR is empty: the drill report cannot be checked"
  fi
  if [ ! -s "${DRILL_REPORT_DIR}/report.json" ]; then
    fail "the drill report ${DRILL_REPORT_DIR}/report.json is missing"
  fi
  if ! grep -q '"status": "passed"' "${DRILL_REPORT_DIR}/report.json"; then
    fail "the drill report in ${DRILL_REPORT_DIR} does not say that the drill passed"
  fi
  log "the drill report says that the drill passed"
elif [ -n "${DRILL_REPORT_DIR}" ] && [ -s "${DRILL_REPORT_DIR}/report.json" ]; then
  if ! grep -q '"status": "passed"' "${DRILL_REPORT_DIR}/report.json"; then
    fail "the drill report in ${DRILL_REPORT_DIR} does not say that the drill passed"
  fi
  log "the drill report says that the drill passed"
fi
