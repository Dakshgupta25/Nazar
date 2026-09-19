# Visual Privacy Extension — Evaluation Corpus & Results Guide

This directory contains the machine-readable evaluation test corpus, ground-truth JSON definitions, and automated evaluation output files for the **Visual Privacy Extension** (Phase 10 Final Release).

---

## 1. Evaluation Corpus Layout (`evaluation/corpus/`)

| File | Scenario ID | Description | Expected Detections | Expected Verification |
| :--- | :--- | :--- | :--- | :--- |
| `case_a_single_face.json` | `case-a-single-face` | Single human face in image | 1 Face | `PASS` |
| `case_b_group_photo.json` | `case-b-group-photo` | Group photo containing 3 human faces | 3 Faces | `PASS` |
| `case_c_email.json` | `case-c-email` | Synthetic email string (`alice.smith@privacytest.org`) | 1 PII (`EMAIL`) | `PASS` |
| `case_d_phone.json` | `case-d-phone` | Synthetic Indian phone (`+91 9876543210`) | 1 PII (`PHONE`) | `PASS` |
| `case_e_pan.json` | `case-e-pan` | Synthetic 10-char PAN (`ABCPE1234F`) | 1 PII (`PAN`) | `PASS` |
| `case_f_credit_card.json` | `case-f-credit-card` | Synthetic Luhn card (`4532 0151 1283 0366`) | 1 PII (`CREDIT_CARD`) | `PASS` |
| `case_g_mixed.json` | `case-g-mixed` | Mixed screenshot (1 Face, Email, Phone, PAN, Ordinary text) | 1 Face, 3 PII, 1 Ord text | `PASS` |
| `case_h_nonsensitive.json` | `case-h-nonsensitive` | Non-sensitive document text only | 0 PII, 1 Ord text | `PASS` |
| `case_i_multi_pii.json` | `case-i-multi-pii` | Multi-PII document (2 Emails, 2 Phones, 1 Card) | 5 PII items | `PASS` |
| `case_j_under_redacted.json` | `case-j-under-redacted` | Under-redacted image payload (Un-redacted PII remains) | 1 Residual PII | `FAIL` |

---

## 2. Automated Evaluation & Benchmark Execution

### Run Corpus Evaluation (`npm run eval`)
Runs all 10 synthetic corpus scenarios against `PrivacyPipeline`, compares expected vs observed findings, and updates `evaluation/results/raw-results.json` and `evaluation/results/metrics.json`.
```bash
npm run eval
```

### Run Performance Benchmarks (`npm run benchmark`)
Measures high-precision cold run (with model initialization) vs warm run latencies across pipeline stages, and updates `evaluation/results/benchmark.json`.
```bash
npm run benchmark
```

---

## 3. Results Files (`evaluation/results/`)

- **`raw-results.json`**: Per-case breakdown of ground-truth expected values vs observed model pipeline findings.
- **`metrics.json`**: Aggregate confusion matrix and summary metrics across Face, OCR, PII classification, Redaction, and Verification stages.
- **`benchmark.json`**: Cold vs warm performance latencies (min, max, average, median) across 5 sample iterations.
