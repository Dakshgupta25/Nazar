PHASE 0
Gemini 3.1 Pro — HIGH
        ↓
PHASE 1
Gemini 3.8 Flash — MEDIUM
        ↓
PHASE 2
Gemini 3.8 Flash — MEDIUM
        ↓
PHASE 3
Gemini 3.8 Flash — MEDIUM
        ↓
PHASE 4
Gemini 3.8 Flash — MEDIUM
        ↓
PHASE 5
Gemini 3.1 Pro — HIGH
        ↓
PHASE 6
Gemini 3.1 Pro — HIGH
        ↓
PHASE 7
Gemini 3.8 Flash — MEDIUM
        ↓
PHASE 8
Gemini 3.8 Flash — LOW/MEDIUM
        ↓
PHASE 9
Gemini 3.1 Pro — HIGH
        ↓
PHASE 10
Gemini 3.8 Flash — MEDIUM
        ↓
PHASE 11
Gemini 3.8 Flash — MEDIUM
        ↓
PHASE 12
Gemini 3.8 Flash — LOW
# NAZAR — Privacy Firewall AI Browser Agent
## Antigravity Build Prompt — Phase-by-Phase Master README

> **Project name: NAZAR**
>
> **Tagline:** Local Privacy Firewall for AI Agents
>
> This document is the **only build specification you should use for the new NAZAR implementation**.
>
> The previous ZIP/project was inspected only to understand the product concept and intended direction. **Do not copy, reuse, extend, refactor, or preserve its code, architecture, dependencies, files, models, or implementation decisions.**
>
> Build NAZAR as a **completely new project from scratch**.

---

# 0. MASTER INSTRUCTION

You are building **NAZAR**, a privacy-first browser extension that creates a local security boundary between a user's private browser/screen data and online AI agents.

The fundamental rule is:

```text
RAW USER DATA
     |
     v
LOCAL PRIVACY FIREWALL
     |
     +--> DOM analysis
     +--> OCR
     +--> Face detection
     +--> PII / secret detection
     +--> Pattern detection
     +--> Detection fusion
     |
     v
MINIMAL REDACTION
     |
     v
EDITABLE USER PREVIEW
     |
     v
EXPLICIT USER APPROVAL
     |
     v
SANITIZED CONTEXT
     |
     v
ONLINE AI
```

## Non-negotiable security rule

**Raw private information must never be sent to an online AI before local privacy filtering and explicit user approval.**

If privacy processing fails, is incomplete, crashes, times out, or cannot establish that the outgoing context is sanitized:

```text
BLOCK TRANSMISSION.
```

Never fall back to the original data.

---

# 1. PRODUCT GOAL

NAZAR has two core features.

## Feature 1 — Privacy-Safe Browser AI Agent

The user enters an instruction such as:

> "Fill this form and click Submit."

NAZAR captures the relevant browser context, analyzes it locally, detects private information, redacts only sensitive regions, presents an editable preview, and sends only the approved sanitized context to the online AI agent.

The agent may then:

- click
- type
- scroll
- select
- navigate
- submit

The privacy firewall must remain the security boundary throughout the workflow.

## Feature 2 — Local Image Privacy Filter

The user uploads an image.

NAZAR locally performs:

```text
Image
 ↓
OCR + Face Detection + PII/Secret Detection
 ↓
Redaction
 ↓
Editable Preview
 ↓
Copy / Save
```

No cloud OCR, cloud vision, cloud PII API, or online LLM is required for image sanitization.

---

# 2. IMPORTANT PRODUCT PRINCIPLES

Prioritize these in order:

1. **Privacy**
2. **Correctness**
3. **Context preservation**
4. **Reliability**
5. **Security**
6. **Performance**
7. **Simplicity**
8. **Maintainability**

Do not optimize for:

- number of technologies
- number of files
- number of models
- number of features
- architectural complexity

The smallest architecture that correctly solves the problem is preferred.

---

# 3. HARD REQUIREMENTS

## 3.1 Local privacy processing

Sensitive detection must happen locally.

Do not send raw screenshots, raw OCR text, raw DOM containing private values, or raw images to:

- OpenAI
- Gemini
- Claude
- cloud OCR APIs
- cloud vision APIs
- external PII APIs
- analytics systems

before sanitization.

## 3.2 DOM + OCR are both mandatory

For browser pages, NAZAR must use:

```text
DOM analysis
+
OCR / computer vision
```

They are complementary.

### DOM can identify

- input fields
- email inputs
- password inputs
- telephone inputs
- payment fields
- labels
- buttons
- links
- ARIA labels
- accessible names
- relevant HTML attributes
- sensitive form semantics

### OCR can identify

