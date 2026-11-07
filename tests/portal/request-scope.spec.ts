import { RequestScope } from "../../apps/web/lib/request-scope";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe("Portal request lifecycle", () => {
  it("discards a previous company response even when the transport ignores abort", async () => {
    const scope = new RequestScope();
    const first = scope.start();
    const oldResponse = deferred<string[]>();
    const state: { rows: string[] } = { rows: [] };
    const oldRequest = oldResponse.promise.then((rows) => {
      if (first.isCurrent()) state.rows = rows;
    });

    const current = scope.start();
    expect(first.signal.aborted).toBe(true);
    if (current.isCurrent()) state.rows = ["company-b-run"];
    oldResponse.resolve(["company-a-run"]);
    await oldRequest;

    expect(state.rows).toEqual(["company-b-run"]);
  });

  it("invalidates a response whose body is still being read", async () => {
    const scope = new RequestScope();
    const pending = scope.start();
    const body = deferred<string>();
    let selected: string | null = null;
    const response = (async () => {
      if (!pending.isCurrent()) return;
      const detail = await body.promise;
      if (pending.isCurrent()) selected = detail;
    })();

    scope.cancel();
    body.resolve("old-company-detail");
    await response;

    expect(selected).toBeNull();
    expect(pending.isCurrent()).toBe(false);
  });

  it("prevents stale session results from restoring a logged-out portal", async () => {
    const scope = new RequestScope();
    const pending = scope.start();
    const response = deferred<string>();
    let user: string | null = null;
    const login = response.promise.then((value) => {
      if (pending.isCurrent()) user = value;
    });

    scope.cancel();
    response.resolve("old-session-user");
    await login;

    expect(user).toBeNull();
    const next = scope.start();
    expect(next.signal.aborted).toBe(false);
    expect(next.isCurrent()).toBe(true);
    expect(pending.isCurrent()).toBe(false);
  });
});
