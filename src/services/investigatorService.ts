import { LlmAIInvestigator } from '@/services/LlmAIInvestigator';
import { MockAIInvestigator } from '@/services/AIInvestigatorService';

import type { AIInvestigatorService } from '@/types';

/** App-wide investigator: real model through the local proxy, built-in mock as a safety net. */
export const aiInvestigatorService: AIInvestigatorService = new LlmAIInvestigator(new MockAIInvestigator());
