#!/usr/bin/env bash
set -euo pipefail
usage() {
  echo 'Usage: sudo bash setup-mailcow.sh --hostname mail.example.com --commit FULL_UPSTREAM_SHA [--timezone Etc/UTC] [--start]'
  echo 'Configure a new dedicated Mailcow host. Existing installations are never overwritten.'
}
hostname=''
commit=''
timezone='Etc/UTC'
start=false
while (($#)); do
  case "$1" in
    --hostname|--commit|--timezone)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      case "$1" in
        --hostname) hostname=$2 ;;
        --commit) commit=$2 ;;
        --timezone) timezone=$2 ;;
      esac
      shift 2 ;;
    --start) start=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
[[ "$hostname" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$ && ${#hostname} -le 253 ]] || { echo 'A valid mail server FQDN is required.' >&2; exit 2; }
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'Provide the full SHA of a reviewed Mailcow release commit.' >&2; exit 2; }
[[ "$timezone" =~ ^[a-zA-Z0-9_+-]+(/[a-zA-Z0-9_+-]+)*$ && -f "/usr/share/zoneinfo/$timezone" ]] || { echo 'Invalid timezone.' >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo 'Run this script as root on the dedicated mail host.' >&2; exit 1; }
for tool in docker git openssl ss; do
  command -v "$tool" >/dev/null || { echo "Install required tool: $tool" >&2; exit 1; }
done
docker info >/dev/null
docker compose version >/dev/null
root=/opt/mailcow-dockerized
[[ ! -e "$root" ]] || { echo 'Existing Mailcow directory found; use the official update procedure instead.' >&2; exit 1; }
for port in 25 80 110 143 443 465 587 993 995 4190; do
  [[ -z "$(ss -H -ltn "sport = :$port")" ]] || { echo "Port $port is already in use. Use a dedicated mail host." >&2; exit 1; }
done
umask 0022
git clone --branch master https://github.com/mailcow/mailcow-dockerized.git "$root"
cd "$root"
git cat-file -e "$commit^{commit}"
git checkout -b mern-mailcow "$commit"
git branch --set-upstream-to=origin/master mern-mailcow
# Keep the reviewed commit while delegating generated secrets and platform settings to Mailcow.
MAILCOW_HOSTNAME="$hostname" MAILCOW_TZ="$timezone" SKIP_CLAMD=n ./generate_config.sh --dev
[[ $(git rev-parse HEAD) == "$commit" ]] || { echo 'Mailcow revision changed unexpectedly.' >&2; exit 1; }
chmod 600 mailcow.conf
docker compose config --quiet
if "$start"; then
  docker compose pull
  docker compose up -d
fi
echo "Mailcow configuration created at $root."
echo 'Complete DNS, certificates, administrator credentials, domain and mailbox setup using README.md.'
