import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/*", "docs/*", "test-src/*", "scripts/*", "**/*.d.ts", "eslint.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": 0,
      "@typescript-eslint/consistent-type-definitions": 0,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { project: true, tsconfigDirName: import.meta.dirname },
    },
  },
);
