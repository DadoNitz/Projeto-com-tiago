# Estrutura de Diretórios e Decisões Técnicas

## Estrutura

```
.
├── docs/                              documentação arquitetural
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/                          seed realista (seção 30)
├── public/
│   └── icons/                         ícones do PWA
├── storage/                           uploads em dev (fora do public/)
└── src/
    ├── app/
    │   ├── (auth)/login/
    │   ├── (app)/                     área autenticada, com layout+sidebar
    │   │   ├── dashboard/
    │   │   ├── estoque/
    │   │   │   ├── itens/             lista, busca, filtros
    │   │   │   ├── itens/[id]/        detalhe da unidade (destino do QR)
    │   │   │   ├── produtos/[id]/     detalhe do modelo
    │   │   │   ├── novo/              cadastro em passos
    │   │   │   ├── categorias/
    │   │   │   ├── marcas/
    │   │   │   ├── locais/
    │   │   │   └── movimentacoes/
    │   │   ├── montagens/             Fase 2
    │   │   ├── inteligencia/          Fase 3
    │   │   ├── relatorios/            Fase 3/4
    │   │   ├── promocoes/             Fase 5
    │   │   └── configuracoes/
    │   ├── api/
    │   │   ├── auth/[...nextauth]/
    │   │   ├── upload/                multipart, validação de MIME
    │   │   ├── images/[...key]/       serve arquivo autenticado
    │   │   └── ai/chat/               Fase 3 (SSE)
    │   ├── manifest.ts
    │   ├── sw.ts                      Service Worker (Serwist)
    │   └── layout.tsx
    │
    ├── components/
    │   ├── ui/                        shadcn/ui
    │   ├── layout/                    Sidebar, BottomNav, Topbar, AppShell
    │   ├── inventory/                 formulários, cards, tabelas do estoque
    │   ├── pwa/                       InstallPrompt, UpdatePrompt, Connection
    │   └── shared/                    DataTable, EmptyState, Money, Paginação
    │
    ├── server/
    │   ├── actions/                   Server Actions (auth + Zod + serviço)
    │   ├── services/                  regra de negócio
    │   │   ├── product.service.ts
    │   │   ├── inventory.service.ts
    │   │   ├── movement.service.ts    ÚNICO caminho de escrita de status
    │   │   ├── dashboard.service.ts
    │   │   └── audit.service.ts
    │   └── db/
    │       ├── client.ts              Prisma + extensão de soft delete
    │       └── queries/               queries de leitura complexas
    │
    ├── domain/                        TypeScript puro, sem I/O, testável
    │   ├── specs/                     catálogo, validação dinâmica, normalização
    │   ├── compatibility/             motor determinístico (Fase 2)
    │   └── pricing/
    │
    ├── lib/
    │   ├── auth/                      Auth.js config + permissions
    │   ├── storage/                   StorageProvider + drivers
    │   ├── ai/                        AIService + providers + tools (Fase 3)
    │   ├── hardware/                  HardwareDataProvider (interface, Fase 4)
    │   ├── images/                    redimensionamento, thumbnail, MIME real
    │   ├── validation/                schemas Zod compartilhados
    │   └── utils/
    │
    ├── hooks/
    └── types/
```

### Princípios da estrutura

- `domain/` não importa nada de `server/`, `lib/` ou `app/`. É onde ficam as regras que precisam ser testadas sem banco.
- `server/services/` é a única camada que conhece Prisma.
- `app/` só orquestra. Um arquivo de página que passe de ~150 linhas é sinal de que falta um componente ou um serviço.

## Decisões técnicas

### 1. Next.js 15 + React 19 + TypeScript estrito

`strict: true`, `noUncheckedIndexedAccess: true`, `any` proibido por lint. O tipo do `specs` JSONB é estreitado pelo catálogo, não por `any`.

### 2. Prisma + PostgreSQL

Prisma pela tipagem end-to-end e migrations versionadas (exigidas na seção 28). Onde o Prisma não alcança — CHECK constraints, índices GIN/trigram, índices em expressão — usamos SQL bruto **dentro das migrations**, nunca aplicado direto no banco.

### 3. Auth.js v5 com Credentials + JWT

Credentials porque é um sistema interno, sem cadastro público. Senhas com `bcrypt`. Sessão em JWT (sem hit no banco por request), com `role` no token. Autorização checada **no servidor** em toda action; o middleware só protege rotas, não é a única defesa.

Permissões em código:

```ts
const PERMISSIONS = {
  ADMIN:    ['*'],
  EMPLOYEE: ['inventory:read','inventory:write','movement:create','build:write', ...],
  VIEWER:   ['inventory:read','report:read', ...],
}
```

### 4. Zod em toda fronteira

Todo input de Server Action, Route Handler e formulário é validado por Zod no servidor. O cliente valida também, mas só para UX — o servidor nunca confia.

### 5. shadcn/ui + Tailwind v4

Componentes copiados para o projeto (não é dependência opaca), acessíveis via Radix, e com foco por teclado e alvos de toque adequados — o que a seção 33 exige ao proibir dependência de hover.

### 6. Serwist para o Service Worker

`next-pwa` está sem manutenção ativa e não acompanha o App Router. Serwist é o sucessor mantido, com integração oficial. Estratégia de cache deliberadamente conservadora:

- Assets estáticos (`/_next/static/*`, ícones, fontes): `CacheFirst`.
- Páginas HTML: `NetworkOnly` no MVP. Cachear HTML de rota autenticada é o caminho mais rápido para vazar dado entre usuários.
- Rotas de API: **nunca** cacheadas.
- No logout, `caches.delete()` de tudo.

### 7. Uploads

Validação por magic bytes (`file-type`), não por `Content-Type` do cliente. Limite de 15 MB por arquivo. Processamento com `sharp`: original reduzido a no máximo 2000px de lado maior (qualidade suficiente para OCR na Fase 4) e thumbnail 400px WebP. Arquivos ficam fora de `public/` e são servidos por rota que checa sessão.

### 8. Testes com Vitest

Vitest pela velocidade e compatibilidade com ESM/TS. Foco nas regras críticas da seção 29: movimentações, reserva, cancelamento de montagem, compatibilidade, disponibilidade e permissões. Regras de domínio testadas sem banco; serviços de estoque testados com banco de teste real, porque o que se quer verificar são justamente transações e constraints — mock aqui testaria o mock.

### 9. Dinheiro em `Decimal`

`Decimal(12,2)` no banco, `Prisma.Decimal` na aplicação. Nunca `float` para dinheiro.

### 10. Paginação por cursor nas listagens grandes

Offset degrada com o crescimento. Cursor mantém desempenho e combina com scroll infinito no celular. Filtros e busca sempre no servidor.
