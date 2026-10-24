/**
 * src/modules/ai/memory/types.ts
 *
 * MODULE 5B.2 — Memory Foundation contract.
 *
 * WHAT A MEMORY IS: a small, validated, business-scoped piece of durable
 * business knowledge, entered manually through the authorized API. It is
 * plain data — never instructions, never a transcript, never a secret.
 * Nothing in this module extracts, retrieves or injects memories into AI
 * requests; those are later modules (5B.3+).
 *
 * LIMITS
 *   content   1..2000 chars, required
 *   label     1..120 chars, optional (empty clears)
 *   metadata  flat object, <=10 keys, key 1..40 chars [A-Za-z][A-Za-z0-9_.-]*,
 *             value string(<=200)|number|boolean, <=2000 bytes serialized
 *             ({} = none; clearing sets {})
 *   per business: <=500 memories (active + archived), a soft cap
 *
 * EXPIRY: `expiresAt` is optional and evaluated at READ time only. An ACTIVE
 * memory whose expiresAt has passed is "expired": hidden from the default
 * `active` list, still stored, still listed under `all`, flagged isExpired.
 * No job deletes or archives anything. Setting a new future expiresAt (or
 * null) via update re-activates it.
 *
 * LIFECYCLE
 *   ACTIVE   (default) editable
 *   ARCHIVED read-only (edit => 409); archive is reversible via restore
 *   delete   permanent hard delete, any status
 *   restore  ARCHIVED -> ACTIVE; does NOT extend an elapsed expiresAt
 */
export const BUSINESS_MEMORY_TYPES = ["BUSINESS_FACT", "BUSINESS_PREFERENCE", "BUSINESS_GOAL", "BUSINESS_CONSTRAINT"] as const;
export type BusinessMemoryTypeValue = (typeof BUSINESS_MEMORY_TYPES)[number];

export const BUSINESS_MEMORY_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type BusinessMemoryStatusValue = (typeof BUSINESS_MEMORY_STATUSES)[number];

export const MEMORY_LIMITS = {
  contentMaxLength: 2_000,
  labelMaxLength: 120,
  metadataMaxKeys: 10,
  metadataKeyMaxLength: 40,
  metadataValueMaxLength: 200,
  metadataMaxSerializedLength: 2_000,
  maxMemoriesPerBusiness: 500,
  listDefaultLimit: 50,
  listMaxLimit: 100,
} as const;

export type MemoryMetadataValue = string | number | boolean;
export type MemoryMetadata = Record<string, MemoryMetadataValue>;

/** `active` = ACTIVE and not expired (default). `archived` = ARCHIVED. `all` = everything incl. expired. */
export const MEMORY_LIST_VIEWS = ["active", "archived", "all"] as const;
export type MemoryListView = (typeof MEMORY_LIST_VIEWS)[number];

export interface BusinessMemoryDTO {
  id: string;
  businessId: string;
  type: BusinessMemoryTypeValue;
  status: BusinessMemoryStatusValue;
  label: string | null;
  content: string;
  metadata: MemoryMetadata;
  expiresAt: Date | null;
  /** true when expiresAt is set and has passed (computed at read time). */
  isExpired: boolean;
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessMemoryListResult {
  items: BusinessMemoryDTO[];
  totalCount: number;
  limit: number;
  offset: number;
}
