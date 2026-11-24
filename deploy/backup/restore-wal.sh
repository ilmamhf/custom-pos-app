#!/usr/bin/env bash
# The PostgreSQL `restore_command`: fetches one WAL segment from the archive.
#
# This runs on the instance that is being recovered, not on the production
# server. The archive holds the encrypted segments, so they are decrypted
# into the requested path.
#
# The arguments are the ones PostgreSQL passes: `%f` is the file name it
# wants, `%p` is the path it wants it at.

set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

if [ "$#" -ne 2 ]; then
  fail "usage: restore-wal.sh <file-name> <target-path>"
fi

FILE_NAME="$1"
TARGET_PATH="$2"

SOURCE="${WAL_ARCHIVE_DIR}/wal/${FILE_NAME}.age"

if [ ! -f "${SOURCE}" ]; then
  # A missing segment is normal at the end of the archive: PostgreSQL treats
  # a non-zero exit as "not found" and ends the recovery there.
  exit 1
fi

age_decrypt "${SOURCE}" > "${TARGET_PATH}.tmp"
mv "${TARGET_PATH}.tmp" "${TARGET_PATH}"
exit 0
