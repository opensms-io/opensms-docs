#!/usr/bin/env bash
# local-stack.sh: build and run an isolated opensms development stack.
#
#   PostgreSQL 16, Redis 7 and NATS 2.10 in Docker (loopback ports only),
#   a restricted runtime database role, opensms-migrate with runtime grants,
#   an opensms-admin superadmin bootstrap, the API, and the SolidJS UI.
#
# Every outbound side effect (email, live SMS, webhooks, automatic top-ups)
# is disabled in the generated runtime environment.
#
# Usage:
#   operations/local-stack.sh up        create or resume the whole stack (idempotent)
#   operations/local-stack.sh status    read-only health report
#   operations/local-stack.sh env       print the non-secret connection summary
#   operations/local-stack.sh mock-ui   start the UI against the in-browser mock backend
#   operations/local-stack.sh stop      stop the API and UI processes, keep containers
#   operations/local-stack.sh down      stop processes and remove this stack's containers
#   operations/local-stack.sh down --purge   also delete volumes and the state directory
#
# Settings (environment variables, all optional):
#   OPENSMS_LOCAL_PREFIX      container/volume name prefix       (opensms-local)
#   OPENSMS_LOCAL_STATE       state dir: secrets, binaries, logs (~/.local/state/<prefix>)
#   OPENSMS_API_DIR           API checkout                       (<repo>/api)
#   OPENSMS_UI_DIR            frontend checkout                  (<repo>/frontend)
#   OPENSMS_LOCAL_PG_PORT     host port for PostgreSQL          (15460)
#   OPENSMS_LOCAL_REDIS_PORT  host port for Redis               (16410)
#   OPENSMS_LOCAL_NATS_PORT   host port for NATS                (14250)
#   OPENSMS_LOCAL_API_PORT    API port                           (18200)
#   OPENSMS_LOCAL_UI_PORT     UI port (real API mode)           (5200)
#   OPENSMS_LOCAL_MOCK_PORT   UI port (mock backend mode)       (5201)
#   OPENSMS_LOCAL_METRICS_PORT loopback metrics port, 0 disables (19100)
#   OPENSMS_LOCAL_EVENTBUS    true to route the outbox through NATS JetStream (false)
#   OPENSMS_LOCAL_ADMIN_EMAIL superadmin to bootstrap            (admin@opensms.test)
#   OPENSMS_LOCAL_SKIP_UI     true to skip starting the UI       (false)
#
# The status command can inspect an existing stack whose names differ, for
# example: OPENSMS_LOCAL_PG_CONTAINER=osdocs-pg OPENSMS_LOCAL_PG_SUPERUSER=osdocs
# OPENSMS_LOCAL_API_PORT=18180 OPENSMS_LOCAL_UI_PORT=5190 local-stack.sh status
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)

PREFIX=${OPENSMS_LOCAL_PREFIX:-opensms-local}
STATE=${OPENSMS_LOCAL_STATE:-$HOME/.local/state/$PREFIX}
API_DIR=${OPENSMS_API_DIR:-$repo_root/api}
UI_DIR=${OPENSMS_UI_DIR:-$repo_root/frontend}
PG_PORT=${OPENSMS_LOCAL_PG_PORT:-15460}
REDIS_PORT=${OPENSMS_LOCAL_REDIS_PORT:-16410}
NATS_PORT=${OPENSMS_LOCAL_NATS_PORT:-14250}
API_PORT=${OPENSMS_LOCAL_API_PORT:-18200}
UI_PORT=${OPENSMS_LOCAL_UI_PORT:-5200}
MOCK_PORT=${OPENSMS_LOCAL_MOCK_PORT:-5201}
METRICS_PORT=${OPENSMS_LOCAL_METRICS_PORT:-19100}
EVENTBUS=${OPENSMS_LOCAL_EVENTBUS:-false}
ADMIN_EMAIL=${OPENSMS_LOCAL_ADMIN_EMAIL:-admin@opensms.test}
SKIP_UI=${OPENSMS_LOCAL_SKIP_UI:-false}
PG_CONTAINER=${OPENSMS_LOCAL_PG_CONTAINER:-$PREFIX-pg}
PG_SUPERUSER=${OPENSMS_LOCAL_PG_SUPERUSER:-opensms_owner}
REDIS_CONTAINER=${OPENSMS_LOCAL_REDIS_CONTAINER:-$PREFIX-redis}
NATS_CONTAINER=${OPENSMS_LOCAL_NATS_CONTAINER:-$PREFIX-nats}

