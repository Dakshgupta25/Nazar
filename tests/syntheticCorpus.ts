/**
 * Synthetic Privacy Evaluation Corpus:
 * Contains strictly non-real, generated test cases for verifying PII, Secret,
 * and DOM sensitivity detection without using real personal data.
 */

export interface SyntheticTestCase {
  id: string;
  category: string;
  input: string;
  expectedCategory: string;
  shouldMatch: boolean;
}

export const SYNTHETIC_PII_CORPUS: SyntheticTestCase[] = [
  // Emails
  {
    id: 'email_1',
    category: 'email',
    input: 'Contact us at alice.sandbox@test-domain.org for info.',
    expectedCategory: 'email',
    shouldMatch: true,
  },
  {
    id: 'email_2',
    category: 'email',
    input: 'Send bug reports to security-ops@dev-mock.co.uk immediately.',
    expectedCategory: 'email',
    shouldMatch: true,
  },

  // Phones
  {
    id: 'phone_us',
    category: 'phone',
    input: 'Call the office at (555) 019-2834 during business hours.',
    expectedCategory: 'phone',
    shouldMatch: true,
  },
  {
    id: 'phone_in',
    category: 'phone',
    input: 'Reach customer service at +91 9876543210 for assistance.',
    expectedCategory: 'phone',
    shouldMatch: true,
  },

  // Credit Cards (Luhn Valid test numbers)
  {
    id: 'card_visa',
    category: 'credit_card',
    input: 'Billing card number: 4000-0012-3456-7899 on file.',
    expectedCategory: 'credit_card',
    shouldMatch: true,
  },
  {
    id: 'card_invalid_luhn',
    category: 'credit_card',
    input: 'Random digit sequence: 4000-1111-2222-3333 should fail Luhn.',
    expectedCategory: 'credit_card',
    shouldMatch: false, // Fails Luhn check
  },

  // Cloud API Keys & Tokens
  {
    id: 'api_aws',
    category: 'api_key',
    input: 'AWS credentials: AKIAIOSFODNN7EXAMPLE in config.',
    expectedCategory: 'api_key',
    shouldMatch: true,
  },
  {
    id: 'api_google',
    category: 'api_key',
    input: 'Google Maps API key: AIzaSyD-7e1234567890abcdefghijklmnopqrst',
    expectedCategory: 'api_key',
    shouldMatch: true,
  },
  {
    id: 'token_github',
    category: 'access_token',
    input: 'GitHub access token: ghp_1234567890abcdefghijklmnopqrstuvwxyz12',
    expectedCategory: 'access_token',
    shouldMatch: true,
  },

  // Address
  {
    id: 'addr_1',
    category: 'address',
    input: 'Shipping destination: 4500 Sunset Boulevard, Suite 200',
    expectedCategory: 'address',
    shouldMatch: true,
  },

  // Session URL
  {
    id: 'url_session',
    category: 'session_url',
    input: 'Redirecting to https://auth.mock-app.net/callback?token=abcdef1234567890xyz',
    expectedCategory: 'session_url',
    shouldMatch: true,
  },

  // Non-sensitive public text (Negative examples)
  {
    id: 'public_text_1',
    category: 'none',
    input: 'The quick brown fox jumps over the lazy dog.',
    expectedCategory: 'none',
    shouldMatch: false,
  },
  {
    id: 'public_text_2',
    category: 'none',
    input: 'Button label: "Click here to proceed to next page"',
    expectedCategory: 'none',
    shouldMatch: false,
  },
];
