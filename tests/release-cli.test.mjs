import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const cli = new URL("../scripts/tabellio-release.mjs", import.meta.url);
const planner = new URL("../scripts/lib/release-planner.mjs", import.meta.url);

test("release CLI preserves omitted and explicit control remote options", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tabellio-release-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const loader = join(root, "planner-loader.mjs");
  const bootstrap = join(root, "register-loader.mjs");
  await writeFile(loader, `export async function load(url, context, nextLoad) {
    if (url === ${JSON.stringify(planner.href)}) {
      return { format: "module", shortCircuit: true,
        source: "export async function planRelease(options) { return { controlRemote: options.controlRemote }; }" };
    }
    return nextLoad(url, context);
  }
`);
  await writeFile(bootstrap, `import { register } from "node:module";
register(${JSON.stringify(pathToFileURL(loader).href)}, import.meta.url);
`);
  const environment = { ...process.env, GITHUB_TOKEN: "", GH_TOKEN: "" };
  delete environment.NODE_OPTIONS;
  for (const [label, arguments_, expected] of [["default", [], null], ["explicit", ["--control-remote", "control"], "control"]]) {
    const out = join(root, `${label}-intent.json`);
    const result = await execute(process.execPath, [
      "--import", bootstrap, fileURLToPath(cli), "plan",
      "--repo", root, "--owner", "example", "--remote-repo", "repository",
      "--number", "7", "--version", "1.2.3", "--notes", "release-notes.txt",
      "--out", out, ...arguments_,
    ], { cwd: root, env: environment, timeout: 30_000 });
    const written = JSON.parse(await readFile(out, "utf8"));
    const reported = JSON.parse(result.stdout);
    assert.deepEqual(written, { controlRemote: expected });
    assert.equal(reported.ok, true);
    assert.deepEqual(reported.intent, written);
    assert.equal(reported.out, out);
  }
});
