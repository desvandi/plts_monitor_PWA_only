// =============================================================================
// API Response helpers — consistent {success, message, data} envelope.
// =============================================================================

import { NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/types";

export function ok<T>(data: T, message = ""): NextResponse<ApiResponse<T>> {
  return NextResponse.json<ApiResponse<T>>({ success: true, message, data });
}

export function fail(message: string, status = 400): NextResponse<ApiResponse<null>> {
  return NextResponse.json<ApiResponse<null>>(
    { success: false, message, data: null },
    { status },
  );
}

export function unauthorized(message = "Unauthorized"): NextResponse<ApiResponse<null>> {
  return fail(message, 401);
}

export function forbidden(message = "Forbidden"): NextResponse<ApiResponse<null>> {
  return fail(message, 403);
}

export function notFound(message = "Not Found"): NextResponse<ApiResponse<null>> {
  return fail(message, 404);
}
