import sys,re
name=sys.argv[1]
def rw(p,f):
    s=open(p,encoding='utf-8').read(); t=f(s); assert t!=s,f"mutation {name} did not change {p}"; open(p,'w',encoding='utf-8').write(t)
RA='src/lib/middleware/require-auth.ts'; MW='src/middleware.ts'; RP='src/modules/auth/repository.ts'
if name=='U1-trust-headers':
    rw(RA,lambda s:s.replace('''  const token = await getSessionCookie();
  if (!token) throw unauthenticated();''','''  const hl = await (await import("next/headers")).headers();
  const hu = hl.get("x-user-id"), hs = hl.get("x-session-id"), he = hl.get("x-user-email"), hr = hl.get("x-platform-role");
  if (hu && hs && he && hr) return { userId: hu, sessionId: hs, email: he, platformRole: hr as SessionPayload["platformRole"], exp: 0 };
  const token = await getSessionCookie();
  if (!token) throw unauthenticated();'''))
elif name=='U2-jwt-role':
    rw(RA,lambda s:s.replace("platformRole: live.platformRole, exp: claims.exp","platformRole: claims.platformRole, exp: claims.exp"))
elif name=='U3-skip-db':
    rw(RA,lambda s:s.replace("  if (!live) throw unauthenticated();\n","  if (!live && false) throw unauthenticated();\n").replace("const live = await resolveActiveSessionIdentity(claims.sessionId, claims.userId);","const live = (await resolveActiveSessionIdentity(claims.sessionId, claims.userId)) ?? { sessionId: claims.sessionId, userId: claims.userId, email: claims.email, platformRole: claims.platformRole };"))
elif name=='U4-no-strip':
    rw(MW,lambda s:s.replace("  return forwardWithoutIdentityHeaders(req);\n}","  return NextResponse.next();\n}"))
elif name=='U5-inject-identity':
    rw(MW,lambda s:s.replace("  return forwardWithoutIdentityHeaders(req);\n}",'''  if (isLoggedIn && session) {
    const rh = withoutIdentityHeaders(req.headers);
    rh.set("x-user-id", session.userId); rh.set("x-user-email", session.email); rh.set("x-platform-role", session.platformRole); rh.set("x-session-id", session.sessionId);
    return NextResponse.next({ request: { headers: rh } });
  }
  return forwardWithoutIdentityHeaders(req);
}'''))
elif name=='U6-strip-only-one':
    rw('src/lib/middleware/identity-headers.ts',lambda s:s.replace('"x-user-id", "x-session-id", "x-user-email", "x-platform-role"','"x-user-id", "x-session-id", "x-user-email"'))
elif name=='U7-no-isactive':
    rw(RP,lambda s:s.replace(", user: { isActive: true } }",  " }"))
elif name=='H-both-layers':   # pre-fix behaviour: middleware passes client headers on the unauthenticated path + requireAuth trusts headers (role from header)
    rw(MW,lambda s:s.replace("  return forwardWithoutIdentityHeaders(req);\n}",'''  if (isLoggedIn && session) {
    const rh = new Headers(req.headers);
    rh.set("x-user-id", session.userId); rh.set("x-user-email", session.email); rh.set("x-platform-role", session.platformRole); rh.set("x-session-id", session.sessionId);
    return NextResponse.next({ request: { headers: rh } });
  }
  return NextResponse.next();
}'''))
    rw(RA,lambda s:s.replace('''  const token = await getSessionCookie();
  if (!token) throw unauthenticated();

  // Signature''','''  const hl = await (await import("next/headers")).headers();
  const hu = hl.get("x-user-id"), hs = hl.get("x-session-id"), he = hl.get("x-user-email"), hr = hl.get("x-platform-role");
  if (hu && hs && he && hr) {
    const liveH = await resolveActiveSessionIdentity(hs, hu);
    if (!liveH) throw unauthenticated();
    return { userId: hu, sessionId: hs, email: he, platformRole: hr as SessionPayload["platformRole"], exp: 0 };
  }
  const token = await getSessionCookie();
  if (!token) throw unauthenticated();

  // Signature'''))
else: raise SystemExit("unknown "+name)
