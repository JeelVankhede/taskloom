# Demo Seed

Local development data. `npm run seed` (from the repository root) builds this folder with `tsc` and runs it with `node`.

## Safety

- Runs only against a local database: it refuses when `NODE_ENV=production` or when the `DATABASE_URL` host is not `localhost` or `127.0.0.1`.
- Connects as `app_runtime`, the API's own login, and acts only through `SET LOCAL ROLE`, so row-level security, grants, and triggers apply exactly as they do for the API. Nothing runs as the owner or a superuser.
- One transaction: a failure leaves the database untouched, never half-seeded.
- Runs once. A second run prints `Already seeded` and changes nothing. Start over with `npm run db:reset` (local only).

## Demo accounts

Every account uses the password **`taskloom-demo-2026`**. These are test values for local use only.

| Email                    | What it shows                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `owner@acme.test`        | Acme owner                                                                                    |
| `admin@acme.test`        | Acme admin                                                                                    |
| `member@acme.test`       | Acme member                                                                                   |
| `contributor@acme.test`  | Acme contributor: edits tasks, cannot manage projects                                         |
| `departed@acme.test`     | Deactivated Acme member: signs in, belongs to no organization, still assigned to closed tasks |
| `owner@globex.test`      | Globex owner, with one pending join request to decide                                         |
| `both@example.test`      | Member of Acme and Globex: the organization switcher                                          |
| `newbie@example.test`    | No organization: onboarding                                                                   |
| `requester@example.test` | Pending request to join Globex                                                                |

## Data

| Organization      | Timezone         | Projects                                            |
| ----------------- | ---------------- | --------------------------------------------------- |
| Acme (`acme`)     | Asia/Kolkata     | ENG, 2,500 tasks (about 5% archived); OPS, 40 tasks |
| Globex (`globex`) | America/New_York | WEB, 60 tasks                                       |

- Status mix: Backlog 30%, Todo 20%, In Progress 15%, In Review 10%, Done 20%, Canceled 5%.
- About 15% of open tasks are overdue; due dates fall within about 60 days of today in the organization's timezone.
- Priorities spread evenly across the five values, including none. About 15% of tasks are unassigned.
- Tasks carry 0 to 3 labels. Acme: bug, feature, infra, design, docs, security. Globex: bug, content, seo.
- Every change writes its history event (`member.added`, `label.created`, `project.created`, `task.created`, `task.archived`, `member.deactivated`).
- Deterministic: a fixed pseudo-random seed produces the same data every time. Timestamps are "now", because the API roles cannot write them.
