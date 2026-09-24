# NAZAR — Local Privacy Firewall for AI Agents

> **Tagline:** Local Privacy Firewall for AI Agents  
> **Status:** Production-Ready (Phases 0–12 Fully Implemented & Tested)  
> **Core Architecture:** Manifest V3 Browser Extension + Standalone Local Image Privacy Filter

NAZAR establishes an uncompromising, fail-closed privacy boundary between private user information (browser screens, interactive DOM, local documents/images) and online AI agents. Raw sensitive context is never transmitted across the network.

---

## 1. Problem & Threat Model

Modern AI browser agents operate by observing user viewports via visual screenshots and DOM trees. This model introduces critical privacy vulnerabilities:

- **Credential Exposure**: Passwords, session tokens, cookies, and API keys are visible on screen.
- **Financial & Identity Leaks**: Credit card details, bank account numbers, tax IDs, Social Security/Aadhaar numbers, and national IDs can be inadvertently sent to third-party LLM providers.
- **Personal Identifiable Information (PII)**: Addresses, full names, phone numbers, customer emails, and confidential communications are exposed.
- **Visual Privacy**: User faces, profile pictures, and private graphic documents are captured without redaction.

Once raw data leaves the user's device, privacy guarantees are irreversibly lost.

---

## 2. Core Philosophy

```text
Private data should be filtered locally
before it reaches an online AI.
```

- **Client-Side First**: Detection and redaction run 100% locally on the user's device.
- **Fail-Closed Privacy**: If any scan, model, or check fails, times out, or crashes, transmission is strictly blocked.
- **Zero Raw Data Egress**: Raw screenshots, unredacted DOMs, and detected values never leave memory.
- **Explicit User Control**: AI egress requires explicit, interactive user inspection and approval.

---

## 3. Core Features

### Feature 1: Privacy-Safe Browser AI Agent
- Captures active browser tab context (viewport screenshot + interactive DOM structure).
- Executes local multi-modal privacy scan: DOM attribute inspection, local OCR, local face detection, and regex pattern matching across 17 sensitive categories.
- Fuses detections and applies semantic redactions (e.g. `[EMAIL REDACTED]`, `[PASSWORD REDACTED]`) preserving syntactic context so the AI can still plan actions.
- Displays an interactive Preview Editor for manual inspection and customization.
- Enforces an immutable, single-use cryptographic Egress Gate before online AI access.
- Executes safe, validated browser actions (`click`, `type`, `scroll`, `wait`, `select`).

### Feature 2: Local Image Privacy Filter
- Standalone privacy tool for desktop screenshots, scanned documents, and user images.
- Operates purely offline without requiring any DOM context.
- Detects PII, secrets, keys, and human faces.
- Offers multiple pixel redaction modes: solid color fill, pixelation (mosaic), and Gaussian blur.
- Exports sanitized images via local Blob/Data URL with zero network transmission.

---

## 4. Architecture Diagrams

### 4.1 Browser AI Agent Pipeline

