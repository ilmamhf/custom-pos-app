# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# PostgreSQL with the backup tooling.
#
# The same image is used for three jobs:
#   - the database server (it needs `age` for the WAL archive command)
#   - the backup job (base backup + encryption + retention)
#   - the restore drill (decryption + recovery + verification)
#
# One image means the backup tool and the server always speak the same
# PostgreSQL major version, which `pg_basebackup` requires.
# ---------------------------------------------------------------------------
FROM postgres:16

# age encrypts the backups and the WAL segments. The backup job only needs the
# public recipient; the private identity is mounted into the restore drill.
RUN apt-get update \
    && apt-get install -y --no-install-recommends age \
    && rm -rf /var/lib/apt/lists/*

COPY backup.sh archive-wal.sh restore-wal.sh restore-drill.sh verify-backup.sh age-keygen.sh lib.sh /usr/local/bin/
COPY pos-entrypoint.sh /usr/local/bin/pos-entrypoint.sh

RUN chmod 0755 \
    /usr/local/bin/backup.sh \
    /usr/local/bin/archive-wal.sh \
    /usr/local/bin/restore-wal.sh \
    /usr/local/bin/restore-drill.sh \
    /usr/local/bin/verify-backup.sh \
    /usr/local/bin/age-keygen.sh \
    /usr/local/bin/lib.sh \
    /usr/local/bin/pos-entrypoint.sh

# The wrapper fixes the ownership of the mounted volumes and then drops the
# privileges: the server and the jobs never run as root.
ENTRYPOINT ["/usr/local/bin/pos-entrypoint.sh"]
CMD ["postgres"]
