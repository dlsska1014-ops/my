---
name: orchestrate-kakao-accountbook-graph
description: Coordinate a bounded multi-agent graph for complex Kakao Accountbook repository work. Use when a change, investigation, release decision, or review spans at least two independent domains such as account security, household lifecycle, Kakao, receipts, UX, performance, validation, or release operations and materially benefits from parallel read-only research or review. Route routine single-scope changes to run-kakao-accountbook-loop instead. Keep one writer and require human approval before production deployment, SQL execution, environment or Secret changes, destructive Git, or external-console actions.
---

# Orchestrate Kakao Accountbook Graph

Act as the coordinator and integrator. Use `$run-kakao-accountbook-loop` as the execution and
retry policy inside each graph route; read that skill completely before starting. When
already coordinating this graph, invoke the loop only for the assigned branch or writer
attempt and do not route back into this graph.

## Select the smallest graph

| Route | Use | Graph |
|---|---|---|
| Single | One clear domain or small documentation change | Coordinator runs the loop alone |
| Analysis | Read-only investigation or review with independent questions | Explorer branches → coordinator synthesis |
| Change | Cross-domain or high-risk repository change | Explorer branches → one builder → reviewer + verifier → coordinator |
| Human gate | Production, SQL execution, Secrets, external console, destructive Git, or unresolved product choice | Analyze and prepare only → ask user → continue only after direct approval |

Do not create agents merely to mirror job titles. Use parallel agents only when independent
branches materially improve speed or quality. Keep direct-child depth at one.
Record `git status --short --branch` before the first branch so unexpected changes can be
distinguished from the assigned work.
Spawn branches only from the root coordinator. If this skill is invoked inside a subagent,
do not delegate again; complete the assigned read-only analysis and return a graph
recommendation to the parent.

## Maintain coordinator state

Keep this state in the main task plan and agent messages; do not create or commit a runtime
state file:

```yaml
goal:
success_criteria: []
scope: []
exclusions: []
baseline_version:
risk_domains: []
affected_paths: []
operations:
  worker:
  sql:
  environment:
  kakao_developers:
  openbuilder:
  production_deploy:
evidence: []
decisions: []
approvals: {}
writer_owner:
targeted_checks: []
full_harness:
manual_checks: []
attempts_by_checkpoint: {}
blocker:
```

Never put Secrets, tokens, private production data, or raw user data in shared state or agent
prompts.

## Route domain branches

Select only branches supported by the request:

| Signal | Read first | Required targeted check |
|---|---|---|
| Authentication, account, invitation, permission, deletion, leaving | `BASELINE.md`, security validation | `npm run validate:household-security` |
| `botGroupKey`, response shapes, identity keys, Kakao login | Kakao project memory | `npm run validate:kakao-group` |
| OCR, photos, upload, receipt save | receipt rules and implementation | `npm run validate:receipt` |
| Hierarchy, action text, accessibility, analysis UI | UX project memory | `npm run validate:ux-principles` |
| `/my`, `/app`, request count, cache, static assets | performance baseline | `npm run validate:performance` |
| Version, ZIP, deployment decision | deployment matrix, SQL history, release checklist | document consistency plus full harness |

Allow read-only investigation of database objects, fields, RLS, RPC, or indexes. Route through
the human gate before proposing a database mutation that expands the approved scope, and
always before executing SQL. Do not draft speculative performance SQL without production
rows, logs, and query-plan evidence.

## Assign bounded roles

Prefer these project agents when available:

- `kakao-accountbook-explorer`: inspect one independent domain read-only and return evidence,
  affected paths, invariants, risks, and the narrow check.
- `kakao-accountbook-builder`: become the sole writer for the approved scope, make the
  smallest coherent change, and run targeted checks. Do not let the coordinator or another
  agent edit concurrently.
- `kakao-accountbook-reviewer`: inspect the completed diff read-only for correctness,
  security, regressions, scope drift, and missing tests.
- `kakao-accountbook-verifier`: run checks read-only and report exact commands, results, the
  first actionable failure, and manual requirements without fixing anything.

Use at most two parallel explorer branches. After building, reviewer and verifier may run in
parallel. Keep no more than two child threads active at once and close or reuse completed
threads before another wave.

Do not parallelize coupled edits, generation, formatting, staging, commits, or checks against
a changing tree. Wait for every explorer before starting the builder. While the builder is
active, the coordinator and all other agents must not edit files or Git state.

Give every child a bounded handoff containing:

```text
Goal:
Assigned scope:
Files or evidence to inspect:
Protected invariants:
Forbidden actions:
Expected output:
```

Do not reveal the expected conclusion to reviewer or verifier agents. Ask for file and line
evidence rather than raw logs.

## Integrate through gates

1. Gather explorer summaries and resolve contradictions from repository evidence.
2. Stop for user direction when protected product behavior conflicts with the request or
   evidence cannot determine the correct choice.
3. Record one `writer_owner`. Allow exactly that writer to edit `src/index.js` or overlapping
   paths.
4. Run the selected targeted checks.
5. End the builder wave and freeze a stable diff before starting reviewer and verifier.
6. If review requires a fix, end all review waves first, return ownership to the same sole
   writer, and reuse the retry limits from the loop skill.
7. Finish with:

```sh
node .codex/scripts/verify-repository.mjs
```

8. Inspect the full diff, prohibited files, checksum result, deployment classification, and
   outstanding real-device checks.

Treat commit and push approval separately from production deployment. A Git push never means
the Worker, SQL, environment, Kakao Developers, or OpenBuilder was changed.

## Stop and report

Stop when the loop reaches its retry ceiling, two attempts repeat the same error without new
evidence, required access or approval is absent, user changes prevent a safe sole writer, or
protected behavior conflicts with an ambiguous request. Also stop if files outside the
assigned writer's report change unexpectedly; do not overwrite or absorb them.

Report exactly one status:

- `repository-complete`: repository changes and automated verification are complete; no
  production claim is made.
- `production-pending`: repository work is complete but approved deployment or manual
  production checks remain.
- `blocked`: state the evidence, unverified scope, and smallest action needed.
- `production-confirmed`: use only after separately authorized production actions and manual
  checks actually complete.
