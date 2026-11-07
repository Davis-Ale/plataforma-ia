import { isSameOriginAction } from "../../apps/web/lib/same-origin";

describe("Portal recovery request origin", () => {
  const headers = { origin: "http://127.0.0.1:3001", host: "127.0.0.1:3001", "sec-fetch-site": "same-origin" };

  it("accepts the actual browser host independently of the internal Next server address", () => {
    expect(isSameOriginAction(new Headers(headers))).toBe(true);
    expect(isSameOriginAction(new Headers({ ...headers, origin: "https://portal.example.com", host: "portal.example.com" }))).toBe(true);
  });

  it.each([
    { ...headers, origin: "https://foreign.example.com" },
    { ...headers, "sec-fetch-site": "cross-site" },
    { ...headers, "sec-fetch-site": "same-site" },
    { ...headers, origin: "null" },
    { ...headers, origin: "file://127.0.0.1:3001" },
    { ...headers, origin: "" },
    { ...headers, host: "" },
    { ...headers, "sec-fetch-site": "" },
  ])("rejects untrusted browser action metadata: %j", (value) => {
    expect(isSameOriginAction(new Headers(value))).toBe(false);
  });
});
