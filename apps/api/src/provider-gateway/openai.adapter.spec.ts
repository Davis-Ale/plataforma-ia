import { createOpenAiAdapter, OPENAI_PROVIDER_KEY } from "./openai.adapter";
import { ProviderInvocation } from "./provider.types";

describe("OpenAI ProviderAdapter", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects empty api key", () => {
    expect(() => createOpenAiAdapter("")).toThrow();
    expect(() => createOpenAiAdapter("   ")).toThrow();
  });

  it("exposes stable provider key", () => {
    const adapter = createOpenAiAdapter("sk-test");
    expect(adapter.key).toBe(OPENAI_PROVIDER_KEY);
  });

  it("estimates input tokens", () => {
    const adapter = createOpenAiAdapter("sk-test");
    expect(adapter.countInputTokens("gpt-4o-mini", "abcd")).toBe(1);
    expect(adapter.countInputTokens("gpt-4o-mini", "a".repeat(40))).toBe(10);
  });

  it("calls Responses API and returns tenant-scoped usage", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "resumo autorizado" }],
          },
        ],
        usage: { input_tokens: 12, output_tokens: 4 },
      }),
    }) as unknown as typeof fetch;

    const adapter = createOpenAiAdapter("sk-test");
    const controller = new AbortController();
    const request: ProviderInvocation = Object.freeze({
      companyId: "company-a",
      correlationId: "corr",
      operationId: "op-1",
      attemptNumber: 1,
      model: "gpt-4o-mini",
      prompt: JSON.stringify({ instruction: "Summarize", context: "texto" }),
      maxInputTokens: 1000,
      maxOutputTokens: 100,
      maxOutputBytes: 2000,
      costCapMicros: 100_000,
      currency: "USD",
      signal: controller.signal,
    });

    const result = await adapter.generate(request);
    expect(result).toEqual({
      companyId: "company-a",
      output: "resumo autorizado",
      usage: {
        inputTokens: 12,
        outputTokens: 4,
        actualCostMicros: expect.any(Number),
      },
    });
    expect(result.usage.actualCostMicros).toBeGreaterThan(0);
    expect(result.usage.actualCostMicros).toBeLessThanOrEqual(request.costCapMicros);

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe("https://api.openai.com/v1/responses");
    expect(call[1].headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(call[1].body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.input).toBe(request.prompt);
    expect(body.max_output_tokens).toBe(100);
    expect(body.store).toBe(false);
  });

  it("fails closed on HTTP error", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
    const adapter = createOpenAiAdapter("sk-test");
    const controller = new AbortController();
    await expect(
      adapter.generate(
        Object.freeze({
          companyId: "company-a",
          correlationId: "corr",
          operationId: "op-1",
          attemptNumber: 1,
          model: "gpt-4o-mini",
          prompt: "x",
          maxInputTokens: 10,
          maxOutputTokens: 10,
          maxOutputBytes: 100,
          costCapMicros: 1000,
          currency: "USD",
          signal: controller.signal,
        }),
      ),
    ).rejects.toThrow(/OpenAI HTTP 401/);
  });

  it("rejects unknown model", async () => {
    const adapter = createOpenAiAdapter("sk-test");
    const controller = new AbortController();
    await expect(
      adapter.generate(
        Object.freeze({
          companyId: "company-a",
          correlationId: "corr",
          operationId: "op-1",
          attemptNumber: 1,
          model: "unknown-model",
          prompt: "x",
          maxInputTokens: 10,
          maxOutputTokens: 10,
          maxOutputBytes: 100,
          costCapMicros: 1000,
          currency: "USD",
          signal: controller.signal,
        }),
      ),
    ).rejects.toThrow();
  });
});
