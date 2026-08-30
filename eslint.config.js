import js from "@eslint/js";

export default [
  {
    ignores: ["coverage/**", "dist/**", "node_modules/**", ".npm-cache/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        Blob: "readonly",
        Bun: "readonly",
        DataView: "readonly",
        Deno: "readonly",
        TextEncoder: "readonly",
        URL: "readonly",
        Uint32Array: "readonly",
        Uint8Array: "readonly",
        Worker: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        crypto: "readonly",
        document: "readonly",
        globalThis: "readonly",
        performance: "readonly",
        process: "readonly",
        self: "readonly",
        setTimeout: "readonly",
        structuredClone: "readonly",
      },
      sourceType: "module",
    },
    rules: {
      "no-control-regex": "off",
      "no-console": "off",
    },
  },
];