log() { printf '[local-stack] %s\n' "$*"; }
die() { printf '[local-stack] error: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"; }

# 32 URL-safe characters from 24 random bytes. The encryption key must be
# exactly 32 raw bytes and is never base64-decoded by the API, so this value
# is used verbatim.
random32() { openssl rand -base64 24 | tr '+/' '-_'; }

ensure_secrets() {
  umask 077
  mkdir -p "$STATE/bin" "$STATE/logs" "$STATE/vite-env"
  if [ ! -f "$STATE/secrets.env" ]; then
    log "generating private secrets in $STATE/secrets.env"
    {
      echo "PG_OWNER_PASSWORD=$(random32)"
      echo "PG_RUNTIME_PASSWORD=$(random32)"
      echo "ENCRYPTION_KEY=$(random32)"
      echo "ADMIN_PASSWORD=$(random32)"
    } > "$STATE/secrets.env"
  fi
  # shellcheck disable=SC1091
  . "$STATE/secrets.env"
  [ ${#ENCRYPTION_KEY} -eq 32 ] || die "encryption key in secrets.env is not 32 bytes"
  printf 'POSTGRES_USER=opensms_owner\nPOSTGRES_DB=opensms\nPOSTGRES_PASSWORD=%s\n' "$PG_OWNER_PASSWORD" > "$STATE/pg.env"
  OWNER_URL="postgres://opensms_owner:$PG_OWNER_PASSWORD@127.0.0.1:$PG_PORT/opensms?sslmode=disable"
  RUNTIME_URL="postgres://opensms_runtime:$PG_RUNTIME_PASSWORD@127.0.0.1:$PG_PORT/opensms?sslmode=disable"
}

# ensure_container NAME IMAGE [docker run args...] -- [command args...]
ensure_container() {
  local name=$1 image=$2; shift 2
  local state
  state=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || true)
  case "$state" in
    running) log "container $name already running" ;;
    exited|created) log "starting existing container $name"; docker start "$name" >/dev/null ;;
    '') log "creating container $name ($image)"; docker run -d --name "$name" --restart unless-stopped "$@" >/dev/null ;;
    *) die "container $name is in state $state" ;;
  esac
}

wait_for() { # wait_for DESCRIPTION SECONDS COMMAND...
  local what=$1 limit=$2; shift 2
  local i=0
  until "$@" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -ge "$limit" ] && die "timed out waiting for $what"
    sleep 1
  done
  log "$what is ready"
}

start_containers() {
  ensure_container "$PG_CONTAINER" postgres:16 \
    --env-file "$STATE/pg.env" -p "127.0.0.1:$PG_PORT:5432" -v "$PREFIX-pgdata:/var/lib/postgresql/data" postgres:16
  ensure_container "$REDIS_CONTAINER" redis:7 \
    -p "127.0.0.1:$REDIS_PORT:6379" redis:7
  ensure_container "$NATS_CONTAINER" nats:2.10 \
    -p "127.0.0.1:$NATS_PORT:4222" -v "$PREFIX-natsdata:/data" nats:2.10 --js --store_dir /data/jetstream
  # The image's first-boot init runs a temporary socket-only server; waiting
  # on TCP skips past it to the real server.
  wait_for "PostgreSQL" 90 docker exec "$PG_CONTAINER" pg_isready -h 127.0.0.1 -U opensms_owner -d opensms
  wait_for "Redis" 30 docker exec "$REDIS_CONTAINER" redis-cli ping
}

