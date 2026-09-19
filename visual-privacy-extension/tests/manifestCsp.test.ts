import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Manifest V3 Content Security Policy (CSP) Audit Test', () => {
  const rootManifestPath = path.resolve(__dirname, '../manifest.json');
  const distManifestPath = path.resolve(__dirname, '../dist/manifest.json');

  function auditManifestCsp(manifestPath: string, label: string) {
    expect(fs.existsSync(manifestPath), `${label} manifest file should exist`).toBe(true);
    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    expect(manifestContent.content_security_policy).toBeDefined();
    expect(manifestContent.content_security_policy.extension_pages).toBeDefined();

    const csp: string = manifestContent.content_security_policy.extension_pages;

    // 1. Must contain 'self'
    expect(csp).toContain("'self'");

    // 2. Must contain 'wasm-unsafe-eval' for local WebAssembly execution
    expect(csp).toContain("'wasm-unsafe-eval'");

    // 3. Must NOT contain 'unsafe-eval'
    expect(csp.includes("'unsafe-eval'")).toBe(false);

    // 4. Must NOT contain 'unsafe-inline'
    expect(csp.includes("'unsafe-inline'")).toBe(false);

    // 5. Must NOT contain remote script sources (http:, https:, CDN domains)
    expect(csp.includes('http:')).toBe(false);
    expect(csp.includes('https:')).toBe(false);
    expect(csp.includes('cdn')).toBe(false);

    // 6. Must enforce strict object-src
    expect(csp).toContain("object-src 'self'");
  }

  it('1. verifies root manifest.json CSP configuration', () => {
    auditManifestCsp(rootManifestPath, 'Root');
  });

  it('2. verifies built dist/manifest.json CSP configuration if dist exists', () => {
    if (fs.existsSync(distManifestPath)) {
      auditManifestCsp(distManifestPath, 'Dist');
    }
  });
});