```text
  +-------------------------------------------------------------------+
  |                        USER BROWSER TAB                           |
  +---------------------------------+---------------------------------+
                                    |
                    Viewport Screenshot + Extracted DOM
                                    v
  +-------------------------------------------------------------------+
  |               LOCAL PRIVACY FIREWALL (NAZAR)                      |
  |                                                                   |
  |  +-------------------------------------------------------------+  |
  |  |               Multi-Modal Privacy Detection                 |  |
  |  |   DOM Tree Scan  +  Local OCR  +  Local Face  +  PII Regex  |  |
  |  +------------------------------+------------------------------+  |
  |                                 |                                 |
  |                                 v                                 |
  |  +-------------------------------------------------------------+  |
  |  |                Spatial Detection Fusion                     |  |
  |  |         IoU Overlap Resolution & Normalization              |  |
  |  +------------------------------+------------------------------+  |
  |                                 |                                 |
  |                                 v                                 |
  |  +-------------------------------------------------------------+  |
  |  |                     Redaction Engine                        |  |
  |  |   Semantic Labels (DOM)  +  Pixel Redaction (Screenshot)    |  |
  |  +------------------------------+------------------------------+  |
  |                                 |                                 |
  |                                 v                                 |
  |  +-------------------------------------------------------------+  |
  |  |               Interactive Preview Editor                    |  |
  |  |       Visual Review, Manual Redactions, Pan & Zoom          |  |
  |  +------------------------------+------------------------------+  |
  |                                 |                                 |
  |                                 v                                 |
  |  +-------------------------------------------------------------+  |
  |  |             MANDATORY USER APPROVAL (Fail-Closed)           |  |
  |  +------------------------------+------------------------------+  |
  |                                 |                                 |
  |                                 v                                 |
  |  +-------------------------------------------------------------+  |
  |  |              Cryptographic Egress Gate (FSM)                |  |
  |  |    Checksum Integrity Verification & Single-Use Token       |  |
  |  +------------------------------+------------------------------+  |
  +---------------------------------+---------------------------------+
                                    |
                          Sanitized Context Only
                                    v
  +-------------------------------------------------------------------+
  |                    ONLINE AI AGENT PROVIDER                       |
  |               (Claude / OpenAI / Custom Endpoint)                 |
  +---------------------------------+---------------------------------+
                                    |
                        Structured Browser Actions
                                    v
  +-------------------------------------------------------------------+
  |                 CLIENT-SIDE ACTION VALIDATOR                      |
  |             (Target Selector & Whitelist Guard)                   |
  +-------------------------------------------------------------------+
```

### 4.2 Local Image Privacy Filter Pipeline

```text
  +-------------------------------------------------------------------+
  |                       UPLOADED LOCAL IMAGE                        |
  +---------------------------------+---------------------------------+
                                    |
                                    v
  +-------------------------------------------------------------------+
  |                   LOCAL IMAGE PRIVACY ENGINE                      |
  |                                                                   |
  |  +---------------------+  +------------------+  +--------------+  |
  |  |      Local OCR      |  | Local Face Model |  |  PII Scanner |  |
  |  +----------+----------+  +--------+---------+  +-------+------+  |
  |             \                      |                   /          |
  |              +---------------------+------------------+           |
  |                                    |                              |
  |                                    v                              |
  |                       Spatial Detection Fusion                    |
  |                                    |                              |
  |                                    v                              |
  |                   Multi-Mode Pixel Redaction Engine               |
  |                 (Solid Mask / Mosaic / Local Blur)                |
  |                                    |                              |
  |                                    v                              |
  |                       Interactive Image Preview                   |
  |               (Add/Remove Redaction, Re-run Filter)               |
  +------------------------------------+------------------------------+
                                       |
                                       v
  +-------------------------------------------------------------------+
  |                       LOCAL EXPORT / SAVE                         |
  |                  (Download PNG/SVG / Copy Blob)                   |
  |                    * Zero Cloud Transmission *                    |
  +-------------------------------------------------------------------+
```

---

## 5. DOM + OCR Fusion: Why Both Are Mandatory

A robust privacy firewall cannot rely on DOM inspection or OCR alone:

1. **Why DOM-only is insufficient**:
   - Canvas-rendered text, embedded PDFs, charts, SVG graphics, and WebGL applications have zero DOM text nodes.
   - Text rendered within images or scanned documents has no representation in the HTML tree.
   - Malicious or adversarial CSS (`opacity: 0`, off-screen positioning, shadow DOM, pseudo-elements) can conceal sensitive text from standard DOM queries.

2. **Why OCR-only is insufficient**:
   - Modern web forms frequently obscure sensitive values visually using password masking (`••••••••`). OCR sees only dots, while the underlying DOM contains form field metadata (`autocomplete="current-password"`, `type="password"`) that reveals the field's sensitivity.
   - Screen-rendered text with anti-aliasing, tiny fonts, low contrast, or custom web fonts can produce OCR errors or low confidence.
   - Dynamic form state and semantic attributes (`name="ssn"`, `data-testid="credit-card"`) exist solely in the DOM.

