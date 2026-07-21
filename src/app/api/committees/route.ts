import { NextRequest } from "next/server";
import { requireHr } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { createCommittee, listCommitteeMembers, listCommittees } from "@/server/services";
import { createCommitteeSchema } from "@/server/validation";
import { assertSameOrigin, ok, readJson, routeError } from "../_lib/http";

export async function GET() {
  try {
    await ensureDatabaseReady();
    await requireHr();
    return ok({ items: await listCommittees() });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireHr();
    const input = createCommitteeSchema.parse(await readJson(request));
    const committee = await createCommittee(input, actor);
    return ok({ committee, members: await listCommitteeMembers(committee.id) }, 201);
  } catch (error) {
    return routeError(error);
  }
}
