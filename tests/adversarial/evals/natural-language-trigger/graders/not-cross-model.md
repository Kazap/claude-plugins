---
type: llm
arm: both
criteria: >-
  The trace never launches the adversarial:cross-model-review skill and never says the plan will
  be sent to OpenAI, Codex, Google or Antigravity. A plain request for an adversarial review must
  stay with adversarial:review, which sends nothing outside the session.
---