- text inside images
- canvas text
- screenshots
- PDFs
- rendered graphics
- non-semantic text
- embedded content

OCR output should contain at least:

```json
{
  "text": "john@example.com",
  "boundingBox": {
    "x": 420,
    "y": 280,
    "width": 210,
    "height": 30
  },
  "confidence": 0.98
}
```

## 3.3 Detection fusion

DOM and OCR must feed a common privacy detection/fusion layer.

The fusion system should determine:

```text
WHAT is sensitive
WHERE it is
WHAT TYPE it is
HOW CONFIDENT the detector is
HOW it should be redacted
```

Signals may include:

- DOM semantics
- OCR text
- OCR bounding boxes
- regex/pattern detectors
- face detection
- PII classification
- contextual/semantic signals

## 3.4 Minimal redaction

NAZAR must not hide entire screens unnecessarily.

Prefer:

```text
Email: [EMAIL REDACTED]
Phone: [PHONE REDACTED]
Name: [NAME REDACTED]
```

instead of:

```text
████████████████████
████████████████████
```

The AI should retain useful structure and meaning.

## 3.5 Face redaction

Detect faces locally and redact only the face bounding box.

Do not blur an entire image just because a face exists.

## 3.6 User approval

No sanitized context is sent to the online AI until the user explicitly approves it.

## 3.7 Fail closed

If any required privacy stage fails:

```text
Privacy scan failed.
Your original content has NOT been sent.
[Retry]
[Cancel]
```

---

# 4. TECHNOLOGY SELECTION RULE

Choose the implementation stack yourself.

Potential technologies include:

- Manifest V3
- TypeScript
- React
- ONNX Runtime Web
- WebAssembly
- WebGPU
- Web Workers
- Content scripts
- Service worker
- Offscreen document

These are **options, not requirements**.

Before implementing, justify every major technology:

| Technology | Why selected | Problem solved | Alternative | Why alternative rejected |
|---|---|---|---|---|

Do not add a dependency simply because it is popular.

---

# 5. MODEL SELECTION RULE

Choose local models based on:

1. Privacy
2. Accuracy
3. Browser compatibility
4. Model size
5. CPU/GPU requirements
6. RAM usage
7. Inference speed
8. Offline support
9. Distribution/licensing practicality

Prefer the smallest practical model combination.

The system must remain usable on ordinary consumer hardware.

Do not choose a huge model merely because benchmark accuracy is higher.

---

# 6. FIRST-TIME MODEL MANAGEMENT

On first launch:

```text
Extension installed
      ↓
Check local models
      ↓
Missing?
      ↓
Download required model assets
      ↓
Verify integrity
      ↓
Store locally
      ↓
Privacy engine ready
```

Do not repeatedly download models.

Provide a clear status UI:

```text
NAZAR Privacy Engine

✓ OCR
✓ Face Detection
✓ PII Detection

Status: Ready
```

The UI must clearly communicate:

> Privacy detection happens locally on this device.

If a model cannot be loaded, the relevant capability must be unavailable rather than silently bypassed.

---

# 7. DATA HANDLING RULES

Raw user information is sensitive.

Avoid:

- raw screenshot logging
- raw OCR logging
- raw PII logging
- permanent storage of original images
- analytics containing private content
- network uploads of raw screenshots
- unnecessary extension storage of raw data

Prefer in-memory processing.

If temporary disk storage is unavoidable, document:

- exact location
- purpose
- retention duration
- deletion mechanism

Never put real private values into debug logs.

---

# 8. PROJECT ARCHITECTURE

Use a clean modular architecture.

A reasonable conceptual model is:

```text
NAZAR
|
+-- Extension UI
|
+-- Capture
|   +-- Screenshot
|   +-- DOM extraction
|
+-- Privacy Engine
|   +-- OCR
|   +-- Face detection
|   +-- PII detection
|   +-- Pattern detection
|   +-- DOM analysis
|   +-- Detection fusion
|
+-- Redaction Engine
|
+-- Preview Editor
|
+-- Agent Controller
|
+-- Model Manager
|
+-- Secure Temporary State
|
+-- Tests / Evaluation
```

This is conceptual, not a mandate.

Change it if a technically superior simpler design is justified.

---

# 9. SHARED PRIVACY ENGINE

Feature 1 and Feature 2 must reuse privacy components where appropriate.

Conceptually:

```text
                 PRIVACY ENGINE
                       |
        +--------------+--------------+
        |              |              |
       OCR      FACE DETECTION    PII DETECTION
        |              |              |
        +--------------+--------------+
                       |
                 REDACTION ENGINE
```

Feature 1 additionally uses:

```text
Browser Capture
DOM Analysis
Agent Controller
```

