import { Injectable } from "@nestjs/common";
import { Capability } from "./capability.types";

@Injectable()
export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();

  register<Input, Output>(capability: Capability<Input, Output>): void {
    if (
      typeof capability.key !== "string" ||
      capability.key.trim() === "" ||
      this.capabilities.has(capability.key) ||
      !Array.isArray(capability.allowedRoles) ||
      capability.allowedRoles.some(
        (role) => !["OWNER", "ADMIN", "MEMBER"].includes(role),
      ) ||
      typeof capability.validate !== "function" ||
      typeof capability.authorize !== "function" ||
      typeof capability.execute !== "function"
    ) {
      throw new Error("Invalid or duplicate capability registration");
    }

    const approval = capability.approval ?? {
      mode: "REQUIRED", approverRoles: [],
    };
    if (
      approval.mode !== "NONE" &&
      (approval.mode !== "REQUIRED" ||
        !Array.isArray(approval.approverRoles) ||
        approval.approverRoles.some(
          (role) => !["OWNER", "ADMIN", "MEMBER"].includes(role),
        ))
    ) {
      throw new Error("Invalid capability approval policy");
    }

    const { key, validate, authorize, execute } = capability;
    this.capabilities.set(key, Object.freeze({
      key,
      allowedRoles: Object.freeze([...capability.allowedRoles]),
      approval: approval.mode === "NONE"
        ? Object.freeze({ mode: "NONE" as const })
        : Object.freeze({
            mode: "REQUIRED" as const,
            approverRoles: Object.freeze([...approval.approverRoles]),
          }),
      validate,
      authorize: (context, input) => authorize(context, input as Input),
      execute: (context, input) => execute(context, input as Input),
    }));
  }

  resolve(key: string): Capability | undefined {
    return this.capabilities.get(key);
  }
}
