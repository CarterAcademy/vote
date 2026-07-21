import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  internalTranscriptionConfigured,
  transcribeAudio,
} from "./transcription";

const originalEnv = { ...process.env };

describe("internal audio transcription", () => {
  beforeEach(() => {
    process.env.INTERNAL_LLM_TRANSCRIPTIONS_URL = "https://llm.example/v1/audio/transcriptions";
    process.env.INTERNAL_LLM_TRANSCRIBE_MODEL = "qwen-asr";
    process.env.INTERNAL_LLM_API_KEY = "test-token";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_CHAT_COMPLETIONS_URL;
    delete process.env.OPENROUTER_AUDIO_TRANSCRIBE_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("sends multipart audio to the configured transcription model", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        text: "建议通过该人选。",
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await expect(transcribeAudio({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "audio/webm",
    })).resolves.toBe("建议通过该人选。");

    const [url, request] = fetchMock.mock.calls[0];
    const body = request?.body as FormData;
    expect(url).toBe("https://llm.example/v1/audio/transcriptions");
    expect(body.get("model")).toBe("qwen-asr");
    const file = body.get("file") as File;
    expect(file.name).toBe("recording.webm");
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(3);
    expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer test-token");
  });

  it("supports an internal endpoint without an API key", async () => {
    delete process.env.INTERNAL_LLM_API_KEY;
    expect(internalTranscriptionConfigured()).toBe(true);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "转写成功" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(transcribeAudio({ bytes: new Uint8Array([1]), contentType: "audio/wav" }))
      .resolves.toBe("转写成功");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has("Authorization")).toBe(false);
  });

  it("requires the transcription endpoint and model", async () => {
    delete process.env.INTERNAL_LLM_TRANSCRIPTIONS_URL;
    expect(internalTranscriptionConfigured()).toBe(false);
    await expect(transcribeAudio({ bytes: new Uint8Array([1]), contentType: "audio/wav" }))
      .rejects.toMatchObject({ code: "TRANSCRIPTION_NOT_CONFIGURED" });
  });

  it("falls back to an audio-capable OpenRouter chat model after an internal 5xx", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-token";
    process.env.OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.example/api/v1/chat/completions";
    process.env.OPENROUTER_AUDIO_TRANSCRIBE_MODEL = "google/gemini-2.5-flash";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "upstream failed" } }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "备用转写成功。" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(transcribeAudio({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "audio/mp4",
    })).resolves.toBe("备用转写成功。");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe("https://openrouter.example/api/v1/chat/completions");
    expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer openrouter-test-token");
    const body = JSON.parse(String(request?.body));
    expect(body.model).toBe("google/gemini-2.5-flash");
    expect(body.messages[0].content[1]).toMatchObject({
      type: "input_audio",
      input_audio: { data: "AQID", format: "m4a" },
    });
  });

  it("reports transcription available with OpenRouter alone", async () => {
    delete process.env.INTERNAL_LLM_TRANSCRIPTIONS_URL;
    delete process.env.INTERNAL_LLM_TRANSCRIBE_MODEL;
    process.env.OPENROUTER_API_KEY = "openrouter-test-token";
    process.env.OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.example/api/v1/chat/completions";
    expect(internalTranscriptionConfigured()).toBe(true);
  });
});
