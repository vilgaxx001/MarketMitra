-- Representative rows for an installation that predates migrations (generic fixtures, no real data).
INSERT INTO "users"("id","email","passwordHash","name","updatedAt") VALUES
  ('cuser000000000000000001','a@example.test','x','Admin One',now()),
  ('cuser000000000000000002','b@example.test','x','Member Two',now());
INSERT INTO "workspaces"("id","name","slug","ownerId","updatedAt") VALUES ('cwksp000000000000000001','Acme','acme','cuser000000000000000001',now());
INSERT INTO "workspace_members"("id","workspaceId","userId","role") VALUES
  ('cmem000000000000000001','cwksp000000000000000001','cuser000000000000000001','ADMIN'),
  ('cmem000000000000000002','cwksp000000000000000001','cuser000000000000000002','TEAM_MEMBER');
INSERT INTO "business_profiles"("id","workspaceId","slug","businessName","updatedAt") VALUES ('cbiz0000000000000000001','cwksp000000000000000001','acme-sweets','Acme Sweets',now());
