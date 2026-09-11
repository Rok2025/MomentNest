#!/usr/bin/env bash
# Executed as momentnest-deploy. Database migrations are intentionally separate.
set -euo pipefail
release=${1:?release required}
commit=${2:?commit required}
[[ "$release" =~ ^gha-[0-9]+-[0-9]+-[0-9a-f]{40}$ ]]
[[ "$commit" =~ ^[0-9a-f]{40}$ ]]
[[ "$release" == *"-$commit" ]]
base=/opt/apps/momentnest
target="$base/releases/$release"
exec 9>"$base/.deploy.lock"
flock -w 180 9
for file in .next/BUILD_ID node_modules/next/dist/bin/next workers/media.ts public/photo-picker-check.html COMMIT; do test -s "$target/$file"; done
test "$(cat "$target/COMMIT")" = "$commit"
cd "$target"
node --env-file=/etc/momentnest/runtime.env deploy/preflight.mjs
previous=''
if [[ -L "$base/current" ]]; then previous=$(readlink -f "$base/current"); fi
switched=0
restart_services() { sudo /usr/bin/systemctl restart momentnest-web.service momentnest-storage.service momentnest-worker.service; }
rollback() {
  status=$?
  trap - EXIT
  if (( status != 0 && switched == 1 )); then
    if [[ -n "$previous" && -d "$previous" ]]; then
      ln -s "$previous" "$base/rollback-$release"
      mv -Tf "$base/rollback-$release" "$base/current"
      restart_services
      echo 'Release failed; previous release restored.' >&2
    else
      sudo /usr/bin/systemctl stop momentnest-web.service momentnest-storage.service momentnest-worker.service
      rm -f "$base/current"
      echo 'First release failed; services stopped.' >&2
    fi
  fi
  exit "$status"
}
trap rollback EXIT
ln -s "$target" "$base/pending-$release"
mv -Tf "$base/pending-$release" "$base/current"
switched=1
restart_services
ready=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 10 http://127.0.0.1:3210/api/health | node -e 'let b="";process.stdin.on("data",x=>b+=x);process.stdin.on("end",()=>{try{const r=JSON.parse(b);process.exit(r.ok&&r.commit===process.argv[1]?0:1)}catch{process.exit(1)}})' "$commit" && curl -fsS --max-time 5 http://127.0.0.1:3211/health >/dev/null; then ready=1; break; fi
  sleep 2
done
test "$ready" = 1
systemctl is-active --quiet momentnest-web.service momentnest-storage.service momentnest-worker.service
# Check HTTPS through the actual Nginx vhost before accepting the release.
node deploy/verify-public.mjs "$commit" https://nest.rokzhang.cn
printf 'Activated %s\n' "$release"
