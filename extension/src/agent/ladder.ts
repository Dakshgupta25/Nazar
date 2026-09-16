import { SanitizedDOMContext } from '../dom/semanticTree';

/**
 * Nazar Decision Ladder
 * 
 * L0: Deterministic DOM (Zero model inference)
 * L1: Local Vision (Local VLM)
 * L2: Server (Fallback only)
 */

export type ActionType = 'click' | 'type' | 'scroll' | 'focus';

export interface AgentAction {
  type: ActionType;
  targetNodeId?: string; // If L0 successfully finds it
  value?: string;
  confidence: number;
  sourceLayer: 'L0' | 'L1' | 'L2';
}

/**
 * L0: Deterministic Resolution
 * Attempts to solve the task using purely the semantic DOM tree.
 */
function resolveL0(task: string, domContext: SanitizedDOMContext): AgentAction | null {
  const t = task.toLowerCase();
  
  // Example heuristic: "click submit" -> look for button with text "submit"
  if (t.includes('click')) {
    const targetText = t.replace('click', '').trim();
    const match = domContext.elements.find(e => 
      e.isInteractive && e.text.toLowerCase().includes(targetText)
    );
    if (match) {
      return { type: 'click', targetNodeId: match.nodeId, confidence: 1.0, sourceLayer: 'L0' };
    }
  }

  // Example heuristic: "focus email" -> look for input type=email
  if (t.includes('focus') && t.includes('email')) {
    const match = domContext.elements.find(e => e.tagName === 'input' && e.attributes.type === 'email');
    if (match) {
      return { type: 'focus', targetNodeId: match.nodeId, confidence: 1.0, sourceLayer: 'L0' };
    }
  }

  return null;
}

/**
 * Executes the Decision Ladder.
 */
export async function executeLadder(task: string, domContext: SanitizedDOMContext): Promise<AgentAction> {
  console.log(`[Ladder] Attempting to resolve task: "${task}"`);

  // L0 Attempt
  const l0Action = resolveL0(task, domContext);
  if (l0Action) {
    console.log(`[Ladder] L0 (DOM) resolved task confidently.`);
    return l0Action;
  }

  // L1 Attempt (Local Vision - To be integrated)
  console.log(`[Ladder] L0 failed. Escalating to L1 (Local VLM)...`);
  // const l1Action = await resolveL1(task, sanitizedScreenshot);
  // if (l1Action && l1Action.confidence > 0.8) return l1Action;

  // L2 Attempt (Server Escalation)
  console.log(`[Ladder] L1 failed. Escalating to L2 (Server)...`);
  // return await resolveL2(task, domContext, sanitizedScreenshotCrop);
  
  throw new Error("Task could not be resolved by the Decision Ladder.");
}
