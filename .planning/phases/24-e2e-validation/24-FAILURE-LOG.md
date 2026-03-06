# Phase 24: E2E Failure Log

**Run date:** 2026-03-06
**Target project:** /home/kanter/code/rpi-camera-py
**Release:** v3.0.0-alpha.1 (initial run) → v3.0.0-alpha.2 (post-patch run)

## Pre-Run Issues Fixed

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| init.md trust.toml schema: [rpev] with simplified keys instead of [rpev.involvement] with 16-entry matrix | MEDIUM | Updated init.md step 5 and step 6 to write full [rpev.involvement] matrix with 16 entries (4 levels x 4 stages), plus [rpev.domain_overrides] and [rpev] scalar keys matching packages/framework/config/trust.toml |

## Failure Log

*Issues documented as encountered during E2E run.*

| # | When | Issue | Root Cause | Severity | Status |
|---|------|-------|------------|----------|--------|
| 1 | Install | install.sh fails with 404 on tarball download | `/releases/latest` API returns empty for prerelease-only repos; fallback hardcoded to non-existent `v3.0` tag | BLOCKER | PATCHED |

## Verification Results

*Filled in during Plan 24-02 after patches applied.*

| Success Criterion | Result | Evidence |
|-------------------|--------|----------|
| SC1: Full RPEV cycle completes on rpi-camera-py | PENDING | — |
| SC2: .synapse-audit.log contains required tool entries | PENDING | — |
| SC3: Failure log documents issues with root causes | PENDING | — |
| SC4: /synapse:status matches get_task_tree state | PENDING | — |
