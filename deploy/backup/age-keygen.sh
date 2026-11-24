#!/usr/bin/env bash
# Generates the age keypair the backups are encrypted with.
#
# The public recipient is committed (it is not a secret) and the private
# identity is written to a git-ignored path. The private key has to be moved
# into the operator's secret store; without it the backups cannot be
# restored.

set -euo pipefail

RECIPIENT_FILE="${RECIPIENT_FILE:-$(dirname "$0")/age-recipient.txt}"
IDENTITY_FILE="${IDENTITY_FILE:-$(dirname "$0")/age-identity.txt}"

if ! command -v age-keygen > /dev/null 2>&1; then
  echo "age-keygen is not installed. Run this inside the backup image:" >&2
  echo "  docker run --rm -v \"\$(pwd)/deploy/backup:/backup\" pos-backup age-keygen" >&2
  exit 1
fi

if [ -f "${IDENTITY_FILE}" ]; then
  echo "the identity ${IDENTITY_FILE} already exists; move it aside before generating a new pair" >&2
  exit 1
fi

umask 077
age-keygen -o "${IDENTITY_FILE}"

# The identity file starts with a "# created:" comment and holds the public
# key on a "# public key: age1…" line.
grep -m 1 -o 'age1[0-9a-z]*' "${IDENTITY_FILE}" > "${RECIPIENT_FILE}"

if [ ! -s "${RECIPIENT_FILE}" ]; then
  echo "could not read the public key out of ${IDENTITY_FILE}" >&2
  exit 1
fi

chmod 0644 "${RECIPIENT_FILE}"

echo "public recipient written to ${RECIPIENT_FILE}"
echo "private identity written to ${IDENTITY_FILE}"
echo
echo "Move the private identity into your secret store now. The repository"
echo "ignores it, but a key that only exists on one machine cannot restore"
echo "the backups after that machine is gone."
