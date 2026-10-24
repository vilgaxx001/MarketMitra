/**
 * src/modules/brand/index.ts — public API of the brand module.
 */
export type { BrandIdentityDTO } from "./types";
export { updateBrandIdentitySchema } from "./validators";
export type { UpdateBrandIdentityInput } from "./validators";
export { getBrandIdentity, updateBrandIdentity } from "./service";
