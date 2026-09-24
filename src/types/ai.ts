/**
 * NAZAR AI Agent Types (Phase 6)
 */

import { ValidatedEgressRequest } from './security';

export type AgentActionType = 'click' | 'type' | 'scroll' | 'select' | 'navigate' | 'submit' | 'done';

export interface AgentAction {
  type: AgentActionType;
  targetSelector?: string;
  value?: string;
  description: string;
}

export interface AIProviderConfig {
  providerName: 'openai' | 'anthropic' | 'gemini' | 'mock';
  apiKey?: string;
  model?: string;
}

export interface AIProvider {
  generateActions(request: ValidatedEgressRequest, config: AIProviderConfig): Promise<AgentAction[]>;
}