**The Solution**: NAZAR's **Fusion Engine** cross-correlates bounding boxes from the DOM hierarchy, OCR word-coordinates, face bounding boxes, and regex pattern detections. When signals overlap spatially (Intersection over Union), they are merged into unified, high-confidence redaction boundaries with conservative sizing.

---

## 6. Local AI Models & Offline Readiness

NAZAR bundles a modular **Model Manager** that manages local AI weights with integrity guarantees:

| Model / Capability | Engine / Format | Purpose | Download Size |
| :--- | :--- | :--- | :--- |
| **Local OCR** | Lightweight WebAssembly / Canvas Engine | Extracts word coordinates and text from visual viewports | ~2.5 MB |
| **Local Face Detection** | MobileNet-based Haar / SSD Model | Identifies human facial boundaries for mosaic/blur redaction | ~1.8 MB |
| **Local PII & Pattern Engine** | Multi-token compiled RegExp & Heuristics | Scans single tokens and multi-word phrases for 17 sensitive classes | Bundled |

### First-Time Download & Offline Operation
1. Models are downloaded on demand from verified sources with progress tracking.
2. Upon download, weights are validated against hardcoded SHA-256 cryptographic hashes.
3. Assets are stored locally in the browser's persistent `IndexedDB` (`nazar_model_store`).
4. Once installed and verified, models run **100% offline** with zero network pings.
5. If an asset is missing or corrupted, the engine fails closed and blocks scans that enforce model readiness.

---

## 7. Security Guarantees & Invariants

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

### Strictly Blocked Leakage Paths (Proven via Regression Suite)
- `RAW DATA ----------------------> ONLINE AI` ❌ (BLOCKED)
- `RAW OCR -----------------------> ONLINE AI` ❌ (BLOCKED)
- `RAW DOM -----------------------> ONLINE AI` ❌ (BLOCKED)
- `RAW IMAGE ---------------------> ONLINE AI` ❌ (BLOCKED)
- `UNAPPROVED SANITIZED DATA -----> ONLINE AI` ❌ (BLOCKED)
- `PRIVACY FAILURE ---------------> ONLINE AI` ❌ (BLOCKED)
- `CANCELLED SESSION -------------> ONLINE AI` ❌ (BLOCKED)
- `STALE APPROVAL ----------------> ONLINE AI` ❌ (BLOCKED)

### Security Safeguards
- **Monotonic Egress State Machine**: State transitions strictly follow `RAW` -> `SCANNED` -> `SANITIZED` -> `USER_APPROVED` -> `EGRESS_ALLOWED`. Any out-of-order transition aborts into `PRIVACY_FAILED`.
- **Anti-Tampering Checksums**: Approved artifacts include SHA-256 integrity checksums calculated across artifact attributes. In-memory mutation between approval and egress triggers an immediate security fault.
- **Single-Use Egress Tokens**: Authorizations expire immediately after a single payload construction.
- **In-Memory Volatility**: Unredacted captures exist only in short-lived memory structures; cancelled sessions immediately zero out all associated buffers.
- **Restricted URL Defense**: Privileged browser schemes (`chrome://`, `chrome-extension://`, `edge://`, `about:`, `devtools:`) cannot be targeted for capture.
- **Safe Console Logging**: All logging sanitize sensitive errors and never outputs raw context or error payloads.

---

## 8. Data Boundary Specification

### Stays Strictly Local (Never Transmitted)
- Raw screenshots and visual viewport buffers
- Original user-uploaded images
- Raw OCR word lists and text fragments
- Raw DOM nodes containing passwords, credentials, or PII
- Original detected sensitive values
- Local model inference inputs/outputs
- Internal navigation state and unapproved artifacts

### May Leave the Device
- **Only** the user-approved, sanitized DOM tree with semantic redactions in place
- **Only** the user-approved, pixel-redacted visual screenshot (if multimodal mode is active)
- The user's explicit task prompt
- Single-use egress authentication token

---

## 9. Sensitive Categories Covered

