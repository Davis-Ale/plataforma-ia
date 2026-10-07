import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { WorkflowStatus } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import {
  WorkflowsRepository,
  WorkflowsService as Engine,
} from "@plataforma/workflows";
import { AuditService } from "../audit/audit.service";
import { WorkflowsService } from "./workflows.service";

jest.setTimeout(20000);

describe("Workflows PostgreSQL concurrency", () => {
  const prisma = new PrismaService();
  const repository = new WorkflowsRepository(prisma);
  const engine = new Engine(repository);
  const audit = { create: jest.fn() } as unknown as jest.Mocked<AuditService>;
  const service = new WorkflowsService(engine, audit);
  let companyCreated = false;
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      const env = readFileSync(resolve(__dirname, "../../../../.env"), "utf8");
      const value = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
      if (!value) throw new Error("DATABASE_URL is required");
      process.env.DATABASE_URL = value.replace(/^["']|["']$/g, "");
    }
    await prisma.$connect();
    await prisma.company.create({
      data: { id: companyId, name: "workflow-concurrency-test" },
    });
    companyCreated = true;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    audit.create.mockClear();
  });

  afterAll(async () => {
    try {
      if (companyCreated) await prisma.company.deleteMany({ where: { id: companyId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function run(status: WorkflowStatus) {
    return prisma.workflowRun.create({
      data: { companyId, workflowKey: "concurrency-test", status },
    });
  }

  function synchronizeReads(method: "findRun" | "findStep") {
    const original = repository[method].bind(repository) as (
      ...args: string[]
    ) => Promise<unknown>;
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolveBarrier) => {
      release = resolveBarrier;
    });
    jest.spyOn(repository, method).mockImplementation((async (
      ...args: string[]
    ) => {
      const record = await original(...args);
      arrived += 1;
      if (arrived === 2) release();
      await barrier;
      return record;
    }) as never);
  }

  it("allows only one simultaneous start and one success audit", async () => {
    const initial = await run(WorkflowStatus.PENDING);
    synchronizeReads("findRun");
    const results = await Promise.allSettled([
      service.startRun(companyId, initial.id),
      service.startRun(companyId, initial.id),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(audit.create).toHaveBeenCalledTimes(1);
    const winner = results.find(
      (item) => item.status === "fulfilled",
    ) as PromiseFulfilledResult<Awaited<ReturnType<typeof service.startRun>>>;
    expect(await repository.findRun(companyId, initial.id)).toEqual(
      winner.value,
    );
    const loser = results.find(
      (item) => item.status === "rejected",
    ) as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(BadRequestException);
  });

  it("allows only one simultaneous step start", async () => {
    const parent = await run(WorkflowStatus.RUNNING);
    const step = await prisma.workflowStep.create({
      data: { companyId, workflowRunId: parent.id, stepKey: "step", stepOrder: 1 },
    });
    synchronizeReads("findStep");
    const results = await Promise.allSettled([
      service.startStep(companyId, parent.id, step.id),
      service.startStep(companyId, parent.id, step.id),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(audit.create).toHaveBeenCalledTimes(1);
    const winner = results.find((item) => item.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof service.startStep>>>;
    expect(await repository.findStep(companyId, parent.id, step.id)).toEqual(winner.value);
  });

  it("allows only one start or cancellation of a pending run", async () => {
    const parent = await run(WorkflowStatus.PENDING);
    synchronizeReads("findRun");
    const results = await Promise.allSettled([
      service.startRun(companyId, parent.id),
      service.cancelRun(companyId, parent.id),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(audit.create).toHaveBeenCalledTimes(1);
    const winner = results.find((item) => item.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof service.startRun>>>;
    expect(await repository.findRun(companyId, parent.id)).toEqual(winner.value);
  });

  it.each(["complete-fail", "complete-cancel", "fail-cancel"])(
    "preserves the winning run result for %s",
    async (pair) => {
      const initial = await run(WorkflowStatus.RUNNING);
      synchronizeReads("findRun");
      const actions = {
        complete: () =>
          service.completeRun(companyId, initial.id, { winner: "complete" }),
        fail: () => service.failRun(companyId, initial.id, "failure"),
        cancel: () => service.cancelRun(companyId, initial.id),
      };
      const keys = pair.split("-") as Array<keyof typeof actions>;
      const results = await Promise.allSettled(
        keys.map((key) => actions[key]()),
      );
      expect(
        results.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(1);
      expect(audit.create).toHaveBeenCalledTimes(1);
      const winner = results.find(
        (item) => item.status === "fulfilled",
      ) as PromiseFulfilledResult<
        Awaited<ReturnType<typeof service.completeRun>>
      >;
      expect(await repository.findRun(companyId, initial.id)).toEqual(
        winner.value,
      );
    },
  );

  it("preserves the winning step output and timestamps", async () => {
    const parent = await run(WorkflowStatus.RUNNING);
    const step = await prisma.workflowStep.create({
      data: {
        companyId,
        workflowRunId: parent.id,
        stepKey: "step",
        stepOrder: 1,
        status: WorkflowStatus.RUNNING,
      },
    });
    synchronizeReads("findStep");
    const results = await Promise.allSettled([
      service.completeStep(companyId, parent.id, step.id, { winner: true }),
      service.failStep(companyId, parent.id, step.id, "failure"),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(audit.create).toHaveBeenCalledTimes(1);
    const winner = results.find(
      (item) => item.status === "fulfilled",
    ) as PromiseFulfilledResult<
      Awaited<ReturnType<typeof service.completeStep>>
    >;
    expect(await repository.findStep(companyId, parent.id, step.id)).toEqual(
      winner.value,
    );
  });

  it.each(["create-start", "start-complete", "start-cancel"])(
    "rechecks the locked parent for %s",
    async (pair) => {
      const creating = pair === "create-start";
      const parent = await run(
        creating ? WorkflowStatus.PENDING : WorkflowStatus.RUNNING,
      );
      const step = creating
        ? null
        : await prisma.workflowStep.create({
            data: {
              companyId,
              workflowRunId: parent.id,
              stepKey: "step",
              stepOrder: 1,
            },
          });
      let entered!: () => void;
      let release!: () => void;
      const locked = new Promise<void>((done) => {
        entered = done;
      });
      const gate = new Promise<void>((done) => {
        release = done;
      });
      const blocker = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM workflow_runs WHERE id = ${parent.id} AND company_id = ${companyId} FOR UPDATE`;
        entered();
        await gate;
        await tx.workflowRun.updateMany({
          where: { id: parent.id, companyId },
          data: {
            status: creating
              ? WorkflowStatus.RUNNING
              : pair === "start-complete"
                ? WorkflowStatus.COMPLETED
                : WorkflowStatus.CANCELLED,
          },
        });
      });
      await locked;
      let writeReached!: () => void;
      const reached = new Promise<void>((done) => {
        writeReached = done;
      });
      if (creating) {
        const original = repository.createStep.bind(repository);
        jest.spyOn(repository, "createStep").mockImplementation((...args) => {
          writeReached();
          return original(...args);
        });
      } else {
        const original = repository.updateStep.bind(repository);
        jest.spyOn(repository, "updateStep").mockImplementation((...args) => {
          writeReached();
          return original(...args);
        });
      }
      const operation = creating
        ? service.createStep(companyId, parent.id, {
            stepKey: "step",
            stepOrder: 1,
          })
        : service.startStep(companyId, parent.id, step!.id);
      const assertion =
        expect(operation).rejects.toBeInstanceOf(BadRequestException);
      await reached;
      release();
      await blocker;
      await assertion;
      expect(audit.create).not.toHaveBeenCalled();
      if (creating)
        expect(
          await prisma.workflowStep.count({
            where: { companyId, workflowRunId: parent.id },
          }),
        ).toBe(0);
      else
        expect(
          await repository.findStep(companyId, parent.id, step!.id),
        ).toEqual(step);
    },
  );

  it("does not mutate or audit another tenant", async () => {
    const parent = await run(WorkflowStatus.PENDING);
    await expect(
      service.startRun(otherCompanyId, parent.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createStep(otherCompanyId, parent.id, {
        stepKey: "step",
        stepOrder: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await repository.findRun(companyId, parent.id)).toEqual(parent);
    expect(audit.create).not.toHaveBeenCalled();
  });
});
