#!/usr/bin/env bash
set -euo pipefail

build_context="${TABELLIO_BUILD_CONTEXT:-provider}"
pull_request="${BUILDKITE_PULL_REQUEST:-false}"
pipeline_branch="${BUILDKITE_BRANCH:-}"
default_branch="${BUILDKITE_PIPELINE_DEFAULT_BRANCH:-main}"
default_branch_build=false
if [[ "$pull_request" == "false" && "$pipeline_branch" == "$default_branch" ]]; then
  default_branch_build=true
fi
if [[ "$pull_request" == "false" && "$build_context" != "preflight" && "$default_branch_build" != "true" ]]; then
  printf '%s\n' '{"decision":"not_required","reason":"product validation runs on pull requests, the default branch, or explicit preflight builds."}' > tabellio-validation-result.json
  exit 0
fi

. .buildkite/scripts/verify-git-toolchain.sh
. .buildkite/scripts/security-tools.sh
. .buildkite/scripts/entire-tools.sh

postgres_bin="$(pg_config --bindir)"
test -x "$postgres_bin/initdb"
test -x "$postgres_bin/pg_ctl"
export PATH="$postgres_bin:$PATH"

bash .buildkite/scripts/checkpoint-evidence.sh

repository_id="${TABELLIO_REPO_ID:-}"
if [[ -z "$repository_id" ]]; then
  repository_url="$(git remote get-url origin)"
  repository_id="$(node -e 'const u=process.argv[1]; const m=u.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/); if(!m)process.exit(1); console.log(m[1]);' "$repository_url")"
fi
[[ "$repository_id" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "A valid customer repository ID is required." >&2; exit 1; }

candidate="${BUILDKITE_COMMIT:-HEAD}"
base_branch="${BUILDKITE_PULL_REQUEST_BASE_BRANCH:-${TABELLIO_BASE_BRANCH:-main}}"
base_ref="origin/${base_branch}"
checkpoint_args=()

git fetch --no-tags origin "+refs/heads/${base_branch}:refs/remotes/origin/${base_branch}"
test "$(git rev-parse HEAD^{commit})" = "$(git rev-parse "${candidate}^{commit}")"

umask 077
temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT

if [[ "$default_branch_build" == "true" ]]; then
  base_ref="HEAD^"
  checkpoint_output="$temporary_dir/checkpoint-output"
  github_headers=(
    -H "Accept: application/vnd.github+json"
    -H "X-GitHub-Api-Version: 2022-11-28"
  )
  if [[ -n "${BUILDKITE_GITHUB_TOKEN:-}" ]]; then
    github_header_file="$temporary_dir/github-headers"
    (umask 077 && printf 'Authorization: Bearer %s\n' "$BUILDKITE_GITHUB_TOKEN" > "$github_header_file")
    github_headers+=(-H "@${github_header_file}")
  fi
  if ! curl --fail --silent --show-error \
    "${github_headers[@]}" \
    "https://api.github.com/repos/${repository_id}/commits/${candidate}/pulls" \
    | node scripts/resolve-merged-checkpoint.mjs \
        --commit "$candidate" \
        --github-output "$checkpoint_output"; then
    printf '%s\n' "Merged checkpoint resolution failed." >&2
    exit 1
  fi
  found="$(awk -F= '$1 == "found" { print $2 }' "$checkpoint_output")"
  if [[ "$found" == "true" ]]; then
    checkpoint_fetch_ref="$(awk -F= '$1 == "fetch_ref" { print $2 }' "$checkpoint_output")"
    checkpoint_local_ref="$(awk -F= '$1 == "local_ref" { print $2 }' "$checkpoint_output")"
    resolved_checkpoint_head="$(awk -F= '$1 == "head" { print $2 }' "$checkpoint_output")"
    if [[ -z "$checkpoint_fetch_ref" || -z "$checkpoint_local_ref" || -z "$resolved_checkpoint_head" ]]; then
      printf '%s\n' "Merged checkpoint output is incomplete." >&2
      exit 1
    fi
    if ! git fetch --no-tags origin "+${checkpoint_fetch_ref}:${checkpoint_local_ref}"; then
      printf '%s\n' "Merged checkpoint fetch failed." >&2
      exit 1
    fi
    fetched_checkpoint_head="$(git rev-parse "${checkpoint_local_ref}^{commit}")"
    if [[ "$fetched_checkpoint_head" != "$resolved_checkpoint_head" ]]; then
      printf '%s\n' "Merged checkpoint identity changed during resolution." >&2
      exit 1
    fi
    checkpoint_args=(
      --checkpoint-base "$base_ref"
      --checkpoint-head "$resolved_checkpoint_head"
    )
  elif [[ "$found" != "false" ]]; then
    printf '%s\n' "Merged checkpoint result is invalid." >&2
    exit 1
  fi
fi

install -m 755 scripts/tabellio-validator.mjs "$temporary_dir/tabellio-validator"

if ! PATH="$temporary_dir:$PATH" node scripts/tabellio-validate.mjs gate \
  --repo . \
  --repo-id "$repository_id" \
  --runner-id "buildkite:${BUILDKITE_BUILD_ID:?Buildkite build ID is required}" \
  --base "$base_ref" \
  --commit HEAD \
  "${checkpoint_args[@]}" \
  --manifest tabellio.validation.json \
  > "$temporary_dir/tabellio-validation-private.json" 2> "$temporary_dir/validation-stderr.log"; then
  node scripts/validation-public-summary.mjs "$temporary_dir/tabellio-validation-private.json" tabellio-validation-result.json
  printf '%s\n' "Product validation failed; inspect the trusted worker result. Missing genuine checkpoint evidence must fail the gate." >&2
  exit 1
fi

node scripts/validation-public-summary.mjs "$temporary_dir/tabellio-validation-private.json" tabellio-validation-result.json
# Native validation refs remain private on the trusted worker; never upload them as public CI artifacts.
