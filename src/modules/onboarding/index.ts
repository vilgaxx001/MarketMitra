/**
 * src/modules/onboarding/index.ts — public API of the onboarding module.
 */
export { ONBOARDING_STEPS, TOTAL_ONBOARDING_STEPS } from "./validators";
export {
  step1Schema, step2Schema, step3Schema, step4Schema, step5Schema, step6Schema, step7Schema, step8Schema,
} from "./validators";
export type {
  Step1Input, Step2Input, Step3Input, Step4Input, Step5Input, Step6Input, Step7Input, Step8Input,
} from "./validators";
export { advanceStep, getOnboardingState, completeOnboarding } from "./service";
export type { OnboardingState } from "./service";
