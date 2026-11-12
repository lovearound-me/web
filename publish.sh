#!/usr/bin/env bash
#
# publish.sh — build the web client and publish it to Firebase Hosting, the
# site lovearound-app, served at app.lovearound.me.
#
# Terraform (the server repo, deploy/hosting.tf) owns the hosting site, its
# custom domain and the sign-in's authorized domains; this script owns only
# its content. firebase-tools runs in a node container and authenticates with
# the host's gcloud Application Default Credentials. Idempotent and
# re-runnable.
#
# Env overrides (all optional): PROJECT_ID, ADC
#
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-needed-app-2026}"
ADC="${ADC:-$HOME/.config/gcloud/application_default_credentials.json}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[[ -f "$ADC" ]] || { echo ">> no ADC at $ADC — run 'gcloud auth application-default login'"; exit 1; }

# public/: src/ as is, with the dictionaries; stops if English lacks a text.
python3 "$ROOT/build.py"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$ROOT/firebase.json" "$ROOT/.firebaserc" "$STAGE/"
cp -R "$ROOT/public" "$STAGE/"

echo ">> deploying hosting:lovearound-app on ${PROJECT_ID}"
docker run --rm \
  -v "$STAGE:/site" -w /site \
  -v "$ADC:/adc.json:ro" -e GOOGLE_APPLICATION_CREDENTIALS=/adc.json \
  node:22-slim \
  npx --yes firebase-tools@13.29.1 deploy \
    --project "$PROJECT_ID" --only hosting:lovearound-app --non-interactive \
    --message "$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%s)"
echo ">> done: https://app.lovearound.me"
