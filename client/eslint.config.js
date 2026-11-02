import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        Worker: "readonly",
        Float32Array: "readonly",
        document: "readonly",
        console: "readonly",
        DOMException: "readonly",
        Image: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        PerformanceObserver: "readonly",
        location: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        WebSocket: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        EventTarget: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        fetch: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        globalThis: "readonly",
      },
    },
  },

  {
    files: [
      "client/src/**/*.ts",
      "server/**/*.ts",
      "shared/**/*.ts",
      "tests/**/*.ts",
      "e2e/**/*.ts",
    ],
    ignores: ["**/*.d.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },

  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/test-results/**",
    ],
  },
];