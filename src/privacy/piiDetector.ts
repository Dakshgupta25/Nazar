/**
 * Local PII and Secret Pattern Detector
 * Executes purely locally on client device.
 * Never logs or transmits raw sensitive values.
 */

import { SensitiveCategory } from '../types/privacy';

export interface PiiTextMatch {
  category: SensitiveCategory;
  confidence: number;
  startIndex: number;
  endIndex: number;
  textLength: number;
}

/**
 * Validates a credit card number using the Luhn Algorithm.
 */
export function isValidLuhn(digits: string): boolean {
  const sanitized = digits.replace(/[\s-]/g, '');
  if (!/^\d{11,19}$/.test(sanitized)) {
    return false;
  }

  let sum = 0;
  let alternate = false;

  for (let i = sanitized.length - 1; i >= 0; i--) {
    let n = parseInt(sanitized.charAt(i), 10);
    if (alternate) {
      n *= 2;
      if (n > 9) {
        n -= 9;
      }
    }
    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

/**
 * Validates an Indian Aadhaar number using the Verhoeff algorithm.
 */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 6, 7, 8, 9, 0, 1, 2, 3, 4],
  [6, 7, 8, 9, 5, 1, 2, 3, 4, 0],
  [7, 8, 9, 5, 6, 2, 3, 4, 0, 1],
  [8, 9, 5, 6, 7, 3, 4, 0, 1, 2],
  [9, 5, 6, 7, 8, 4, 0, 1, 2, 3],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidVerhoeff(str: string): boolean {
  const sanitized = str.replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(sanitized)) return false;

  let c = 0;
  const digits = sanitized.split('').map(Number).reverse();

  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  }

  return c === 0;
}

// Regex patterns for diverse PII and secrets
const EMAIL_REGEX = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

// Phone: International (+x), US (xxx-xxx-xxxx), Indian (9xxxx xxxxx, +91-xxxxx)
const PHONE_REGEX =
  /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b(?:\+91[\s-]?)?[6-9]\d{9}\b/g;

// Indian Aadhaar: 12 digits, often 4-4-4
const AADHAAR_REGEX = /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g;

// Passports: US (9 digits), Indian (1 letter + 7 digits)
const PASSPORT_REGEX = /\b[A-Z][0-9]{7}\b|\b[0-9]{9}\b/g;

// API Keys & Tokens
const AWS_KEY_REGEX = /\bAKIA[0-9A-Z]{16}\b/g;
const GOOGLE_API_KEY_REGEX = /\bAIza[0-9A-Za-z\-_]{35}(?:\b|$)/g;
const GITHUB_TOKEN_REGEX = /\b(?:ghp_[0-9a-zA-Z]{30,42}|github_pat_[0-9a-zA-Z_]{82})\b/g;
const SLACK_TOKEN_REGEX = /\bxox[baprs]-[0-9a-zA-Z-]{24,}\b/g;
const JWT_TOKEN_REGEX = /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g;
const GENERIC_HEX_KEY_REGEX = /\b(?:api[_-]?key|secret|token|auth)["'\s:=]+([0-9a-fA-F]{32,64})\b/gi;

// Potential Credit Card candidates (13 to 19 digits with separators)
const CARD_CANDIDATE_REGEX = /\b(?:\d{4}[-\s]?){3}\d{1,4}\b|\b\d{13,19}\b/g;

// Postal Code / PIN code in context
const PIN_CODE_REGEX = /\b(?:pin|pincode|zip|postal|postal\s*code)[\s:]*([1-9][0-9]{5}|[0-9]{5}(?:-[0-9]{4})?)\b/gi;

// Physical Address keywords
const ADDRESS_REGEX = /\b\d{1,5}\s+(?:[A-Za-z0-9.-]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Nagar|Marg|Sector|Block|Floor|Apartment|Apt|Suite)\b/gi;

// Session / Auth URL
const SESSION_URL_REGEX = /https?:\/\/[^\s"'<>]*(?:token|access_token|session_id|auth_key|api_key|secret)=([a-zA-Z0-9%_-]{12,})/gi;

// Salutation + Capitalized Name
const NAME_REGEX = /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;

/**
 * Scans raw text locally and extracts matches categorized by sensitive type.
 * Never logs raw values.
 */
export function scanTextForPii(text: string): PiiTextMatch[] {
  if (!text || typeof text !== 'string') return [];

  const matches: PiiTextMatch[] = [];

  // Helper to add regex matches
  const matchRegex = (
    regex: RegExp,
    category: SensitiveCategory,
    confidence: number,
    validator?: (val: string) => boolean
  ) => {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const matchText = m[0];
      if (validator && !validator(matchText)) {
        continue;
      }
      matches.push({
        category,
        confidence,
        startIndex: m.index,
        endIndex: m.index + matchText.length,
        textLength: matchText.length,
      });
    }
  };

  // 1. Email
  matchRegex(EMAIL_REGEX, 'email', 0.98);

  // 2. Phone
  matchRegex(PHONE_REGEX, 'phone', 0.92);

  // 3. Credit Card (validated with Luhn)
  matchRegex(CARD_CANDIDATE_REGEX, 'credit_card', 0.98, isValidLuhn);

  // 4. Indian Aadhaar (validated with Verhoeff)
  matchRegex(AADHAAR_REGEX, 'aadhaar', 0.99, isValidVerhoeff);

  // 5. Passport
  matchRegex(PASSPORT_REGEX, 'passport', 0.85);

  // 6. Cloud & Platform API Keys / Tokens
  matchRegex(AWS_KEY_REGEX, 'api_key', 0.99);
  matchRegex(GOOGLE_API_KEY_REGEX, 'api_key', 0.99);
  matchRegex(GITHUB_TOKEN_REGEX, 'access_token', 0.99);
  matchRegex(SLACK_TOKEN_REGEX, 'access_token', 0.99);
  matchRegex(JWT_TOKEN_REGEX, 'access_token', 0.95);
  matchRegex(GENERIC_HEX_KEY_REGEX, 'secret_key', 0.92);

  // 7. Postal Codes
  matchRegex(PIN_CODE_REGEX, 'postal_code', 0.88);

  // 8. Physical Address
  matchRegex(ADDRESS_REGEX, 'address', 0.86);

  // 9. Session / Auth URL
  matchRegex(SESSION_URL_REGEX, 'session_url', 0.94);

  // 10. Salutation Names
  matchRegex(NAME_REGEX, 'name', 0.85);

  return matches;
}
