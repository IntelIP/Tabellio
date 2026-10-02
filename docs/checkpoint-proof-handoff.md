# Private checkpoint proof preparation

Prepare and verify a bounded metadata-only handoff from genuine local Entire 0.7.7 checkpoints. This command never captures a session, uploads evidence, changes an environment, creates credentials, or approves a gate. It reuses the canonical exporter and audits the actual serialized pack against the selected native metadata object IDs. Keep the native ref and private backup locally.

Use Node 22, Entire 0.7.7, Git, and an existing authenticated GitHub CLI with repository read access. Fetch current public source refs first; check out the exact published candidate. Choose a new output directory outside both the source checkout and Git directory, with an existing private parent directory.

```sh
npm run tabellio:checkpoint:proof -- prepare \
  --repo-id github.com/OWNER/REPO --event pull_request \
  --candidate FULL_COMMIT_ID --pull-request PR_NUMBER --out /private/handoff

npm run tabellio:checkpoint:proof -- check \
  --out /private/handoff --scope-sha256 DIGEST_FROM_PREPARE
```

For the current landed main commit, use `--event push` and omit `--pull-request`. The tool reads GitHub's merged-PR association and preserves the original source head as the checkpoint range, while the envelope binds the landed candidate to its first parent. Source and landed trees must match. Missing source objects fail closed; fetch the public PR head into the existing checkout and retry. No history is reconstructed.

Preparation creates a directory with mode 0700 and five files with mode 0600: `scope.json`, `metadata.bundle`, `envelope.json`, `part-1.txt`, and `part-2.txt`. It refuses existing output directories, repository/Git destinations (including symlinks), inline prompt references, unsupported metadata fields, extra packed blobs, and envelopes exceeding the existing two-secret transport limits. Failed preparation removes only its newly created directory. Successful preparation preserves the private files for review. Stdout contains scope and digests, never secret chunks or session content.

Review `scope.json` privately. Approval must name its digest, repository, event, candidate, validation base, checkpoint range, destination, sharing scope, and cleanup plan. Keep the digest separately; verification uses it to detect changes to both scope and transport. The local check also rejects expired preparation (24 hours), moved local/remote candidate targets, changed PR merge bases, and changed merged-source associations. It does not validate a dirty worktree or grant approval. The existing hosted envelope has no expiry field: the 24-hour expiry protects local checking only, so run `check` immediately before an independently approved handoff and verify the exact hosted head again.

After explicit approval, an operator may supply the two part files through the existing encrypted secret-input mechanism to an appropriately protected exact-run environment. Do not put these files in Git, PR comments, logs, artifacts, or a public checkpoint ref. This tool deliberately performs no remote mutation. Creating persistent access, changing protection, or sharing proof for another candidate requires separate authorization. A premerge handoff does not authorize a postmerge handoff.

Record the real hosted validators and runner cleanup result, then remove only handoff-owned secrets/environment resources and temporary local transport copies. Missing proof leaves the hosted gate blocked; do not describe skipped validators as passed. Retain customer-owned native checkpoints and backups. Entire 0.7.7 has no authenticated commit binding, so the genuine trusted producer and its Git association remain part of the trust boundary; metadata filtering is not a substitute for that boundary.

## What this command replaces

One preparation command replaces manual repository/base selection, squash-source lookup, exporter argument assembly, serialized pack inspection, envelope/base64 construction, transport-size calculation, chunk splitting, private file creation, and scope digest assembly. One check command replaces manual comparisons of those files, expiry, the local/remote candidate, PR base freshness, and merged-source association. It makes no hosted gate or release-readiness claim.

A normal future PR flow is: finish genuine capture and commit; push the exact source head; fetch current main; prepare proof for that published head and PR number; review the private scope and approve that exact handoff; run `check`; upload only the approved secret inputs; approve the protected job; wait for actual validators; clean owned transport resources; merge through protection. The current main workflow then requires a separately prepared and approved push envelope for the landed commit. Local preparation, exact-head validation, publication, evidence sharing, environment review, gate execution, merge and cleanup remain distinct boundaries.

## Proposed reduction of the second handoff — not implemented

The structural cause is the existing v1 envelope's exact `candidate` and `base`: a squash merge creates a new commit, so a PR envelope cannot validate main. Main runs separately after the temporary secrets have been removed. Reusing or rebinding the old PR approval implicitly would broaden authorization.

A bounded code-level design could use an explicitly approved two-phase handoff capsule: name the repository, PR number, exact source head/tree and expected main parent before merging; authorize only that PR check and its single verified landed successor. After merge, read GitHub's merged-PR association, require the original head, identical tree and expected parent, derive the landed envelope, and run all existing validators again. Reject moved main, another PR, an unrelated commit, replay outside the capsule, expiry or an ambiguous association. Do not infer the source from commit subjects or manufacture a checkpoint.

The encrypted proof would remain available only for that bounded lifecycle, with protected review and cleanup after postmerge validation or timeout/cancellation. Implementing the capsule, adding an authorized derived-commit scope, changing environment branch access or extending secret retention affects sharing/security policy and needs explicit approval before implementation or configuration. This proposal needs concurrency, replay, cancellation and cleanup regressions and review; it is not an enabled release process. It would not require a mandatory private control repository or persistent new credentials.

The pack audit accepts the pinned native capture's numeric session/line-attribution counters and reference identifiers. It validates nested counter types; arbitrary text in counters and context-bearing fields such as summaries or review prompts remain unsupported and fail closed. The allowed shape follows [Entire 0.7.7 checkpoint metadata](https://github.com/entireio/cli/blob/v0.7.7/cmd/entire/cli/checkpoint/checkpoint.go). These transport fixtures are synthetic tests and never substitute for genuine captured checkpoints.