# Same statement as api/ops/hosted/init-runtime.sh: the password travels via
# the container environment, never via command arguments.
ensure_runtime_role() {
  log "ensuring restricted role opensms_runtime exists"
  OPENSMS_RUNTIME_DB_PASSWORD=$PG_RUNTIME_PASSWORD docker exec -i -e OPENSMS_RUNTIME_DB_PASSWORD "$PG_CONTAINER" \
    psql -q -U opensms_owner -d opensms -v ON_ERROR_STOP=1 <<'SQL'
\getenv runtime_password OPENSMS_RUNTIME_DB_PASSWORD
SELECT format('CREATE ROLE opensms_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'runtime_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'opensms_runtime')
\gexec
SQL
}

build_binaries() {
  local b
  for b in opensms opensms-migrate opensms-admin; do
    log "building $b"
    CGO_ENABLED=0 go build -C "$API_DIR" -trimpath -o "$STATE/bin/$b" "./cmd/$b"
  done
  # The API resolves ./database relative to its working directory, and every
  # binary loads ./.env from its working directory. Running from the state
  # directory keeps api/.env out of this stack.
  ln -sfn "$API_DIR/database" "$STATE/database"
}

# run_with_env FILE COMMAND...: run COMMAND from the state directory with only
# PATH, HOME and the variables in FILE. Secrets never appear in argv.
run_with_env() {
  local file=$1; shift
  (
    cd "$STATE"
    for v in $(compgen -e); do
      case $v in PATH|HOME) ;; *) unset "$v" 2>/dev/null || true ;; esac
    done
    set -a
    # shellcheck disable=SC1090
    . "$file"
    set +a
    exec "$@"
  )
}

run_migrations() {
  log "running opensms-migrate with runtime grants"
  cat > "$STATE/migration.env" <<EOF
OPENSMS_ENV=development
OPENSMS_DATABASE_URL=$RUNTIME_URL
OPENSMS_MIGRATION_DATABASE_URL=$OWNER_URL
OPENSMS_ENCRYPTION_KEY=$ENCRYPTION_KEY
EOF
  run_with_env "$STATE/migration.env" "$STATE/bin/opensms-migrate" -runtime-role opensms_runtime -database-dir "$STATE/database"
}

bootstrap_admin() {
  local out
  log "bootstrapping superadmin $ADMIN_EMAIL (development mode, no TOTP)"
  printf 'OPENSMS_ENV=development\nOPENSMS_ADMIN_DATABASE_URL=%s\n' "$OWNER_URL" > "$STATE/admin.env"
  if out=$(printf '%s' "$ADMIN_PASSWORD" | run_with_env "$STATE/admin.env" \
      "$STATE/bin/opensms-admin" --email "$ADMIN_EMAIL" --role superadmin --development-no-totp --password-stdin 2>&1); then
    log "created: $out"
  elif printf '%s' "$out" | grep -q 'identity already exists'; then
    log "superadmin already exists, left unchanged"
  else
    die "opensms-admin failed: $out"
  fi
}

write_runtime_env() {
  local metrics_enabled=false
  [ "$METRICS_PORT" != 0 ] && metrics_enabled=true
  cat > "$STATE/runtime.env" <<EOF
OPENSMS_ENV=development
OPENSMS_PORT=$API_PORT
OPENSMS_DATABASE_URL=$RUNTIME_URL
OPENSMS_REDIS_URL=redis://127.0.0.1:$REDIS_PORT/0
OPENSMS_NATS_URL=nats://127.0.0.1:$NATS_PORT
OPENSMS_EVENTBUS_ENABLED=$EVENTBUS
OPENSMS_ENCRYPTION_KEY=$ENCRYPTION_KEY
OPENSMS_CORS_ORIGINS=http://127.0.0.1:$UI_PORT,http://localhost:$UI_PORT,http://127.0.0.1:$MOCK_PORT,http://localhost:$MOCK_PORT
OPENSMS_ADMIN_CONSOLE_URL=http://127.0.0.1:$UI_PORT
OPENSMS_PASSWORD_RESET_URL=http://127.0.0.1:$UI_PORT/reset-password
OPENSMS_METRICS_ENABLED=$metrics_enabled
OPENSMS_METRICS_ADDRESS=127.0.0.1:$METRICS_PORT
OPENSMS_EMAIL_DELIVERY_ENABLED=false
OPENSMS_LIVE_DISPATCH_ENABLED=false
OPENSMS_WEBHOOK_DELIVERY_ENABLED=false
OPENSMS_AUTOMATIC_TOPUPS_ENABLED=false
OPENSMS_PROVIDER_BALANCE_POLLING_ENABLED=false
OPENSMS_ROUTE_PROBES_ENABLED=false
OPENSMS_LOOKUP_REFRESH_ENABLED=false
EOF
}

