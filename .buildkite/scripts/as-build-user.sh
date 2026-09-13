#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" == 0 ]]; then
  # PostgreSQL refuses root. Each hosted job has its own disposable checkout.
  test "${MISE_DATA_DIR:-}" = /tmp/tabellio-mise
  test "$(pwd -P)" != /
  useradd --create-home --shell /bin/bash tabellio-ci
  chown -R tabellio-ci:tabellio-ci "$(pwd -P)" "$MISE_DATA_DIR"
  exec runuser -u tabellio-ci -- env HOME=/home/tabellio-ci bash "$@"
fi

exec bash "$@"
