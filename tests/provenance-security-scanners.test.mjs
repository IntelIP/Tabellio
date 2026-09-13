import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { assembleLineage, captureCandidate } from "../scripts/lib/provenance-ledger.mjs";
import { scanCandidateSecurity } from "../scripts/lib/provenance-security-scanners.mjs";

const execute = promisify(execFile);
const now = "2026-09-12T12:00:01Z";
const gitleaks = process.env.TABELLIO_GITLEAKS;
const required = process.env.TABELLIO_REQUIRE_SECURITY_SCANNERS === "1";
test("required security scanner configuration is present", () => {
  if (required) assert.ok(gitleaks, "TABELLIO_GITLEAKS must name the pinned scanner.");
});

async function withCandidate(files, work) {
  const repo = await mkdtemp(join(tmpdir(), "tabellio-security-test-"));
  const git = (...args) => execute("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Sample", "-c", "user.email=sample@example.invalid", ...args], { cwd: repo });
  try {
    await git("init", "-b", "main");
    await writeFile(join(repo, "base.mjs"), "export const base = true;\n");
    await git("add", ".");
    await git("commit", "-m", "Base");
    await git("checkout", "-b", "sample");
    for (const [path, content] of Object.entries(files)) await writeFile(join(repo, path), content);
    await git("add", ".");
    await git("commit", "-m", "Candidate");
    const candidate = await captureCandidate({ repo, projectKey: "SAMPLE", repositoryId: "sample/repository" });
    const lineage = assembleLineage({ candidate, observations: [] });
    await work({ repo, lineage, now, gitleaks });
  } finally { await rm(repo, { recursive: true, force: true }); }
}

const syntheticToken = "ghp_" + createHash("sha256").update("tabellio synthetic noncredential fixture").digest("hex").slice(0, 36);
for (const [name, files, category] of [
  ["clean", { "app.mjs": "export const answer = 42;\n" }, null],
  ["secret", { "app.mjs": `export const key = '${syntheticToken}'; // gitleaks:allow\n` }, "secrets"],
  ["broken authorization", { "app.mjs": "export const claims = jwt.decode(token);\n", ".ignore": "app.mjs\n" }, "authorization"],
  ["unsafe trust boundary", { "app.mjs": "export const agent = new https.Agent({rejectUnauthorized: false});\n" }, "trust"],
  ["insecure dependency", { "package.json": JSON.stringify({ dependencies: { example: "http://example.invalid/pkg.tgz" } }) }, "dependencies"],
]) {
  test(`real immutable candidate scanners identify ${name}`, { skip: !gitleaks && !required }, async () => {
    await withCandidate(files, async (input) => {
      const result = await scanCandidateSecurity(input);
      assert.equal(result.status, category ? "failed" : "passed", JSON.stringify(result.checks.map(({ category, status }) => ({ category, status }))));
      if (category) assert.equal(result.checks.find((item) => item.category === category).status, "failed");
      assert.ok(!JSON.stringify(result).includes(syntheticToken));
      assert.equal(result.candidate.id, input.lineage.candidate.id);
    });
  });
}

test("unavailable tools and unaudited dependencies remain blocked", async () => {
  await withCandidate({ "package.json": JSON.stringify({ dependencies: { example: "1.0.0" } }) }, async (input) => {
    const result = await scanCandidateSecurity({ ...input, gitleaks: join(input.repo, "missing-gitleaks"), astGrep: join(input.repo, "missing-ast-grep") });
    assert.equal(result.status, "blocked");
    assert.ok(result.checks.every((item) => item.status === "blocked"));
  });
});

test("scanner uses immutable blobs and rejects a changed candidate", { skip: !gitleaks && !required }, async () => {
  await withCandidate({ "app.mjs": "export const answer = 42;\n" }, async (input) => {
    await writeFile(join(input.repo, "app.mjs"), "eval(untrusted);\n");
    assert.equal((await scanCandidateSecurity(input)).status, "passed");
    await assert.rejects(scanCandidateSecurity({ ...input, head: "main" }));
  });
});

