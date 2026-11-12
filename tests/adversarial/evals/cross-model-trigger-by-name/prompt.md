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

Rode uma cross-model review deste plano antes de eu implementar:

1. Criar um job que roda a cada 5 minutos e executa `DELETE FROM sessions WHERE expires_at < now()`.
2. O job roda em todas as 4 réplicas da aplicação ao mesmo tempo, sem lock.
3. A tabela `sessions` tem 40 milhões de linhas e não tem índice em `expires_at`.
