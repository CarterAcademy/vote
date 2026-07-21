import { createHmac, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SessionUser } from "@/types";
import { ensureDatabaseReady } from "../db";

const CUTE_ADJECTIVES = [
  "软萌", "元气", "闪闪", "甜甜", "乖巧", "快乐", "幸运", "暖暖", "好奇", "勇敢",
  "机灵", "悠闲", "清新", "圆滚", "轻盈", "温柔", "灿烂", "安静", "活泼", "俏皮",
  "迷你", "蓬松", "奶油", "蜜糖", "星光", "月亮", "彩虹", "晨曦", "微风", "小小",
  "呆萌", "聪明", "可爱", "认真", "自在", "欢喜", "淘气", "优雅", "清醒", "热心",
  "淡定", "灵动", "香香", "晶莹", "明亮", "酷酷", "佛系", "治愈", "慢慢", "笑眯眯",
] as const;

const CUTE_NOUNS = [
  "小熊", "兔兔", "团子", "海獭", "企鹅", "小鹿", "松鼠", "猫咪", "柯基", "柴犬",
  "羊驼", "熊猫", "浣熊", "刺猬", "仓鼠", "狐狸", "考拉", "水豚", "海豹", "河马",
  "袋鼠", "树懒", "小象", "长颈鹿", "梅花鹿", "小马", "奶牛", "绵羊", "山羊", "小猪",
  "鸭鸭", "鹅鹅", "海鸥", "麻雀", "喜鹊", "鹦鹉", "蜂鸟", "猫头鹰", "啄木鸟", "小黄鸡",
  "海豚", "鲸鱼", "锦鲤", "金鱼", "水母", "海星", "章鱼", "螃蟹", "龙虾", "小海马",
  "蜜蜂", "蝴蝶", "蜻蜓", "瓢虫", "萤火虫", "蚂蚁", "蜗牛", "蚕宝宝", "甲虫", "螳螂",
  "蘑菇", "草莓", "樱桃", "桃子", "柠檬", "橙子", "葡萄", "蓝莓", "西瓜", "菠萝",
  "椰子", "栗子", "榛子", "花生", "豆豆", "布丁", "奶糖", "棉花糖", "泡芙", "曲奇",
  "蛋挞", "甜筒", "年糕", "麻薯", "汤圆", "饭团", "包子", "小面包", "小蛋糕", "爆米花",
  "云朵", "星星", "月牙", "太阳花", "蒲公英", "四叶草", "铃兰", "向日葵", "小风车", "纸飞机",
] as const;

export const INTRO_NICKNAME_COUNT = CUTE_ADJECTIVES.length * CUTE_NOUNS.length;

export interface IntroCommentDto {
  id: string;
  authorName: string;
  anonymous: boolean;
  content: string;
  createdAt: string;
}

function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || forwarded
    || "unknown-client";
}

function visitorHash(request: NextRequest): string {
  const secret = process.env.ANONYMOUS_NICKNAME_SECRET?.trim()
    || process.env.SESSION_SECRET?.trim()
    || "local-anonymous-nickname-secret";
  return createHmac("sha256", secret).update(clientAddress(request)).digest("hex");
}

export function nicknameForHash(hash: string): string {
  const index = Number(BigInt(`0x${hash.slice(0, 12)}`) % BigInt(INTRO_NICKNAME_COUNT));
  const adjective = CUTE_ADJECTIVES[Math.floor(index / CUTE_NOUNS.length)];
  const noun = CUTE_NOUNS[index % CUTE_NOUNS.length];
  return `${adjective}${noun}`;
}

function toDto(row: {
  id: string;
  user_name: string | null;
  nickname: string | null;
  content: string;
  created_at: Date;
}): IntroCommentDto {
  const anonymous = !row.user_name;
  return {
    id: row.id,
    authorName: row.user_name ?? row.nickname ?? "神秘访客",
    anonymous,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listIntroComments(): Promise<IntroCommentDto[]> {
  const db = await ensureDatabaseReady();
  const rows = await db
    .selectFrom("intro_comments")
    .leftJoin("users", "users.id", "intro_comments.author_user_id")
    .leftJoin("intro_comment_visitors", "intro_comment_visitors.id", "intro_comments.anonymous_visitor_id")
    .select([
      "intro_comments.id",
      "users.name as user_name",
      "intro_comment_visitors.nickname",
      "intro_comments.content",
      "intro_comments.created_at",
    ])
    .orderBy("intro_comments.created_at", "desc")
    .limit(100)
    .execute();
  return rows.reverse().map(toDto);
}

export async function createIntroComment(
  content: string,
  actor: SessionUser | null,
  request: NextRequest,
): Promise<IntroCommentDto> {
  const db = await ensureDatabaseReady();
  let visitorId: string | null = null;

  if (!actor) {
    const ipHash = visitorHash(request);
    const nickname = nicknameForHash(ipHash);
    await db.insertInto("intro_comment_visitors").values({
      id: randomUUID(),
      ip_hash: ipHash,
      nickname,
    }).onConflict((conflict) => conflict.column("ip_hash").doNothing()).execute();
    const visitor = await db.selectFrom("intro_comment_visitors")
      .select("id")
      .where("ip_hash", "=", ipHash)
      .executeTakeFirstOrThrow();
    visitorId = visitor.id;
  }

  const id = randomUUID();
  await db.insertInto("intro_comments").values({
    id,
    author_user_id: actor?.id ?? null,
    anonymous_visitor_id: visitorId,
    content,
  }).execute();

  const row = await db.selectFrom("intro_comments")
    .leftJoin("users", "users.id", "intro_comments.author_user_id")
    .leftJoin("intro_comment_visitors", "intro_comment_visitors.id", "intro_comments.anonymous_visitor_id")
    .select([
      "intro_comments.id",
      "users.name as user_name",
      "intro_comment_visitors.nickname",
      "intro_comments.content",
      "intro_comments.created_at",
    ])
    .where("intro_comments.id", "=", id)
    .executeTakeFirstOrThrow();
  return toDto(row);
}