pid_alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }
http_ok() { curl -fsS -o /dev/null --max-time 3 "$1" 2>/dev/null; }

start_api() {
  if pid_alive "$STATE/api.pid" && http_ok "http://127.0.0.1:$API_PORT/healthz"; then
    log "API already running (pid $(cat "$STATE/api.pid"))"
    return
  fi
  if http_ok "http://127.0.0.1:$API_PORT/healthz"; then
    die "port $API_PORT already serves another process; set OPENSMS_LOCAL_API_PORT"
  fi
  log "starting API on 127.0.0.1:$API_PORT (log: $STATE/logs/api.log)"
  run_with_env "$STATE/runtime.env" nohup "$STATE/bin/opensms" >> "$STATE/logs/api.log" 2>&1 &
  echo $! > "$STATE/api.pid"
  wait_for "API readiness" 60 curl -fsS --max-time 3 "http://127.0.0.1:$API_PORT/readyz"
}

# Vite runs with a generated config so its dependency cache and env files live
# in the state directory. frontend/.env.local is therefore not read, and other
# Vite servers using the same checkout are not disturbed.
write_vite_config() {
  local plugin
  plugin=$(cd "$UI_DIR" && node -e "console.log(require('fs').realpathSync('node_modules/vite-plugin-solid') + '/dist/esm/index.mjs')")
  cat > "$STATE/vite.config.mjs" <<EOF
import solid from '$plugin'
export default {
  root: '$UI_DIR',
  cacheDir: '$STATE/vite-cache',
  envDir: '$STATE/vite-env',
  plugins: [solid()],
}
EOF
}

start_vite() { # start_vite NAME PORT API_BASE
  local name=$1 port=$2 base=$3
  if pid_alive "$STATE/$name.pid" && http_ok "http://127.0.0.1:$port/"; then
    log "$name already running on 127.0.0.1:$port"
    return
  fi
  [ -d "$UI_DIR/node_modules" ] || die "run 'pnpm install' in $UI_DIR first"
  write_vite_config
  log "starting $name on 127.0.0.1:$port (VITE_API_BASE=${base:-unset}, log: $STATE/logs/$name.log)"
  if [ -n "$base" ]; then
    (cd "$UI_DIR" && VITE_API_BASE=$base exec nohup ./node_modules/.bin/vite --config "$STATE/vite.config.mjs" \
      --host 127.0.0.1 --port "$port" --strictPort >> "$STATE/logs/$name.log" 2>&1) &
  else
    (cd "$UI_DIR" && unset VITE_API_BASE && exec nohup ./node_modules/.bin/vite --config "$STATE/vite.config.mjs" \
      --host 127.0.0.1 --port "$port" --strictPort >> "$STATE/logs/$name.log" 2>&1) &
  fi
  echo $! > "$STATE/$name.pid"
  wait_for "$name" 60 curl -fsS --max-time 3 "http://127.0.0.1:$port/"
}

stop_pid() {
  local file="$STATE/$1.pid"
  if pid_alive "$file"; then
    log "stopping $1 (pid $(cat "$file"))"
    pkill -TERM -P "$(cat "$file")" 2>/dev/null || true
    kill -TERM "$(cat "$file")" 2>/dev/null || true
  fi
  rm -f "$file"
}

