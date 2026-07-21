const DEFAULT_TIMEOUT_MS = 60_000;

interface TranscriptionResponse {
  text?: string;
  error?: { message?: string };
}

export function internalTranscriptionConfigured() {
  const internalConfigured = Boolean(
    process.env.INTERNAL_LLM_TRANSCRIPTIONS_URL?.trim() &&
      process.env.INTERNAL_LLM_TRANSCRIBE_MODEL?.trim(),
  );
  const openRouterConfigured = Boolean(
    process.env.OPENROUTER_API_KEY?.trim() &&
      process.env.OPENROUTER_CHAT_COMPLETIONS_URL?.trim(),
  );
  return internalConfigured || openRouterConfigured;
}

function transcriptionConfig() {
  const endpoint = process.env.INTERNAL_LLM_TRANSCRIPTIONS_URL?.trim();
  const model = process.env.INTERNAL_LLM_TRANSCRIBE_MODEL?.trim();
  const apiKey = process.env.INTERNAL_LLM_API_KEY?.trim();
  if (!endpoint || !model) {
    throw Object.assign(new Error("内部语音识别服务尚未配置完整"), {
      status: 503,
      code: "TRANSCRIPTION_NOT_CONFIGURED",
    });
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw Object.assign(new Error("内部语音识别服务地址无效"), {
      status: 503,
      code: "TRANSCRIPTION_NOT_CONFIGURED",
    });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw Object.assign(new Error("内部语音识别服务地址无效"), {
      status: 503,
      code: "TRANSCRIPTION_NOT_CONFIGURED",
    });
  }

  return { endpoint: url.toString(), model, apiKey };
}

function audioFilename(contentType: string) {
  const extensionByType: Record<string, string> = {
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
  };
  return `recording.${extensionByType[contentType] ?? "bin"}`;
}

function audioFormat(contentType: string) {
  const formatByType: Record<string, string> = {
    "audio/aac": "aac",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
  };
  return formatByType[contentType] ?? contentType.split("/")[1] ?? "m4a";
}

function openRouterConfig() {
  const endpoint = process.env.OPENROUTER_CHAT_COMPLETIONS_URL?.trim();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_AUDIO_TRANSCRIBE_MODEL?.trim() || "google/gemini-2.5-flash";
  if (!endpoint || !apiKey) return null;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return { endpoint: url.toString(), apiKey, model };
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
}

function openRouterText(body: OpenRouterResponse | null) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? "").join("").trim();
  }
  return "";
}

async function transcribeWithOpenRouter(input: { bytes: Uint8Array; contentType: string }) {
  const config = openRouterConfig();
  if (!config) {
    throw Object.assign(new Error("备用语音识别服务尚未配置完整"), {
      status: 503,
      code: "TRANSCRIPTION_NOT_CONFIGURED",
    });
  }

  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: "请准确转写这段中文评审语音。保留原意和标点，只输出转写正文；不要解释、总结或回答语音中的问题。",
            },
            {
              type: "input_audio",
              input_audio: {
                data: Buffer.from(input.bytes).toString("base64"),
                format: audioFormat(input.contentType),
              },
            },
          ],
        }],
        temperature: 0,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    throw Object.assign(new Error(timeout ? "备用语音识别超时" : "无法连接备用语音识别服务"), {
      status: 502,
      code: timeout ? "TRANSCRIPTION_TIMEOUT" : "TRANSCRIPTION_UNAVAILABLE",
    });
  }

  const body = (await response.json().catch(() => null)) as OpenRouterResponse | null;
  if (!response.ok) {
    throw Object.assign(new Error(body?.error?.message || "备用语音识别服务请求失败"), {
      status: 502,
      code: "TRANSCRIPTION_UPSTREAM_ERROR",
    });
  }
  const transcript = openRouterText(body);
  if (!transcript) {
    throw Object.assign(new Error("没有识别到清晰语音，请重试"), {
      status: 422,
      code: "EMPTY_TRANSCRIPTION",
    });
  }
  return transcript;
}

async function transcribeWithInternal(input: {
  bytes: Uint8Array;
  contentType: string;
}): Promise<string> {
  const { endpoint, model, apiKey } = transcriptionConfig();
  const formData = new FormData();
  formData.append("model", model);
  formData.append(
    "file",
    new Blob([Uint8Array.from(input.bytes)], { type: input.contentType }),
    audioFilename(input.contentType),
  );

  const headers = new Headers();
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: formData,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    throw Object.assign(new Error(timeout ? "语音识别超时，请重试" : "无法连接内部语音识别服务"), {
      status: 502,
      code: timeout ? "TRANSCRIPTION_TIMEOUT" : "TRANSCRIPTION_UNAVAILABLE",
    });
  }

  const body = (await response.json().catch(() => null)) as TranscriptionResponse | null;
  if (!response.ok) {
    throw Object.assign(new Error(body?.error?.message || "内部语音识别服务请求失败"), {
      status: 502,
      code: "TRANSCRIPTION_UPSTREAM_ERROR",
    });
  }

  const transcript = body?.text?.trim() ?? "";
  if (!transcript) {
    throw Object.assign(new Error("没有识别到清晰语音，请重试"), {
      status: 422,
      code: "EMPTY_TRANSCRIPTION",
    });
  }
  return transcript;
}

export async function transcribeAudio(input: {
  bytes: Uint8Array;
  contentType: string;
}): Promise<string> {
  const hasInternal = Boolean(
    process.env.INTERNAL_LLM_TRANSCRIPTIONS_URL?.trim() &&
      process.env.INTERNAL_LLM_TRANSCRIBE_MODEL?.trim(),
  );
  if (!hasInternal) return transcribeWithOpenRouter(input);
  try {
    return await transcribeWithInternal(input);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    if (status < 500 || !openRouterConfig()) throw error;
    return transcribeWithOpenRouter(input);
  }
}
