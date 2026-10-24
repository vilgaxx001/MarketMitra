# API route inventory (generated from the source by static inspection; every `route.ts` under src/app/api)

| Route file | Methods | Identity helper | Permission guard |
|---|---|---|---|
| `/v1/ai/demo-generate` | POST | NONE (public by design) | - |
| `/v1/auth/forgot-password` | POST | NONE (public by design) | - |
| `/v1/auth/login` | POST | NONE (public by design) | - |
| `/v1/auth/logout` | GET, POST | getCurrentSession | - |
| `/v1/auth/me` | GET | requireAuthUser | - |
| `/v1/auth/resend-verification` | POST | requireAuth | - |
| `/v1/auth/reset-password` | POST | NONE (public by design) | - |
| `/v1/auth/signup` | POST | NONE (public by design) | - |
| `/v1/auth/verify-email` | POST | NONE (public by design) | - |
| `/v1/contact` | POST | NONE (public by design) | - |
| `/v1/invites/accept` | POST | requireAuth | - |
| `/v1/onboarding/start` | POST | requireAuth | - |
| `/v1/workspaces/[workspaceSlug]/activity` | GET | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/ai/execute` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/archive` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/assets/[assetId]/archive` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/assets/confirm-upload` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/assets/initiate-upload` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/assets` | GET | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-memories/[memoryId]/archive` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-memories/[memoryId]/restore` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-memories/[memoryId]` | DELETE, GET, PATCH | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-memories` | GET, POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-preferences` | DELETE, GET, PATCH | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/archive` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/audience/[segmentId]` | DELETE, PATCH | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/audience/[segmentId]/set-primary` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/audience` | GET, POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/brand` | GET, PATCH | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/context` | GET | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/restore` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]` | GET, PATCH | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses/[businessId]/switch-active` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/businesses` | GET, POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/leave` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/onboarding/complete` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/onboarding` | GET | requireWorkspaceAccess | - |
| `/v1/workspaces/[workspaceSlug]/onboarding/step` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/restore` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]` | GET, PATCH | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/team/invites/[inviteId]/resend` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/team/invites/[inviteId]/revoke` | POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/team/invites` | GET, POST | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/team/members/[userId]` | DELETE, PATCH | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces/[workspaceSlug]/team/members` | GET | requireWorkspaceAccess | requirePermission |
| `/v1/workspaces` | GET, POST | requireAuth | - |
