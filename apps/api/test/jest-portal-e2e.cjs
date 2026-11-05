module.exports = {
  rootDir: "..",
  testMatch: ["<rootDir>/test/auth-portal.postgres.e2e.ts"],
  testEnvironment: "node",
  testTimeout: 60000,
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: {
      target: "ES2022",
      module: "CommonJS",
      moduleResolution: "node",
      lib: ["ES2022", "DOM"],
      strict: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      skipLibCheck: true,
    } }],
  },
};
