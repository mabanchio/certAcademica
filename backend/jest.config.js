/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          strict: true,
          esModuleInterop: true,
          module: "CommonJS",
          target: "ES2022",
          lib: ["ES2022"],
          skipLibCheck: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    // ts-path aliases si los hubiera
  },
  // No correr tests en node_modules ni dist
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  // Cobertura mínima esperada
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/index.ts",   // entry point, no unidad
  ],
};
