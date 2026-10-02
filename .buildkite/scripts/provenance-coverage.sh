#!/usr/bin/env bash
set -euo pipefail

postgres_bin="$(pg_config --bindir)"
test -x "$postgres_bin/initdb"
test -x "$postgres_bin/pg_ctl"
export PATH="$postgres_bin:$PATH"

# Run the storage/security/publication suite and changed local-workflow tests
# directly with one file worker, so actual two-process race tests remain intact
# while unrelated Git fixtures do not compete. Their individual
# test deadlines and the existing job deadline apply instead of the demo's
# unrelated 60-second child-process deadline. Do not skip PostgreSQL evidence.
umask 077
coverage_pg_root="$(mktemp -d /tmp/tabellio-coverage-pg.XXXXXX)"
coverage_pg_data="$coverage_pg_root/data"
coverage_pg_socket="$coverage_pg_root/socket"
cleanup_coverage_postgres() {
  [[ -n "$coverage_pg_root" ]] || return 0
  if [[ -f "$coverage_pg_data/PG_VERSION" ]]; then
    if pg_ctl -D "$coverage_pg_data" status >/dev/null 2>&1; then
      if ! pg_ctl -D "$coverage_pg_data" -m fast -w -t 30 stop >/dev/null 2>&1; then
        printf '%s\n' "Coverage PostgreSQL cleanup failed; preserve $coverage_pg_root for recovery." >&2
        return 1
      fi
    else
      coverage_pg_status=$?
      if [[ "$coverage_pg_status" != 3 ]]; then
        printf '%s\n' "Coverage PostgreSQL state is uncertain; preserve $coverage_pg_root for recovery." >&2
        return 1
      fi
    fi
  fi
  if ! rm -rf "$coverage_pg_root"; then
    printf '%s\n' "Coverage PostgreSQL directory cleanup failed; preserve $coverage_pg_root for recovery." >&2
    return 1
  fi
  coverage_pg_root=
}
trap 'coverage_exit=$?; trap - EXIT; if ! cleanup_coverage_postgres; then exit 1; fi; exit "$coverage_exit"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$coverage_pg_socket"
initdb -D "$coverage_pg_data" --auth-local=trust --auth-host=reject \
  --username=tabellio --encoding=UTF8 --no-locale >/dev/null
pg_ctl -D "$coverage_pg_data" -l "$coverage_pg_root/postgres.log" \
  -o "-c listen_addresses='' -k $coverage_pg_socket" -w -t 30 start >/dev/null
TABELLIO_REQUIRE_POSTGRES=1 TABELLIO_TEST_PG_SOCKET="$coverage_pg_socket" TABELLIO_TEST_PG_USER=tabellio \
  c8 --exclude '**/node_modules/**' --reporter=json --reports-dir coverage \
  node --test --test-concurrency=1 tests/local-provenance-store.test.mjs tests/provenance-ledger.test.mjs \
    tests/provenance-sources.test.mjs tests/provenance-security.test.mjs \
    tests/provenance-security-scanners.test.mjs tests/provenance-review-result.test.mjs \
    tests/provenance-review-publication.test.mjs \
    tests/platform-config.test.mjs tests/preflight.test.mjs \
    tests/release-workflow.test.mjs tests/release-cli.test.mjs tests/checkpoint-evidence.test.mjs tests/checkpoint-proof.test.mjs
cleanup_coverage_postgres

# Preserve the same real recovery demo coverage without rerunning that suite
# through its nested child-process wrapper.
c8 --clean=false --exclude '**/node_modules/**' --reporter=json --reports-dir coverage \
  node scripts/demo-provenance.mjs --out coverage/provenance-demo.json

# Include the policy benchmark and negative setup diagnostics without discarding
# the integration demo coverage collected above.
c8 --clean=false --exclude '**/node_modules/**' --reporter=json --reports-dir coverage \
  node --test --test-concurrency=1 tests/provenance-benchmark.test.mjs tests/demo-provenance.test.mjs tests/validation-checkpoints.test.mjs

# Fallow 2.89 consumes function/statement coverage but rejects c8's unknown
# branch-column sentinel (-1). Preserve the original report; omit only branch
# maps in its input, without changing any measured function or statement hits.
jq 'with_entries(.value |= (.branchMap = {} | .b = {}))' \
  coverage/coverage-final.json > coverage/fallow-coverage.json
