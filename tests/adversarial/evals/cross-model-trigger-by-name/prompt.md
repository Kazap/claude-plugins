---
name: cross-model-trigger-by-name
description: Asking for a cross-model review by name starts the adversarial:cross-model-review skill, not adversarial:review. Bash is disallowed, so nothing can reach an external provider.
tags: [invocation, cross-model]
plugins: ["../../../../plugins/adversarial"]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Workflow, Bash]
---

Run a cross-model review of this plan before I implement it:

1. Create a job that runs every 5 minutes and executes `DELETE FROM sessions WHERE expires_at < now()`.
2. The job runs on all 4 application replicas at the same time, with no lock.
3. The `sessions` table has 40 million rows and no index on `expires_at`.
