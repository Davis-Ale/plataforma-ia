export class RequestScope {
  private controller: AbortController | undefined;

  start() {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;

    return {
      signal: controller.signal,
      isCurrent: () => this.controller === controller && !controller.signal.aborted,
    };
  }

  cancel() {
    this.controller?.abort();
    this.controller = undefined;
  }
}
