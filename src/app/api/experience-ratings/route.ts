import { NextRequest } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import {
  getExperienceRatingStatus,
  recordExperienceRating,
} from "@/server/services";
import { assertSameOrigin, ok, readJson, routeError } from "../_lib/http";

const contextSchema = z.enum(["MEMBER", "ADMIN"]);
const ratingSchema = z
  .object({
    context: contextSchema,
    outcome: z.enum(["RATED", "DISMISSED"]),
    score: z.number().int().min(1).max(5).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(4).optional(),
  })
  .superRefine((value, context) => {
    if (value.outcome === "RATED" && value.score === undefined) {
      context.addIssue({
        code: "custom",
        path: ["score"],
        message: "请选择评分",
      });
    }
    if (value.outcome === "DISMISSED" && value.score !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["score"],
        message: "关闭评价时不能提交评分",
      });
    }
  });

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const actor = await requireSessionUser();
    const context = contextSchema.parse(request.nextUrl.searchParams.get("context"));
    return ok(await getExperienceRatingStatus(context, actor));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await ensureDatabaseReady();
    const actor = await requireSessionUser();
    const input = ratingSchema.parse(await readJson(request));
    return ok(await recordExperienceRating(input, actor), 201);
  } catch (error) {
    return routeError(error);
  }
}