NAZAR detects and redacts 17 sensitive categories:

1. **Email Addresses** (RFC 5322 compliant regex)
2. **Passwords & Masked Fields** (DOM type/name/id + OCR heuristics)
3. **Credit & Debit Cards** (Visa, MasterCard, Amex, Discover, RuPay + Luhn algorithm validation)
4. **Card Verification Codes** (CVV/CVC/CSC)
5. **Bank Account & Routing Numbers** (IBAN, ACH, IFSC)
6. **API Keys & Cloud Tokens** (AWS, GitHub, Google, Stripe, Slack, JWT)
7. **Private Cryptographic Keys** (RSA, OpenSSH, PGP headers)
8. **US Social Security Numbers (SSN)**
9. **Indian Aadhaar Numbers** (Verhoeff checksum checked)
10. **Passport Numbers** (Global formats)
11. **Driver's License Identifiers**
12. **Phone Numbers** (E.164 and international formats)
13. **Street Addresses** (Multi-token postal address patterns)
14. **Postal & ZIP Codes**
15. **Human Names** (Contextual name matching)
16. **Session & Magic URLs** (Tokens embedded in URL parameters)
17. **Human Faces** (Local facial detection bounding boxes)

---

## 10. Known Limitations

In the interest of engineering honesty and transparent security:

- **Heuristic Boundaries**: No statistical or heuristic classifier is 100% perfect. Context-free unusual names or obfuscated PII can escape detection.
- **Complex Dynamic Canvases**: Highly animated WebGL or DRM-protected video frames may not be fully parsed via OCR in real time.
- **Heavy Anti-Aliasing**: Extremely small (<8px) or low-contrast text may yield low OCR confidence.
- **Synthetic Test Environments**: In headless/Vitest environments, WebGL and hardware-accelerated canvas fall back to software-based emulation.
- **Device Hardware Performance**: Model initialization and OCR latency depend on device CPU capabilities.

---

## 11. Minimal Permission Model

NAZAR's `manifest.json` requests only the bare minimum permissions required:

```json
{
  "permissions": [
    "activeTab",
    "scripting"
  ]
}
```

- `activeTab`: Grants access to the current tab only when the user explicitly invokes the extension.
- `scripting`: Enables dynamic injection of the content script extractor into tabs opened prior to extension installation.
- **No background webRequest permissions.**
- **No unlimited storage permissions.**
- **No broad host permissions (`<all_urls>` host permissions are not in permissions array).**

---

## 12. Verification & Testing

### Test Suite Summary
NAZAR includes 15 automated test suites covering all units, integration points, security gates, and performance benchmarks:

```bash
npm test
```

```
Test Files  15 passed (15)
Tests       152 passed (152)

- tests/serviceWorker.test.ts          (2 tests)
- tests/messages.test.ts               (3 tests)
- tests/domExtractor.test.ts           (6 tests)
- tests/ocrDetector.test.ts / face     (1 test)
- tests/piiDetector.test.ts           (18 tests)
- tests/fusionEngine.test.ts           (3 tests)
- tests/redactionEngine.test.ts       (16 tests)
- tests/previewEditor.test.ts         (14 tests)
- tests/egressGate.test.ts             (8 tests)
- tests/agent.test.ts                  (5 tests)
- tests/imageFilter.test.ts           (12 tests)
- tests/modelManager.test.ts          (17 tests)
- tests/privacyEngine.test.ts          (2 tests)
- tests/performanceEvaluation.test.ts  (5 tests)
- tests/regression.test.ts            (40 tests)
```

### Production Build
```bash
npm run build
```
Builds TypeScript and produces optimized production assets in `dist/` in ~1.2s.

---

## 13. Loading the Extension

1. Build the distribution bundle:
   ```bash
   npm run build
   ```
2. Open Chrome/Chromium and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in upper right).
4. Click **Load unpacked** and select the `dist/` directory inside this repository.
5. Open the test harness at `c:\Users\hp\Desktop\Nazar\public\test-page.html` to test live redaction and preview features.
