#!/usr/bin/env bash
# Restores the newest encrypted backup into a scratch instance and verifies it.
#
# A backup is not verified until it has been restored. This script runs the
# whole path: decrypt, extract, recover with the archived WAL, check the
# data, and measure how long it took. The measured time is the RTO.
#
# The drill never touches the production database: it starts its own
# PostgreSQL instance on a different port with its own data directory.

set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

DRILL_PORT="${DRILL_PORT:-55432}"
DRILL_DATA_DIR="${DRILL_DATA_DIR:-/tmp/restore-drill/data}"
DRILL_REPORT="${DRILL_REPORT:-/tmp/restore-drill/report.json}"
PGUSER="${PGUSER:-pos}"
PGDATABASE="${PGDATABASE:-pos}"

# The report directory is a mounted volume, so the report survives the
# container.
DRILL_REPORT_DIR="${DRILL_REPORT_DIR:-}"
if [ -n "${DRILL_REPORT_DIR}" ] && [ -d "${DRILL_REPORT_DIR}" ]; then
  DRILL_REPORT="${DRILL_REPORT_DIR}/report.json"
fi

STARTED_AT="$(date -u +%s)"

cleanup() {
  if [ -n "${DRILL_PID:-}" ] && kill -0 "${DRILL_PID}" 2>/dev/null; then
    log "stopping the scratch instance"
    pg_ctl --pgdata="${WORK_DIR:-/tmp/restore-drill/extracted}" -m fast stop > /dev/null 2>&1 || true
    wait "${DRILL_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

mkdir -p "${DRILL_DATA_DIR}" "$(dirname "${DRILL_REPORT}")"

# --- 1. Find the backup ----------------------------------------------------
NEWEST_META="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'base-*.meta.json' | sort | tail -n 1)"
if [ -z "${NEWEST_META}" ]; then
  fail "no backup found in ${BACKUP_DIR}"
fi

META_NAME="$(basename "${NEWEST_META}" .meta.json)"
BACKUP_FILE="${BACKUP_DIR}/${META_NAME}.tar.gz.age"
WAL_FILE="${BACKUP_DIR}/${META_NAME}.tar.gz-wal.age"
MANIFEST_FILE="${BACKUP_DIR}/${META_NAME}.backup_manifest.age"

log "drill: restoring ${META_NAME}"
if [ ! -f "${BACKUP_FILE}" ]; then
  fail "the metadata points at ${BACKUP_FILE}, which does not exist"
fi
if [ ! -f "${MANIFEST_FILE}" ]; then
  fail "the metadata points at ${MANIFEST_FILE}, which does not exist"
fi

# --- 2. Check the stored archive --------------------------------------------
# The checksum in the metadata covers the encrypted file. If the stored
# backup drifted, the restore would produce a broken database and the drill
# would report a restore failure instead of a storage failure.
EXPECTED_SHA="$(grep -o '"sha256": "[^"]*"' "${NEWEST_META}" | head -1 | sed 's/.*: "//; s/"$//')"
ACTUAL_SHA="$(sha256sum "${BACKUP_FILE}" | cut -d' ' -f1)"
if [ -n "${EXPECTED_SHA}" ] && [ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]; then
  fail "the stored backup does not match its checksum (expected ${EXPECTED_SHA}, got ${ACTUAL_SHA})"
fi

# --- 3. Decrypt and extract ------------------------------------------------
WORK_DIR="${DRILL_DATA_DIR}/extracted"
mkdir -p "${WORK_DIR}"

log "drill: decrypting the base backup"
age_decrypt "${BACKUP_FILE}" | tar -xzf - -C "${WORK_DIR}"

# The WAL that ships with the base backup belongs into the data directory.
if [ -f "${WAL_FILE}" ]; then
  log "drill: decrypting the bundled WAL"
  mkdir -p "${WORK_DIR}/pg_wal"
  age_decrypt "${WAL_FILE}" | tar -xzf - -C "${WORK_DIR}/pg_wal"
fi

log "drill: decrypting the manifest"
MANIFEST_PATH="${DRILL_DATA_DIR}/backup_manifest"
age_decrypt "${MANIFEST_FILE}" > "${MANIFEST_PATH}"

if [ ! -f "${WORK_DIR}/PG_VERSION" ]; then
  fail "the extracted backup has no PG_VERSION: this is not a data directory"
fi

# PostgreSQL refuses to start in a data directory that is group- or
# world-readable. The extraction target is created by `mkdir`, so the mode
# has to be set explicitly.
chmod 0700 "${WORK_DIR}"

# PostgreSQL refuses to start in a data directory that is not empty.
rm -f "${WORK_DIR}/postmaster.pid"

# --- 4. Configure the recovery ---------------------------------------------
# The manifest names the WAL range the backup covers. The end of that range
# is the point the recovery rolls forward to: the archived WAL segments
# between the start and the end are replayed, and the recovery stops there.
#
# Without a target the instance would wait for WAL that does not exist yet,
# because the production server is still writing.
TARGET_LSN="$(grep -o '"End-LSN": "[^"]*"' "${MANIFEST_PATH}" | head -1 | sed 's/.*: "//; s/"$//')"
if [ -z "${TARGET_LSN}" ]; then
  fail "the manifest does not name the end of the WAL range"
fi
log "drill: recovering to ${TARGET_LSN}"

cat >> "${WORK_DIR}/postgresql.auto.conf" <<EOF
restore_command = '/usr/local/bin/restore-wal.sh "%f" "%p"'
recovery_target_lsn = '${TARGET_LSN}'
recovery_target_action = 'promote'
EOF

# `standby.signal` turns the instance into a standby, which is what makes
# PostgreSQL replay the archived WAL.
touch "${WORK_DIR}/standby.signal"

# --- 5. Start the scratch instance -----------------------------------------
log "drill: starting the scratch instance on port ${DRILL_PORT}"
if ! pg_ctl --pgdata="${WORK_DIR}" -o "-p ${DRILL_PORT} -c listen_addresses='' -c unix_socket_directories='/tmp'" \
  --log="${DRILL_DATA_DIR}/postgres.log" --wait start > /dev/null; then
  # The server log says why the instance refused to start.
  log "drill: the server log"
  tail -n 40 "${DRILL_DATA_DIR}/postgres.log" >&2 || true
  fail "the scratch instance did not start"
fi

DRILL_PID="$(pg_ctl --pgdata="${WORK_DIR}" status 2>/dev/null | head -n 1 | awk '{print $1}')"

PSQL=(psql --host=/tmp --port="${DRILL_PORT}" --username="${PGUSER}" --dbname="${PGDATABASE}" --no-psqlrc --tuples-only --no-align)

# --- 6. Wait for the recovery to finish ------------------------------------
log "drill: waiting for the recovery to finish"
RECOVERED=0
for _ in $(seq 1 120); do
  if "${PSQL[@]}" -c "SELECT pg_is_in_recovery()" 2>/dev/null | grep -q '^f$'; then
    RECOVERED=1
    break
  fi
  sleep 1
done

if [ "${RECOVERED}" -ne 1 ]; then
  log "drill: the recovery log"
  tail -n 40 "${DRILL_DATA_DIR}/postgres.log" >&2 || true
  fail "the restored instance did not finish the recovery"
fi

# --- 7. Verify the data ----------------------------------------------------
log "drill: verifying the restored data"

TABLE_COUNT="$("${PSQL[@]}" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
if [ "${TABLE_COUNT}" -lt 1 ]; then
  fail "the restored database has no tables in the public schema"
fi

# The tables the application needs. A partial restore would miss some of
# them, and the drill has to catch that.
EXPECTED_TABLES="stores products sales sale_tenders users store_inventory payment_providers payment_transactions negative_stock_events"
for table in ${EXPECTED_TABLES}; do
  EXISTS="$("${PSQL[@]}" -c "SELECT to_regclass('public.${table}') IS NOT NULL")"
  if [ "${EXISTS}" != "t" ]; then
    fail "the table public.${table} is missing from the restored database"
  fi
done

SALE_COUNT="$("${PSQL[@]}" -c "SELECT count(*) FROM sales")"
STORE_COUNT="$("${PSQL[@]}" -c "SELECT count(*) FROM stores")"
PRODUCT_COUNT="$("${PSQL[@]}" -c "SELECT count(*) FROM products")"
TENDER_COUNT="$("${PSQL[@]}" -c "SELECT count(*) FROM sale_tenders")"

# A restored database must be readable, not just present.
if [ "${SALE_COUNT}" -gt 0 ]; then
  TOTAL_CHECK="$("${PSQL[@]}" -c "SELECT count(*) FROM sales WHERE grand_total IS NULL")"
  if [ "${TOTAL_CHECK}" != "0" ]; then
    fail "${TOTAL_CHECK} restored sales have no grand total"
  fi
fi

# The tenders are the split payments of a sale. A restored database must
# not contain a tender without its sale: that is the relationship a partial
# or inconsistent restore breaks first.
ORPHAN_TENDERS="$("${PSQL[@]}" -c "SELECT count(*) FROM sale_tenders t LEFT JOIN sales s ON s.id = t.sale_id WHERE s.id IS NULL")"
if [ "${ORPHAN_TENDERS}" != "0" ]; then
  fail "${ORPHAN_TENDERS} restored tenders have no sale"
fi

# --- 8. Verify the WAL archive ---------------------------------------------
# The recovery above replays the WAL that ships with the backup. The
# archived segments are what a point-in-time recovery past the backup needs,
# so they are checked separately: the newest one is decrypted and read with
# `pg_waldump`.
log "drill: verifying the WAL archive"
NEWEST_WAL="$(find "${WAL_ARCHIVE_DIR}/wal" -maxdepth 1 -type f -name '*.age' ! -name '*.backup.age' 2>/dev/null | sort | tail -n 1)"
if [ -z "${NEWEST_WAL}" ]; then
  fail "the WAL archive is empty"
fi

WAL_CHECK_DIR="${DRILL_DATA_DIR}/wal-check/pg_wal"
mkdir -p "${WAL_CHECK_DIR}"
WAL_SEGMENT_NAME="$(basename "${NEWEST_WAL}" .age)"
age_decrypt "${NEWEST_WAL}" > "${WAL_CHECK_DIR}/${WAL_SEGMENT_NAME}"
if [ ! -s "${WAL_CHECK_DIR}/${WAL_SEGMENT_NAME}" ]; then
  fail "the archived WAL segment ${NEWEST_WAL} decrypted to an empty file"
fi

# `pg_waldump` derives the start location from the segment name, so the
# segment has to sit in a directory named `pg_wal`. It prints one line per
# WAL record; an empty output means the segment is not readable as WAL.
WAL_RECORDS="$(pg_waldump -p "${WAL_CHECK_DIR}" "${WAL_SEGMENT_NAME}" 2>/dev/null | grep -c 'rmgr:' || true)"
if [ "${WAL_RECORDS}" -lt 1 ]; then
  fail "the archived WAL segment ${NEWEST_WAL} cannot be read as WAL"
fi

WAL_COUNT="$(find "${WAL_ARCHIVE_DIR}/wal" -maxdepth 1 -type f -name '*.age' 2>/dev/null | wc -l | tr -d ' ')"

# --- 9. Report --------------------------------------------------------------
FINISHED_AT="$(date -u +%s)"
DURATION=$((FINISHED_AT - STARTED_AT))

cat > "${DRILL_REPORT}" <<EOF
{
  "status": "passed",
  "backup": "${META_NAME}",
  "recovery_target_lsn": "${TARGET_LSN}",
  "started_at": "$(date -u -d "@${STARTED_AT}" +'%Y-%m-%dT%H:%M:%SZ')",
  "finished_at": "$(date -u -d "@${FINISHED_AT}" +'%Y-%m-%dT%H:%M:%SZ')",
  "rto_seconds": ${DURATION},
  "tables": ${TABLE_COUNT},
  "stores": ${STORE_COUNT},
  "products": ${PRODUCT_COUNT},
  "sales": ${SALE_COUNT},
  "tenders": ${TENDER_COUNT},
  "archived_wal_segments": ${WAL_COUNT},
  "archived_wal_records_checked": ${WAL_RECORDS}
}
EOF

write_drill_duration "${DURATION}"

log "drill: passed in ${DURATION}s (${TABLE_COUNT} tables, ${STORE_COUNT} stores, ${PRODUCT_COUNT} products, ${SALE_COUNT} sales, ${TENDER_COUNT} tenders)"
log "drill: report written to ${DRILL_REPORT}"
