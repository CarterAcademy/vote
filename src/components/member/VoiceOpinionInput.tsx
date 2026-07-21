"use client";

import { Button, Textarea } from "@fluentui/react-components";
import {
  DeleteRegular,
  KeyboardRegular,
  MicPulseRegular,
  MicRegular,
} from "@fluentui/react-icons";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { VoiceRecording } from "@/lib/client/types";
import styles from "./MemberVoteForm.module.css";

const HOLD_DELAY_MS = 320;
const RECORDING_START_HAPTIC_MS = 45;

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface BrowserSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

function speechRecognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function mediaRecorderSupported() {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function triggerRecordingStartHaptic() {
  try {
    if (navigator.vibrate?.(RECORDING_START_HAPTIC_MS)) return;
  } catch {
    // Fall through to DingTalk's native bridge when browser vibration is unavailable.
  }

  void import("dingtalk-jsapi")
    .then((dd) => {
      if (dd.env.platform !== "notInDingTalk") {
        return dd.device.notification.vibrate({ duration: RECORDING_START_HAPTIC_MS });
      }
    })
    .catch(() => undefined);
}

export function preferredRecordingType(
  isTypeSupported: (type: string) => boolean = (type) => MediaRecorder.isTypeSupported(type),
) {
  // DingTalk's WebView can report both MP4 and WebM support. Prefer MP4 because
  // the internal transcription gateway can determine its duration directly;
  // its lightweight parser rejects MediaRecorder's WebM/EBML output.
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((type) => isTypeSupported(type)) ?? "";
}

function appendTranscript(value: string, transcript: string, maxLength: number) {
  const normalized = transcript.trim();
  if (!normalized) return value;
  const separator = value && !/[\s，。！？；：,.!?;:]$/.test(value) ? "。" : "";
  return `${value}${separator}${normalized}`.slice(0, maxLength);
}

export function VoiceOpinionInput({
  value,
  onChange,
  pollId,
  recordings = [],
  onRecordingsChange,
  maxLength = 4000,
}: {
  value: string;
  onChange: (value: string) => void;
  pollId?: string;
  recordings?: VoiceRecording[];
  onRecordingsChange?: (recordings: VoiceRecording[]) => void;
  maxLength?: number;
}) {
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null);
  const [internalTranscriptionAvailable, setInternalTranscriptionAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceProviderRef = useRef<"browser" | "internal" | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const pendingMediaStopRef = useRef(false);
  const recordingLimitTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const longPressRef = useRef(false);
  const suppressClickRef = useRef(false);
  const focusOnTextModeRef = useRef(false);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (mode !== "text" || !focusOnTextModeRef.current) return;
    focusOnTextModeRef.current = false;
    textareaRef.current?.focus();
    const length = textareaRef.current?.value.length ?? 0;
    textareaRef.current?.setSelectionRange(length, length);
  }, [mode]);

  useEffect(() => {
    setSpeechSupported(Boolean(speechRecognitionConstructor()));
    let active = true;
    void api.transcriptionCapability()
      .then(({ available }) => {
        if (active) setInternalTranscriptionAvailable(available && mediaRecorderSupported());
      })
      .catch(() => {
        if (active) setInternalTranscriptionAvailable(false);
      });
    return () => {
      active = false;
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      if (recordingLimitTimerRef.current !== null) window.clearTimeout(recordingLimitTimerRef.current);
      recognitionRef.current?.abort();
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.onerror = null;
        if (mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const focusTextInput = useCallback(() => {
    focusOnTextModeRef.current = true;
    setMode("text");
    if (mode === "text") {
      focusOnTextModeRef.current = false;
      textareaRef.current?.focus();
      const length = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(length, length);
    }
  }, [mode]);

  const commitTranscript = useCallback((transcript: string) => {
    const nextValue = appendTranscript(valueRef.current, transcript, maxLength);
    valueRef.current = nextValue;
    onChange(nextValue);
  }, [maxLength, onChange]);

  const transcribeRecording = useCallback(async (audio: Blob) => {
    setVoiceMessage("正在将语音转成文字…");
    try {
      if (!pollId) throw new Error("缺少投票信息，无法保存录音");
      const result = await api.uploadVoiceRecording(pollId, audio);
      commitTranscript(result.recording.transcript);
      onRecordingsChange?.([...recordings, result.recording]);
      setVoiceMessage(null);
      focusOnTextModeRef.current = true;
      setMode("text");
    } catch (requestError) {
      setVoiceMessage(errorMessage(requestError));
    }
  }, [commitTranscript, onRecordingsChange, pollId, recordings]);

  const startListening = useCallback(async () => {
    if (internalTranscriptionAvailable && mediaRecorderSupported()) {
      voiceProviderRef.current = "internal";
      pendingMediaStopRef.current = false;
      setVoiceMessage(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        if (voiceProviderRef.current !== "internal") {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        mediaStreamRef.current = stream;
        mediaChunksRef.current = [];
        const mimeType = preferredRecordingType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) mediaChunksRef.current.push(event.data);
        };
        recorder.onstart = () => {
          triggerRecordingStartHaptic();
          setListening(true);
          if (pendingMediaStopRef.current && recorder.state === "recording") recorder.stop();
        };
        recorder.onstop = () => {
          if (recordingLimitTimerRef.current !== null) {
            window.clearTimeout(recordingLimitTimerRef.current);
            recordingLimitTimerRef.current = null;
          }
          const audio = new Blob(mediaChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          mediaChunksRef.current = [];
          mediaRecorderRef.current = null;
          mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
          voiceProviderRef.current = null;
          setListening(false);
          if (audio.size > 0) void transcribeRecording(audio);
          else setVoiceMessage("没有录到有效语音，请重新按住说话。");
        };
        recorder.onerror = () => {
          setVoiceMessage("录音未完成，请检查麦克风后重试。");
          setListening(false);
        };
        // A timeslice makes Chromium/DingTalk emit a fragmented MP4 containing
        // many moof/mdat segments. DingTalk's embedded audio player cannot play
        // that file after upload, so finalize one complete blob on stop.
        recorder.start();
        recordingLimitTimerRef.current = window.setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, 60_000);
      } catch {
        voiceProviderRef.current = null;
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setListening(false);
        setVoiceMessage("无法访问麦克风，请允许麦克风权限或改用文字输入。");
      }
      return;
    }

    // Real vote pages only accept server-backed recordings so every submitted
    // voice opinion has an editable transcript and an auditable original file.
    if (pollId) {
      setVoiceMessage("语音录音服务暂不可用，请联系管理员完成内部转写配置，或先使用文字输入。");
      return;
    }

    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      setSpeechSupported(false);
      setVoiceMessage("当前浏览器不支持语音转文字，请使用文字输入。建议使用最新版 Chrome 或 Safari。");
      focusTextInput();
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    voiceProviderRef.current = "browser";
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      triggerRecordingStartHaptic();
      setListening(true);
      setVoiceMessage(null);
    };
    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalTranscript += result[0].transcript;
        else interim += result[0].transcript;
      }
      setInterimTranscript(interim.trim());
      if (finalTranscript.trim()) {
        commitTranscript(finalTranscript);
        setInterimTranscript("");
      }
    };
    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        "not-allowed": "没有麦克风权限。请在浏览器设置中允许访问麦克风，或改用文字输入。",
        "service-not-allowed": "当前环境无法使用语音识别，请改用文字输入。",
        "audio-capture": "未检测到可用麦克风，请检查设备后重试。",
        "no-speech": "没有听到清晰语音，请按住后靠近麦克风重试。",
        network: "语音识别网络连接失败，请重试或改用文字输入。",
      };
      setVoiceMessage(messages[event.error] ?? "语音识别未完成，请重试或改用文字输入。");
      setListening(false);
      setInterimTranscript("");
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (voiceProviderRef.current === "browser") voiceProviderRef.current = null;
      setListening(false);
      setInterimTranscript("");
    };

    try {
      recognition.start();
    } catch {
      setVoiceMessage("语音识别暂时无法启动，请稍后重试或改用文字输入。");
      recognitionRef.current = null;
      voiceProviderRef.current = null;
    }
  }, [commitTranscript, focusTextInput, internalTranscriptionAvailable, pollId, transcribeRecording]);

  const stopListening = useCallback(() => {
    if (voiceProviderRef.current === "internal") {
      pendingMediaStopRef.current = true;
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch {
      recognitionRef.current?.abort();
    }
  }, []);

  function clearHoldTimer() {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button > 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    clearHoldTimer();
    longPressRef.current = false;
    suppressClickRef.current = false;
    setVoiceMessage(null);
    holdTimerRef.current = window.setTimeout(() => {
      longPressRef.current = true;
      suppressClickRef.current = true;
      void startListening();
    }, HOLD_DELAY_MS);
  }

  function handlePointerEnd() {
    clearHoldTimer();
    if (longPressRef.current) void stopListening();
  }

  function switchToVoiceMode() {
    if (
      pollId &&
      !(internalTranscriptionAvailable && mediaRecorderSupported())
    ) {
      setVoiceMessage("语音录音服务暂不可用，请联系管理员完成内部转写配置，或先使用文字输入。");
      textareaRef.current?.focus();
      return;
    }
    if (
      !pollId &&
      !(internalTranscriptionAvailable && mediaRecorderSupported()) &&
      !speechRecognitionConstructor()
    ) {
      setSpeechSupported(false);
      setVoiceMessage("当前浏览器不支持语音转文字，请使用文字输入。建议使用最新版 Chrome 或 Safari。");
      textareaRef.current?.focus();
      return;
    }
    setVoiceMessage(null);
    setMode("voice");
  }

  const voiceInputAvailable = pollId
    ? internalTranscriptionAvailable
    : internalTranscriptionAvailable || speechSupported === true;

  return (
    <div className={styles.opinionComposer}>
      {mode === "text" ? (
        <div className={styles.textInputWrap}>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(_, data) => onChange(data.value)}
            placeholder="请输入客观、完整的评审意见"
            resize="vertical"
            maxLength={maxLength}
            aria-label="详细评审意见"
          />
          {voiceInputAvailable && (
            <Button
              type="button"
              appearance="subtle"
              icon={<MicRegular />}
              className={styles.modeButton}
              aria-label="切换到语音输入"
              title="切换到语音输入"
              onClick={switchToVoiceMode}
            />
          )}
        </div>
      ) : (
        <div className={styles.voiceMode}>
          <button
            type="button"
            className={`${styles.holdToTalk} ${listening ? styles.holdToTalkActive : ""}`}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              focusTextInput();
            }}
            aria-label={listening ? "正在录入语音，松开结束" : "按住说话，轻触切换文字输入"}
          >
            <span className={styles.voiceIcon} aria-hidden="true">
              {listening ? <MicPulseRegular /> : <MicRegular />}
            </span>
            <span>
              <strong>{listening ? "正在聆听，松开结束" : "按住说话"}</strong>
              <small>{interimTranscript || "轻触此处输入文字"}</small>
            </span>
          </button>
          <Button
            type="button"
            appearance="subtle"
            icon={<KeyboardRegular />}
            className={styles.voiceKeyboardButton}
            aria-label="切换到文字输入"
            title="切换到文字输入"
            onClick={focusTextInput}
          />
        </div>
      )}

      <div className={styles.composerMeta}>
        <span>
          {mode === "voice"
            ? "长按录入，松开后文字会加入评审意见"
            : voiceInputAvailable
              ? "支持文字输入和语音转文字"
              : "仅支持文字输入"}
        </span>
        <span className={styles.characterCount}>{value.length}/{maxLength}</span>
      </div>

      {voiceMessage && (
        <p className={styles.voiceMessage} role="status">
          {voiceMessage}
        </p>
      )}
      {recordings.length > 0 && (
        <div className={styles.voiceRecordingList} aria-label="已录入语音">
          {recordings.map((recording, index) => (
            <div className={styles.voiceRecording} key={recording.id}>
              <div>
                <strong>语音 {index + 1}</strong>
                <span>{recording.submitted ? "已随投票保存" : "待提交"}</span>
              </div>
              {pollId && (
                <audio
                  controls
                  preload="metadata"
                  src={`/api/polls/${pollId}/voice-recordings/${recording.id}`}
                  aria-label={`播放语音 ${index + 1}`}
                />
              )}
              <Button
                type="button"
                appearance="subtle"
                icon={<DeleteRegular />}
                aria-label={`移除语音 ${index + 1}`}
                onClick={() => {
                  onRecordingsChange?.(recordings.filter((item) => item.id !== recording.id));
                  if (pollId && !recording.submitted) {
                    void api.deleteVoiceDraft(pollId, recording.id).catch(() => undefined);
                  }
                }}
              />
            </div>
          ))}
          <p>转写文字可继续编辑；提交后管理员可查看文字并播放原音。</p>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {speechSupported === false && !internalTranscriptionAvailable
          ? "当前环境不支持语音转文字"
          : listening
            ? "正在录入语音"
            : ""}
      </span>
    </div>
  );
}
