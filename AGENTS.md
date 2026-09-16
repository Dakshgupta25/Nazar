1. No model training.
2. No raw PII may cross the egress gate.
3. Exactly one non-local network egress module.
4. Fail closed on privacy errors.
5. No real PII in logs or telemetry.
6. Never persist the PII vault.
7. All local inference runs off the main UI thread.
8. Prefer deterministic DOM processing before VLM inference.
9. Never run the VLM continuously.
10. Never upload an unsanitized screenshot.
11. Never execute arbitrary model-generated JavaScript.
12. Validate every action target.
13. Human confirmation for irreversible actions.
14. Chrome and Firefox feature parity through adapters.
15. All performance claims must be measured.
16. No invented benchmark numbers.
17. Do not add dependencies without checking their license.
18. Do not add a large model when a specialist small model solves the same task.
19. Keep Nazar Edge usable independently from the Nazar Cloud API.
20. Keep the cloud API compatible with future API-key customers.
