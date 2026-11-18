---
name: agent-superpowers
description: Use when a coding task needs disciplined discovery, planning, implementation, testing, debugging, review, or delivery across an agent harness.
---

# Agent Superpowers

Apply this workflow to software work. It is a portable adaptation of the MIT-licensed [obra/superpowers](https://github.com/obra/superpowers) methodology for harnesses that support skill or instruction files.

## Operating loop

1. **Understand before changing.** Inspect the repository, constraints, existing conventions, and relevant tests. If the request is ambiguous and the choice changes behavior, ask one focused question; otherwise record a reversible assumption.
2. **Design before implementation.** For non-trivial work, write a short implementation plan with acceptance criteria, risks, and verification commands.
3. **Test first for behavior changes.** Add the smallest test that expresses the desired behavior, run it and confirm the failure is meaningful, then implement the minimum change and rerun it.
4. **Debug systematically.** Reproduce the failure, trace evidence to the root cause, and add a regression test before fixing it. Do not paper over symptoms with retries or broad exception handling.
5. **Review in two passes.** First check that the change satisfies the stated requirements; then check maintainability, security, performance, and unintended scope.
6. **Verify before claiming completion.** Run the full relevant test, lint, typecheck, build, and packaging commands. Report actual results, remaining risks, and files changed.

## Delegation and parallelism

Delegate independent exploration or review tasks only when the harness supports isolated workers. Keep dependent implementation steps sequential. Give each worker a bounded prompt, explicit files, and a requested output format. Inspect the resulting diff and run verification yourself; never trust a worker's success claim without evidence.

## Safe integration defaults

Prefer repository-local installation, feature branches, atomic commits, and dry runs. Never copy secrets, overwrite unrelated files, or enable an external provider merely because an integration exists. Treat OmniRoute as an optional OpenAI-compatible gateway: configure only an endpoint and environment-variable names; credentials remain the operator's responsibility.

## OmniRoute (optional)

If an OmniRoute instance is already running, use its OpenAI-compatible base URL (commonly `http://localhost:20128/v1`) or register its MCP HTTP endpoint (commonly `http://localhost:20128/api/mcp/stream`) through the harness's native MCP configuration. Do not assume either endpoint is reachable; validate with the harness or a harmless health request first. Do not start, expose, or publish a router without explicit operator intent.

## Completion report

Return: **Changes made**, **intentionally untouched**, **verification evidence**, **integration/configuration steps**, and **remaining risks or follow-ups**.
