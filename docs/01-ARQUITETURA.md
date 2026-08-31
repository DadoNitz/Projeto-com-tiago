# Arquitetura Proposta

## Visão geral

Aplicação Next.js (App Router) em camadas explícitas. A regra que sustenta tudo:
**componente React não contém regra de negócio**. Componentes chamam Server Actions,
Server Actions chamam serviços, serviços falam com o banco.

```
┌──────────────────────────────────────────────────────────────────────┐
│  UI  (app/, components/)                                             │
│  Server Components para leitura · Client Components para interação   │
│  Não sabe o que é uma transação. Não conhece Prisma.                 │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ Server Actions / Route Handlers
                                │ (fronteira de autenticação + validação Zod)
┌───────────────────────────────▼──────────────────────────────────────┐
│  APPLICATION  (server/actions/)                                      │
│  1. authorize(session, permission)                                   │
│  2. schema.parse(input)                                              │
│  3. service.do(...)                                                  │
│  4. revalidatePath / retorna ActionResult<T>                         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  DOMAIN / SERVICES  (server/services/, domain/)                      │
│                                                                      │
│  ProductService     InventoryService     MovementService             │
│  BuildService       ReportService        AuditService                │
│                                                                      │
│  domain/compatibility/  ← TypeScript puro, sem I/O, testável         │
│  domain/specs/          ← catálogo, validação dinâmica, normalização │
└──────┬──────────────────┬───────────────────┬────────────────────────┘
       │                  │                   │
┌──────▼──────┐   ┌───────▼────────┐   ┌──────▼────────────────────────┐
│ INFRA: DB   │   │ INFRA: Storage │   │ INFRA: AI                     │
│ Prisma      │   │ StorageProvider│   │ AIService + AIProvider        │
│ PostgreSQL  │   │  Local / S3 /  │   │  Anthropic / OpenAI / Gemini  │
│ + extensions│   │  R2 / Supabase │   │  + Tools (somente leitura)    │
└─────────────┘   └────────────────┘   └───────────────────────────────┘
```

## Por que Server Actions e não uma API REST separada

A spec permite as duas. Server Actions vencem aqui porque:

- Uma fronteira só de validação/autorização, sem duplicar tipos entre cliente e servidor.
- Sem camada HTTP manual para CRUD, que é a maior parte do sistema.
- Menos código para manter, que é o critério de desempate pedido na seção 28.

Onde REST é melhor, usamos REST (`app/api/`): upload de imagem (multipart + streaming), streaming de chat da IA (SSE), webhooks futuros e leitura por QR Code.

## Regras invioláveis da arquitetura

1. **Nenhum componente React importa `prisma`.** Só serviços importam.
2. **Toda Server Action começa com autorização e validação.** Sem exceção. Um helper (`createAction`) força isso por construção — a action é definida como um objeto com `permission` + `schema` + `handler`, e o handler só recebe input já validado e sessão já autorizada.
3. **Movimentação de estoque só via `MovementService`.** É o único lugar que altera `InventoryUnit.status`, e sempre dentro de transação com registro de histórico e auditoria.
4. **Compatibilidade é determinística.** A IA lê o veredito; não o produz.
5. **Segredos nunca chegam ao cliente.** Chaves de IA e storage só em Server Components/Actions. Nenhuma variável sensível com prefixo `NEXT_PUBLIC_`.

## Camada de IA (preparada na Fase 1, implementada na Fase 3)

```
AIService
  ├─ provider: AIProvider        (transporte: Anthropic | OpenAI | Gemini)
  ├─ tools:    InventoryTool[]   (somente leitura, tipadas com Zod, com LIMIT)
  └─ prompts:  system prompts versionados em arquivo
```

O fluxo de uma pergunta do usuário:

```
Pergunta -> AIService -> LLM decide tool -> tool roda SQL real -> JSON compacto
         -> LLM formula resposta em português -> UI
```

O LLM nunca vê a conexão do banco, nunca escreve, e o que ele recebe são fatos, não o dump do banco.

## Camada de Storage

```ts
interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string>;
}
```

Fase 1 usa `LocalStorageProvider` (grava em `storage/` fora do `public/`, servido por rota autenticada). Trocar para S3/R2/Supabase é implementar a interface e mudar `STORAGE_DRIVER` no `.env`.

Imagens passam por um pipeline antes de persistir: valida MIME real (magic bytes, não o `Content-Type` enviado), limita tamanho, redimensiona o original para no máximo 2000px (preservando legibilidade para OCR futuro) e gera thumbnail 400px para listagens.

## Camada PWA

- `app/manifest.ts` — manifest gerado pelo Next (tipado).
- `app/sw.ts` — Service Worker via Serwist. Precache de assets estáticos apenas.
- `components/pwa/` — `UpdatePrompt`, `InstallPrompt`, `ConnectionIndicator`.
- `hooks/useOnlineStatus` — estados `online | offline | reconnecting`.

Mutations verificam conexão antes de enviar e nunca marcam como concluído sem resposta do servidor.
