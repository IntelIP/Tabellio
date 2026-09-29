# Code cleanup

- Run `npm run quality:dead-code` after JavaScript removals. Run `npm run quality:changed-code` before opening a pull request.
- For cross-file removals, refresh Graphify and inspect callers before deleting. Verify current source and framework registrations.
