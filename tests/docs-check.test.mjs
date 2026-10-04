import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { checkDocs } from "../scripts/check-docs.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "tabellio-docs-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of [
    "README.md", "AGENTS.md", "CONTRIBUTING.md", "SECURITY.md",
    "docs/README.md", "docs/try-tabellio.md", "docs/getting-started.md",
    "docs/operate-and-release.md", "docs/harness.md", "docs/historical/README.md",
    ".github/pull_request_template.md", "templates/pull_request_template.md",
    ".github/ISSUE_TEMPLATE/bug.yml", ".github/ISSUE_TEMPLATE/feature.yml", ".github/ISSUE_TEMPLATE/config.yml",
  ]) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), "# Entry\n");
  }
  await writeFile(join(root, "package.json"), JSON.stringify({ version: "0.7.0" }));
  return root;
}

test("docs check resolves links, headings, references, images, and encoded paths locally", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "docs/space name.md"), "# Details\n# Details\n");
  await writeFile(join(root, "README.md"), '# Start\n[details](docs/space%20name.md#details-1)\n[entry][guide]\n[guide]: docs/README.md#entry\n![image](image.svg)\n<a href="docs/">Docs</a>\n[web](https://unavailable.invalid)\n[mail](mailto:example@example.invalid)\n```md\n[example](missing.md)\n```\n`[literal](missing.md)`\n');
  await writeFile(join(root, "image.svg"), "<svg/>\n");
  assert.deepEqual((await checkDocs(root)).errors, []);
});

const failures = [
  ["broken local link", "README.md", "[broken](docs/missing.md)\n", /broken local link/],
  ["missing heading", "README.md", "[broken](docs/README.md#missing)\n", /missing local heading/],
  ["incorrect installation version", "docs/try-tabellio.md", "npm install --save-dev @intelip/tabellio@0.6.0\n", /installation version/],
  ["unpinned installation", "README.md", "npm install @intelip/tabellio\n", /found unpinned/],
  ["incorrect runner version", "docs/getting-started.md", "npx tabellio-version --expect-version 0.6.0\n", /expected installation version/],
  ["mismatched templates", ".github/pull_request_template.md", "Different template\n", /differs from/],
  ["oversized README", "README.md", "line\n".repeat(151), /exceeds limit 150/],
  ["oversized agent entry", "AGENTS.md", "line\n".repeat(101), /exceeds limit 100/],
];
for (const [name, file, content, expected] of failures) {
  test(`docs check rejects ${name}`, async (t) => {
    const root = await fixture(t);
    await writeFile(join(root, file), content);
    assert.equal((await checkDocs(root)).errors.some((error) => expected.test(error)), true);
  });
}

for (const file of ["AGENTS.md", ".github/pull_request_template.md"]) {
  test(`docs check rejects missing ${file}`, async (t) => {
    const root = await fixture(t);
    await unlink(join(root, file));
    assert.equal((await checkDocs(root)).errors.includes(`${file}: missing required entry file`), true);
  });
}

test("docs check keeps historical release versions valid", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "docs/releases"));
  await writeFile(join(root, "docs/releases/v0.1.0.md"), "npm install @intelip/tabellio@0.1.0\n");
  await writeFile(join(root, "README.md"), "npm install --save-dev @intelip/tabellio@0.7.0\nnpx tabellio-version --expect-version 0.7.0\n");
  assert.deepEqual((await checkDocs(root)).errors, []);
});

test("docs check CLI reports success and exits nonzero for a broken link", async (t) => {
  const root = await fixture(t);
  const script = fileURLToPath(new URL("../scripts/check-docs.mjs", import.meta.url));
  const run = promisify(execFile);
  const result = await run(process.execPath, [script, "--repo", root]);
  assert.match(result.stdout, /Documentation checks passed/);
  await writeFile(join(root, "README.md"), "[broken](missing.md)\n");
  await assert.rejects(run(process.execPath, [script, "--repo", root]), (error) => error.code === 1 && /broken local link/.test(error.stderr));
});
