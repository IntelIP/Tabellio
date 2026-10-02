import { NativeGitStore } from "../../scripts/providers/native-git-store.mjs";
import { GitJsonLedger } from "../../scripts/lib/git-json-ledger.mjs";
import { ValidationRunner } from "../../scripts/lib/validation-runner.mjs";

export async function createValidationRunner(repoPath) {
  const store = await NativeGitStore.open(repoPath);
  const ledger = await GitJsonLedger.open({ repoPath, ref: "refs/tabellio/validations" });
  return { store, ledger, runner: new ValidationRunner({ store, ledger }) };
}
