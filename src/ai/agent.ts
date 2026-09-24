import { AIProvider, AIProviderConfig, AgentAction } from '../types/ai';
import { ValidatedEgressRequest } from '../types/security';

export class BrowserAgent {
  constructor(
    private provider: AIProvider,
    private config: AIProviderConfig
  ) {}

  /**
   * Executes an instruction securely.
   * Only accepts a ValidatedEgressRequest, which guarantees it passed the Egress Gate.
   */
  public async executeInstruction(request: ValidatedEgressRequest): Promise<AgentAction[]> {
    if (!request || !request.egressToken || !request.payload) {
      throw new Error("SECURITY FAULT: Agent rejected malformed or unverified egress request");
    }

    // Explicitly verify no raw properties accidentally slipped into the payload
    const payloadKeys = Object.keys(request.payload);
    const forbiddenKeywords = ['rawImage', 'rawDom', 'rawContext', 'originalImage', 'originalDom'];
    for (const key of payloadKeys) {
      for (const forbidden of forbiddenKeywords) {
        if (key.toLowerCase().includes(forbidden.toLowerCase())) {
          throw new Error(`SECURITY FAULT: Payload contains forbidden raw data attribute: ${key}`);
        }
      }
    }

    // Call the underlying AI provider
    const actions = await this.provider.generateActions(request, this.config);

    // Validate the actions before returning
    return this.validateActions(actions);
  }

  /**
   * Browser actions must be validated before execution.
   */
  private validateActions(actions: AgentAction[]): AgentAction[] {
    if (!Array.isArray(actions)) {
      throw new Error("AI provider returned malformed actions");
    }

    const validTypes = ['click', 'type', 'scroll', 'select', 'navigate', 'submit', 'done'];

    for (const action of actions) {
      if (!validTypes.includes(action.type)) {
        throw new Error(`SECURITY FAULT: Invalid or unsupported agent action type: ${action.type}`);
      }

      if ((action.type === 'click' || action.type === 'type' || action.type === 'select') && !action.targetSelector) {
        throw new Error(`SECURITY FAULT: Action '${action.type}' requires a targetSelector`);
      }

      if (action.type === 'type' && typeof action.value !== 'string') {
        throw new Error(`SECURITY FAULT: Action 'type' requires a string value`);
      }
    }

    return actions;
  }
}
