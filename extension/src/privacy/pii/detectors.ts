import { PII_PATTERNS } from './patterns';

/**
 * Validates a credit card number using the Luhn algorithm.
 */
function isValidLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  let sum = 0;
  let isSecond = false;
  
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (isSecond) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    isSecond = !isSecond;
  }
  
  return sum % 10 === 0;
}

/**
 * Validates an Aadhaar number using the Verhoeff algorithm.
 */
function isValidAadhaar(aadhaar: string): boolean {
  const digits = aadhaar.replace(/\D/g, '');
  if (digits.length !== 12) return false;
  
  // Verhoeff tables
  const d = [
    [0,1,2,3,4,5,6,7,8,9], [1,2,3,4,0,6,7,8,9,5], [2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7], [4,0,1,2,3,9,5,6,7,8], [5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2], [7,6,5,9,8,2,1,0,4,3], [8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0]
  ];
  const p = [
    [0,1,2,3,4,5,6,7,8,9], [1,5,7,6,2,8,3,0,9,4], [5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7], [9,4,5,3,1,2,6,8,7,0], [4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5], [7,0,4,6,9,1,3,2,5,8]
  ];
  const inv = [0,4,3,2,1,5,6,7,8,9];

  let c = 0;
  const array = digits.split('').map(Number).reverse();
  
  for (let i = 0; i < array.length; i++) {
    c = d[c][p[i % 8][array[i]]];
  }
  
  return c === 0;
}

/**
 * Main Lane B Detector.
 * Runs deterministic regexes and strict checksums on an input string.
 * Returns the detected PII type, or null.
 */
export function detectDeterministicPII(text: string): string | null {
  const cleanText = text.trim();
  
  if (PII_PATTERNS.EMAIL.test(cleanText)) return 'EMAIL';
  if (PII_PATTERNS.UPI.test(cleanText)) return 'UPI';
  if (PII_PATTERNS.PAN.test(cleanText)) return 'PAN';
  if (PII_PATTERNS.GSTIN.test(cleanText)) return 'GSTIN';
  if (PII_PATTERNS.IFSC.test(cleanText)) return 'IFSC';
  if (PII_PATTERNS.PASSPORT_IN.test(cleanText)) return 'PASSPORT';
  if (PII_PATTERNS.PHONE_IN.test(cleanText)) return 'PHONE';
  
  // Requires Checksum Validation
  if (PII_PATTERNS.CREDIT_CARD.test(cleanText.replace(/\s/g, ''))) {
    if (isValidLuhn(cleanText)) return 'CREDIT_CARD';
  }
  
  if (PII_PATTERNS.AADHAAR_BASIC.test(cleanText)) {
    if (isValidAadhaar(cleanText)) return 'AADHAAR';
  }
  
  return null;
}
