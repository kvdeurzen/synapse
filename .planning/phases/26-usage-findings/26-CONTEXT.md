# Phase 26: Usage Findings

## Purpose

Address issues discovered during real usage of Synapse on rpi-camera-py. This is the final polish pass before declaring v3.0 release-ready.

## Background

Phase 25 hardened agent prompts based on Phase 24's E2E failure log (40 issues: 5 BLOCKER, 28 DEGRADED, 7 COSMETIC). Plans 25-01 through 25-06 addressed prompt discipline, slash commands, audit attribution, research capabilities, and PR workflow.

The abbreviated E2E re-validation (25-04) confirmed the fixes are installed but could not fully validate attribution improvement without a live RPEV run.

This phase captures findings from actual usage — the ground truth that only comes from running the system on real work.

## Scope

Plans will be created as findings accumulate. Expected categories:

- **Install script issues** — missing files, path problems, upgrade handling
- **Agent behavior gaps** — prompts that still produce suboptimal behavior in practice
- **Tool sequence failures** — MCP calls that fail or return unexpected results
- **UX friction** — commands that are confusing or produce unhelpful output
- **Performance issues** — excessive token usage, slow operations

## Inputs

- Real usage sessions on rpi-camera-py
- Phase 25 E2E results: `.planning/phases/25-agent-behavior-hardening/25-E2E-RESULTS.md`
- Phase 24 failure log: `.planning/phases/24-e2e-validation/24-FAILURE-LOG.md`

## Requirements

| ID | Description | Priority |
|----|-------------|----------|
| UF-01 | All BLOCKER-severity findings resolved | Must |
| UF-02 | Install script reliably deploys latest framework | Must |
| UF-03 | RPEV cycle runs end-to-end without manual workarounds | Must |
| UF-04 | Attribution >= 80% in live RPEV session | Should |
