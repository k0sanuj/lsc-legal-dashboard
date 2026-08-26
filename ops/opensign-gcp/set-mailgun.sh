#!/usr/bin/env bash
# Inject real Mailgun credentials into a running OpenSign VM and restart the
# server container. Use this after deploy.sh ran with ALLOW_PLACEHOLDER_MAIL=1.
#
# Usage:
#   MAILGUN_API_KEY=key-... MAILGUN_DOMAIN=futureofsports.io \
#   MAILGUN_SENDER=legal@futureofsports.io ops/opensign-gcp/set-mailgun.sh
#
# MAILGUN_SENDER must be a BARE address here, unlike the dashboard which accepts
# a display name. OpenSign builds its From header as `appName <MAILGUN_SENDER>`,
# so a "Name <addr>" value nests the angle brackets and every send fails with
# Mailgun 400 "from parameter is not a valid address". The display name comes
# from appName in .env.prod instead.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-fsp-legal-esign}"
INSTANCE="${INSTANCE:-opensign-vm}"
ZONE="${ZONE:-}"

# OpenSign wraps this value in angle brackets itself; a display name here
# produces a nested, invalid From header and silently breaks every email.
case "${MAILGUN_SENDER:-}" in
  *"<"*|*">"*)
    echo "ERROR: MAILGUN_SENDER must be a bare address for OpenSign, for example" >&2
    echo "       legal@futureofsports.io, not 'Name <legal@futureofsports.io>'." >&2
    echo "       OpenSign builds its From header as appName <MAILGUN_SENDER>, so a" >&2
    echo "       display name here nests the brackets and Mailgun rejects every send." >&2
    echo "       Set the display name with appName in .env.prod instead." >&2
    exit 1
    ;;
esac

for var in MAILGUN_API_KEY MAILGUN_DOMAIN MAILGUN_SENDER; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is required." >&2
    exit 1
  fi
done

if [ -z "$ZONE" ]; then
  ZONE="$(gcloud --project="$PROJECT_ID" compute instances list \
    --filter="name=$INSTANCE" --format='value(zone)' | head -1)"
fi
if [ -z "$ZONE" ]; then
  echo "ERROR: could not find instance $INSTANCE in project $PROJECT_ID." >&2
  exit 1
fi

remote=$(cat <<EOF
set -euo pipefail
cd /opt/opensign
sudo sed -i \
  -e 's|^MAILGUN_API_KEY=.*|MAILGUN_API_KEY=${MAILGUN_API_KEY}|' \
  -e 's|^MAILGUN_DOMAIN=.*|MAILGUN_DOMAIN=${MAILGUN_DOMAIN}|' \
  -e 's|^MAILGUN_SENDER=.*|MAILGUN_SENDER=${MAILGUN_SENDER}|' \
  .env.prod
sudo grep -c REPLACE_ME .env.prod && echo "WARNING: placeholders remain in .env.prod" || true
sudo docker compose up -d --force-recreate server client
sudo docker compose ps
EOF
)

gcloud --project="$PROJECT_ID" compute ssh "$INSTANCE" --zone="$ZONE" --quiet --command="$remote"

echo
echo "Mailgun credentials applied. Send a test document and confirm delivery."