Feature 2 additionally uses:

```text
Image Upload
```

Do not duplicate OCR, PII, face, geometry, or redaction logic.

---

# 10. EDITABLE PREVIEW REQUIREMENTS

Before sending sanitized context to the online AI, provide an editor.

The user must be able to:

- see all redactions
- add redaction
- remove redaction
- move redaction
- resize redaction
- change redaction type
- undo
- redo
- zoom
- pan
- compare original/sanitized locally
- approve
- cancel

The original stays local.

Only the approved sanitized representation can cross the egress boundary.

---

# 11. REDACTION TYPES

Support:

- semantic replacement
- solid rectangle
- blur
- pixelation

Default toward semantic/context-preserving redaction when appropriate.

Examples:

```text
[NAME REDACTED]
[EMAIL REDACTED]
[PHONE REDACTED]
[ADDRESS REDACTED]
[FACE REDACTED]
[PASSWORD REDACTED]
[API KEY REDACTED]
[CARD NUMBER REDACTED]
```

---

# 12. AGENT CONTEXT

After approval, the online agent may receive:

1. Sanitized visual context
2. Sanitized structured context
3. Redaction metadata where useful

Example:

```json
{
  "redactions": [
    {
      "type": "email",
      "label": "[EMAIL REDACTED]",
      "boundingBox": {
        "x": 120,
        "y": 300,
        "width": 220,
        "height": 30
      }
    }
  ]
}
```

The online model must never receive the original value.

---

# 13. PRIVACY EGRESS GATE

Create an explicit security boundary in the architecture.

Conceptually:

```text
LOCAL DATA
   |
   v
PRIVACY PIPELINE
   |
   v
SANITIZED ARTIFACT
   |
   v
USER APPROVAL
   |
   v
EGRESS GATE
   |
   v
ONLINE AI
```

The online AI request must be impossible unless the request is associated with an approved sanitized artifact.

Do not rely only on developer discipline.

Make the boundary explicit in code.

---

# 14. DEVELOPMENT PHASES

Do not implement everything at once.

Each phase must have:

- objective
- implementation tasks
- acceptance criteria
- tests
- security checks
- stop condition

Do not move to the next phase until the current phase is working and validated.

---

# PHASE 0 — REQUIREMENTS, THREAT MODEL & SYSTEM DESIGN

## Objective

Design NAZAR before writing the implementation.

## Prompt to Antigravity

```text
You are starting a completely new project named NAZAR.

Do not use the provided/previous project as implementation source material.
Do not copy code, architecture, dependencies, file structure, models, or implementation decisions from any previous project.

Your task is ONLY Phase 0.

Analyze the product requirements in this README and produce a technically rigorous system design.

Do not build the full application yet.

Deliver:

1. Product requirements breakdown.
2. Security/threat model.
3. Trust boundaries.
4. Data-flow diagram.
5. Browser-extension component architecture.
6. DOM + OCR + vision detection-fusion architecture.
7. Redaction architecture.
8. Editable preview architecture.
9. Online-agent egress architecture.
10. Feature 1 architecture.
11. Feature 2 architecture.
12. Local model requirements.
13. Model-management design.
14. Storage and data-lifecycle policy.
15. Permission requirements.
16. Failure and fail-closed behavior.
17. Testing strategy.
18. Performance strategy.
19. Proposed project structure.
20. Technology decision table with alternatives and reasons for rejection.

Important:

- Do not generate hundreds of files.
- Do not create placeholder implementations.
- Do not add a backend unless a real requirement proves it necessary.
- Keep the architecture minimal.
- Identify any requirement that is technically difficult or potentially unsafe.
- Explicitly identify what data is allowed to leave the device and what data must never leave.
- Explain how the egress gate guarantees that raw private information cannot be sent to the online AI.

At the end, provide:
- Architecture Decision Record
- Phase 0 acceptance checklist
- Exact implementation plan for Phase 1

Stop after Phase 0.
```

## Acceptance criteria

Phase 0 is complete only when:

- architecture is documented
- trust boundaries are documented
- egress boundary is documented
- model strategy is documented
- project structure is documented
- threat model exists
- technology decisions are justified
- no implementation has been unnecessarily generated

---

# PHASE 1 — EXTENSION FOUNDATION

## Objective

Create the minimal working browser extension.

## Prompt to Antigravity

