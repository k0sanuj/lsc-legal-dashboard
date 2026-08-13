#!/usr/bin/env bash
# Deploy the OpenSign stack (server, client, MongoDB, Caddy) onto a single
# Compute Engine VM in the FSP GCP organisation. Idempotent: re-running
# reconciles the VM and redeploys the containers.
#
# Required env:
#   MAILGUN_API_KEY   Mailgun private API key
#   MAILGUN_DOMAIN    Mailgun sending domain, e.g. mg.leaguesports.co
#   MAILGUN_SENDER    From address on that domain
#   ACME_EMAIL        Contact address for the Let's Encrypt account
#
# Optional env:
#   PROJECT_ID        GCP project (default fsp-legal-esign)
#   INSTANCE          VM name (default opensign-vm)
#   MACHINE_TYPE      default e2-medium
#   OPENSIGN_HOST     Public hostname. Defaults to a sslip.io name derived from
#                     the reserved static IP, which needs no DNS setup.
#   SSH_SOURCE_RANGE  CIDR allowed to reach port 22 (default 0.0.0.0/0)
#   MASTER_KEY        OpenSign Parse master key (generated if unset)

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-fsp-legal-esign}"
INSTANCE="${INSTANCE:-opensign-vm}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-medium}"
DISK_SIZE="${DISK_SIZE:-40GB}"
SSH_SOURCE_RANGE="${SSH_SOURCE_RANGE:-0.0.0.0/0}"
ADDRESS_NAME="${ADDRESS_NAME:-opensign-ip}"
ZONE_CANDIDATES="${ZONE_CANDIDATES:-me-central1-a europe-west1-b us-central1-a}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ALLOW_PLACEHOLDER_MAIL=1 brings the stack up with unusable placeholder mail
# credentials so the infrastructure can be provisioned and verified before the
# Mailgun account exists. Outbound email stays broken until set-mailgun.sh runs.
if [ "${ALLOW_PLACEHOLDER_MAIL:-0}" = "1" ]; then
  MAILGUN_API_KEY="${MAILGUN_API_KEY:-REPLACE_ME_MAILGUN_API_KEY}"
  MAILGUN_DOMAIN="${MAILGUN_DOMAIN:-REPLACE_ME_MAILGUN_DOMAIN}"
  MAILGUN_SENDER="${MAILGUN_SENDER:-postmaster@REPLACE_ME_MAILGUN_DOMAIN}"
  ACME_EMAIL="${ACME_EMAIL:-legal@leaguesports.co}"
  echo "WARNING: deploying with placeholder Mailgun credentials."
  echo "         Run ops/opensign-gcp/set-mailgun.sh once the real key exists."
fi

for var in MAILGUN_API_KEY MAILGUN_DOMAIN MAILGUN_SENDER ACME_EMAIL; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is required. See the header of this script." >&2
    exit 1
  fi
done

gc() { gcloud --project="$PROJECT_ID" "$@"; }

step() { printf '\n=== %s ===\n' "$1"; }

step "Enabling required APIs"
gc services enable compute.googleapis.com oslogin.googleapis.com >/dev/null

step "Ensuring a default VPC network exists"
if ! gc compute networks describe default >/dev/null 2>&1; then
  gc compute networks create default --subnet-mode=auto >/dev/null
fi

step "Selecting a zone with $MACHINE_TYPE capacity"
ZONE=""
for candidate in $ZONE_CANDIDATES; do
  if gc compute machine-types describe "$MACHINE_TYPE" --zone="$candidate" >/dev/null 2>&1; then
    ZONE="$candidate"
    break
  fi
done
if [ -z "$ZONE" ]; then
  echo "ERROR: $MACHINE_TYPE is not offered in any of: $ZONE_CANDIDATES" >&2
  exit 1
fi
REGION="${ZONE%-*}"
echo "zone=$ZONE region=$REGION"

step "Reserving a static external IP"
if ! gc compute addresses describe "$ADDRESS_NAME" --region="$REGION" >/dev/null 2>&1; then
  gc compute addresses create "$ADDRESS_NAME" --region="$REGION" >/dev/null
fi
STATIC_IP="$(gc compute addresses describe "$ADDRESS_NAME" --region="$REGION" --format='value(address)')"
echo "ip=$STATIC_IP"

HOST="${OPENSIGN_HOST:-sign-${STATIC_IP//./-}.sslip.io}"
HOST_URL="https://${HOST}"
echo "host=$HOST"

step "Opening firewall for HTTP, HTTPS and SSH"
if ! gc compute firewall-rules describe opensign-allow-web >/dev/null 2>&1; then
  gc compute firewall-rules create opensign-allow-web \
    --network=default --allow=tcp:80,tcp:443,udp:443 \
    --source-ranges=0.0.0.0/0 --target-tags=opensign >/dev/null
fi
if ! gc compute firewall-rules describe opensign-allow-ssh >/dev/null 2>&1; then
  gc compute firewall-rules create opensign-allow-ssh \
    --network=default --allow=tcp:22 \
    --source-ranges="$SSH_SOURCE_RANGE" --target-tags=opensign >/dev/null
