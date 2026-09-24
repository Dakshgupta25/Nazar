import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserAgent } from '../src/ai/agent';
import { MockAIProvider } from '../src/ai/mockProvider';
import { ValidatedEgressRequest, EgressGate } from '../src/security';
import { SanitizedArtifact } from '../src/types/preview';
import { generateLocalChecksum } from '../src/preview/previewState';

describe('NAZAR Phase 6 — Online AI Browser Agent', () => {
  let agent: BrowserAgent;
  let gate: EgressGate;
  
  beforeEach(() => {
    agent = new BrowserAgent(new MockAIProvider(), { providerName: 'mock' });
    gate = new EgressGate();
  });

  const createApprovedArtifact = (): SanitizedArtifact => {
    const timestamp = Date.now();
    const id = 'art_123';
    const url = 'https://example.com';
    const checksum = generateLocalChecksum(`${id}:${url}:0:${timestamp}`);
    return {
      artifactId: id,
      approvalTimestamp: timestamp,
      isUserApproved: true,
      contextUrl: url,
      contextTitle: 'Title',
      redactionsCount: 0,
      redactionsApplied: [],
      residualScanPassed: true,
      securityChecksum: checksum,
      sanitizedDom: { elements: [] } as any
    };
  };

  const getValidEgressRequest = (prompt: string): ValidatedEgressRequest => {
    gate.initializeSession();
    gate.recordScanComplete();
    gate.recordSanitizationComplete();
    gate.approveArtifact(createApprovedArtifact());
    const token = gate.authorizeEgress();
    return gate.constructEgressPayload(prompt, token);
  };

  it('agent executes instructions and produces validated actions', async () => {
    const request = getValidEgressRequest('Fill this form and click Submit');
    const actions = await agent.executeInstruction(request);
    
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].type).toBe('type');
    expect(actions[0].targetSelector).toBeDefined();
    
    expect(actions[1].type).toBe('click');
    expect(actions[1].targetSelector).toBeDefined();
  });

  it('agent fails safely if raw data properties are secretly embedded in the payload', async () => {
    const request = getValidEgressRequest('Do something');
    
    // Malicious injection of raw data property
    (request.payload as any).rawImage = new Uint8ClampedArray(10);
    
    await expect(agent.executeInstruction(request)).rejects.toThrow(/forbidden raw data attribute/);
  });

  it('agent cannot run with malformed or unverified egress requests', async () => {
    // Missing egress token entirely
    const badRequest = { payload: { prompt: 'do something', contextUrl: '', contextTitle: '' } } as any;
    
    await expect(agent.executeInstruction(badRequest)).rejects.toThrow(/SECURITY FAULT/);
  });

  it('validates agent actions and rejects unvalidated targets/types', async () => {
    const badProvider = {
      generateActions: async () => [{ type: 'click' }] // missing targetSelector
    } as any;
    
    const badAgent = new BrowserAgent(badProvider, { providerName: 'mock' });
    const request = getValidEgressRequest('Click');
    
    await expect(badAgent.executeInstruction(request)).rejects.toThrow(/requires a targetSelector/);
  });

  it('privacy failure blocks the agent since egress payload cannot be constructed', async () => {
    gate.initializeSession();
    gate.recordScanComplete();
    gate.recordSanitizationComplete();
    // Intentionally NOT approving the artifact
    // gate.approveArtifact(...)
    
    // The gate will throw, preventing the request from even reaching the agent
    expect(() => gate.authorizeEgress()).toThrow(/Invalid state transition/);
  });
});