```text
Implement ONLY Phase 1 of NAZAR.

Use the architecture approved in Phase 0.

Build a clean Manifest V3 browser extension from scratch.

Implement only:

1. Extension manifest.
2. Basic extension UI.
3. Content script.
4. Background/service worker only if actually required.
5. Secure message passing between extension components.
6. Browser screenshot/context capture.
7. Basic DOM extraction.
8. Minimal permissions.
9. Basic error handling.
10. Development/test page.

Requirements:

- TypeScript where appropriate.
- Keep files small and modular.
- Do not add AI yet.
- Do not add cloud APIs.
- Do not add fake privacy detection.
- Do not build the complete agent yet.
- Do not create unnecessary backend infrastructure.
- Do not store raw screenshots permanently.
- Do not log raw page content.

The extension must successfully:

1. Load in the browser.
2. Accept a test action.
3. Capture the required browser context.
4. Extract basic DOM structure.
5. Communicate safely between extension components.

Add focused tests for:
- message validation
- capture flow
- DOM extraction
- permission behavior

Update README/developer documentation with:
- setup
- build
- load unpacked extension
- test instructions

Stop after Phase 1.
```

## Acceptance criteria

```text
Extension loads
        ↓
User triggers capture
        ↓
Screenshot/context captured
        ↓
DOM extracted
        ↓
Result returned to UI
```

No online AI is involved.

---

# PHASE 2 — LOCAL PRIVACY ENGINE

## Objective

Build the real local privacy detection pipeline.

## Prompt to Antigravity

```text
Implement ONLY Phase 2 of NAZAR.

Do not build the online AI agent yet.

Implement a real local privacy engine containing:

1. OCR.
2. Face detection.
3. PII detection.
4. Secret/API-key/token pattern detection.
5. DOM sensitivity analysis.
6. Detection normalization.
7. Detection fusion.
8. Confidence scoring.
9. Bounding-box mapping.
10. Privacy result schema.

Minimum PII categories:

- name
- email
- phone
- physical address
- postal address
- credit/debit card number
- bank/payment information
- Aadhaar
- passport
- driver's license
- password
- API key
- access token
- secret key
- security code
- private/session URL information where confidently identifiable

Important:

- All inference must happen locally.
- Do not send raw input to any external service.
- Do not log raw detected values.
- Do not store original images permanently.
- Use workers/asynchronous processing where necessary.
- Do not freeze the UI during inference.

DOM signals should include, where applicable:

- input type
- autocomplete
- name
- id
- label
- aria-label
- accessible name
- password fields
- email fields
- telephone fields
- payment fields
- relevant semantic attributes

OCR must return:
- text
- confidence
- bounding box

Face detection must return:
- bounding box
- confidence

Create a fusion layer that merges overlapping and related signals.

The output should identify:
- what is sensitive
- where it is
- type
- confidence
- recommended redaction mode

Create unit and integration tests.

Create a small synthetic evaluation corpus that contains no real personal data.

Measure:
- OCR latency
- face detection latency
- PII detection latency
- total privacy scan latency
- memory usage where practical

Do not proceed to redaction or online AI.

Stop after Phase 2.
```

## Acceptance criteria

The privacy engine must work independently.

Given a synthetic test page/image:

```text
DOM + Screenshot
       ↓
Privacy Engine
       ↓
Detected Regions
```

No cloud request is allowed.

---

# PHASE 3 — REDACTION ENGINE

## Objective

Convert privacy detections into precise sanitized output.

## Prompt to Antigravity

```text
Implement ONLY Phase 3 of NAZAR.

Build the real redaction engine on top of the Phase 2 privacy results.

Implement:

1. Text-region redaction.
2. Face-region redaction.
3. Semantic replacement.
4. Solid rectangle mode.
5. Blur mode.
6. Pixelation mode.
7. Bounding-box expansion where required for safety.
8. Overlap resolution.
9. Redaction metadata.
10. Sanitized image generation.
11. Sanitized structured representation.

Default to the smallest practical redaction region.

Preserve surrounding context.

Examples:

Name -> [NAME REDACTED]
Email -> [EMAIL REDACTED]
Phone -> [PHONE REDACTED]
Face -> [FACE REDACTED]
Password -> [PASSWORD REDACTED]

Important:

- Never redact the entire image merely because one region is sensitive.
- Never modify unrelated content.
- Do not reveal the original value in logs/errors.
- Keep original and sanitized data separated in memory.
- Do not allow sanitized output generation to mutate the original source.
- Verify that all required detections are actually represented in the sanitized result.

Create tests for:
- single PII
- multiple PII
- overlapping PII
- face + text
- multiple faces
- semantic redaction
- geometry correctness
- no accidental redaction of unrelated regions

Add a residual-scan safety check where technically appropriate.

Stop after Phase 3.
```

## Acceptance criteria

```text
Input
 ↓
Privacy detections
 ↓
Precise redaction
 ↓
Sanitized output
```

Context outside sensitive regions remains readable.

---

# PHASE 4 — EDITABLE PREVIEW EDITOR

