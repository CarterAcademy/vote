import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function assertSameOrigin(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw Object.assign(new Error("跨站请求已被拒绝"), {
      status: 403,
      code: "CROSS_SITE_REQUEST_REJECTED",
    });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const requestHost = request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!requestHost || originHost !== requestHost) {
      throw Object.assign(new Error("请求来源不受信任"), {
        status: 403,
        code: "UNTRUSTED_ORIGIN",
      });
    }
  }
}

interface RouteError {
  status?: number;
  statusCode?: number;
  code?: string;
  message?: string;
  details?: unknown;
}

export function routeError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "提交内容不完整或格式不正确",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const routeError = error as RouteError;
  const status = routeError.status ?? routeError.statusCode ?? 500;
  const safeStatus = status >= 400 && status <= 599 ? status : 500;

  if (safeStatus >= 500) {
    console.error("Unhandled route error", error);
  }

  return NextResponse.json(
    {
      error: {
        code: routeError.code ?? "INTERNAL_ERROR",
        message:
          safeStatus >= 500
            ? "服务暂时不可用，请稍后重试"
            : routeError.message ?? "请求未完成",
        ...(routeError.details === undefined ? {} : { details: routeError.details }),
      },
    },
    { status: safeStatus },
  );
}

export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error("请求内容不是有效的 JSON"), {
      status: 400,
      code: "INVALID_JSON",
    });
  }
}
