#!/usr/bin/env bash
set -euo pipefail

# Source to retain PATH in Buildkite; GitHub receives it through GITHUB_PATH.
entire_tools_root="${TABELLIO_ENTIRE_TOOLS_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/tabellio-entire-0.7.7}"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    entire_archive_name=entire_linux_amd64.tar.gz
    entire_archive_digest=63d89e2ac57fc52307907a15b168a7b0bf7b114993b27f8fa943dfdb4159ad26
    ;;
  Darwin-arm64)
    entire_archive_name=entire_darwin_arm64.tar.gz
    entire_archive_digest=960f25c18ebd7fa66c00081fc0abff64ce34774ff7ce0c03e3b5d12a4b134568
    ;;
  *) printf '%s\n' 'Unsupported Entire tool platform.' >&2; exit 1 ;;
esac
mkdir -p "$entire_tools_root"
entire_archive_path="$entire_tools_root/$entire_archive_name"
if [[ ! -f "$entire_archive_path" ]]; then
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --connect-timeout 15 --max-time 120 \
    "https://github.com/entireio/cli/releases/download/v0.7.7/$entire_archive_name" \
    --output "$entire_archive_path"
fi
node --input-type=module - "$entire_archive_path" "$entire_archive_digest" <<'NODE'
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const actual = createHash('sha256').update(readFileSync(process.argv[2])).digest('hex');
if (actual !== process.argv[3]) throw new Error('Entire archive integrity mismatch.');
NODE
tar -xzf "$entire_archive_path" -C "$entire_tools_root" entire
export PATH="$entire_tools_root:$PATH"
entire version | grep -Eq '^Entire CLI v?0\.7\.7([[:space:]]|$)'
if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$entire_tools_root" >> "$GITHUB_PATH"
fi
