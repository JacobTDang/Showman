// ESLint v9 flat config for the TypeScript engine + services.
// The Go control-plane is linted separately (gofmt / go vet / golangci-lint).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "out/**", "data/**", "data-smoke/**", "coverage/**", "assets/**", "control-plane/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Enable type-aware linting (for the high-value async-correctness rules below)
    // without the full recommendedTypeChecked no-unsafe-* flood on JSON.parse casts.
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // noUncheckedIndexedAccess makes `!` pervasive and appropriate here.
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Catch un-awaited / un-voided promises — the class of bug behind flaky teardown.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    // Tests and one-off scripts may use `any` for terse fixtures/JSON.
    files: ["test/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  prettier,
);
