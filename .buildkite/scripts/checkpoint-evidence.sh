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
  if ! git fetch --no-tags "$bundle" "$checkpoint_ref:$checkpoint_ref" >/dev/null 2>&1; then
    echo 'Checkpoint setup blocked: native checkpoint import failed; reconcile existing history on the trusted worker.' >&2
    exit 1
  fi
fi
if ! git rev-parse --verify "$checkpoint_ref^{commit}" >/dev/null 2>&1; then
  echo 'Checkpoint setup blocked: use a trusted worker with genuine native Entire history, or supply TABELLIO_CHECKPOINT_BUNDLE from customer-owned private storage. Never upload session records to public CI artifacts.' >&2
  exit 1
fi