## Objective

Give the user control before any data leaves the device.

## Prompt to Antigravity

```text
Implement ONLY Phase 4 of NAZAR.

Build the local editable privacy preview.

The user must be able to:

- view sanitized output
- see every detected redaction
- add a redaction
- remove a redaction
- move a redaction
- resize a redaction
- change redaction type
- undo
- redo
- zoom
- pan
- compare original/sanitized locally
- approve
- cancel

Important security rules:

1. Original content remains local.
2. Original content must never be rendered through an online service.
3. Preview must not trigger an AI request.
4. Approval creates an explicit sanitized artifact.
5. Cancellation destroys temporary sanitized workflow state where possible.

Make the editor responsive.

Do not build the AI agent yet.

Create tests for:
- adding redactions
- editing geometry
- undo/redo
- approval state
- cancellation
- comparison mode
- zoom/pan

Stop after Phase 4.
```

## Acceptance criteria

The user can manually correct the privacy result before approval.

---

# PHASE 5 — SECURE EGRESS GATE

## Objective

Create the security boundary before integrating the online AI.

## Prompt to Antigravity

```text
Implement ONLY Phase 5 of NAZAR.

Build the secure egress gate.

The egress gate is the only component allowed to construct/send online AI context.

Implement an explicit state machine similar to:

RAW
 ↓
SCANNED
 ↓
SANITIZED
 ↓
USER_APPROVED
 ↓
EGRESS_ALLOWED

Invalid transitions must be rejected.

Examples:

RAW -> ONLINE = impossible
SCANNED -> ONLINE = impossible
SANITIZED -> ONLINE = impossible
CANCELLED -> ONLINE = impossible
PRIVACY_FAILED -> ONLINE = impossible

Only:

USER_APPROVED -> EGRESS_ALLOWED

is valid.

Requirements:

- sanitize/approval state must be cryptographically or structurally bound to the exact sanitized artifact where practical.
- Never attach original values to outgoing request objects.
- Validate outgoing payloads before transmission.
- Fail closed.
- If validation fails, block the request.
- Do not log sensitive content.

Add security tests attempting to:
- bypass approval
- send raw screenshot
- send raw OCR
- send unsanitized DOM
- reuse stale approval
- modify sanitized context after approval
- trigger AI request after cancellation

All must fail safely.

Do not integrate the actual online AI yet.

Stop after Phase 5.
```

## Acceptance criteria

It should be demonstrably impossible through normal application paths to send raw content to the online AI layer.

---

# PHASE 6 — FEATURE 1: ONLINE AI BROWSER AGENT

## Objective

Integrate the AI agent only after the privacy firewall is operational.

## Prompt to Antigravity

```text
Implement ONLY Phase 6 of NAZAR.

Now integrate the online AI browser agent.

Workflow:

User prompt
 ↓
Browser capture
 ↓
DOM analysis
 ↓
OCR / vision analysis
 ↓
Local privacy engine
 ↓
Local redaction
 ↓
Editable preview
 ↓
Explicit user approval
 ↓
Secure egress gate
 ↓
Sanitized context
 ↓
Online AI
 ↓
Browser action
 ↓
Verification

Example user instruction:

"Fill this form and click Submit."

The agent may perform:

- click
- type
- scroll
- select
- navigate
- submit

Important:

- The online AI receives only sanitized context.
- The online AI must not receive original private values.
- The agent must not bypass the egress gate.
- Browser actions must be validated before execution.
- Do not silently perform high-impact actions without the required user interaction policy.
- Keep agent capabilities minimal.
- Do not add unrelated autonomous features.

The AI provider must be configurable.

Do not hard-code secrets into the extension.

Do not expose API keys in source control.

Add tests proving:
1. raw values are absent from AI payloads.
2. sanitized values are present where appropriate.
3. agent cannot run before approval.
4. privacy failure blocks the agent.
5. browser actions execute only against validated targets.

Add a development mode using synthetic data only.

Stop after Phase 6.
```

## Acceptance criteria

The end-to-end Feature 1 flow works:

```text
Prompt
 ↓
Capture
 ↓
Privacy filtering
 ↓
Preview
 ↓
Approval
 ↓
Sanitized AI context
 ↓
Agent action
```

---

# PHASE 7 — FEATURE 2: LOCAL IMAGE PRIVACY FILTER

## Objective

Build the independent image sanitizer.

## Prompt to Antigravity

