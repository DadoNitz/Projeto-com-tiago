import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` existe para quebrar o build se um componente de cliente
      // importar codigo de servidor. Em teste nao ha essa fronteira, e o
      // modulo real lanca ao ser carregado fora do Next.
      "server-only": path.resolve("tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    globals: false,
    setupFiles: ["tests/setup.ts"],
    env: {
      // O cliente do banco dimensiona o pool de conexoes pelo ambiente. Sem
      // isto cada arquivo de teste abriria 10 conexoes, e a suite completa
      // esgotava o limite do Neon — falha intermitente que sumia ao rodar um
      // arquivo isolado.
      NODE_ENV: "test",
    },
    // Testes de integracao tocam o mesmo banco; rodar em paralelo faria uma
    // suite apagar os dados da outra.
    fileParallelism: false,
    // Chamadas a modelo de IA na camada gratuita passam de 30s com facilidade.
    testTimeout: 120_000,
  },
});
