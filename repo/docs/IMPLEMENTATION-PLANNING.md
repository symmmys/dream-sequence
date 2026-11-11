# Somnium — Implementation Planning and Workload Estimation

**Status:** Required planning convention for future substantial implementation plans  
**Introduced:** November 9, 2026

## Purpose

Implementation plans should make scope, uncertainty, dependencies, and likely effort visible before substantial code changes begin. A timebox should be treated as a planning constraint, not as a promise that every part of an ambitious feature can be completed within it.

## Required estimation approach

For each substantial implementation plan:

1. Break the requested outcome into independently reviewable work packages using a lightweight Work Breakdown Structure (WBS).
2. Estimate each package with three-point estimates:
   - **Optimistic (O):** the work proceeds with few surprises.
   - **Most likely (M):** the expected path given the inspected codebase.
   - **Pessimistic (P):** reasonable integration, debugging, or compatibility complications occur.
3. Calculate the PERT weighted estimate for each package:

   `PERT = (O + 4M + P) / 6`

4. Sum package estimates while calling out dependencies and any work that can happen in parallel. The simple sum is a conservative elapsed-effort approximation when tasks are sequential; do not imply parallel work reduces elapsed time unless the dependency structure supports it.
5. State the assumptions, major risks, confidence level, and likely sources of variance. Distinguish implementation, testing, live visual validation, and packaging.
6. Define a bounded, testable vertical slice for the requested timebox. Explicitly list deferred work rather than silently reducing acceptance criteria.
7. Include observable acceptance criteria and identify which can be automated versus which require browser, WebGL, or user validation.

## Historical calibration

Before estimating, inspect the most relevant previous milestones and use analogous estimation where possible:

- Compare architectural scope, affected modules, integrations, regression breadth, and packaging requirements.
- Use previous milestones to calibrate relative complexity and likely risk, not as a direct measure of coding speed.
- If reliable active-work durations are not recorded, label historical comparisons as artifact-to-artifact elapsed intervals. Those intervals can include idle time, conversation interruptions, testing, and other non-coding time; they must not be presented as active engineering hours.
- Prefer several comparable milestones and report mean/median or a range where useful. Explain small or heterogeneous samples.
- Do not fabricate historical measurements. If the repository does not preserve meaningful timing data, say so and rely on expert-judgment PERT estimates with lower confidence.

## Timebox guidance

When a requested timebox is shorter than the estimated full scope:

- Preserve one end-to-end demonstrable capability wherever possible.
- Prioritize the highest-risk integration path early, so feasibility is tested before polishing controls or broad coverage.
- Keep performance and lifecycle safeguards in the vertical slice, but limit scale (for example, one light source, one anomaly, one receiving slice, and a bounded shadow-caster set).
- Defer generalization, multiple sources, expensive sampling, advanced physically based effects, and broad optimization to named follow-up increments.
- Report actual test and packaging results separately from the estimate. If a live visual environment was unavailable, state that limitation plainly.

## Reporting template

A useful plan contains:

- Goal and non-goals.
- Existing implementation/assets inspected.
- WBS with O/M/P and weighted PERT estimates.
- Dependencies, assumptions, risks, and confidence.
- Historical analogues and limitations of the timing data.
- Recommended timeboxed vertical slice and deferred scope.
- Acceptance criteria and validation strategy.

This method is a planning aid, not a guarantee. Estimates should be revised when repository inspection or early implementation reveals materially different complexity.