```text
Implement ONLY Phase 7 of NAZAR.

Build Feature 2: Local Image Privacy Filter.

Workflow:

Upload image
 ↓
Local OCR
 +
Local face detection
 +
Local PII/secret detection
 ↓
Detection fusion
 ↓
Redaction
 ↓
Editable preview
 ↓
Copy / Save

The feature must work without DOM information.

Support detection of:

- names
- emails
- phone numbers
- addresses
- financial information
- government IDs
- passwords
- API keys
- tokens
- obvious secrets
- faces

Support:
- semantic replacement
- rectangle
- blur
- pixelation
- manual redaction
- delete/move/resize
- undo/redo
- zoom/pan
- original/sanitized comparison

Actions:

[Copy Image]
[Save Image]

Everything before copying/saving must happen locally.

Do not upload images to a server.

Add tests using synthetic images.

Stop after Phase 7.
```

## Acceptance criteria

A user can upload an image and safely produce a sanitized copy without network processing.

---

# PHASE 8 — MODEL MANAGER & OFFLINE OPERATION

## Objective

Make local model handling production-oriented.

## Prompt to Antigravity

```text
Implement ONLY Phase 8 of NAZAR.

Build the production model-management system.

Requirements:

1. Detect installed model assets.
2. Download missing model assets.
3. Verify downloaded assets.
4. Store them locally.
5. Avoid repeated downloads.
6. Show model status.
7. Handle corrupted downloads.
8. Handle interrupted downloads.
9. Handle unavailable models.
10. Support offline operation after models are installed.

UI should show:

NAZAR Privacy Engine

✓ OCR
✓ Face Detection
✓ PII Detection

Status: Ready

If a required model is unavailable:

- explain the missing capability
- do not silently bypass privacy
- fail closed for workflows requiring that capability

Document:
- model source
- version
- size
- license
- integrity verification
- storage location
- update strategy

Do not add model auto-updates without integrity verification.

Stop after Phase 8.
```

---

# PHASE 9 — SECURITY & PRIVACY AUDIT

## Objective

Perform a dedicated security audit.

## Prompt to Antigravity

```text
Implement ONLY Phase 9 of NAZAR.

Do not add unrelated product features.

Perform a complete privacy/security audit.

Audit:

1. Network requests.
2. Extension permissions.
3. Storage.
4. Temporary files.
5. Console logs.
6. Error messages.
7. Analytics/telemetry.
8. Model downloads.
9. AI requests.
10. DOM extraction.
11. Screenshot handling.
12. OCR handling.
13. PII handling.
14. Face detection.
15. Redaction.
16. Preview editor.
17. Approval state.
18. Egress gate.
19. Agent actions.
20. Image copy/save.
21. Cancellation.
22. Privacy failures.
23. Extension restart behavior.
24. Stale state.
25. Race conditions.

Attempt to prove:

RAW DATA -> ONLINE AI

cannot occur through normal application paths.

Attempt adversarial cases:

- bypass approval
- call AI API directly
- reuse old approval
- mutate sanitized payload
- inject raw OCR into outgoing request
- inject raw DOM into outgoing request
- cause privacy engine failure
- cause model loading failure
- cancel during processing
- close/reopen extension during approval
- replay an old sanitized artifact
- trigger concurrent scans
- manipulate redaction metadata

Document every finding.

Fix real vulnerabilities.

Do not merely mark vulnerabilities as accepted without technical justification.

Produce:
- security audit
- threat model update
- privacy data-flow verification
- permissions audit
- egress verification
- residual-data verification

Stop after Phase 9.
```

---

# PHASE 10 — PERFORMANCE & REAL-WORLD EVALUATION

## Objective

Measure the actual system instead of guessing.

## Prompt to Antigravity

```text
Implement ONLY Phase 10 of NAZAR.

Perform real performance and quality evaluation.

Measure:

- extension startup
- model loading
- screenshot capture
- DOM extraction
- OCR latency
- face detection latency
- PII detection latency
- fusion latency
- redaction latency
- preview rendering
- end-to-end privacy scan
- memory usage
- CPU usage where practical

Evaluate:

1. normal HTML page
2. large page
3. dynamic React page
4. form-heavy page
5. image-heavy page
6. canvas content
7. PDF/embedded content where supported
8. dark mode
9. light mode
10. low-resolution image
11. multiple faces
12. multiple PII regions

Evaluate detection quality with synthetic test data.

Track:

- precision
- recall
- false positives
- false negatives
- localization quality
- context preservation
- processing latency

Do not fabricate metrics.

If a metric cannot be measured, explicitly mark it as unmeasured.

Optimize only after measuring.

Stop after Phase 10.
```

---

# PHASE 11 — FINAL TESTING & REGRESSION

## Objective

Make sure all features continue to work together.

## Prompt to Antigravity

