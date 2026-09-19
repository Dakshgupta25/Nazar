# Visual Privacy Extension (Phases 1 - 10 Final Release)

A privacy-preserving Chrome browser extension for local face detection, spatial OCR text extraction, rule-based PII classification, canonical sensitive region mapping, destructive pixel redaction, independent sanitization verification, single-action end-to-end pipeline orchestration, comprehensive security auditing, and reproducible benchmarking prior to visual AI processing.

> **Phase 10 Scope Disclaimer:**
> Phase 10 completes the final evaluation, performance benchmarking, visual demonstration package, and release evidence for the standalone project. The single end-to-end privacy pipeline (`PrivacyPipeline`) orchestrates all core stages under a strict **fail-closed policy**. The primary user-facing export button (`[ Export Verified Image ]`) is enabled **ONLY** when verification returns `PASS` (`VERIFIED`).

---

## 1. Project Overview

The **Visual Privacy Extension** is a browser-native extension designed to detect, map, destructively redact, and independently verify sensitive visual regions (faces, text, PII) locally inside the browser before images reach cloud AI services or external APIs.

### Key Guarantees
- **100% offline local processing** (0 network egress for face detection, OCR, PII classification, region mapping, destructive redaction, verification, or pipeline execution).
- Manifest V3 extension build loadable directly into Chrome/Chromium.
- Zero server dependencies or external AI APIs.
- Fully independent codebase isolated from cloud backends.
- **Single Primary Action**: `[ PROTECT IMAGE ]` executes the complete pipeline in one click.
- **Real-Time Stage Progress & Checklist**: Displays stage progress, checklist counters, progress bar, and cancellation support (`[ Cancel ]`).
- **Strict Fail-Closed Export Policy**: Standard export of sanitized images is disabled unless the output is independently verified (`verification.status === 'PASS'`).
- **Empirically Audited Security**: 26 security test cases verified across zero network egress, zero PII logging, geometry attack clamping, and verifier tampering defenses.
- **Reproducible Evaluation & Benchmark**: Automated evaluation corpus engine (`npm run eval`) and high-precision performance benchmarker (`npm run benchmark`).

---

## 2. End-to-End Pipeline Architecture (Phases 1 - 10)

```
                 IMAGE
                   ↓
            Image Validation
                   ↓
       ┌───────────┴───────────┐
       ↓                       ↓
 Face Detection               OCR
       ↓                       ↓
       │               PII Classification
       │                       ↓
       └───────────┬───────────┘
                   ↓
             Region Mapping
                   ↓
               Redaction
                   ↓
            Sanitized Image
                   ↓
              Verification
                   ↓
          ┌────────┴─────────┐
          ↓                  ↓
        PASS               FAIL /
                            INCONCLUSIVE
                   ↓
        Security & Egress Audit Gate
```

### Stage Lifecycle & States
`IDLE` → `LOADING_IMAGE` → `DETECTING_FACES` → `RUNNING_OCR` → `CLASSIFYING_PII` → `MAPPING_REGIONS` → `REDACTING` → `VERIFYING` → `COMPLETED` / `FAILED` / `INCONCLUSIVE` / `CANCELLED`

### Fail-Closed Result Statuses
1. **`VERIFIED`**: Pipeline completed AND verification returned `status === 'PASS'` and `passed === true`.
2. **`FAILED_VERIFICATION`**: Pipeline completed BUT verification returned `status === 'FAIL'` (residual faces, residual PII, or broken pixel integrity).
3. **`INCONCLUSIVE`**: Verification returned `status === 'INCONCLUSIVE'`.
4. **`ERROR`**: Critical pipeline stage error occurred.
5. **`CANCELLED`**: User cancelled pipeline processing mid-execution.

---

## 3. Supported Pipeline Categories

