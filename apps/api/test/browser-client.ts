import { ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export class BrowserClient {
  private process: ChildProcess | undefined;
  private directory: string | undefined;
  private socket: WebSocket | undefined;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  async start(url: string) {
    const binary = process.env.CHROME_BIN;
    if (!binary) throw new Error("CHROME_BIN is required");
    this.directory = await mkdtemp(join(tmpdir(), "plataforma-browser-"));
    this.process = spawn(binary, [
      "--headless", "--no-sandbox", "--disable-dev-shm-usage", "--no-first-run",
      "--remote-debugging-port=0", `--user-data-dir=${this.directory}`, "about:blank",
    ], { stdio: "ignore" });
    let launchError: Error | undefined;
    this.process.on("error", (error) => { launchError = error; });
    let port: string | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      if (this.process.exitCode !== null) throw new Error("Browser exited during startup");
      const active = await readFile(join(this.directory, "DevToolsActivePort"), "utf8").catch(() => "");
      port = active.split("\n")[0];
      if (port) break;
      await delay(100);
    }
    if (!port) throw new Error("Browser debugging port unavailable");
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
    const target = targets.find((item) => item.type === "page");
    if (!target) throw new Error("Browser page unavailable");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Browser connection failed")), { once: true });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("Browser connection closed"));
      this.pending.clear();
    });
    await this.send("Page.enable");
    await this.send("Network.enable");
    await this.send("Page.navigate", { url });
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("Browser not connected");
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${expression}`);
    return result.result.value;
  }

  async waitFor(expression: string) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate<boolean>(expression)) return;
      } catch (error) {
        if (!(error instanceof Error) || !/context.*destroyed|Cannot find context|target navigated/i.test(error.message)) throw error;
      }
      await delay(50);
    }
    const text = await this.evaluate<string>("document.body?.innerText");
    throw new Error(`Browser condition timed out: ${expression}\n${text}`);
  }

  async close() {
    this.socket?.close();
    this.process?.kill("SIGTERM");
    if (this.process && this.process.exitCode === null) {
      await Promise.race([new Promise<void>((resolve) => this.process!.once("exit", () => resolve())), delay(2000)]);
      if (this.process.exitCode === null) this.process.kill("SIGKILL");
    }
    if (this.directory) await rm(this.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
