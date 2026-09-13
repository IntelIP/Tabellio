#!/usr/bin/env bash
set -euo pipefail

elevate=()
if [[ "$(id -u)" != 0 ]]; then
  elevate=(sudo -n)
fi

if ! bash .buildkite/scripts/verify-git-toolchain.sh --check-version "$(git version | awk '{print $3}')"; then
  "${elevate[@]}" apt-get update -qq
  "${elevate[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends software-properties-common
  "${elevate[@]}" add-apt-repository -y ppa:git-core/ppa
  "${elevate[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git
fi
bash .buildkite/scripts/verify-git-toolchain.sh --check-version "$(git version | awk '{print $3}')"

if ! command -v pg_config >/dev/null || [[ ! -x "$(pg_config --bindir)/initdb" ]]; then
  "${elevate[@]}" apt-get update -qq
  "${elevate[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql postgresql-client libpq-dev
fi
test -x "$(pg_config --bindir)/initdb"
test -x "$(pg_config --bindir)/pg_ctl"
