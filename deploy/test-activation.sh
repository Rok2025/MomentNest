#!/usr/bin/env bash
# Isolated contract test: no real service, database, network or private files.
set -euo pipefail
sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
export FIXTURE="$sandbox"
mkdir -p "$sandbox/bin" "$sandbox/app/releases/previous"
sed "s|base=/opt/apps/momentnest|base=$sandbox/app|" deploy/activate-release.sh > "$sandbox/activate.sh"
cat > "$sandbox/bin/node" <<'MOCK'
#!/usr/bin/env bash
case "$*" in
  *preflight.mjs*) test "${FAIL_STAGE:-}" != preflight ;;
  *verify-public.mjs*) test "${FAIL_STAGE:-}" != public ;;
  *) cat >/dev/null ;;
esac
MOCK
cat > "$sandbox/bin/curl" <<'MOCK'
#!/usr/bin/env bash
printf '{"ok":true}\n'
MOCK
cat > "$sandbox/bin/sudo" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FIXTURE/services.log"
MOCK
cat > "$sandbox/bin/systemctl" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
chmod +x "$sandbox/bin/"*
export PATH="$sandbox/bin:$PATH"
commit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
release=gha-1-1-$commit
target="$sandbox/app/releases/$release"
mkdir -p "$target/.next" "$target/node_modules/next/dist/bin" "$target/workers"
for file in .next/BUILD_ID node_modules/next/dist/bin/next workers/media.ts; do echo fixture > "$target/$file"; done
echo "$commit" > "$target/COMMIT"
ln -s "$sandbox/app/releases/previous" "$sandbox/app/current"
if FAIL_STAGE=preflight bash "$sandbox/activate.sh" "$release" "$commit"; then exit 1; fi
test "$(readlink "$sandbox/app/current")" = "$sandbox/app/releases/previous"
test ! -e "$sandbox/services.log"
if FAIL_STAGE=public bash "$sandbox/activate.sh" "$release" "$commit"; then exit 1; fi
test "$(readlink "$sandbox/app/current")" = "$sandbox/app/releases/previous"
test "$(wc -l < "$sandbox/services.log")" -eq 2
bash "$sandbox/activate.sh" "$release" "$commit"
test "$(readlink "$sandbox/app/current")" = "$target"
rm "$sandbox/app/current"
if FAIL_STAGE=public bash "$sandbox/activate.sh" "$release" "$commit"; then exit 1; fi
test ! -e "$sandbox/app/current"
tail -1 "$sandbox/services.log" | grep -q 'systemctl stop'
if bash "$sandbox/activate.sh" '../escape' "$commit"; then exit 1; fi
echo 'Activation contracts passed: preflight, rollback, success, first-release failure, invalid release.'
