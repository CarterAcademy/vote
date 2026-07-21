import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/client/api";
import { preferredRecordingType, VoiceOpinionInput } from "./VoiceOpinionInput";

interface FakeResult {
  isFinal: boolean;
  0: { transcript: string };
}

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition | null = null;

  continuous = false;
  interimResults = false;
  lang = "";
  onstart: (() => void) | null = null;
  onresult: ((event: Event & { resultIndex: number; results: FakeResult[] }) => void) | null = null;
  onerror: ((event: Event & { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();

  constructor() {
    FakeSpeechRecognition.latest = this;
  }
}

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType || "audio/mp4";
  }

  start() {
    this.state = "recording";
    this.onstart?.();
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recording"], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.();
  }
}

function ControlledInput({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return <VoiceOpinionInput value={value} onChange={setValue} />;
}

function ControlledPollInput() {
  const [value, setValue] = useState("");
  const [recordings, setRecordings] = useState<import("@/lib/client/types").VoiceRecording[]>([]);
  return (
    <VoiceOpinionInput
      pollId="poll-1"
      value={value}
      onChange={setValue}
      recordings={recordings}
      onRecordingsChange={setRecordings}
    />
  );
}

describe("VoiceOpinionInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: FakeSpeechRecognition,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    FakeSpeechRecognition.latest = null;
    Reflect.deleteProperty(window, "webkitSpeechRecognition");
    Reflect.deleteProperty(globalThis, "MediaRecorder");
    Reflect.deleteProperty(navigator, "mediaDevices");
    Reflect.deleteProperty(navigator, "vibrate");
    vi.restoreAllMocks();
  });

  it("uses a short press or the keyboard icon to return to text input", () => {
    render(<ControlledInput />);

    expect(screen.getByRole("textbox", { name: "详细评审意见" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "切换到语音输入" }));
    const holdButton = screen.getByRole("button", { name: "按住说话，轻触切换文字输入" });
    fireEvent.pointerDown(holdButton, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(holdButton, { button: 0, pointerId: 1 });
    fireEvent.click(holdButton);
    expect(screen.getByRole("textbox", { name: "详细评审意见" })).toHaveFocus();
    expect(FakeSpeechRecognition.latest).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "切换到语音输入" }));
    fireEvent.click(screen.getByRole("button", { name: "切换到文字输入" }));
    expect(screen.getByRole("textbox", { name: "详细评审意见" })).toHaveFocus();
  });

  it("starts on a long press and appends recognized speech as text", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    render(<ControlledInput initialValue="已有意见" />);
    fireEvent.click(screen.getByRole("button", { name: "切换到语音输入" }));
    const holdButton = screen.getByRole("button", { name: "按住说话，轻触切换文字输入" });

    fireEvent.pointerDown(holdButton, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(319));
    expect(vibrate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    const recognition = FakeSpeechRecognition.latest;
    expect(recognition?.start).toHaveBeenCalledOnce();
    expect(vibrate).toHaveBeenCalledOnce();
    expect(vibrate).toHaveBeenCalledWith(45);
    act(() => {
      recognition?.onresult?.(Object.assign(new Event("result"), {
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "建议通过" } }],
      }));
    });
    fireEvent.pointerUp(holdButton, { button: 0, pointerId: 1 });

    fireEvent.click(screen.getByRole("button", { name: "切换到文字输入" }));
    expect(screen.getByRole("textbox", { name: "详细评审意见" })).toHaveValue("已有意见。建议通过");
  });

  it("keeps only text input visible when speech recognition is unsupported", () => {
    Reflect.deleteProperty(window, "webkitSpeechRecognition");
    render(<ControlledInput />);

    expect(screen.getByRole("textbox", { name: "详细评审意见" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "切换到语音输入" })).not.toBeInTheDocument();
    expect(screen.getByText("仅支持文字输入")).toBeInTheDocument();
  });

  it("prefers MP4 over WebM when DingTalk supports both formats", () => {
    const supported = vi.fn(() => true);

    expect(preferredRecordingType(supported)).toBe("audio/mp4");
    expect(supported).toHaveBeenCalledTimes(1);
    expect(supported).toHaveBeenCalledWith("audio/mp4");
  });

  it("falls back to Opus WebM when MP4 is unavailable", () => {
    const supported = vi.fn((type: string) => type === "audio/webm;codecs=opus");

    expect(preferredRecordingType(supported)).toBe("audio/webm;codecs=opus");
  });

  it("hides voice input when server transcription or secure recording is unavailable", async () => {
    vi.spyOn(api, "transcriptionCapability").mockResolvedValue({ available: false });
    render(<VoiceOpinionInput pollId="poll-1" value="" onChange={() => undefined} />);

    await act(async () => undefined);
    expect(screen.queryByRole("button", { name: "切换到语音输入" })).not.toBeInTheDocument();
    expect(screen.getByText("仅支持文字输入")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("returns to text mode after recording so the user can review the transcript", async () => {
    const stopTrack = vi.fn();
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopTrack }],
        }),
      },
    });
    vi.spyOn(api, "transcriptionCapability").mockResolvedValue({ available: true });
    vi.spyOn(api, "uploadVoiceRecording").mockResolvedValue({
      recording: {
        id: "recording-1",
        transcript: "建议通过。",
        contentType: "audio/mp4",
        sizeBytes: 9,
        submitted: false,
        createdAt: new Date().toISOString(),
      },
    });
    render(<ControlledPollInput />);

    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "切换到语音输入" }));
    const holdButton = screen.getByRole("button", { name: "按住说话，轻触切换文字输入" });
    fireEvent.pointerDown(holdButton, { button: 0, pointerId: 1 });
    await act(async () => vi.advanceTimersByTime(320));
    await act(async () => {
      fireEvent.pointerUp(holdButton, { button: 0, pointerId: 1 });
      await Promise.resolve();
      await Promise.resolve();
    });

    const textarea = screen.getByRole("textbox", { name: "详细评审意见" });
    expect(textarea).toHaveValue("建议通过。");
    expect(textarea).toHaveFocus();
    expect(screen.getByText("语音 1")).toBeInTheDocument();
    expect(stopTrack).toHaveBeenCalled();
  });
});
