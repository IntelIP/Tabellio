const GITHUB_SYNC_COMMANDS = new Set(["sync", "gate"]);

export function reviewCommandRequiresGitHub(command) {
  return GITHUB_SYNC_COMMANDS.has(command);
}