```text
Implement ONLY Phase 11 of NAZAR.

Run the complete regression suite.

Test Feature 1:

Prompt
 -> capture
 -> DOM
 -> OCR
 -> privacy detection
 -> fusion
 -> redaction
 -> preview
 -> approval
 -> egress
 -> AI
 -> browser action

Test Feature 2:

Image
 -> OCR
 -> face detection
 -> PII detection
 -> fusion
 -> redaction
 -> preview
 -> copy/save

Test failure paths:

- OCR failure
- face model failure
- PII detector failure
- model download failure
- screenshot failure
- DOM extraction failure
- preview failure
- user cancellation
- approval timeout
- malformed AI request
- network failure
- AI failure
- browser action failure

Verify fail-closed behavior everywhere.

Run:
- unit tests
- integration tests
- security tests
- regression tests
- build checks
- lint/type checks
- browser tests where practical

Do not weaken tests to make the build pass.

Fix actual defects.

Stop after Phase 11.
```

---

# PHASE 12 — FINAL CLEANUP & RELEASE READINESS

## Objective

Remove unnecessary complexity and prepare NAZAR for real use.

## Prompt to Antigravity

```text
Implement ONLY Phase 12 of NAZAR.

Perform final engineering cleanup.

Review the entire codebase for:

- dead code
- unused dependencies
- duplicate utilities
- duplicated privacy logic
- giant files
- unnecessary abstractions
- unclear naming
- weak error handling
- unsafe logging
- unnecessary permissions
- unnecessary storage
- unnecessary services
- fake implementations
- TODOs that affect security
- inconsistent types
- missing tests

Simplify wherever possible.

Do not rewrite working architecture without a genuine technical reason.

Verify:

1. Feature 1 works.
2. Feature 2 works.
3. Local privacy detection works.
4. DOM + OCR fusion works.
5. Redaction preserves context.
6. User approval is mandatory.
7. Egress is fail-closed.
8. Raw information does not reach online AI.
9. Models work offline after installation.
10. No private data is unnecessarily persisted.
11. Permissions are minimal.
12. Build is reproducible.

Produce:
- final project structure
- final security summary
- final privacy data-flow
- final dependency list
- final permission list
- final known limitations
- release checklist

Stop after Phase 12.
```

---

# 15. FINAL README REQUIREMENTS FOR THE IMPLEMENTED PROJECT

After all phases are complete, the project itself must contain a polished `README.md`.

It must include:

## 15.1 Overview

What NAZAR is and why it exists.

## 15.2 Problem

Explain the privacy problem created when online AI agents can see browser screens containing private information.

## 15.3 Core philosophy

```text
Private data should be filtered locally
before it reaches an online AI.
```

## 15.4 Features

Explain:

- Privacy-safe browser AI agent
- Local image privacy filter

## 15.5 Architecture

Include diagrams for:

```text
Browser -> Privacy Firewall -> AI
```

and:

```text
Image -> Privacy Engine -> Redaction -> Output
```

## 15.6 DOM + OCR fusion

Explain why both are necessary.

## 15.7 Local AI

Document every local model and its purpose.

## 15.8 Model installation

Explain first-time model download and offline behavior.

## 15.9 Security

Explain:

- fail-closed behavior
- egress gate
- local processing
- temporary data lifecycle
- permission model
- logging policy

## 15.10 Data boundary

Clearly state:

### Stays local

- raw screenshots
- original images
- raw OCR
- raw DOM containing private values
- original detected PII
- local model inference inputs
- original browser context

### May leave the device

Only:

- user-approved sanitized context
- user-approved sanitized image/context
- the minimum information required for the configured online AI task

## 15.11 Limitations

Be honest.

Document:

- unsupported browser APIs
- OCR limitations
- face detection limitations
- PII false positives/negatives
- pages that cannot be fully captured
- model size
- device performance differences

Never claim perfect privacy.

---

# 16. FINAL SECURITY GUARANTEE TO VERIFY

Before calling NAZAR complete, demonstrate the following invariant:

```text
                 RAW DATA
                    |
                    v
             LOCAL PROCESSING
                    |
                    v
             SANITIZED DATA
                    |
                    v
              USER APPROVAL
                    |
                    v
              EGRESS GATE
                    |
                    v
               ONLINE AI
```

And prove that these paths are blocked:

```text
RAW DATA ----------------------> ONLINE AI   ❌
RAW OCR -----------------------> ONLINE AI   ❌
RAW DOM -----------------------> ONLINE AI   ❌
RAW IMAGE ---------------------> ONLINE AI   ❌
UNAPPROVED SANITIZED DATA -----> ONLINE AI   ❌
PRIVACY FAILURE ---------------> ONLINE AI   ❌
CANCELLED SESSION -------------> ONLINE AI   ❌
STALE APPROVAL ----------------> ONLINE AI   ❌
```

Only:

