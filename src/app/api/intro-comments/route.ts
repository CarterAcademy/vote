import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { createIntroComment, listIntroComments } from "@/server/services";
import { assertSameOrigin, ok, readJson, routeError } from "../_lib/http";

const commentSchema = z.object({
  content: z.string().trim().min(1, "请输入评论内容").max(1000, "评论最多 1000 字"),
});

export async function GET() {
  try {
    return ok({ items: await listIntroComments() });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const { content } = commentSchema.parse(await readJson(request));
    const comment = await createIntroComment(content, await getSessionUser(), request);
    return ok({ comment }, 201);
  } catch (error) {
    return routeError(error);
  }
}
