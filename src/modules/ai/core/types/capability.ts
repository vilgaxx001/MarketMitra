export const AI_CAPABILITIES = ["TEXT_GENERATION","STREAMING","STRUCTURED_OUTPUT","TOOL_CALLING","VISION","EMBEDDINGS","LONG_CONTEXT"] as const;
export type AICapability = (typeof AI_CAPABILITIES)[number];
export type CapabilitySet = readonly AICapability[];
export function hasCapability(supported: CapabilitySet, required: AICapability): boolean { return supported.includes(required); }
export function hasAllCapabilities(supported: CapabilitySet, required: readonly AICapability[]): boolean { return required.every((cap) => supported.includes(cap)); }
export function missingCapabilities(supported: CapabilitySet, required: readonly AICapability[]): AICapability[] { return required.filter((cap) => !supported.includes(cap)); }
