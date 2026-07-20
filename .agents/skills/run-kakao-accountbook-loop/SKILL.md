---
name: run-kakao-accountbook-loop
description: Run a bounded implementation and verification loop for the Kakao Accountbook repository. Use when Codex modifies, fixes, refactors, reviews, packages, or prepares a version of this repository and must define success criteria, protect account security, household lifecycle, Kakao, receipt, UX, and performance baselines, run targeted and full verification, retry only with new evidence, and report manual deployment, SQL, environment-variable, or external-console work without executing it.
---

# Run Kakao Accountbook Loop

Complete repository work through a bounded gather, act, verify, and retry loop. Preserve the
released product baseline and separate repository changes from production operations.

## 1. Define the work contract

1. Recommend the reasoning effort before taking action. Follow `AGENTS.md`: use Medium for
   ordinary edits, High for authentication, security, data lifecycle, deployment decisions,
   or validation, and Extra High for large structural changes or complex incident analysis.
2. State the goal, observable success criteria, in-scope files or behavior, and explicit
   exclusions.
3. Inspect `git status --short --branch`.
4. Read `VERSION.txt`, `BASELINE.md`, and `KNOWN-ISSUES.md`. For version or deployment work,
   also read `NEXT_UPDATE_PLAN.md`, `DEPLOYMENT_MATRIX.md`, and `RELEASE-CHECKLIST.md`.
5. Search the relevant implementation and tests before editing. Do not infer behavior from
   filenames alone.

## 2. Gate production-impacting work

Classify the task separately for Worker code, SQL or schema, environment variables or
Secrets, Kakao Developers, OpenBuilder, and production deployment.

- Keep V22.8.13 SQL, schema, environment variables, Kakao Developers, and OpenBuilder
  unchanged unless the request and repository evidence require a change.
- Do not invent an index or SQL for a performance concern without production query-plan
  evidence.
- Prepare procedures and report requirements when production work is relevant, but do not
  deploy, run SQL, change Secrets, or edit external consoles without explicit authorization.
- Treat a successful local harness as repository verification, not production approval.

## 3. Plan and act once

1. Form the smallest testable hypothesis for the requested outcome.
2. Write a short plan with one active step and explicit verification.
3. Make the smallest coherent change. Preserve protected behavior in `BASELINE.md`.
4. Do not weaken tests, remove checksum coverage, or change expected hashes merely to make a
   failure pass.
5. Use one agent for routine work. When at least two independent domains or review tracks
   materially benefit from parallelism, route through `$orchestrate-kakao-accountbook-graph`
   and keep exactly one writer. When this loop is already running inside that graph, do not
   route back to the graph; complete only the assigned branch or writer attempt.

## 4. Verify the attempt

Run the narrow validation that matches the changed area:

```sh
npm run validate:receipt
npm run validate:kakao-group
npm run validate:household-security
npm run validate:ux-principles
npm run validate:performance
```

Before completion, always run the cross-platform repository harness:

```sh
node .codex/scripts/verify-repository.mjs
```

Inspect the complete diff and confirm that:

- all 31 release checksums, 289 automated checks, and `default.fetch` pass;
- the source hash changes only when an authorized source change requires it;
- no unrelated, generated, secret, environment, screenshot, or archive files entered the diff;
- SQL, environment, console, deployment, and real-device requirements are reported separately.

## 5. Retry with new evidence

When verification fails:

1. Capture the exact failing checkpoint and first actionable error.
2. Decide whether the cause is implementation, fixture, environment, or an external/manual
   dependency.
3. Update the hypothesis and make one minimal corrective change.
4. Rerun the failed narrow check, then rerun the full harness after it passes.

Limit the same failing checkpoint to three corrective attempts. Stop earlier when two
consecutive attempts produce the same error without new evidence. Do not repeat an identical
command with identical inputs and expect a different result. Report the blocker, evidence,
unverified scope, and the smallest user or external action needed.

## 6. Complete and report

Finish only when success criteria are met, the protected baseline is preserved, the full
harness passes, and the final diff is reviewed. Commit or push only when publication is part
of the user-approved workflow. Never treat a Git push as an operating deployment.

Report:

- the outcome and files changed;
- targeted checks and full harness result;
- whether SQL, environment variables, external consoles, or production deployment are
  required;
- remaining manual or real-device checks;
- the commit and branch when published.
