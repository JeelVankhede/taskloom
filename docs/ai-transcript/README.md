# AI Transcript and Prompting Strategy

The session exports in this folder are complete and unedited. This page explains how I used the AI, how I checked it, and where I overruled it.

## Sessions

| # | Session | What happened | Output |
|---|---|---|---|
| 1 | Brief analysis | The AI read the brief, mapped how the parts depend on each other, and listed the decisions to make first | Decision list |
| 2 | Schema design | Sixteen design decisions, one at a time, as single- and multi-select questions. The AI proposed options. I chose, and pushed back where I disagreed. | SPEC v1.0, SQL DDL, GraphQL SDL, and ten invariant tests run as the non-owner role |
| 3 | Technical documentation | A Task 1.2 draft, then five open items decided one at a time | SPEC v1.1 |
| 4 | Schema critique | A critique of v1.1 across the five areas the brief names | [1.3-ai-critique.md](../1.3-ai-critique.md) |
| 5 | Critique review | Each finding discussed, decided, then applied | SPEC v1.2 |
| 6 | Audit and documentation | A second-opinion audit of the critique, v1.2 measured against the brief, the submission structure approved, the documents written | `docs/` |
| 7 | Scaffolding | Stack, accounts, tenancy connections, and onboarding decided one at a time. Agent rules generated from my own starter recipes, then adapted to the design. Monorepo scaffolded and every gate run. | Scaffold, agent rules, [implementation plan](../implementation-plan.md), design reference v1.4 |

## Strategy

1. **Decisions before artifacts.** No schema was written until the design decisions were locked. The AI asked, I answered, and it propagated the consequences.
2. **One source of truth.** Every prompt was grounded in one SPEC.md. A decision that lived only in chat did not count until it was written into the spec.
3. **Approval gates.** Open items and critique findings were handled one at a time. The spec changed only after each decision.
4. **Separate passes.** Drafting, critiquing, and auditing ran as separate passes. The critique pass never edited the spec.
5. **The AI checks the AI.** A second pass audited the critique itself. It found that the critique relied on DDL from an older spec version, and it found two issues the critique missed: lost domain events and a per-row project lookup in the overdue check.
6. **Verify mechanically.** Invariant tests ran as the non-owner database role. Spec versions were diffed. Removed features were searched for leftovers. Word counts were checked against the brief's limits.

## Where I Overruled the AI

| Topic | AI output | My decision |
|---|---|---|
| Status model | Per-project statuses mapped to fixed categories | Freeform per-project statuses, each open, completed, or canceled through `closed_kind` |
| Stack | A query builder instead of Prisma, then three migration tools | Prisma owns the schema. What Prisma cannot express is SQL inside Prisma migrations. |
| Migration framing | Described hand-written SQL as living outside Prisma's control | Corrected. Prisma owns every migration, and hand-written SQL sits inside them. |
| Scope in session 3 | Built a migration chain and smoke tests during a documentation task | Stopped it. The task was documentation. |
| Process in session 5 | Applied every critique fix at once, without approval | Rejected. Restarted from v1.1 and decided one finding at a time. |
| Due dates | Assumed undated tasks exist without evidence, then proposed null-aware cursors and a revert | Due date required on every task |
| Re-key | A key-history table instead of transfer | Kept transfer as the design and moved re-key out of v1 |
| Viewer role | Make viewer read-only | Renamed it contributor, with task editing kept |
| Roles | Cut to three database roles | Kept the roles. Moved those without v1 work to Later with their features. |
| Partitioning `tasks`, per-column rank | Adopt | Declined, with reasons in the analysis |
| Scope in session 6 | Its plan included building the API and web app | Restricted the AI to documentation |
| Join requests in session 7 | Offered to leave join-by-request designed, because the brief does not ask for it | Built it, with owner or admin approval, so a new user has a way into an organization |

## Where the AI Changed My Design

The critique found real gaps I had missed: permissive switcher policies on the membership table (X1), a writable global `users` table (X2), two invariants the database did not enforce (C1, C2), and history that could record a stale `from` value (C3). Each is fixed and tested. The details are in [1.3-analysis.md](../1.3-analysis.md).

In session 7 it argued me out of microservices. Composite tenant keys, one read snapshot per request, and row-level security all need one database and one transaction, so the API is a modular monolith. It replaced four Prisma clients with one client that switches role inside each transaction. When NestJS 12 turned out to be ESM-only, it stopped and asked before replacing Jest with Vitest. Every decision from that session is listed in the [implementation plan](../implementation-plan.md), section 2.
