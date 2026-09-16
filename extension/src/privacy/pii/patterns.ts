/**
 * Regular expressions for Lane B: Deterministic Text Detectors.
 * Focuses on Indian context (SIH requirements).
 */

export const PII_PATTERNS = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE_IN: /^(?:(?:\+|0{0,2})91(\s*[\-]\s*)?|[0]?)?[6789]\d{9}$/,
  PAN: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i,
  GSTIN: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i,
  IFSC: /^[A-Z]{4}0[A-Z0-9]{6}$/i,
  UPI: /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/,
  PASSPORT_IN: /^[A-PR-WYa-pr-wy][1-9]\d\s?\d{4}[1-9]$/i,
  CREDIT_CARD: /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})$/,
  AADHAAR_BASIC: /^\d{4}\s?\d{4}\s?\d{4}$/
};
