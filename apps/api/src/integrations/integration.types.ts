export type IntegrationKind = "contracts" | "operations" | "people";

export type IntegrationBinding = Readonly<{
  companyId: string;
  kind: IntegrationKind;
  adapterKey: string;
}>;

export type ContractsReadInput = Readonly<{
  externalRef: string;
}>;

export type ContractsReadOutput = Readonly<{
  companyId: string;
  externalRef: string;
  name: string;
  clientName: string;
  startDate: string;
  status: string;
  simulated: boolean;
  sourceAdapter: string;
}>;

export type ContractsPort = Readonly<{
  key: string;
  kind: "contracts";
  read: (companyId: string, input: ContractsReadInput) => Promise<ContractsReadOutput>;
}>;

export type OperationsPlanInput = Readonly<{
  contractExternalRef: string;
  contractName: string;
  clientName: string;
  startDate: string;
}>;

export type OperationsPlanOutput = Readonly<{
  companyId: string;
  planId: string;
  contractExternalRef: string;
  workstreams: readonly string[];
  targetStartDate: string;
  simulated: boolean;
  sourceAdapter: string;
}>;

export type OperationsPort = Readonly<{
  key: string;
  kind: "operations";
  plan: (companyId: string, input: OperationsPlanInput) => Promise<OperationsPlanOutput>;
}>;

export type PeopleCapacityInput = Readonly<{
  planId: string;
  workstreams: readonly string[];
  targetStartDate: string;
}>;

export type PeopleCapacityOutput = Readonly<{
  companyId: string;
  planId: string;
  available: boolean;
  gaps: readonly string[];
  simulated: boolean;
  sourceAdapter: string;
}>;

export type PeoplePort = Readonly<{
  key: string;
  kind: "people";
  checkCapacity: (companyId: string, input: PeopleCapacityInput) => Promise<PeopleCapacityOutput>;
}>;
