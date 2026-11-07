const path = require("node:path");

module.exports = {
  rootDir: "..",
  testMatch: ["<rootDir>/tests/portal/*.spec.ts"],
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": [
      require.resolve("ts-jest", { paths: [path.resolve(__dirname, "../apps/api")] }),
      { tsconfig: {
        target: "ES2022",
        module: "CommonJS",
        moduleResolution: "node",
        strict: true,
        lib: ["ES2022", "DOM"],
        types: ["jest", "node"],
        typeRoots: ["apps/api/node_modules/@types", "node_modules/@types"],
      } },
    ],
  },
};
