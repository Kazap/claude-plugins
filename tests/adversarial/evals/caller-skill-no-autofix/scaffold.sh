#!/usr/bin/env bash
# Stages a plan file for the calling skill to send to the review.
set -euo pipefail
mkdir -p docs
cat > docs/plan.md <<'PLAN'
# Plan: clean up expired sessions

1. Create a job that runs every 5 minutes and executes `DELETE FROM sessions WHERE expires_at < now()`.
2. The job runs on all 4 application replicas at the same time, with no lock.
3. The `sessions` table has 40 million rows and no index on `expires_at`.
PLAN
