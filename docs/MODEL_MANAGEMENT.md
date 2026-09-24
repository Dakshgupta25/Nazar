# NAZAR Model Management & Offline Operation Specification (Phase 8)

## 1. Overview & Architecture

NAZAR relies on lightweight, strictly on-device model assets to perform:
1. **Visual Text Recognition (OCR)**
2. **Face & Biometric Boundary Detection**
3. **PII, Credential, & Secret Pattern Classification**

To guarantee zero external data leaks, all inference and processing happens 100% locally. The Model Manager coordinates asset verification, local persistence, download resiliency, integrity verification, and fail-closed privacy enforcement.

---

## 2. Canonical Model Manifest & Specifications

| Model Name | Capability | Version | Canonical Size | License | Source / Distribution URL | Checksum (SHA-256) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **NAZAR Local OCR Engine** | `ocr` | `1.2.0` | 4.2 MB | Apache-2.0 | `https://models.nazar.local/ocr/nazar-ocr-v1.2.0.bin` | `9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08` |
| **NAZAR Local Face Landmark Model** | `face_detection` | `1.0.4` | 1.85 MB | BSD-3-Clause | `https://models.nazar.local/vision/face-detector-v1.0.4.bin` | `5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8` |
| **NAZAR PII & Secret Classifier** | `pii_detection` | `2.1.0` | 850 KB | MIT | `https://models.nazar.local/nlp/pii-classifier-v2.1.0.bin` | `4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a` |

---

## 3. Cryptographic Integrity Verification

- **Algorithm:** SHA-256 (via Web Cryptography API `crypto.subtle.digest('SHA-256', buffer)`).
- **Verification Rule:** Every model asset downloaded or read from local disk is cryptographically hashed. The computed hex string must match the immutable manifest checksum.
- **Corrupted Asset Remediation:**
  - If a checksum mismatch occurs during download or initialization, the asset is rejected immediately.
  - Any corrupted payload is removed from storage (`deleteModelAsset()`).
  - The model status is transitioned to `corrupted`.
  - Privacy workflows fail closed to prevent faulty sanitization.

---

## 4. Local Storage Location & Persistence

- **Primary Storage:** Client-side IndexedDB (`nazar_model_store` database, `models` object store).
- **Secondary / Headless Fallback:** In-memory `Map<string, StoredModelAsset>` for headless browser execution and automated Vitest suites.
- **Cache Invariant:** Assets are keyed by `modelId` and version. Once installed and verified:
  - Repeated downloads are strictly avoided.
  - Assets persist across browser extension restarts, tab closures, and device reboots.
  - Zero network round-trips are executed once models are installed.

---

## 5. Download Resiliency & Error States

The Model Manager handles real-world browser network conditions:
1. **Interrupted Downloads:** AbortController signals and network drops trigger the `interrupted` state, allowing resuming or retrying without leaving partial corrupt files.
2. **Missing Models:** If an asset is not yet downloaded, the status is `missing`.
3. **Unavailable Models:** If remote servers are unreachable while offline, the engine marks the status as `unavailable` with a human-readable explanation.
4. **Progress Streaming:** `ReadableStream` chunked progress tracking exposes real-time `loadedBytes`, `totalBytes`, and `percentage` to the UI.

---

## 6. Fail-Closed Privacy Enforcement

In accordance with NAZAR's non-negotiable security directives:
- **No Silent Bypasses:** If any required model capability (`ocr`, `face_detection`, or `pii_detection`) is unavailable or corrupted, the system **never** proceeds with incomplete sanitization and **never** falls back to sending raw data.
- **Strict Capability Verification (`verifyCapabilitiesOrBlock`):**
  - Workflow evaluates capability requirements before scan.
  - If missing: returns `allowed: false` with the exact missing capabilities and throws a fail-closed privacy error.
  - Outgoing transmission to online AI agents is blocked at the Egress Gate.

---

## 7. True Offline Operation

- **Offline Detection:** Monitors `navigator.onLine` and local asset readiness.
- **Readiness Invariant:** When all 3 models (`ocr`, `face_detection`, `pii_detection`) are verified in local storage, `isOfflineReady()` returns `true`.
- **Zero Egress Assurance:** All OCR word detection, face clustering, PII regex scanning, and pixel redaction run completely offline on local CPU/GPU via WebAssembly/Canvas.

---

## 8. Model Update Strategy

- **Manual / User-Approved Updates Only:** Models are never silently auto-updated in the background without explicit cryptographic integrity verification.
- **Immutable Version Pinning:** Model updates require a new version identifier and a corresponding immutable SHA-256 entry in `NAZAR_MODEL_REGISTRY`.
- **Pre-Activation Verification:** Downloaded updates are stored in a staging buffer and verified before replacing existing active weights in storage.
