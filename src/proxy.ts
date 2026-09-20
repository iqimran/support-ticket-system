import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, validateSessionToken } from "@/server/auth/session";

// UX-only fast path: redirects obviously unauthenticated/unauthorized
// requests before rendering. It is NOT the security boundary — every
// page/layout/server action re-checks via requireAuth()/requireAdmin()
// regardless of what happens here (see src/server/authorization).
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = await validateSessionToken(token);

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (request.nextUrl.pathname.startsWith("/admin") && user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tickets/:path*",
    "/customers/:path*",
    "/team-members/:path*",
    "/reports/:path*",
    "/archive/:path*",
    "/admin/:path*",
  ],
};
