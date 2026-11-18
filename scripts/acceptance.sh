#!/usr/bin/env bash
# End-to-end acceptance run on a brand-new database using the production build.
#   PG_ADMIN_URL=postgresql://user:pw@localhost:5432/postgres scripts/acceptance.sh
# Creates two new databases (smis_accept_<stamp>, smis_restore_<stamp>); never touches existing ones.
set -euo pipefail
cd "$(dirname "$0")/.."
PG_ADMIN_URL="${PG_ADMIN_URL:-postgresql://smis:smis_dev_pw@localhost:5432/postgres}"
STAMP="$(date +%s)"
ACC_DB="smis_accept_$STAMP"
RES_DB="smis_restore_$STAMP"
BASE_CONN="${PG_ADMIN_URL%/*}"
export DATABASE_URL="$BASE_CONN/$ACC_DB"
export DIRECT_URL="$DATABASE_URL"
PORT="${PORT:-3100}"

echo "==> Creating $ACC_DB"
psql "$PG_ADMIN_URL" -qc "CREATE DATABASE $ACC_DB"
npx prisma migrate deploy >/dev/null
SEED_ADMIN_PASSWORD=AcceptAdmin123 npx tsx prisma/seed.ts >/dev/null
npx tsx prisma/demo-data.ts

[[ -d .next ]] || npx next build
echo "==> Starting production server on :$PORT"
if curl -s -o /dev/null "http://localhost:$PORT"; then echo "Port $PORT is already in use — stop that server first." >&2; exit 1; fi
# setsid: own process group, so the whole server tree is stopped on exit
APP_URL="http://localhost:$PORT" setsid ./node_modules/.bin/next start -p "$PORT" > /tmp/smis-accept-server.log 2>&1 &
SERVER=$!
trap 'kill -- -$SERVER 2>/dev/null || kill $SERVER 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/login" >/dev/null && break; sleep 1; done

set +e
BASE_URL="http://localhost:$PORT" ADMIN_PASSWORD=AcceptAdmin123 npx tsx tests/acceptance/run.ts
BROWSER_RC=$?
set -e

echo "==> §18 Backup and restore"
BK_DIR="$(mktemp -d)"
DATABASE_URL="$DATABASE_URL" bash scripts/backup.sh "$BK_DIR" >/dev/null
DUMP="$(ls "$BK_DIR"/smis-*.dump)"
psql "$PG_ADMIN_URL" -qc "CREATE DATABASE $RES_DB"
TARGET_DATABASE_URL="$BASE_CONN/$RES_DB" bash scripts/restore.sh "$DUMP" --yes >/dev/null
TABLES='"Student" "Guardian" "Staff" "Mark" "ExamResult" "Payment" "LedgerEntry" "Invoice" "AuditLog" "User"'
DIFF=0; ROWS=""
for t in $TABLES; do
  a=$(psql "$DATABASE_URL" -tAc "select count(*) from $t")
  b=$(psql "$BASE_CONN/$RES_DB" -tAc "select count(*) from $t")
  ROWS="$ROWS ${t//\"/}=$a/$b"
  [[ "$a" == "$b" ]] || DIFF=1
done
BAL_A=$(psql "$DATABASE_URL" -tAc 'select coalesce(sum(debit)-sum(credit),0) from "LedgerEntry"')
BAL_B=$(psql "$BASE_CONN/$RES_DB" -tAc 'select coalesce(sum(debit)-sum(credit),0) from "LedgerEntry"')
TRIG=$(psql "$BASE_CONN/$RES_DB" -tAc "select count(*) from pg_trigger where tgname like '%immutable'")
[[ "$BAL_A" == "$BAL_B" && "$TRIG" == "7" ]] || DIFF=1
SIZE=$(du -h "$DUMP" | cut -f1)
if [[ $DIFF == 0 ]]; then RES="PASS"; else RES="**FAIL**"; fi
EVID="pg_dump ($SIZE, verified with pg_restore --list + SHA-256) restored into a new database; row counts source/restored:$ROWS; total fees balance $BAL_A = $BAL_B; $TRIG immutability triggers present after restore"
sed -i "s#^| 19 |#| 18 | Database backup and restoration | $RES | $EVID |\n| 19 |#" docs/ACCEPTANCE_REPORT.md
echo "Backup/restore: $RES — $EVID"
echo "Report: docs/ACCEPTANCE_REPORT.md   (databases left for inspection: $ACC_DB, $RES_DB)"
[[ $BROWSER_RC == 0 && $DIFF == 0 ]]
