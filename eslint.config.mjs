import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cliente Prisma gerado: nao e codigo nosso, nao passa por lint.
    "src/generated/**",
    "public/sw.js",
  ]),
  {
    rules: {
      // A spec (secao 28) exige TypeScript estrito e proibe `any` desnecessario.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Regra de arquitetura (docs/01-ARQUITETURA.md): componentes de UI nao
    // conhecem Prisma. O acesso ao banco fica em src/server/**.
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx", "src/hooks/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Bloqueia o ACESSO ao banco, nao os tipos.
              // `@/generated/prisma/enums` fica liberado de proposito: sao
              // constantes TypeScript puras (UnitStatus, Role...), que a UI
              // precisa para renderizar rotulos e filtros. Proibi-las so
              // levaria a duplicar os mesmos valores a mao, com risco de
              // divergir do schema.
              group: [
                "@/server/db/*",
                "@/generated/prisma/client",
                "@/generated/prisma/models*",
                "@prisma/client",
              ],
              message:
                "Componentes de UI nao acessam o banco diretamente. Use uma Server Action ou um servico em @/server/services.",
            },
          ],
        },
      ],
    },
  },
  {
    // domain/ e TypeScript puro: sem I/O, sem banco, sem React.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*", "@/app/*", "@/components/*", "react", "next/*"],
              message:
                "src/domain deve permanecer puro e testavel sem infraestrutura.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
