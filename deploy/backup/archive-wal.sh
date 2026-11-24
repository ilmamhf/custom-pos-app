#!/usr/bin/env bash
# The PostgreSQL `archive_command`: archives one WAL segment, encrypted.
#
# PostgreSQL calls this for every completed 16 MB WAL segment and retries
# until it succeeds. It has to be idempotent: a segment that is already in
# the archive must not be written twice, and a failure must not corrupt the
# existing copy.
#
# The arguments are the ones PostgreSQL passes: `%p` is the path of the
# segment to archive, `%f` is its file name.

set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

if [ "$#" -ne 2 ]; then
  fail "usage: archive-wal.sh <source-path> <file-name>"
fi

SOURCE_PATH="$1"
FILE_NAME="$2"

TARGET_DIR="${WAL_ARCHIVE_DIR}/wal"
TARGET="${TARGET_DIR}/${FILE_NAME}.age"

mkdir -p "${TARGET_DIR}"

# Already archived: PostgreSQL retries failed commands, and a retry must not
# overwrite a good segment with a partially written one.
if [ -f "${TARGET}" ] && [ -s "${TARGET}" ]; then
  exit 0
fi

# Encrypt to a temporary name and move it into place, so a crash halfway
# through never leaves a truncated segment that looks complete.
age_encrypt "${TARGET}" < "${SOURCE_PATH}"

# The archive is append-only, so a segment that is older than the newest one
# may still be needed for a point-in-time recovery.
exit 0
