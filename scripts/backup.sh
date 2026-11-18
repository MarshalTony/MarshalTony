#!/usr/bin/env bash
# Logical backup of the SMIS database.
#   DATABASE_URL=... scripts/backup.sh [output-dir]
# Optional off-site copy:  BACKUP_S3_URI=s3://bucket/path  (needs the aws CLI; works with R2/B2 via AWS_ENDPOINT_URL)
# Optional encryption:     BACKUP_GPG_RECIPIENT=key-id      (recommended: backups contain personal data)
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/smis-$STAMP.dump"
# Prisma's ?schema= parameter is not understood by libpq
URL="$(echo "$DATABASE_URL" | sed -E 's/[?&]schema=[^&]*//')"
pg_dump --format=custom --no-owner --no-privileges --compress=9 --file "$FILE" "$URL"
pg_restore --list "$FILE" > /dev/null   # verify the archive is readable
sha256sum "$FILE" > "$FILE.sha256"
if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$FILE.gpg" "$FILE" && rm -f "$FILE"
  FILE="$FILE.gpg"
fi
if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  aws s3 cp "$FILE" "$BACKUP_S3_URI/" && aws s3 cp "${FILE%.gpg}.sha256" "$BACKUP_S3_URI/" || { echo "Upload failed" >&2; exit 1; }
fi
# Keep the last 30 local backups
ls -1t "$OUT_DIR"/smis-*.dump* 2>/dev/null | grep -v sha256 | tail -n +31 | xargs -r rm -f
echo "Backup written: $FILE"
