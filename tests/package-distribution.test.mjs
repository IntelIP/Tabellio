import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("package includes public validators and demo but excludes private local state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "TabellioPackage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = new URL("../", import.meta.url);
  await copyFile(new URL("package.json", source), join(root, "package.json"));
  await mkdir(join(root, ".tabellio"));
  for (const name of ["validators.json", "runner-identity-validators.json"]) {
    await copyFile(new URL(`.tabellio/${name}`, source), join(root, ".tabellio", name));
  }
  await writeFile(join(root, ".tabellio", "review-temp-secret-do-not-keep.json"), '{"synthetic":true}\n');
  await writeFile(join(root, ".gitignore"), ".tabellio/review-temp-secret-do-not-keep.json\n");
  await mkdir(join(root, "scripts"));
  await copyFile(new URL("scripts/demo-provenance.mjs", source), join(root, "scripts", "demo-provenance.mjs"));
  const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root });
  const files = JSON.parse(stdout)[0].files.map(({ path }) => path);
  assert.deepEqual(files.filter((path) => path.startsWith(".tabellio/")).sort(), [
    ".tabellio/runner-identity-validators.json",
    ".tabellio/validators.json",
  ]);
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(manifest.bin["tabellio-provenance-demo"], "scripts/demo-provenance.mjs");
  assert.ok(files.includes(manifest.bin["tabellio-provenance-demo"]));
});
