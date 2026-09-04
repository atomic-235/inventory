#!/usr/bin/env bash
# Map the `with-secrets cloud` secrets group onto the standard S3 env vars the
# TUI reads, mirroring how git-backup/git-restore wire Yandex via rclone.
#
#   with-secrets cloud ./packages/tui/cloud.sh pnpm --filter @inventory/tui start
#
# INVENTORY_PASSPHRASE is already in the cloud secrets group (nix/secrets/cloud.yaml)
# and flows through unchanged. S3_BUCKET must be exported in your environment.
set -euo pipefail

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-$YANDEX_CLOUD_SYNC_ID}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-$YANDEX_CLOUD_SYNC_KEY}"
export AWS_ENDPOINT_URL_S3="${AWS_ENDPOINT_URL_S3:-https://storage.yandexcloud.net}"
export AWS_REGION="${AWS_REGION:-ru-central1}"
export S3_BUCKET="${S3_BUCKET:-sync-bucket}"
export S3_OBJECT_KEY="${S3_OBJECT_KEY:-inventory.sqlite}"

exec "$@"
