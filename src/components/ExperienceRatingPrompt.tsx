"use client";

import {
  Button,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { CheckmarkCircleRegular, DismissRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/lib/client/api";
import type { ExperienceRatingContext } from "@/lib/client/types";
import styles from "./ExperienceRatingPrompt.module.css";

const scoreLabels = [
  "非常不满意",
  "不满意",
  "一般",
  "满意",
  "非常满意",
] as const;

const reasonTags: Record<ExperienceRatingContext, { positive: string[]; negative: string[] }> = {
  MEMBER: {
    positive: ["操作清晰", "页面响应顺畅", "材料查看方便", "语音输入好用"],
    negative: ["操作不清楚", "页面响应较慢", "材料查看不方便", "语音输入有问题"],
  },
  ADMIN: {
    positive: ["流程清晰", "进度查看方便", "关闭操作顺畅", "导出结果实用"],
    negative: ["流程不清楚", "进度查看不方便", "关闭操作有问题", "导出结果不好用"],
  },
};

export function ExperienceRatingPrompt({
  context,
  activationKey,
}: {
  context: ExperienceRatingContext;
  activationKey: number | null;
}) {
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (activationKey === null) return;
    let active = true;
    setChecking(true);
    setError(null);
    void api.experienceRatingStatus(context)
      .then((status) => {
        if (!active) return;
        setVisible(status.eligible);
        setScore(null);
        setTags([]);
        setSubmitted(false);
      })
      .catch(() => {
        if (active) setVisible(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [activationKey, context]);

  const availableTags = useMemo(() => {
    if (score === null) return [];
    return score >= 4 ? reasonTags[context].positive : reasonTags[context].negative;
  }, [context, score]);

  function chooseScore(nextScore: number) {
    setScore(nextScore);
    setTags([]);
    setError(null);
  }

  function toggleTag(tag: string) {
    setTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );
  }

  async function submitRating() {
    if (score === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitExperienceRating(context, {
        outcome: "RATED",
        score,
        tags,
      });
      setSubmitted(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function dismiss() {
    setSubmitting(true);
    setError(null);
    try {
      await api.submitExperienceRating(context, { outcome: "DISMISSED" });
      setVisible(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setSubmitting(false);
    }
  }

  if (checking || !visible) return null;

  if (submitted) {
    return (
      <section className={`${styles.prompt} ${styles.thanks}`} aria-live="polite">
        <CheckmarkCircleRegular aria-hidden="true" />
        <div>
          <strong>感谢你的评价</strong>
          <p>你的反馈将用于改进后续使用体验。</p>
        </div>
      </section>
    );
  }

  const title = context === "MEMBER" ? "所有待办已完成" : "操作已完成";
  const question = context === "MEMBER"
    ? "本次投票操作体验如何？"
    : "本次投票管理流程体验如何？";

  return (
    <section className={styles.prompt} aria-labelledby={`${context.toLowerCase()}-rating-title`}>
      <div className={styles.header}>
        <div>
          <h2 id={`${context.toLowerCase()}-rating-title`}>{title}</h2>
          <p>{question}</p>
        </div>
        <Button
          appearance="subtle"
          icon={<DismissRegular />}
          aria-label="暂不评价"
          disabled={submitting}
          onClick={() => void dismiss()}
        />
      </div>

      <div className={styles.scores} role="group" aria-label="满意度评分">
        {scoreLabels.map((label, index) => {
          const value = index + 1;
          return (
            <Button
              key={label}
              className={styles.scoreButton}
              appearance={score === value ? "primary" : "secondary"}
              aria-pressed={score === value}
              aria-label={`${value} 分，${label}`}
              onClick={() => chooseScore(value)}
            >
              <span className={styles.scoreNumber}>{value}</span>
              <span className={styles.scoreLabel}>{label}</span>
            </Button>
          );
        })}
      </div>

      {score !== null && (
        <div className={styles.details}>
          <p>{score >= 4 ? "哪些方面做得好？（选填）" : "主要问题是什么？（选填）"}</p>
          <div className={styles.tags} role="group" aria-label="评价原因">
            {availableTags.map((tag) => (
              <Button
                key={tag}
                size="small"
                appearance={tags.includes(tag) ? "primary" : "secondary"}
                aria-pressed={tags.includes(tag)}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </Button>
            ))}
          </div>
          <Button appearance="primary" disabled={submitting} onClick={() => void submitRating()}>
            {submitting ? "正在提交" : "提交评价"}
          </Button>
        </div>
      )}

      {error && (
        <MessageBar intent="error" className={styles.error}>
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <p className={styles.privacy}>评价单独保存，不包含投票选择、候选人或评审意见。</p>
    </section>
  );
}
