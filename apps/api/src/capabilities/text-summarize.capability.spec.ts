import {
  createTextSummarizeCapability,
  isTextSummarizeInput,
  TEXT_SUMMARIZE_CAPABILITY_KEY,
} from "./text-summarize.capability";

describe("text.summarize capability", () => {
  const capability = createTextSummarizeCapability();

  it("uses stable generic key", () => {
    expect(capability.key).toBe(TEXT_SUMMARIZE_CAPABILITY_KEY);
    expect(capability.approval).toEqual({ mode: "NONE" });
    expect(capability.allowedRoles).toEqual(["OWNER", "ADMIN", "MEMBER"]);
  });

  it("validates bounded text input only", () => {
    expect(isTextSummarizeInput({ text: "hello" })).toBe(true);
    expect(isTextSummarizeInput({ text: "  " })).toBe(false);
    expect(isTextSummarizeInput({ text: "x".repeat(8001) })).toBe(false);
    expect(isTextSummarizeInput({ text: "ok", extra: 1 })).toBe(false);
    expect(isTextSummarizeInput(null)).toBe(false);
  });

  it("reads authorized context scoped to company", async () => {
    const context = {
      companyId: "c1",
      userId: "u1",
      sessionId: "s1",
      correlationId: "t1",
      role: "MEMBER" as const,
    };
    const field = capability.context!.fields[0];
    expect(await field.authorize(context, { text: "conteudo" })).toBe(true);
    const value = await field.read(context, { text: "conteudo autorizado" });
    expect(value).toEqual({
      companyId: "c1",
      text: "conteudo autorizado",
      summary: "conteudo autorizado",
    });
  });
});
