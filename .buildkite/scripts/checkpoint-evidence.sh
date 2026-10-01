#!/usr/bin/env bash
set -euo pipefail
# Import only native checkpoint history explicitly supplied by the operator.
# The subsequent product gate still verifies metadata and exact-candidate association.
checkpoint_ref=refs/heads/entire/checkpoints/v1
if [[ -n "${TABELLIO_CHECKPOINT_BUNDLE:-}" ]]; then
  bundle="$TABELLIO_CHECKPOINT_BUNDLE"
  if [[ ! -f "$bundle" ]] || ! git bundle verify "$bundle" >/dev/null 2>&1; then
    echo 'Checkpoint setup blocked: supplied bundle is missing, invalid, or has unavailable prerequisites.' >&2
    exit 1
  fi
  if ! git bundle list-heads "$bundle" "$checkpoint_ref" | awk -v ref="$checkpoint_ref" '$2 == ref { found=1 } END { exit !found }'; then
    echo 'Checkpoint setup blocked: bundle does not advertise the native Entire checkpoint ref.' >&2
    exit 1
  fi
  # No force: divergent existing history requires explicit operator reconciliation.
  if head -n 4 "$bundle" | grep -q '^@filter='; then
    # Native filtered bundles preserve original object IDs and use promisor packs.
    # Ordinary fetch rejects their intentionally absent transcript/prompt blobs.
    advertised="$(git bundle list-heads "$bundle")"
    imported="$(printf '%s\n' "$advertised" | awk -v ref="$checkpoint_ref" '$2 == ref { print $1 }')"
    if [[ "$(printf '%s\n' "$advertised" | wc -l | tr -d ' ')" != 1 ]] ||
       ! git bundle unbundle "$bundle" >/dev/null 2>&1; then
      echo 'Checkpoint setup blocked: filtered native history import failed.' >&2
      exit 1
    fi
    current="$(git rev-parse --verify "$checkpoint_ref" 2>/dev/null || true)"
    if [[ -n "$current" ]] && ! git merge-base --is-ancestor "$current" "$imported"; then
      echo 'Checkpoint setup blocked: divergent native history requires operator reconciliation.' >&2
      exit 1
    fi
    if ! git update-ref "$checkpoint_ref" "$imported" "$current"; then
      echo 'Checkpoint setup blocked: native history changed during import.' >&2
      exit 1
    fi
  elif ! git fetch --no-tags "$bundle" "$checkpoint_ref:$checkpoint_ref" >/dev/null 2>&1; then
    echo 'Checkpoint setup blocked: native checkpoint import failed; reconcile existing history on the trusted worker.' >&2
    exit 1
  fi
fi
if ! git rev-parse --verify "$checkpoint_ref^{commit}" >/dev/null 2>&1; then
  echo 'Checkpoint setup blocked: use a trusted worker with genuine native Entire history, or supply TABELLIO_CHECKPOINT_BUNDLE from customer-owned private storage. Never upload session records to public CI artifacts.' >&2
  exit 1
fi
