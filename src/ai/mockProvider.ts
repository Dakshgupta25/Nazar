import { AIProvider, AgentAction, AIProviderConfig } from '../types/ai';
import { ValidatedEgressRequest } from '../types/security';

export class MockAIProvider implements AIProvider {
  public async generateActions(request: ValidatedEgressRequest, config: AIProviderConfig): Promise<AgentAction[]> {
    if (config.providerName !== 'mock') {
      throw new Error('MockAIProvider strictly requires providerName to be "mock"');
    }

    // Parse prompt for synthetic actions based on the sanitized context
    const actions: AgentAction[] = [];
    const promptLower = request.payload.prompt.toLowerCase();

    // Verification that we don't accidentally leak unsanitized content inside the Mock provider
    // In a real provider, we'd format this payload to the LLM's required schema.
    const hasSanitizedDom = !!request.payload.sanitizedDom;
    const hasSanitizedImage = !!request.payload.sanitizedImage;

    if (!hasSanitizedDom && !hasSanitizedImage) {
      throw new Error('No sanitized context provided to AI');
    }

    if (promptLower.includes('fill')) {
      actions.push({
        type: 'type',
        targetSelector: 'input[name="search"]',
        value: 'synthetic_query',
        description: 'Filling synthetic form data'
      });
    }

    if (promptLower.includes('click') || promptLower.includes('submit')) {
      actions.push({
        type: 'click',
        targetSelector: 'button[type="submit"]',
        description: 'Clicking submit button'
      });
    }

    if (actions.length === 0) {
      actions.push({
        type: 'done',
        description: 'No applicable actions found'
      });
    }

    return actions;
  }
}
