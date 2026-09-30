// Classify only known local setup failures. Never expose command arguments,
// provider payloads, raw errors, or database logs in a portable demo receipt.
export function provenanceDemoFailure(error, postgresLog = "") {
  if (/Unix-domain socket path.*too long/i.test(postgresLog)) return {
    failureClass: "socket_path_too_long",
    reason: "The PostgreSQL Unix socket path exceeds the platform limit. Use a shorter temporary socket path.",
  };
  if (/could not create Unix socket[^\n]*(?:Operation not permitted|Permission denied)/i.test(postgresLog)) return {
    failureClass: "socket_permission_denied",
    reason: "This environment blocks the temporary PostgreSQL Unix socket. Use an authorized execution environment that supports local sockets; do not weaken security settings.",
  };
  if (error?.code === "ENOENT") return {
    failureClass: "required_tool_missing",
    reason: "A required local executable is unavailable. Check PostgreSQL server/client binaries and Git on PATH.",
  };
  return {
    failureClass: "local_command_failed",
    reason: "Sample demo failed. Check local PostgreSQL, Git, and the required checks; no provider credentials are required.",
  };
}
