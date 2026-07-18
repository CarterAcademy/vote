import { z } from "zod";

const nonBlank = (label: string, maxLength: number) =>
  z
    .string({ error: `${label}不能为空` })
    .trim()
    .min(1, `${label}不能为空`)
    .max(maxLength, `${label}不能超过 ${maxLength} 个字符`);

export const createPollSchema = z
  .object({
    committeeId: z.uuid("请选择有效的委员会"),
    title: nonBlank("投票标题", 300),
    candidateName: nonBlank("人选姓名", 100),
    startsAt: z.coerce.date().optional(),
    deadlineAt: z.coerce.date({ error: "请选择有效的截止时间" }),
  })
  .superRefine((value, context) => {
    const startsAt = value.startsAt ?? new Date();
    if (value.deadlineAt.getTime() <= startsAt.getTime()) {
      context.addIssue({
        code: "custom",
        path: ["deadlineAt"],
        message: "截止时间必须晚于开始时间",
      });
    }
  });

export const voteSchema = z
  .object({
    choice: z.enum(["APPROVE", "REJECT", "ABSTAIN"], {
      error: "请选择通过、不通过或弃权",
    }),
    opinion: z
      .string()
      .trim()
      .max(4000, "评审意见不能超过 4000 个字符")
      .nullish(),
  })
  .superRefine((value, context) => {
    if (value.choice !== "ABSTAIN" && !value.opinion?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["opinion"],
        message: "选择通过或不通过时必须填写评审意见",
      });
    }
  })
  .transform((value) => ({
    choice: value.choice,
    opinion: value.opinion?.trim() || null,
  }));

export const pollListQuerySchema = z
  .object({
    status: z.enum(["OPEN", "CLOSED"]).optional(),
    committeeId: z.uuid().optional(),
    search: z.string().trim().max(100).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.to < value.from) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "结束日期不能早于开始日期",
      });
    }
  });

export const dingtalkAuthSchema = z.object({
  authCode: nonBlank("钉钉授权码", 1000),
});

export const idSchema = z.uuid("无效的资源 ID");

export type CreatePollInput = z.infer<typeof createPollSchema>;
export type VoteInput = z.infer<typeof voteSchema>;
export type PollListQuery = z.infer<typeof pollListQuerySchema>;
export type DingTalkAuthInput = z.infer<typeof dingtalkAuthSchema>;

