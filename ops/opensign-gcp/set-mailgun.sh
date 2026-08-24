#!/usr/bin/env bash
# Inject real Mailgun credentials into a running OpenSign VM and restart the
# server container. Use this after deploy.sh ran with ALLOW_PLACEHOLDER_MAIL=1.
#
# Usage:
#   MAILGUN_API_KEY=key-... MAILGUN_DOMAIN=futureofsports.io \
#   MAILGUN_SENDER='League Sports Legal <legal@futureofsports.io>' ops/opensign-gcp/set-mailgun.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-fsp-legal-esign}"
INSTANCE="${INSTANCE:-opensign-vm}"
ZONE="${ZONE:-}"

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
