#!/usr/bin/env bash
# Restore an SMIS backup into a TARGET database (normally a fresh staging DB first).
#   TARGET_DATABASE_URL=... scripts/restore.sh backups/smis-YYYYmmddTHHMMSSZ.dump [--yes]
# Restoring into production requires written approval from the Headteacher (see docs/BACKUP_AND_RECOVERY.md).
set -euo pipefail
FILE="${1:?Usage: TARGET_DATABASE_URL=... scripts/restore.sh <backup.dump> [--yes]}"
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL}"
URL="$(echo "$TARGET_DATABASE_URL" | sed -E 's/[?&]schema=[^&]*//')"
if [[ -f "$FILE.sha256" ]]; then sha256sum -c "$FILE.sha256"; fi
if [[ "$FILE" == *.gpg ]]; then gpg --batch --yes --decrypt --output "${FILE%.gpg}" "$FILE"; FILE="${FILE%.gpg}"; fi
if [[ "${2:-}" != "--yes" ]]; then
  read -r -p "This will REPLACE all data in the target database. Type RESTORE to continue: " ok
  [[ "$ok" == "RESTORE" ]] || { echo "Aborted."; exit 1; }
fi
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$URL" "$FILE"
echo "Restored $FILE into target. Verify with: psql \"$URL\" -c 'select count(*) from \"Student\"'"