cmd_up() {
  need docker; need go; need curl; need openssl; need node
  [ -d "$API_DIR/cmd/opensms" ] || die "API checkout not found at $API_DIR; set OPENSMS_API_DIR"
  [ "$SKIP_UI" = true ] || [ -f "$UI_DIR/package.json" ] || die "frontend checkout not found at $UI_DIR; set OPENSMS_UI_DIR or OPENSMS_LOCAL_SKIP_UI=true"
  ensure_secrets
  start_containers
  ensure_runtime_role
  build_binaries
  run_migrations
  bootstrap_admin
  write_runtime_env
  start_api
  if [ "$SKIP_UI" != true ]; then
    start_vite ui "$UI_PORT" "http://127.0.0.1:$API_PORT"
  fi
  cmd_env
}

cmd_env() {
  cat <<EOF
API          http://127.0.0.1:$API_PORT   (customer /v1, operator /admin/v1)
UI           http://127.0.0.1:$UI_PORT    (customer /login, operator /admin/login)
Metrics      http://127.0.0.1:$METRICS_PORT/metrics (0 means disabled)
PostgreSQL   127.0.0.1:$PG_PORT  container $PG_CONTAINER (owner opensms_owner, runtime opensms_runtime)
Redis        127.0.0.1:$REDIS_PORT  container $REDIS_CONTAINER
NATS         127.0.0.1:$NATS_PORT  container $NATS_CONTAINER (event bus enabled: $EVENTBUS)
Superadmin   $ADMIN_EMAIL, password in $STATE/secrets.env (ADMIN_PASSWORD)
State        $STATE
EOF
}

# Read-only: no container, process, file or database state is changed.
cmd_status() {
  local files applied code
  echo "containers:"
  for c in "$PG_CONTAINER" "$REDIS_CONTAINER" "$NATS_CONTAINER"; do
    printf '  %-24s %s\n' "$c" "$(docker inspect -f '{{.State.Status}} {{.Config.Image}}' "$c" 2>/dev/null || echo missing)"
  done
  files=$(( $(ls "$API_DIR"/database/migrations/*.sql | wc -l) + 1 ))
  applied=$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d opensms -Atc 'select count(*) from schema_migrations' 2>/dev/null || echo "?")
  echo "migrations: $applied applied of $files in $API_DIR/database (schema.sql + migrations/*.sql)"
  echo "runtime role: $(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d opensms -Atc "select rolname||' superuser='||rolsuper||' createdb='||rolcreatedb||' createrole='||rolcreaterole||' bypassrls='||rolbypassrls from pg_roles where rolname='opensms_runtime'" 2>/dev/null || echo unavailable)"
  echo "message partitions: $(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d opensms -Atc "select count(*)||' ('||min(c.relname)||' .. '||max(c.relname)||')' from pg_inherits i join pg_class c on c.oid=i.inhrelid where i.inhparent='public.messages'::regclass" 2>/dev/null || echo unavailable)"
  for path in healthz readyz; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$API_PORT/$path" || true)
    echo "api /$path: HTTP $code"
  done
  if [ "$METRICS_PORT" != 0 ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$METRICS_PORT/metrics" || true)
    echo "metrics: HTTP $code"
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$UI_PORT/" || true)
  echo "ui: HTTP $code"
}

cmd_stop() { stop_pid ui; stop_pid mock-ui; stop_pid api; }

cmd_down() {
  cmd_stop
  for c in "$PG_CONTAINER" "$REDIS_CONTAINER" "$NATS_CONTAINER"; do
    docker rm -f "$c" >/dev/null 2>&1 && log "removed container $c" || true
  done
  if [ "${1:-}" = --purge ]; then
    docker volume rm "$PREFIX-pgdata" "$PREFIX-natsdata" >/dev/null 2>&1 && log "removed volumes" || true
    rm -rf "$STATE" && log "removed $STATE"
  fi
}

case "${1:-help}" in
  up) cmd_up ;;
  status) cmd_status ;;
  env) ensure_secrets >/dev/null; cmd_env ;;
  mock-ui) need node; mkdir -p "$STATE/logs" "$STATE/vite-env"; start_vite mock-ui "$MOCK_PORT" "" ;;
  stop) cmd_stop ;;
  down) shift; cmd_down "${1:-}" ;;
  help|-h|--help) sed -n '2,36p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "unknown command: $1 (try help)" ;;
esac