```text
USER-APPROVED SANITIZED CONTEXT
                |
                v
           ONLINE AI
```

is allowed.

---

# 17. DEFINITION OF DONE

NAZAR is complete only when all of the following are true:

- [ ] Built from scratch
- [ ] No previous-project implementation reused
- [ ] Manifest V3 extension works
- [ ] Browser capture works
- [ ] DOM extraction works
- [ ] OCR works locally
- [ ] Face detection works locally
- [ ] PII detection works locally
- [ ] Secret detection works locally
- [ ] DOM + OCR fusion works
- [ ] Precise redaction works
- [ ] Semantic redaction works
- [ ] Editable preview works
- [ ] User approval is mandatory
- [ ] Secure egress gate works
- [ ] Feature 1 agent works
- [ ] Browser actions work
- [ ] Feature 2 image sanitizer works
- [ ] Copy/save works
- [ ] Model manager works
- [ ] Offline operation works after model installation
- [ ] Privacy failure fails closed
- [ ] Raw data is not logged
- [ ] Raw data is not unnecessarily persisted
- [ ] Raw data does not reach online AI
- [ ] Security tests pass
- [ ] Regression tests pass
- [ ] Performance is measured
- [ ] Known limitations are documented
- [ ] Unused dependencies removed
- [ ] Unnecessary permissions removed
- [ ] Final README completed

---

# 18. IMPORTANT ANTIGRAVITY OPERATING RULES

Follow these rules throughout the entire project.

### Rule 1 — Build from scratch

Do not use the previous ZIP as an implementation source.

### Rule 2 — Think before coding

Do not generate hundreds of files before validating the architecture.

### Rule 3 — One phase at a time

Finish and test a phase before starting the next.

### Rule 4 — Do not fake functionality

Never create a mock OCR/PII/privacy system and present it as production functionality.

### Rule 5 — Privacy first

Raw private information must not reach the online AI before local filtering.

### Rule 6 — Fail closed

If privacy cannot be guaranteed, stop the operation.

### Rule 7 — Preserve context

Redact the smallest necessary region.

### Rule 8 — Keep the architecture stable

Do not repeatedly rewrite architecture without a real technical reason.

### Rule 9 — Minimize dependencies

Every dependency must have a documented purpose.

### Rule 10 — Minimize permissions

Request only browser permissions that are genuinely required.

### Rule 11 — No unnecessary backend

NAZAR is primarily a local browser extension. Do not introduce servers, databases, queues, or microservices unless a requirement genuinely requires one.

### Rule 12 — No private-data telemetry

Never send raw user content for analytics or debugging.

### Rule 13 — Synthetic data for development

Use synthetic test data instead of real personal information.

### Rule 14 — Measure instead of assuming

Performance and detection quality must be measured.

### Rule 15 — Keep the code understandable

A developer should quickly locate:

```text
Capture
   ↓
Detection
   ↓
Fusion
   ↓
Redaction
   ↓
Preview
   ↓
Approval
   ↓
Egress
   ↓
Agent
```

---

# 19. HOW TO USE THIS FILE WITH ANTIGRAVITY

Do not paste the entire document repeatedly.

Use this workflow:

```text
1. Give Antigravity this README.
2. Ask it to execute PHASE 0 only.
3. Review Phase 0.
4. Approve Phase 1.
5. Review and test Phase 1.
6. Continue phase-by-phase.
7. Never skip security gates.
8. Never ask it to "build everything" in one generation.
```

For every phase, require Antigravity to:

```text
PLAN
 ↓
IMPLEMENT
 ↓
TEST
 ↓
VERIFY
 ↓
REPORT
 ↓
STOP
```

Do not allow it to silently continue into the next phase.

---

# 20. FINAL PRODUCT VISION

NAZAR should feel like a **local privacy firewall sitting between a user and an AI agent**.

The key product experience is:

```text
User asks AI to act
        ↓
NAZAR observes browser context
        ↓
NAZAR detects private information locally
        ↓
NAZAR redacts only what is necessary
        ↓
User sees and edits the sanitized context
        ↓
User approves
        ↓
Only sanitized information crosses the boundary
        ↓
AI performs the requested browser task
```

For images:

```text
User uploads image
        ↓
NAZAR scans locally
        ↓
Private regions are identified
        ↓
Only those regions are redacted
        ↓
User edits the result
        ↓
User copies/saves the sanitized image
```

The product is successful when it can answer four questions clearly:

> **What is private?**

> **Where is it?**

> **How should it be redacted?**

> **What useful context can safely remain visible to AI?**

---

# NAZAR

## Local Privacy Firewall for AI Agents

**Privacy stays local. Context stays useful. The user stays in control.**
