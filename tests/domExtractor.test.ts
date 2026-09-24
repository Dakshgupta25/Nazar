import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkSensitiveCandidate,
  classifyElementType,
  extractDomContext,
  generateSelector,
} from '../src/content/domExtractor';

describe('DOM Extractor & Sensitive Field Detection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('correctly classifies element types', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const btn = document.createElement('button');
    const link = document.createElement('a');
    const form = document.createElement('form');

    expect(classifyElementType(input)).toBe('input');
    expect(classifyElementType(textarea)).toBe('textarea');
    expect(classifyElementType(btn)).toBe('button');
    expect(classifyElementType(link)).toBe('a');
    expect(classifyElementType(form)).toBe('form');
  });

  it('detects sensitive password and email inputs', () => {
    const pwdInput = document.createElement('input');
    pwdInput.type = 'password';
    expect(checkSensitiveCandidate(pwdInput)).toBe(true);

    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    expect(checkSensitiveCandidate(emailInput)).toBe(true);

    const normalInput = document.createElement('input');
    normalInput.type = 'text';
    normalInput.name = 'city';
    expect(checkSensitiveCandidate(normalInput)).toBe(false);
  });

  it('detects sensitive candidate by keywords in name, autocomplete, or placeholder', () => {
    const cardInput = document.createElement('input');
    cardInput.type = 'text';
    cardInput.name = 'creditCardNumber';
    expect(checkSensitiveCandidate(cardInput)).toBe(true);

    const apiKeyInput = document.createElement('input');
    apiKeyInput.type = 'text';
    apiKeyInput.placeholder = 'Enter your api-key';
    expect(checkSensitiveCandidate(apiKeyInput)).toBe(true);

    const ssnInput = document.createElement('input');
    ssnInput.setAttribute('autocomplete', 'ssn');
    expect(checkSensitiveCandidate(ssnInput)).toBe(true);
  });

  it('detects sensitivity from associated label', () => {
    const label = document.createElement('label');
    label.setAttribute('for', 'field_secret');
    label.textContent = 'Account Password';

    const input = document.createElement('input');
    input.id = 'field_secret';

    document.body.appendChild(label);
    document.body.appendChild(input);

    expect(checkSensitiveCandidate(input)).toBe(true);
  });

  it('generates reproducible CSS selectors', () => {
    const form = document.createElement('form');
    form.id = 'login-form';

    const input = document.createElement('input');
    input.name = 'username';
    form.appendChild(input);

    document.body.appendChild(form);

    expect(generateSelector(form)).toBe('#login-form');
    expect(generateSelector(input)).toBe('input[name="username"]');
  });

  it('extracts complete DOM context and statistics', () => {
    document.body.innerHTML = `
      <form id="auth-form" action="/login">
        <label for="usr">Username</label>
        <input type="text" id="usr" name="username" value="user123" />
        <label for="pwd">Password</label>
        <input type="password" id="pwd" name="password" value="secret" />
        <button type="submit" id="btn-submit">Log In</button>
      </form>
    `;

    // In JSDOM, getBoundingClientRect returns zeros by default unless mocked.
    // Let's mock getBoundingClientRect so isElementVisible returns true.
    const all = document.querySelectorAll('*');
    all.forEach((el) => {
      el.getBoundingClientRect = () => ({
        x: 10,
        y: 20,
        width: 100,
        height: 30,
        top: 20,
        left: 10,
        bottom: 50,
        right: 110,
        toJSON: () => {},
      });
    });

    const context = extractDomContext(document);

    expect(context.stats.formsCount).toBe(1);
    expect(context.stats.interactiveCount).toBe(3); // input(usr), input(pwd), button(btn-submit)
    expect(context.stats.sensitiveCandidateCount).toBeGreaterThanOrEqual(1); // password field
    expect(context.elements.some((e) => e.id === 'pwd' && e.isSensitiveCandidate)).toBe(true);
  });
});
