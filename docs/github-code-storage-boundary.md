# GitHub Code-Storage Boundary

GitHub has one narrow job in the Tabellio platform: store code and expose a thin pull-request shell. It is not the agent workflow database.

## Data Placement

| Data | Destination | Reason |
| --- | --- | --- |
| `refs/heads/*` code branches | GitHub `origin` | Shared source history and pull-request heads |
| `refs/tags/*` release tags | GitHub `origin` | Shared code release markers |
| Pull-request title, description, checks summary, and review decision | GitHub | Minimum human accountability surface |
| Entire transcript and checkpoint state | Customer-owned private local storage; optional private GitHub remote | Private agent context stays outside the public code repository |
| `refs/tabellio/reviews` | Customer-owned private local storage; optional private GitHub remote | Full machine review ledger may contain internal context |
| `refs/tabellio/validations` | Customer-owned private local storage; optional private GitHub remote | Full validation evidence and logs remain independently governed |
| `refs/heads/entire/checkpoints/v1` | Customer-owned private local storage; optional private GitHub remote | Agent-session checkpoints do not become ordinary code branches |

## Enforced Contract

`tabellio.platform.json` v0.4 defaults to local evidence storage. No second hosted
repository is required. Private evidence must never be published to public
`origin`; the explicit optional control transport continues rejecting it.
Legacy v0.3 private GitHub remote mode remains supported. Migration requires an
explicit platform change, local native checkpoint preservation, and backup of all
reachable review/validation/checkpoint refs before removing remote storage.

## Pull-Request Boundary

The pull request remains useful but thin. It carries the code diff, a concise change explanation, required check summaries, and the final review decision. Detailed agent transcripts, internal reasoning, full validation logs, and durable review events stay external. A reference or digest can bind the thin pull request to external evidence without copying that evidence into GitHub.

## Migration State

Legacy self-hosted collaboration code and local lab infrastructure have been removed. Public code uses GitHub `origin`; private control state defaults to local customer-owned storage. A private GitHub remote is an optional explicit integration.