fi

step "Creating the VM"
if gc compute instances describe "$INSTANCE" --zone="$ZONE" >/dev/null 2>&1; then
  echo "instance already exists, reusing it"
else
  gc compute instances create "$INSTANCE" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --image-family=ubuntu-2404-lts-amd64 \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size="$DISK_SIZE" \
    --boot-disk-type=pd-balanced \
    --address="$STATIC_IP" \
    --tags=opensign \
    --metadata=enable-oslogin=TRUE \
    --metadata-from-file=startup-script="$SCRIPT_DIR/startup-script.sh" >/dev/null
fi

step "Waiting for SSH and for Docker to finish installing"
# Force the SSH key pair into existence first. On a machine that has never used
# gcloud compute ssh, key generation inside the poll loop swallows its own
# progress and the loop can spin until it times out.
gc compute config-ssh --quiet >/dev/null 2>&1 || true
for attempt in $(seq 1 40); do
  if gc compute ssh "$INSTANCE" --zone="$ZONE" --quiet \
      --command='test -f /var/lib/opensign-bootstrap-done' >/dev/null 2>&1; then
    echo "vm ready"
    break
  fi
  if [ "$attempt" -eq 40 ]; then
    echo "ERROR: VM did not become ready. Inspect the serial console:" >&2
    echo "  gcloud compute instances get-serial-port-output $INSTANCE --zone=$ZONE --project=$PROJECT_ID" >&2
    exit 1
  fi
  sleep 15
done

step "Rendering .env.prod"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
# openssl rather than `tr </dev/urandom | head`: head closing the pipe early makes
# tr exit on SIGPIPE, which pipefail turns into a fatal script error.
MASTER_KEY="${MASTER_KEY:-$(openssl rand -hex 12)}"
sed \
  -e "s|^MASTER_KEY=.*|MASTER_KEY=${MASTER_KEY}|" \
  -e "s|^MAILGUN_API_KEY=.*|MAILGUN_API_KEY=${MAILGUN_API_KEY}|" \
  -e "s|^MAILGUN_DOMAIN=.*|MAILGUN_DOMAIN=${MAILGUN_DOMAIN}|" \
  -e "s|^MAILGUN_SENDER=.*|MAILGUN_SENDER=${MAILGUN_SENDER}|" \
  "$SCRIPT_DIR/env.prod.example" >"$STAGING/.env.prod"
{
  echo "PUBLIC_URL=${HOST_URL}"
  echo "SERVER_URL=${HOST_URL}/api/app"
} >>"$STAGING/.env.prod"

cp "$SCRIPT_DIR/docker-compose.yml" "$SCRIPT_DIR/Caddyfile" "$STAGING/"
cat >"$STAGING/.env" <<EOF
HOST=${HOST}
HOST_URL=${HOST_URL}
ACME_EMAIL=${ACME_EMAIL}
EOF

step "Uploading the stack"
gc compute ssh "$INSTANCE" --zone="$ZONE" --quiet --command='sudo mkdir -p /opt/opensign && sudo chown -R $(id -u):$(id -g) /opt/opensign'
gc compute scp --zone="$ZONE" --quiet \
  "$STAGING/.env.prod" "$STAGING/.env" "$STAGING/docker-compose.yml" "$STAGING/Caddyfile" \
  "$INSTANCE:/opt/opensign/"

step "Starting the containers"
gc compute ssh "$INSTANCE" --zone="$ZONE" --quiet \
  --command='cd /opt/opensign && sudo docker compose pull --quiet && sudo docker compose up -d && sudo docker compose ps'

step "Waiting for HTTPS to answer"
for attempt in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HOST_URL" || true)"
  if [ "$code" = "200" ] || [ "$code" = "302" ]; then
    echo "https up (HTTP $code)"
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "WARNING: $HOST_URL did not answer yet (last code: $code)." >&2
    echo "Certificate issuance can lag. Check: sudo docker compose logs caddy" >&2
  fi
  sleep 10
done

cat <<EOF

=== OpenSign deployed ===
Project        : $PROJECT_ID
Zone           : $ZONE
Instance       : $INSTANCE
Static IP      : $STATIC_IP
Web app        : $HOST_URL
API root       : $HOST_URL/api
Parse mount    : $HOST_URL/api/app
Master key     : $MASTER_KEY   (store this in a password manager, it is not saved anywhere else)

Next steps:
  1. Sign in to $HOST_URL and create the admin account.
  2. Generate an API token under Settings, then set OPENSIGN_API_TOKEN in Vercel.
  3. Point the OpenSign webhook at the value of OPENSIGN_WEBHOOK_URL and set the
     shared secret to OPENSIGN_WEBHOOK_SECRET.
  4. Confirm OPENSIGN_BASE_URL with: ops/opensign-gcp/probe-api.sh $HOST_URL
EOF
