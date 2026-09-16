import { SanitizedDOMContext } from '../dom/semanticTree';
import { piiVault } from '../privacy/vault';

export type ActionType = 
  | 'click' 
  | 'type' 
  | 'scroll' 
  | 'select' 
  | 'check' 
  | 'wait' 
  | 'focus' 
  | 'back' 
  | 'forward' 
  | 'done';

export interface AgentAction {
  action: ActionType;
  target?: string; // Node ID
  value?: string;  // For 'type' or 'select', could be a Vault placeholder
}

/**
 * Validates an action proposed by the Agent against the current DOM state.
 * Prevents arbitrary execution and ensures target exists.
 */
export function validateAction(action: AgentAction, domContext: SanitizedDOMContext): boolean {
  console.log(`[Validator] Validating action: ${action.action}`);

  // Browser navigation actions don't need target validation
  if (['back', 'forward', 'wait', 'done', 'scroll'].includes(action.action)) {
    return true;
  }

  // Interactive actions must target a valid node in the current semantic tree
  if (!action.target) {
    console.warn(`[Validator] Action ${action.action} requires a target.`);
    return false;
  }

  const targetNode = domContext.elements.find(e => e.nodeId === action.target);
  if (!targetNode) {
    console.warn(`[Validator] Target node ${action.target} not found in current DOM context.`);
    return false;
  }

  return true;
}
