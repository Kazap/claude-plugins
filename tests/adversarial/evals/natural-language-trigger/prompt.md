---
name: natural-language-trigger
description: A plain request for an adversarial review, with no slash command, starts the adversarial:review skill.
tags: [invocation]
plugins: ["../../../../plugins/adversarial"]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
disallowed_tools: [Workflow]
---

Do an adversarial review of this plan before I implement it:

1. Create a job that runs every 5 minutes and executes `DELETE FROM sessions WHERE expires_at < now()`.
2. The job runs on all 4 application replicas at the same time, with no lock.
3. The `sessions` table has 40 million rows and no index on `expires_at`.
