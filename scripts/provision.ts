import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { closeDatabase, ensureDatabaseReady } from "../src/server/db";

const personSchema = z.object({
  dingtalkUserId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(100),
  department: z.string().trim().max(200).nullable().optional(),
  position: z.string().trim().max(100).nullable().optional(),
});

const configSchema = z
  .object({
    hr: z.array(personSchema.omit({ position: true })).min(1),
    committees: z
      .array(
        z.object({
          code: z.enum(["ACADEMIC", "TECHNICAL"]),
          name: z.string().trim().min(1).max(200),
          members: z.array(personSchema),
        }),
      )
      .length(2),
  })
  .superRefine((config, context) => {
    const academic = config.committees.find((item) => item.code === "ACADEMIC");
    const technical = config.committees.find((item) => item.code === "TECHNICAL");
    if (!academic || academic.members.length !== 10) {
      context.addIssue({
        code: "custom",
        path: ["committees"],
        message: "学术委员会必须配置 10 名委员",
      });
    }
    if (!technical || technical.members.length !== 9) {
      context.addIssue({
        code: "custom",
        path: ["committees"],
        message: "技术委员会必须配置 9 名委员",
      });
    }

    const ids = [
      ...config.hr.map((person) => person.dingtalkUserId),
      ...config.committees.flatMap((committee) =>
        committee.members.map((person) => person.dingtalkUserId),
      ),
    ];
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "同一个钉钉用户不能在配置中重复出现",
      });
    }
    if (ids.some((id) => id.startsWith("replace-"))) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "配置中仍有 replace- 示例值，请全部替换为真实钉钉用户 ID",
      });
    }
  });

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f" },
      confirm: { type: "boolean", default: false },
    },
  });
  if (!values.file) throw new Error("请使用 --file 指定组织配置 JSON");
  if (!values.confirm) {
    throw new Error("该操作会写入授权成员，请检查文件后增加 --confirm");
  }

  const filePath = resolve(process.cwd(), values.file);
  const config = configSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
  const db = await ensureDatabaseReady();

  const summary = await db.transaction().execute(async (trx) => {
    for (const person of config.hr) {
      await trx
        .insertInto("users")
        .values({
          id: randomUUID(),
          dingtalk_user_id: person.dingtalkUserId,
          name: person.name,
          department: person.department ?? null,
          role: "HR",
        })
        .onConflict((conflict) =>
          conflict.column("dingtalk_user_id").doUpdateSet({
            name: person.name,
            department: person.department ?? null,
            role: "HR",
            is_active: true,
            updated_at: new Date(),
          }),
        )
        .execute();
    }

    for (const committeeConfig of config.committees) {
      const committee = await trx
        .insertInto("committees")
        .values({
          id: randomUUID(),
          code: committeeConfig.code,
          name: committeeConfig.name,
        })
        .onConflict((conflict) =>
          conflict.column("code").doUpdateSet({
            name: committeeConfig.name,
            updated_at: new Date(),
          }),
        )
        .returning(["id"])
        .executeTakeFirstOrThrow();

      for (const [index, person] of committeeConfig.members.entries()) {
        const user = await trx
          .insertInto("users")
          .values({
            id: randomUUID(),
            dingtalk_user_id: person.dingtalkUserId,
            name: person.name,
            department: person.department ?? null,
            role: "MEMBER",
          })
          .onConflict((conflict) =>
            conflict.column("dingtalk_user_id").doUpdateSet({
              name: person.name,
              department: person.department ?? null,
              role: "MEMBER",
              is_active: true,
              updated_at: new Date(),
            }),
          )
          .returning(["id"])
          .executeTakeFirstOrThrow();

        await trx
          .insertInto("committee_members")
          .values({
            id: randomUUID(),
            committee_id: committee.id,
            user_id: user.id,
            position: person.position ?? null,
            display_order: index + 1,
          })
          .onConflict((conflict) =>
            conflict.columns(["committee_id", "user_id"]).doUpdateSet({
              position: person.position ?? null,
              display_order: index + 1,
              is_active: true,
            }),
          )
          .execute();
      }

      await trx
        .insertInto("audit_logs")
        .values({
          id: randomUUID(),
          actor_user_id: null,
          action: "ORGANIZATION_PROVISIONED",
          entity_type: "COMMITTEE",
          entity_id: committee.id,
          details: {
            source: "provision-script",
            memberCount: committeeConfig.members.length,
          },
        })
        .execute();
    }

    return {
      hrCount: config.hr.length,
      academicCount:
        config.committees.find((item) => item.code === "ACADEMIC")?.members.length ?? 0,
      technicalCount:
        config.committees.find((item) => item.code === "TECHNICAL")?.members.length ?? 0,
    };
  });

  console.log(JSON.stringify({ success: true, ...summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
