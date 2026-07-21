"use client";

import {
  Button,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Radio,
  RadioGroup,
} from "@fluentui/react-components";
import {
  ArrowLeftRegular,
  ClockRegular,
  EditRegular,
  SendRegular,
} from "@fluentui/react-icons";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { formatDateTime, isPast } from "@/lib/client/format";
import type { MemberPollDetail, VoiceRecording, VoteChoice } from "@/lib/client/types";
import { AppShell } from "@/components/AppShell";
import { ErrorState, PageLoading } from "@/components/PageState";
import { ChoiceBadge, PollStatusBadge } from "@/components/StatusBadges";
import { VoiceOpinionInput } from "./VoiceOpinionInput";
import styles from "./MemberVoteForm.module.css";

const choices: Array<{
  value: VoteChoice;
  label: string;
  helper: string;
}> = [
  { value: "APPROVE", label: "通过", helper: "支持该人选通过本次评审" },
  { value: "REJECT", label: "不通过", helper: "不支持该人选通过本次评审" },
  { value: "ABSTAIN", label: "弃权", helper: "本次不作通过或不通过选择" },
];

export function MemberVoteForm({
  pollId,
  initialDetail,
}: {
  pollId: string;
  initialDetail: MemberPollDetail;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<MemberPollDetail | null>(initialDetail);
  const [choice, setChoice] = useState<VoteChoice | "">(initialDetail.myVote?.choice ?? "");
  const [opinion, setOpinion] = useState(initialDetail.myVote?.opinion ?? "");
  const [voiceRecordings, setVoiceRecordings] = useState<VoiceRecording[]>(initialDetail.myVote?.voiceRecordings ?? []);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.memberPoll(pollId);
      setDetail(next);
      setChoice(next.myVote?.choice ?? "");
      setOpinion(next.myVote?.opinion ?? "");
      setVoiceRecordings(next.myVote?.voiceRecordings ?? []);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  const canEdit = useMemo(() => {
    if (!detail) return false;
    return detail.canEdit ?? (detail.poll.status === "OPEN" && !isPast(detail.poll.deadlineAt));
  }, [detail]);

  const opinionRequired = choice === "APPROVE" || choice === "REJECT";
  const opinionInvalid = attempted && opinionRequired && !opinion.trim();

  async function submit() {
    setAttempted(true);
    setSuccess(null);
    if (!choice || opinionInvalid || (opinionRequired && !opinion.trim())) return;
    setSubmitting(true);
    setError(null);
    try {
      const isUpdate = Boolean(detail?.myVote);
      const result = await api.vote(pollId, choice, opinion, voiceRecordings.map((recording) => recording.id));
      if (!detail) return;
      setDetail({ ...detail, myVote: result.vote });
      setVoiceRecordings(result.vote.voiceRecordings);
      setSuccess(result.vote.version > 1 ? "投票已更新，修改记录已保存。" : "投票已提交。你可以在截止前回来修改。" );
      setAttempted(false);
      if (!isUpdate) {
        router.push("/vote?completed=1");
        return;
      }
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell area="member">
      <div className={styles.page}>
        <Button as="a" href="/vote" appearance="subtle" icon={<ArrowLeftRegular />} className={styles.back}>
          返回投票列表
        </Button>

        {loading && <PageLoading label="正在加载投票详情" />}
        {!loading && error && !detail && <ErrorState description={error} onRetry={() => void load()} />}

        {!loading && detail && (
          <>
            <section className={styles.hero} aria-labelledby="poll-title">
              <div className={styles.heroTop}>
                <div>
                  <p className={styles.candidate}>评审人选：{detail.poll.candidateName}</p>
                  <h1 id="poll-title">{detail.poll.title}</h1>
                </div>
                <PollStatusBadge status={detail.poll.status} deadlineAt={detail.poll.deadlineAt} />
              </div>
              <div className={styles.meta}>
                <span>{detail.poll.committeeName}</span>
                <span className={styles.metaItem}><ClockRegular /> 截止 {formatDateTime(detail.poll.deadlineAt)}</span>
              </div>
            </section>

            {success && (
              <MessageBar intent="success" className={`${styles.notice} ${styles.messageBar}`}>
                <MessageBarBody>
                  <MessageBarTitle>提交成功</MessageBarTitle>
                  {success}
                </MessageBarBody>
              </MessageBar>
            )}

            {error && (
              <MessageBar intent="error" className={`${styles.notice} ${styles.messageBar}`}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            {canEdit ? (
              <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                {detail.myVote && (
                  <MessageBar intent="info" icon={<EditRegular />} className={styles.messageBar}>
                    <MessageBarBody>
                      已于 {formatDateTime(detail.myVote.updatedAt)} 提交。截止前可修改，系统会保留每次修改记录。
                    </MessageBarBody>
                  </MessageBar>
                )}

                <section>
                  <div className={styles.sectionHeader}>
                    <h2>选择投票意见</h2>
                    <p>请选择一项。通过或不通过时必须填写详细评审意见。</p>
                  </div>
                  <Field
                    validationState={attempted && !choice ? "error" : "none"}
                    validationMessage={attempted && !choice ? "请选择投票意见" : undefined}
                  >
                    <RadioGroup
                      className={styles.choices}
                      value={choice}
                      onChange={(_, data) => {
                        setChoice(data.value as VoteChoice);
                        setAttempted(false);
                      }}
                      aria-label="投票意见"
                    >
                      {choices.map(({ value, label, helper }) => (
                        <div className={styles.choice} key={value}>
                          <Radio
                            value={value}
                            label={
                              <span className={styles.choiceLabel}>
                                <span>{label}<br /><small>{helper}</small></span>
                              </span>
                            }
                          />
                        </div>
                      ))}
                    </RadioGroup>
                  </Field>
                </section>

                <Field
                  className={styles.opinionArea}
                  label={opinionRequired ? "详细评审意见（必填）" : "详细评审意见（选填）"}
                  hint={opinionRequired ? "请说明支持或不支持该人选的具体理由。" : "弃权时可以不填写意见。"}
                  required={opinionRequired}
                  validationState={opinionInvalid ? "error" : "none"}
                  validationMessage={opinionInvalid ? "选择通过或不通过时，必须填写详细评审意见" : undefined}
                >
                  <VoiceOpinionInput
                    pollId={pollId}
                    value={opinion}
                    onChange={setOpinion}
                    recordings={voiceRecordings}
                    onRecordingsChange={setVoiceRecordings}
                    maxLength={4000}
                  />
                </Field>

                <div className={styles.actions}>
                  {/* <Button as="a" href="/vote" appearance="secondary">暂不提交</Button> */}
                  <Button
                    type="submit"
                    appearance="primary"
                    icon={<SendRegular />}
                    disabled={submitting}
                  >
                    {submitting ? "正在提交" : detail.myVote ? "保存修改" : "确认提交"}
                  </Button>
                </div>
              </form>
            ) : (
              <section className={styles.readonly} aria-label="我的投票记录">
                <MessageBar intent="warning" className={styles.messageBar}>
                  <MessageBarBody>本场投票已截止或关闭，当前记录不可修改。</MessageBarBody>
                </MessageBar>
                {detail.myVote ? (
                  <>
                    <div className={styles.readonlyRow}>
                      <span className={styles.readonlyLabel}>我的选择</span>
                      <div><ChoiceBadge choice={detail.myVote.choice} /></div>
                    </div>
                    {detail.myVote.voiceRecordings.length > 0 && (
                      <div className={styles.readonlyRow}>
                        <span className={styles.readonlyLabel}>语音原音</span>
                        <div className={styles.readonlyAudioList}>
                          {detail.myVote.voiceRecordings.map((recording, index) => (
                            <audio key={recording.id} controls preload="metadata" src={`/api/polls/${pollId}/voice-recordings/${recording.id}`} aria-label={`播放语音 ${index + 1}`} />
                          ))}
                        </div>
                      </div>
                    )}
                    <div className={styles.readonlyRow}>
                      <span className={styles.readonlyLabel}>评审意见</span>
                      <p className={styles.opinionText}>{detail.myVote.opinion || "未填写"}</p>
                    </div>
                    <div className={styles.readonlyRow}>
                      <span className={styles.readonlyLabel}>最后提交时间</span>
                      <span>{formatDateTime(detail.myVote.updatedAt)}</span>
                    </div>
                  </>
                ) : (
                  <MessageBar intent="info" className={styles.messageBar}>
                    <MessageBarBody>你未在截止前提交本场投票。</MessageBarBody>
                  </MessageBar>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
