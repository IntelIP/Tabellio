import { runGit } from "./git-process.mjs";
import { validatePlatformConfig } from "./platform-config.mjs";

export async function validationManifestAtPullHead({
  store,
  commit,
  number,
  remote = "origin",
  commandRunner = runGit,
}) {
  let source = await readPlatformConfig(commandRunner, store.repoPath, commit).catch(() => null);
  if (!source) {
    await commandRunner({
      args: ["fetch", "--no-tags", remote, `refs/pull/${number}/head`],
      cwd: store.repoPath,
    });
    const fetched = await store.resolveRef("FETCH_HEAD");
    if (fetched !== commit) {
      throw new Error(`Fetched pull-request head ${fetched} does not match GitHub head ${commit}.`);
    }
    source = await readPlatformConfig(commandRunner, store.repoPath, commit);
  }
  return validatePlatformConfig(JSON.parse(source)).validation.manifest;
}

async function readPlatformConfig(commandRunner, repoPath, commit) {
  const result = await commandRunner({
    args: ["show", `${commit}:tabellio.platform.json`],
    cwd: repoPath,
  });
  return result.stdout;
}
