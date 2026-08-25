import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isProduction = process.env.NODE_ENV === "production";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

function parseOrigins(values: string[]): Set<string> {
  const origins = new Set<string>();
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") origins.add(url.origin);
    } catch {
      console.warn("[security] origen ignorado por formato inválido");
    }
  }
  return origins;
}

const trustedOrigins = parseOrigins([
  appUrl,
  ...(process.env.TRUSTED_APP_ORIGINS || "").split(","),
]);
const trustedFrameAncestors = [...parseOrigins((process.env.TRUSTED_FRAME_ANCESTORS || "").split(","))];

/**
 * Check if an origin is allowed for CORS
 * - Development: localhost o un origen configurado explícitamente.
 * - Production: solo NEXT_PUBLIC_APP_URL y TRUSTED_APP_ORIGINS.
 */
function isAllowedOrigin(origin: string): boolean {
  if (trustedOrigins.has(origin)) return true;
  if (isProduction) return false;

  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

// Public routes that don't require authentication
const publicRoutes = [
  "/",
  "/login",
  "/register",
  "/privacy-policy",
  "/terms-of-service",
];

// Add CORS headers if the origin is allowed
function addCorsHeaders(response: NextResponse, request: NextRequest) {
  const origin = request.headers.get("origin");

  if (origin && isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Max-Age", "86400");
    response.headers.set("Vary", "Origin");
  }

  return response;
}

// CSP y cabeceras defensivas; el embedding requiere un ancestro configurado.
function addSecurityHeaders(response: NextResponse) {
  const frameAncestors = ["'self'", ...trustedFrameAncestors].join(" ");
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors}`,
    "frame-src 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ];

  response.headers.set("Content-Security-Policy", directives.join("; "));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(self), payment=(), publickey-credentials-create=(self), publickey-credentials-get=(self)"
  );
  if (isProduction) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin)) {
      return NextResponse.json({ ok: false, error: { message: "Origen no permitido" } }, { status: 403 });
    }
    const response = new NextResponse(null, { status: 204 });
    addCorsHeaders(response, request);
    addSecurityHeaders(response);
    return response;
  }

  // Create response
  const response = NextResponse.next();

  // Add CORS and CSP headers
  addCorsHeaders(response, request);
  addSecurityHeaders(response);

  // Allow all API routes and static files
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".")
  ) {
    return response;
  }

  // Allow public routes
  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    return response;
  }

  // Check session cookie for protected routes (lightweight Edge-compatible check)
  // Better Auth uses "better-auth.session_token" or "__Secure-better-auth.session_token" (when secure)
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ||
    request.cookies.get("__Secure-better-auth.session_token");

  if (!sessionCookie) {
    // Redirect to login if no session cookie found
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    addCorsHeaders(redirectResponse, request);
    addSecurityHeaders(redirectResponse);
    return redirectResponse;
  }

  // Cookie exists - allow access
  // Note: Full session validation happens in Server Components/API routes
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
