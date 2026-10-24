/**
 * src/modules/audience/index.ts — public API of the audience module.
 */
export type { AudienceSegmentDTO } from "./types";
export { audienceSegmentSchema, updateAudienceSegmentSchema } from "./validators";
export type { AudienceSegmentInput, UpdateAudienceSegmentInput } from "./validators";
export { listSegments, createSegment, updateSegment, archiveSegment, setPrimarySegment } from "./service";
