import { ProviderAdapter, ProviderInvocation, ProviderResponse } from "./provider.types";

const PROVIDER_KEY = "openai";
const OPENAI_URL = "https://api.openai.com/v1/responses";

const MODEL_COSTS: Readonly<Record<string, Readonly<{ input: number; output: number }>>> = Object.freeze({
  "gpt-4o-mini": Object.freeze({ input: 150_000, output: 600_000 }),
  "gpt-4o": Object.freeze({ input: 2_500_000, output: 10_000_000 }),
});

function estimateTokens(text: string): number {
  if (typeof text !== "string" || text.length === 0) return 1;
  return Math.max(1, Math.ceil(text.length / 4));
}

function computeCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const rates = MODEL_COSTS[model];
  if (!rates) return Number.MAX_SAFE_INTEGER;
  const cost =
    (BigInt(inputTokens) * BigInt(rates.input) + BigInt(outputTokens) * BigInt(rates.output) + 999_999n) /
    1_000_000n;
  if (cost <= 0n || cost > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  return Number(cost);
}

type OpenAiResponseBody = {
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

function extractOutputText(body: OpenAiResponseBody): string | undefined {
  if (!Array.isArray(body.output)) return undefined;
  const parts: string[] = [];
  for (const item of body.output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const block of item.content) {
      if (block?.type === "output_text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
  }
  if (parts.length === 0) return undefined;
  return parts.join("");
}

export function createOpenAiAdapter(apiKey: string): ProviderAdapter {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("OpenAI API key required");
  }
  const key = apiKey.trim();

  return Object.freeze({
    key: PROVIDER_KEY,
    countInputTokens(model: string, prompt: string): number {
      if (typeof model !== "string" || typeof prompt !== "string") {
        throw new Error("Invalid token count request");
      }
      return estimateTokens(prompt);
    },
    async generate(request: ProviderInvocation): Promise<ProviderResponse> {
      if (
        !request ||
        request.companyId.trim() === "" ||
        typeof request.model !== "string" ||
        typeof request.prompt !== "string" ||
        !MODEL_COSTS[request.model]
      ) {
        throw new Error("Invalid provider invocation");
      }
      const response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          input: request.prompt,
          max_output_tokens: request.maxOutputTokens,
          temperature: 0,
          store: false,
        }),
        signal: request.signal,
      });
      if (!response.ok) {
        throw new Error(`OpenAI HTTP ${response.status}`);
      }
      const body = (await response.json()) as OpenAiResponseBody;
      if (body.status !== undefined && body.status !== "completed") {
        throw new Error(`OpenAI status ${body.status}`);
      }
      const content = extractOutputText(body);
      if (typeof content !== "string") {
        throw new Error("Empty model response");
      }
      if (Buffer.byteLength(content, "utf8") > request.maxOutputBytes) {
        throw new Error("Output exceeds byte limit");
      }
      const inputTokens =
        typeof body.usage?.input_tokens === "number" && Number.isSafeInteger(body.usage.input_tokens)
          ? body.usage.input_tokens
          : estimateTokens(request.prompt);
      const outputTokens =
        typeof body.usage?.output_tokens === "number" && Number.isSafeInteger(body.usage.output_tokens)
          ? body.usage.output_tokens
          : estimateTokens(content);
      if (inputTokens < 0 || outputTokens < 0) {
        throw new Error("Invalid usage report");
      }
      const actualCostMicros = computeCostMicros(request.model, inputTokens, outputTokens);
      if (actualCostMicros > request.costCapMicros) {
        throw new Error("Cost exceeds cap");
      }
      return Object.freeze({
        companyId: request.companyId,
        output: content,
        usage: Object.freeze({
          inputTokens,
          outputTokens,
          actualCostMicros,
        }),
      });
    },
  });
}

export const OPENAI_PROVIDER_KEY = PROVIDER_KEY;
