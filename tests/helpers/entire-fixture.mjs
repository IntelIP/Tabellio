// Synthetic metadata transport for tests only; never live session provenance.
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
export const fixtureCheckpointId = label => createHash("sha256").update(label).digest("hex").slice(0, 12);
export const fixtureCheckpoint = id => ({ checkpoint_id: id, session_count: 1, sessions: [{ session_id: "synthetic-session", agent: "codex" }] });
export async function installEntireFixture(t, root, entries = {}) {
  const directory = join(root, "synthetic-entire-bin");
  await mkdir(directory, { recursive: true });
  const metadataPath = join(directory, "metadata.json");
  await writeFile(metadataPath, JSON.stringify(entries));
  const binary = join(directory, "entire");
  await writeFile(binary, `#!${process.execPath}\nimport {readFileSync} from 'node:fs';\nconst args=process.argv.slice(2);\nif(args[0]==='version'){console.log('Entire CLI 0.7.7');process.exit(0);}\nconst id=args[args.indexOf('--checkpoint')+1];\nconst entries=JSON.parse(readFileSync(${JSON.stringify(metadataPath)},'utf8'));\nif(!Object.hasOwn(entries,id))process.exit(1);\nconsole.log(JSON.stringify(entries[id]));\n`);
  await chmod(binary, 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${directory}:${previous}`;
  t.after(() => { process.env.PATH = previous; });
  return { metadataPath };
}
