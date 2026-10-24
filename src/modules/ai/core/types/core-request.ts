import type { NormalizedMessage } from "./message";
import type { GenerationConfig } from "./provider";
import type { AITaskRequirements } from "./routing";
export interface AICoreRequest {
  requestId: string; workspaceId: string; actorUserId: string; requiresBusinessContext: boolean; businessId?: string;
  messages: NormalizedMessage[]; taskRequirements: AITaskRequirements; generationConfig: GenerationConfig;
}
