# GitHub Code-Storage Boundary

GitHub has one narrow job in the Tabellio platform: store code and expose a thin pull-request shell. It is not the agent workflow database.

## Data Placement

| Data | Destination | Reason |
| --- | --- | --- |
| `refs/heads/*` code branches | GitHub `origin` | Shared source history and pull-request heads |
| `refs/tags/*` release tags | GitHub `origin` | Shared code release markers |
| Pull-request title, description, checks summary, and review decision | GitHub | Minimum human accountability surface |
| Entire transcript and checkpoint state | External control state | Private agent context stays outside code storage |
| `refs/tabellio/reviews` | External control state | Full machine review ledger may contain internal context |
| `refs/tabellio/validations` | External control state | Full validation evidence and logs remain independently governed |
| `refs/heads/entire/checkpoints/v1` | External control state | Agent-session checkpoints do not become ordinary code branches |

## Enforced Contract

`tabellio.platform.json` declares GitHub `origin` as code storage, sets control state to external, and sets `publishControlRefsToCodeStorage` to `false`. The JSON Schema and runtime validator reject drift from those values.

The control-ref transport also rejects `origin` before reading or writing remote state. Callers must name a separate configured remote for review, validation, and Entire refs. This makes a mistaken private-state push fail closed instead of relying on operator memory.

## Pull-Request Boundary

The pull request remains useful but thin. It carries the code diff, a concise change explanation, required check summaries, and the final review decision. Detailed agent transcripts, internal reasoning, full validation logs, and durable review events stay external. A reference or digest can bind the thin pull request to external evidence without copying that evidence into GitHub.

## Migration State

The Forgejo provider and localhost lab remain temporarily as legacy migration fixtures. They are not canonical services and must receive no new production state. A later cleanup PR removes the provider, lab, commands, docs, and package metadata after the external control-state migration is complete.
