import { Injectable } from "@nestjs/common";
import {
  ContractsPort,
  OperationsPort,
  PeoplePort,
} from "./integration.types";

@Injectable()
export class IntegrationRegistry {
  private readonly contracts = new Map<string, ContractsPort>();
  private readonly operations = new Map<string, OperationsPort>();
  private readonly people = new Map<string, PeoplePort>();

  registerContracts(adapter: ContractsPort): void {
    if (
      !adapter ||
      typeof adapter.key !== "string" ||
      adapter.key.trim() === "" ||
      adapter.kind !== "contracts" ||
      typeof adapter.read !== "function" ||
      this.contracts.has(adapter.key)
    ) {
      throw new Error("Invalid or duplicate contracts adapter");
    }
    this.contracts.set(
      adapter.key,
      Object.freeze({
        key: adapter.key,
        kind: "contracts" as const,
        replaySafety: this.replaySafety(adapter.replaySafety),
        read: adapter.read.bind(adapter),
      }),
    );
  }

  registerOperations(adapter: OperationsPort): void {
    if (
      !adapter ||
      typeof adapter.key !== "string" ||
      adapter.key.trim() === "" ||
      adapter.kind !== "operations" ||
      typeof adapter.plan !== "function" ||
      this.operations.has(adapter.key)
    ) {
      throw new Error("Invalid or duplicate operations adapter");
    }
    this.operations.set(
      adapter.key,
      Object.freeze({
        key: adapter.key,
        kind: "operations" as const,
        replaySafety: this.replaySafety(adapter.replaySafety),
        plan: adapter.plan.bind(adapter),
      }),
    );
  }

  registerPeople(adapter: PeoplePort): void {
    if (
      !adapter ||
      typeof adapter.key !== "string" ||
      adapter.key.trim() === "" ||
      adapter.kind !== "people" ||
      typeof adapter.checkCapacity !== "function" ||
      this.people.has(adapter.key)
    ) {
      throw new Error("Invalid or duplicate people adapter");
    }
    this.people.set(
      adapter.key,
      Object.freeze({
        key: adapter.key,
        kind: "people" as const,
        replaySafety: this.replaySafety(adapter.replaySafety),
        checkCapacity: adapter.checkCapacity.bind(adapter),
      }),
    );
  }

  getContracts(adapterKey: string): ContractsPort | undefined {
    return this.contracts.get(adapterKey);
  }

  getOperations(adapterKey: string): OperationsPort | undefined {
    return this.operations.get(adapterKey);
  }

  getPeople(adapterKey: string): PeoplePort | undefined {
    return this.people.get(adapterKey);
  }

  private replaySafety(value: unknown): "MANUAL" | "READ_ONLY" | "PURE" {
    if (value === undefined) return "MANUAL";
    if (value === "MANUAL" || value === "READ_ONLY" || value === "PURE") return value;
    throw new Error("Invalid adapter replay policy");
  }
}