test("scanning from a subdirectory still checks the full candidate tree", { skip: !gitleaks && !required }, async () => {
  await withCandidate({ "outside.mjs": "eval(untrusted);\n" }, async (input) => {
    const nested = join(input.repo, "nested");
    await mkdir(nested);
    const result = await scanCandidateSecurity({...input, repo: nested});
    assert.equal(result.checks.find((item) => item.category === "trust").status, "failed");
  });
});

test("candidate syntax suppressions cannot produce a security pass", { skip: !gitleaks && !required }, async () => {
  await withCandidate({ "app.mjs": "// ast-grep-ignore\neval(untrusted);\n" }, async (input) => {
    const result = await scanCandidateSecurity(input);
    assert.equal(result.status, "blocked");
    assert.equal(result.checks.find((item) => item.category === "trust").status, "blocked");
  });
});

test("malformed dependency manifests cannot produce a dependency pass", async () => {
  for (const manifest of ["not JSON", JSON.stringify({ dependencies: [] }), JSON.stringify({ dependencies: "example" }), JSON.stringify({ dependencies: { example: 1 } })]) {
    await withCandidate({ "package.json": manifest }, async (input) => {
      const result = await scanCandidateSecurity({ ...input, gitleaks: join(input.repo, "missing-gitleaks"), astGrep: join(input.repo, "missing-ast-grep") });
      assert.equal(result.checks.find((item) => item.category === "dependencies").status, "blocked");
    });
  }
});


test("invalid UTF-8 tree paths cannot collapse into one scanned file", async () => {
  await withCandidate({ "app.mjs": "export const answer = 42;" }, async (input) => {
    const gitInput = (args, data) => {
      const result = spawnSync("git", ["-c", "user.name=Sample", "-c", "user.email=sample@example.invalid", ...args], { cwd: input.repo, input: data });
      assert.equal(result.status, 0, result.stderr.toString());
      return result.stdout;
    };
    const rows = [gitInput(["ls-tree", "-z", "HEAD"])];
    for (const byte of [0x80, 0x81]) {
      const blob = gitInput(["hash-object", "-w", "--stdin"], byte === 0x80 ? "eval(untrusted);" : "export const safe = true;").toString().trim();
      rows.push(Buffer.concat([Buffer.from(`100644 blob ${blob}\tbad-`), Buffer.from([byte]), Buffer.from(".js\0")]));
    }
    const tree = gitInput(["mktree", "-z"], Buffer.concat(rows)).toString().trim();
    const commit = gitInput(["commit-tree", tree, "-p", "HEAD"], "Invalid path bytes\n").toString().trim();
    gitInput(["update-ref", "HEAD", commit]);
    const current = await captureCandidate({ repo: input.repo, projectKey: "SAMPLE", repositoryId: "sample/repository" });
    await assert.rejects(scanCandidateSecurity({ ...input, lineage: assembleLineage({ candidate: current, observations: [] }) }), /encoded data|encoding/i);
  });
});


test("non-object package manifests block dependency review", async () => {
  for (const manifest of [[], null, true, "manifest"]) {
    await withCandidate({ "package.json": JSON.stringify(manifest) }, async input => {
      const review = await scanCandidateSecurity(input);
      assert.equal(review.checks.find(check => check.category === "dependencies").status, "blocked");
    });
  }
});


test("oversized secret reports block without loading unbounded report files", async () => {
  await withCandidate({ "app.mjs": "export const safe = true;" }, async input => {
    const scanner = join(input.repo, "synthetic-scanner");
    const script = `#!${process.execPath}
if (process.argv[2] === "version") { console.log("8.30.1"); }
else { process.stdout.write(JSON.stringify([{ marker: "x".repeat(5 * 1024 * 1024) }])); }
`;
    await writeFile(scanner, script, { mode: 0o700 });
    const review = await scanCandidateSecurity({ ...input, gitleaks: scanner });
    assert.equal(review.checks.find(check => check.category === "secrets").status, "blocked");
    assert.ok(JSON.stringify(review).length < 65536);
  });
});
