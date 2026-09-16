/**
 * Nazar Placeholder Vault
 * 
 * In-memory vault for tokenising sensitive PII before egress.
 * Maps real values to placeholders (e.g., PII_EMAIL_1 -> apoorv@example.com).
 * 
 * CRITICAL SECURITY BOUNDARY:
 * - Never persist this vault to localStorage or IndexedDB.
 * - Clear the vault when the session ends.
 */

class PlaceholderVault {
  private vault = new Map<string, string>();
  private counts = new Map<string, number>();

  /**
   * Stores a real value and returns a sanitized token placeholder.
   * @param type The PII category (e.g., 'EMAIL', 'NAME')
   * @param realValue The sensitive string to protect
   * @returns The token (e.g., '<<PII_EMAIL_1>>')
   */
  public tokenize(type: string, realValue: string): string {
    const currentCount = (this.counts.get(type) || 0) + 1;
    this.counts.set(type, currentCount);
    
    const token = `<<PII_${type.toUpperCase()}_${currentCount}>>`;
    this.vault.set(token, realValue);
    
    return token;
  }

  /**
   * Resolves a token back to its real value.
   * @param token The token received from the server action (e.g., '<<PII_EMAIL_1>>')
   * @returns The real sensitive value, or the original token if not found
   */
  public resolve(token: string): string {
    if (this.vault.has(token)) {
      return this.vault.get(token)!;
    }
    console.warn(`[Vault] Attempted to resolve unknown token: ${token}`);
    return token;
  }

  /**
   * Safely clears all in-memory tokens.
   */
  public clearSession(): void {
    this.vault.clear();
    this.counts.clear();
    console.log("[Vault] Session cleared. All tokens securely destroyed.");
  }
}

// Singleton instance for the background service worker lifecycle
export const piiVault = new PlaceholderVault();
