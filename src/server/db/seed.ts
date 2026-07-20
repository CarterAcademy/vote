import type { Kysely } from "kysely";

import type { DatabaseSchema } from "./types";

export const DEMO_IDS = {
  academicCommittee: "10000000-0000-4000-8000-000000000001",
  technicalCommittee: "10000000-0000-4000-8000-000000000002",
} as const;

const academicMembers = [
  ["20000000-0000-4000-8000-000000000001", "dt_demo_academic_01", "王建国", "战略研究部", "主任委员"],
  ["20000000-0000-4000-8000-000000000002", "dt_demo_academic_02", "李秀兰", "材料研究所", "副主任委员"],
  ["20000000-0000-4000-8000-000000000003", "dt_demo_academic_03", "张志强", "智能技术中心", "委员"],
  ["20000000-0000-4000-8000-000000000004", "dt_demo_academic_04", "刘海燕", "学术委员会办公室", "委员"],
  ["20000000-0000-4000-8000-000000000005", "dt_demo_academic_05", "陈立新", "工程技术部", "委员"],
  ["20000000-0000-4000-8000-000000000006", "dt_demo_academic_06", "杨晓峰", "成果转化中心", "委员"],
  ["20000000-0000-4000-8000-000000000007", "dt_demo_academic_07", "赵明华", "科研管理部", "委员"],
  ["20000000-0000-4000-8000-000000000008", "dt_demo_academic_08", "黄文静", "质量管理部", "委员"],
  ["20000000-0000-4000-8000-000000000009", "dt_demo_academic_09", "周伟民", "创新实验室", "委员"],
  ["20000000-0000-4000-8000-000000000010", "dt_demo_academic_10", "吴雅琴", "综合研究院", "委员"],
] as const;

const technicalMembers = [
  ["20000000-0000-4000-8000-000000000011", "dt_demo_technical_01", "徐国平", "技术委员会", "主任委员"],
  ["20000000-0000-4000-8000-000000000012", "dt_demo_technical_02", "孙丽华", "装备研发部", "副主任委员"],
  ["20000000-0000-4000-8000-000000000013", "dt_demo_technical_03", "朱庆华", "数字工程部", "委员"],
  ["20000000-0000-4000-8000-000000000014", "dt_demo_technical_04", "马晓东", "系统集成部", "委员"],
  ["20000000-0000-4000-8000-000000000015", "dt_demo_technical_05", "胡建军", "测试验证部", "委员"],
  ["20000000-0000-4000-8000-000000000016", "dt_demo_technical_06", "郭海霞", "工业设计中心", "委员"],
  ["20000000-0000-4000-8000-000000000017", "dt_demo_technical_07", "何志远", "软件研发部", "委员"],
  ["20000000-0000-4000-8000-000000000018", "dt_demo_technical_08", "高玉梅", "标准化办公室", "委员"],
  ["20000000-0000-4000-8000-000000000019", "dt_demo_technical_09", "林振宇", "安全保障部", "委员"],
] as const;

function stableId(value: number): string {
  return `70000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

export async function seedDatabase(db: Kysely<DatabaseSchema>): Promise<void> {
  const memberRows = [...academicMembers, ...technicalMembers].map(
    ([id, dingtalkUserId, name, department]) => ({
      id,
      dingtalk_user_id: dingtalkUserId,
      name,
      department,
      role: "MEMBER" as const,
    }),
  );
  await db
    .insertInto("users")
    .values(memberRows)
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();

  await db
    .insertInto("committees")
    .values([
      {
        id: DEMO_IDS.academicCommittee,
        code: "ACADEMIC",
        name: "学术委员会",
      },
      {
        id: DEMO_IDS.technicalCommittee,
        code: "TECHNICAL",
        name: "技术委员会",
      },
    ])
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();

  const committeeMemberRows = [
    ...academicMembers.map(([userId, , , , position], index) => ({
      id: stableId(index + 1),
      committee_id: DEMO_IDS.academicCommittee,
      user_id: userId,
      position,
      display_order: index + 1,
    })),
    ...technicalMembers.map(([userId, , , , position], index) => ({
      id: stableId(index + 101),
      committee_id: DEMO_IDS.technicalCommittee,
      user_id: userId,
      position,
      display_order: index + 1,
    })),
  ];
  await db
    .insertInto("committee_members")
    .values(committeeMemberRows)
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();
}
