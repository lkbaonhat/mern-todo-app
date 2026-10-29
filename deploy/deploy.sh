#!/usr/bin/env bash
set -euo pipefail
IMAGE_TAG=${1:?Usage: deploy.sh IMAGE_TAG}
[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid image tag' >&2; exit 1; }
ROOT=/opt/mern-todo
RELEASE="$ROOT/releases/$IMAGE_TAG"
export IMAGE_TAG
exec 9>"$ROOT/deploy.lock"
flock -x 9
cd "$RELEASE"
sha256sum --check SHA256SUMS
[[ -s "$ROOT/backend.env" ]] || { echo 'Missing backend.env' >&2; exit 1; }
[[ -s "$ROOT/grafana-admin-password" ]] || { echo 'Missing grafana-admin-password' >&2; exit 1; }
docker load -i images.tar
previous=''
if [[ -f "$ROOT/current" ]]; then
  previous=$(cat "$ROOT/current")
  [[ "$previous" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || exit 1
fi
if ! docker compose -p mern-todo -f compose.yml up -d --wait --wait-timeout 180; then
  echo 'Deployment failed; restoring previous release if available.' >&2
  if [[ -n "$previous" ]]; then
    IMAGE_TAG="$previous" docker compose -p mern-todo -f "$ROOT/releases/$previous/compose.yml" up -d --wait --wait-timeout 180
  fi
  exit 1
fi
printf '%s\n' "$IMAGE_TAG" > "$ROOT/current.tmp"
mv "$ROOT/current.tmp" "$ROOT/current"
echo "Deployed $IMAGE_TAG"
