export function platformFixture() {
  return {
    schemaVersion: "tabellio-platform/v0.3",
    codeStorage: {
      provider: "github",
      remoteName: "origin",
      publicSurface: "code-and-thin-pr",
      codeRef: "refs/heads/main",
      allowedRefPrefixes: ["refs/heads/", "refs/tags/"],
    },
    workflow: {
      stackManager: "git-spice",
      controlState: "external",
      controlProvider: "github",
      controlRemoteName: "control",
      controlRefs: ["refs/tabellio/reviews", "refs/tabellio/validations", "refs/heads/entire/checkpoints/v1"],
      publishControlRefsToCodeStorage: false,
    },
    ledger: { provider: "entire", storage: "external", checkpointRef: "refs/heads/entire/checkpoints/v1" },
    validation: { runner: "tabellio-validate", manifest: "tabellio.validation.json", storage: "external", resultRef: "refs/tabellio/validations" },
    reviews: { provider: "tabellio", storage: "external", stateRef: "refs/tabellio/reviews" },
  };
}

export function localPlatformFixture() {
  const value = platformFixture();
  value.schemaVersion = "tabellio-platform/v0.4";
  Object.assign(value.workflow, { controlState: "local", controlProvider: "local", controlRemoteName: null });
  for (const section of ["ledger", "validation", "reviews"]) value[section].storage = "local";
  return value;
}
