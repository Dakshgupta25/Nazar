import { AgentAction, validateAction } from './validator';
import { SanitizedDOMContext } from '../dom/semanticTree';
import { piiVault } from '../privacy/vault';

/**
 * Executes a validated action in the browser.
 */
export async function executeAction(action: AgentAction, domContext: SanitizedDOMContext): Promise<void> {
  // 1. Strict Validation
  if (!validateAction(action, domContext)) {
    throw new Error(`[Executor] Action validation failed for: ${JSON.stringify(action)}`);
  }

  // 2. Resolve Placeholders
  let finalValue = action.value;
  if (finalValue && finalValue.startsWith('<<PII_')) {
    finalValue = piiVault.resolve(finalValue);
    console.log(`[Executor] Resolved Vault token for target ${action.target}`);
  }

  // 3. Prompt Injection / Safety Defence: Require human confirmation for irreversible actions
  const irreversibleKeywords = ['pay', 'purchase', 'delete', 'submit', 'send'];
  const targetText = targetNode.text.toLowerCase();
  const isIrreversible = irreversibleKeywords.some(keyword => targetText.includes(keyword));

  if (isIrreversible && action.action === 'click') {
    const userConfirmed = confirm(`[Nazar Safety] The agent wants to click '${targetNode.text}'. Do you allow this irreversible action?`);
    if (!userConfirmed) {
      console.warn(`[Executor] Action blocked by user confirmation.`);
      return;
    }
  }

  // 4. Execution (Simulated for now, would use chrome.scripting or active tab DOM injection)
  console.log(`[Executor] Executing ${action.action} on ${action.target || 'page'}`);
  
  if (action.action === 'type' && action.target && finalValue) {
    console.log(`[Executor] Typing securely into ${action.target}`);
    // Real value is injected locally, never seen by the agent
  }

  if (action.action === 'click' && action.target) {
    console.log(`[Executor] Clicking ${action.target}`);
  }
}
