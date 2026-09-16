# Nazar Privacy Threat Model

## What Nazar Protects Against
Nazar is explicitly designed to serve as a **privacy firewall** at the browser edge. It protects against:
- Accidental screenshot upload containing sensitive data to an AI model.
- Cloud exposure of visible PII (e.g. Emails, Phone numbers, Credit Cards).
- Face exposure (Local visual redaction via mosaic/solid fill).
- Sensitive form exposure (Passwords, PAN, Aadhaar).
- OCR-visible PII (Sanitized before network egress).
- Sensitive document exposure (PDFs, images).
- URLs containing secrets (Stripped before egress).
- Model attempts to reconstruct placeholders (Vault tokens strictly kept client-side).

## What Nazar DOES NOT Protect Against
Nazar does NOT claim to protect against the following scenarios:
- **Malicious Browser Extensions**: Extensions with equivalent or higher privileges (e.g. `debugger`, `activeTab` on all URLs) can read the raw DOM before Nazar sanitizes it.
- **Compromised Operating Systems**: Malware or rootkits on the host machine.
- **Native Keyloggers**: Hardware or OS-level software recording keystrokes.
- **Direct Privileged Capture**: Hostile agents with direct CDP (Chrome DevTools Protocol) or OS-level access.
- **Third-Party Screenshots**: If an external agent takes an OS-level screenshot while **Screen Privacy is disabled**, they will see the raw PII. 
  - *Mitigation*: If the user needs to hand an arbitrary screenshot to another AI, they must enable **Screen Privacy** first.
- **Independent Agent Capture Pipelines**: External agents running their own capture pipelines that Nazar does not control.
- **Pre-transmitted Secrets**: Secrets already intentionally transmitted by another application.

## The Screen Privacy Boundary
Nazar separates **Agent Privacy** from **Screen Privacy**. 
By default (Agent Privacy), Nazar protects its *own* network egress path. To protect the visual screen from *other* local agents or OS-level screen recorders, the user must explicitly toggle the **Screen Privacy** mode to render the visual masks.
