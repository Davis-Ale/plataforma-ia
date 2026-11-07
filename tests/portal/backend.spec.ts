import { authorizedBackendFetch, clearSessionCookies, setSessionCookies } from "../../apps/web/lib/backend";

const mockJar = new Map<string, string>();
const mockSet = jest.fn((name: string, value: string, _options: unknown) => { mockJar.set(name, value); });
const mockDelete = jest.fn((name: string) => { mockJar.delete(name); });

jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => mockJar.has(name) ? { value: mockJar.get(name) } : undefined,
    set: mockSet,
    delete: mockDelete,
  }),
}), { virtual: true });

describe("Portal backend session bridge", () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    mockJar.clear();
    mockSet.mockClear();
    mockDelete.mockClear();
    fetchMock = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => jest.restoreAllMocks());

  it("keeps tokens in HttpOnly cookies with their own expiration", async () => {
    await setSessionCookies({ accessToken: "access-a", refreshToken: "refresh-a", expiresIn: 3600, refreshExpiresIn: 604800 });
    expect(mockSet).toHaveBeenCalledWith("plataforma_access", "access-a", expect.objectContaining({
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600,
    }));
    expect(mockSet).toHaveBeenCalledWith("plataforma_refresh", "refresh-a", expect.objectContaining({
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 604800,
    }));
    await clearSessionCookies();
    expect(mockJar.size).toBe(0);
  });

  it("renews an expired access token and preserves the company context on retry", async () => {
    mockJar.set("plataforma_access", "expired-access");
    mockJar.set("plataforma_refresh", "refresh-a");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ accessToken: "access-b", refreshToken: "refresh-b", expiresIn: 3600, refreshExpiresIn: 604800 }))
      .mockResolvedValueOnce(Response.json({ items: [] }));

    const response = await authorizedBackendFetch("/workflows", { headers: { "X-Company-Id": "company-b" } });

    expect(response.status).toBe(200);
    const firstHeaders = fetchMock.mock.calls[0]![1].headers as Headers;
    const retryHeaders = fetchMock.mock.calls[2]![1].headers as Headers;
    expect(firstHeaders.get("Authorization")).toBe("Bearer expired-access");
    expect(retryHeaders.get("Authorization")).toBe("Bearer access-b");
    expect(retryHeaders.get("X-Company-Id")).toBe("company-b");
    expect(mockJar.get("plataforma_refresh")).toBe("refresh-b");
  });

  it("uses refresh when the access cookie has expired without dispatching an anonymous request", async () => {
    mockJar.set("plataforma_refresh", "refresh-a");
    fetchMock.mockResolvedValueOnce(Response.json({ accessToken: "access-b", refreshToken: "refresh-b", expiresIn: 3600, refreshExpiresIn: 604800 }))
      .mockResolvedValueOnce(Response.json({ id: "user-a" }));

    expect((await authorizedBackendFetch("/auth/me")).status).toBe(200);
    expect(fetchMock.mock.calls[0]![0]).toEqual(expect.stringMatching(/\/auth\/refresh$/));
    expect((fetchMock.mock.calls[1]![1].headers as Headers).get("Authorization")).toBe("Bearer access-b");
  });

  it("clears both cookies and stops when refresh is revoked", async () => {
    mockJar.set("plataforma_access", "expired-access");
    mockJar.set("plataforma_refresh", "revoked-refresh");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    expect((await authorizedBackendFetch("/workflows")).status).toBe(401);
    expect(mockJar.size).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch a backend request without a session", async () => {
    expect((await authorizedBackendFetch("/workflows")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