1. **Faces**: Local BlazeFace detector (`FACE`).
2. **EMAIL**: RFC 5322 pattern matched (`EMAIL`).
3. **PHONE**: Indian 10-digit mobile numbers with +91 prefix (`PHONE`).
4. **PAN**: Indian 10-character PAN card structure with entity validation (`PAN`).
5. **AADHAAR**: 12-digit Indian Aadhaar passing Verhoeff matrix checksum (`AADHAAR`).
6. **CREDIT_CARD**: 13-19 digit card numbers passing Luhn algorithm (`CREDIT_CARD`).
7. **BANK_ACCOUNT**: IFSC codes and bank account numbers (`BANK_ACCOUNT`).
8. **URL**: Sensitive domain auth/login query parameters (`URL`).

---

## 4. Technical Specifications

| Parameter | Value / Specification |
| :--- | :--- |
| **Pipeline Orchestrator** | `PrivacyPipeline` (`src/core/pipeline/privacyPipeline.ts`) |
| **Face Detector** | BlazeFace (Local TensorFlow.js WebGL / WASM) |
| **OCR Engine** | Tesseract.js (Local WASM / WebWorker) |
| **PII Classifier** | Rule-Based Regex + Luhn + Verhoeff Matrix Checksums |
| **Region Mapper** | Deterministic Geometry Engine (`RegionMapper`) |
| **Redaction Engine** | Canvas / OffscreenCanvas 1:1 Pixel Replacement (`Redactor`) |
| **Verification Engine** | Multi-Layer Residual Scan Engine (`SanitizerVerifier`) |
| **Security Audit** | Threat Model T1–T12, Static Egress & Log Audit, 26 Test Matrix |
| **Content Security Policy** | Local OCR uses WebAssembly. Chrome MV3 extension_pages CSP therefore includes `'wasm-unsafe-eval'` while keeping ordinary `'unsafe-eval'` prohibited (`script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`) |
| **Corpus Evaluation** | 10 Synthetic Scenarios (Cases A–J) in `evaluation/corpus/` |
| **Performance Latency** | ~45ms Cold Start / ~5ms Warm Execution (`evaluation/results/benchmark.json`) |
| **Export Policy** | Fail-Closed Restriction (`[ Export Verified Image ]` enabled ONLY when verified) |
| **Execution Context** | Local Chrome Extension Popup (0 network egress) |

---

## 5. Installation & Reproduction Commands

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Run Full Automated Test Suite (135/135 Passing)
```bash
npm run test
```

### Step 3: Run Dedicated Security Audit Suite (39/39 Passing)
```bash
npm run eval:security
```

### Step 4: Run Corpus Evaluation Engine
```bash
npm run eval
```

### Step 5: Run High-Precision Performance Benchmark
```bash
npm run benchmark
```

### Step 6: Build for Production
```bash
npm run build
```
Generates unpacked Chrome extension build directory in `dist/`.

---

## 6. Manual Chrome Extension Loading & Usage

1. Open **Google Chrome** (or Edge / Brave).
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode** toggle.
4. Click **Load unpacked** and select `dist/` directory.
5. Click the extension icon in your toolbar.
6. Upload an image containing faces, document text, or PII.
7. Click **`[ PROTECT IMAGE ]`** to execute the complete end-to-end pipeline in one click.
8. Monitor real-time stage progress, checklist, and verification status.
9. Click **`[ Export Verified Image ]`** to download `sanitized_<filename>.png` once verified.

---

## 7. Development Progress

- ✅ **Phase 1**: Manifest V3 extension foundation & local image loader
- ✅ **Phase 2**: Local BlazeFace face detector with canvas overlay
- ✅ **Phase 3**: Local Tesseract.js WASM spatial OCR engine
- ✅ **Phase 4**: Local rule-based PII classification & text masking
- ✅ **Phase 5**: Sensitive region mapping & non-destructive visual overlay
- ✅ **Phase 6**: Destructive pixel redaction & sanitized PNG export
- ✅ **Phase 7**: Residual face & OCR verification engine with fail-closed policy
- ✅ **Phase 8**: End-to-end privacy pipeline orchestration & progress UI
- ✅ **Phase 9**: Security, Privacy, and Adversarial Audit
- ✅ **Phase 10**: Final Evaluation, Benchmarks, Demo & Release Evidence (*Complete*)

