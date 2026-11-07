import { setTimeout as delay } from "node:timers/promises";

export class BrowserClient {
  private socket: WebSocket | undefined;
  private nextId = 0;
  private responses: Array<{ url: string; status: number }> = [];
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  async start(url: string) {
    const port = process.env.CHROME_DEBUGGING_PORT;
    if (!port || !/^\d+$/.test(port)) throw new Error("CHROME_DEBUGGING_PORT is required");
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
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string };
        method?: string; params?: { response?: { url: string; status: number } } };
      if (message.method === "Network.responseReceived" && message.params?.response?.url.includes("/api/workflows")) {
        const { url, status } = message.params.response;
        this.responses = [...this.responses.slice(-9), { url, status }];
      }
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
    throw new Error(`Browser condition timed out: ${expression}\n${text}\nWorkflow responses: ${JSON.stringify(this.responses)}`);
  }

  async close() {
    this.socket?.close();
  }

  async capturePage() {
    const { cssContentSize } = await this.send<{ cssContentSize: { width: number; height: number } }>("Page.getLayoutMetrics");
    return this.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } });
  }
}
