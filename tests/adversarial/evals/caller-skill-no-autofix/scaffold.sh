#!/usr/bin/env bash
# Stages a plan file for the calling skill to send to the review.
set -euo pipefail
mkdir -p docs
cat > docs/plan.md <<'PLAN'
# Plano: limpeza de sessões expiradas

1. Criar um job que roda a cada 5 minutos e executa `DELETE FROM sessions WHERE expires_at < now()`.
2. O job roda em todas as 4 réplicas da aplicação ao mesmo tempo, sem lock.
3. A tabela `sessions` tem 40 milhões de linhas e não tem índice em `expires_at`.
PLAN
