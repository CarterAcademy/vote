import type { Kysely } from "kysely";

import type {
  DatabaseSchema,
  VoteChoice,
} from "./types";

export const DEMO_IDS = {
  hr: "00000000-0000-4000-8000-000000000001",
  academicCommittee: "10000000-0000-4000-8000-000000000001",
  technicalCommittee: "10000000-0000-4000-8000-000000000002",
  openPoll: "30000000-0000-4000-8000-000000000001",
  closedPoll: "30000000-0000-4000-8000-000000000002",
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

function stableId(prefix: "4" | "5" | "6" | "7" | "8", value: number): string {
  return `${prefix}0000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

export async function seedDatabase(db: Kysely<DatabaseSchema>): Promise<void> {
  const now = new Date();
  const openStartsAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const openDeadlineAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const closedStartsAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const closedDeadlineAt = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);
  const closedAt = new Date(closedDeadlineAt.getTime() - 30 * 60 * 1000);

  await db
    .insertInto("users")
    .values({
      id: DEMO_IDS.hr,
      dingtalk_user_id: "dt_demo_hr_01",
      name: "何雨晴",
      department: "人力资源部",
      role: "HR",
    })
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();

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
      id: stableId("7", index + 1),
      committee_id: DEMO_IDS.academicCommittee,
      user_id: userId,
      position,
      display_order: index + 1,
    })),
    ...technicalMembers.map(([userId, , , , position], index) => ({
      id: stableId("7", index + 101),
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

  await db
    .insertInto("polls")
    .values([
      {
        id: DEMO_IDS.openPoll,
        committee_id: DEMO_IDS.academicCommittee,
        title: "2026 年度研究员任职资格评审",
        candidate_name: "郑博文",
        status: "OPEN",
        starts_at: openStartsAt,
        deadline_at: openDeadlineAt,
        closed_at: null,
        closed_by_user_id: null,
        close_reason: null,
        created_by_user_id: DEMO_IDS.hr,
      },
      {
        id: DEMO_IDS.closedPoll,
        committee_id: DEMO_IDS.technicalCommittee,
        title: "首席工程师人选技术评审",
        candidate_name: "沈嘉禾",
        status: "CLOSED",
        starts_at: closedStartsAt,
        deadline_at: closedDeadlineAt,
        closed_at: closedAt,
        closed_by_user_id: DEMO_IDS.hr,
        close_reason: "MANUAL",
        created_by_user_id: DEMO_IDS.hr,
      },
    ])
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();

  const academicVoters = academicMembers.map(
    ([userId, dingtalkUserId, name, department, position], index) => ({
      id: stableId("4", index + 1),
      poll_id: DEMO_IDS.openPoll,
      user_id: userId,
      dingtalk_user_id: dingtalkUserId,
      voter_name: name,
      department,
      position,
      display_order: index + 1,
    }),
  );
  const technicalVoters = technicalMembers.map(
    ([userId, dingtalkUserId, name, department, position], index) => ({
      id: stableId("4", index + 101),
      poll_id: DEMO_IDS.closedPoll,
      user_id: userId,
      dingtalk_user_id: dingtalkUserId,
      voter_name: name,
      department,
      position,
      display_order: index + 1,
    }),
  );
  await db
    .insertInto("poll_voters")
    .values([...academicVoters, ...technicalVoters])
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();

  const voteDefinitions: Array<{
    voter: (typeof academicVoters)[number] | (typeof technicalVoters)[number];
    choice: VoteChoice;
    opinion: string | null;
    changedAt: Date;
  }> = [
    {
      voter: academicVoters[0],
      choice: "APPROVE",
      opinion: "候选人科研方向清晰，成果具有较好的原创性，同意推荐。",
      changedAt: new Date(openStartsAt.getTime() + 20 * 60 * 1000),
    },
    {
      voter: academicVoters[1],
      choice: "APPROVE",
      opinion: "学术积累扎实，已达到研究员任职要求。",
      changedAt: new Date(openStartsAt.getTime() + 45 * 60 * 1000),
    },
    {
      voter: academicVoters[2],
      choice: "REJECT",
      opinion: "建议补充核心成果的同行评价材料后再次提交。",
      changedAt: new Date(openStartsAt.getTime() + 70 * 60 * 1000),
    },
    ...technicalVoters.slice(0, 8).map((voter, index) => ({
      voter,
      choice: (index === 6 ? "ABSTAIN" : index === 7 ? "REJECT" : "APPROVE") as VoteChoice,
      opinion:
        index === 6
          ? null
          : index === 7
            ? "工程化验证资料尚不完整，建议补充后复议。"
            : "候选人具备系统工程经验，同意推荐。",
      changedAt: new Date(closedStartsAt.getTime() + (index + 1) * 30 * 60 * 1000),
    })),
  ];

  const voteRows = voteDefinitions.map((definition, index) => ({
    id: stableId("5", index + 1),
    poll_id: definition.voter.poll_id,
    poll_voter_id: definition.voter.id,
    choice: definition.choice,
    opinion: definition.opinion,
    version: 1,
    submitted_at: definition.changedAt,
    updated_at: definition.changedAt,
  }));
  await db
    .insertInto("votes")
    .values(voteRows)
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();

  await db
    .insertInto("vote_revisions")
    .values(
      voteRows.map((vote, index) => ({
        id: stableId("6", index + 1),
        vote_id: vote.id,
        poll_id: vote.poll_id,
        poll_voter_id: vote.poll_voter_id,
        revision_number: 1,
        choice: vote.choice,
        opinion: vote.opinion,
        changed_by_user_id: voteDefinitions[index].voter.user_id,
        changed_at: vote.updated_at,
      })),
    )
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();

  await db
    .insertInto("audit_logs")
    .values([
      {
        id: stableId("8", 1),
        actor_user_id: DEMO_IDS.hr,
        action: "POLL_CREATED",
        entity_type: "POLL",
        entity_id: DEMO_IDS.openPoll,
        details: { source: "demo-seed" },
        created_at: openStartsAt,
      },
      {
        id: stableId("8", 2),
        actor_user_id: DEMO_IDS.hr,
        action: "POLL_CREATED",
        entity_type: "POLL",
        entity_id: DEMO_IDS.closedPoll,
        details: { source: "demo-seed" },
        created_at: closedStartsAt,
      },
      {
        id: stableId("8", 3),
        actor_user_id: DEMO_IDS.hr,
        action: "POLL_CLOSED",
        entity_type: "POLL",
        entity_id: DEMO_IDS.closedPoll,
        details: { reason: "MANUAL" },
        created_at: closedAt,
      },
    ])
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();
}

