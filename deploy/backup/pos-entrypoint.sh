#!/usr/bin/env bash
# Entry point for the PostgreSQL and backup containers.
#
# Docker creates the named volumes owned by root, but the server and the
# backup jobs run as the unprivileged `postgres` user. This wrapper fixes the
# ownership of the mounted directories once, then hands over to the stock
# PostgreSQL entrypoint (for the server) or runs the job as `postgres`.

set -euo pipefail

if [ "$(id -u)" = '0' ]; then
  for dir in \
    "${WAL_ARCHIVE_DIR:-/wal-archive}" \
    "${BACKUP_DIR:-/backups}" \
    "${DRILL_REPORT_DIR:-/drill}" \
    "${PROMETHEUS_TEXTFILE_DIR:-}"
  do
    if [ -n "${dir}" ] && [ -d "${dir}" ]; then
      # A shared volume can be mounted read-only in some of the services;
      # a failed chown is not fatal.
      chown -R postgres:postgres "${dir}" 2> /dev/null || true
    fi
  done

  if [ "${1:-}" = 'postgres' ]; then
    # The stock entrypoint sets up the database and drops the privileges.
    exec docker-entrypoint.sh "$@"
  fi

  # Everything else is a one-shot job.
  exec gosu postgres "$@"
fi

exec "$@"
