# Roadmap de Implementação

## Recorte: o que é MVP e o que não é

| Item da spec | Fase | Observação |
|---|---|---|
| Auth + roles + permissões | **1** | Base de tudo |
| Categorias, marcas, locais, tags | **1** | |
| Produtos com specs dinâmicas | **1** | Catálogo `SpecDefinition` |
| Unidades de estoque + serial final | **1** | Product/InventoryUnit |
| Fotos (upload, câmera, thumbnail) | **1** | |
| Cadastro, edição, soft delete | **1** | |
| Listagem, busca, filtros | **1** | Server-side, paginado |
| Movimentações | **1** | Transacional |
| Dashboard | **1** | Números reais + gráficos |
| Auditoria | **1** | |
| **PWA completo** | **1** | Promovido pela seção 34 |
| Montagens (entidade, reserva) | 2 | |
| Motor de compatibilidade | 2 | Determinístico + testes |
| Sugestão automática de builds | 2 | |
| AIService + chat + tools | 3 | |
| IA de montagem e de análise | 3 | |
| Relatórios (tradicionais e IA) | 3 | |
| Visão computacional / OCR | 4 | |
| Importação/exportação em massa | 4 | |
| QR Code — leitura pela câmera | 4 | Geração e rota `/estoque/itens/[id]` já na 1 |
| Push notifications | 4 | |
| Sincronização offline | 4 | Arquitetura já não impede |
| Promoções | 5 | Só schema na Fase 1 |

### Acrescentado depois da especificação inicial

| Item | Fase | Situação |
|---|---|---|
| Sócios (`Partner`) e quem comprou cada peça | **1** | Schema aplicado; falta UI de cadastro e o campo no formulário |
| Valor real de venda por unidade | **1** | Schema aplicado; entra junto com a movimentação de venda |
| Extrato por sócio (investido x retornado) | **1** | Consulta pronta (`npm run extrato`); falta a tela |
| Descrição para Facebook Marketplace via IA | 3 | Entidade `Listing` criada; `AIService` pronto, falta o prompt e a tela |
| Anúncio em outros canais (OLX, WhatsApp) | 3 | Mesmo modelo, só muda o prompt por canal |
| Remoção de fundo das fotos | 4 | Campo `cutoutKey` criado; provedor a definir (ver abaixo) |
| **Leitura de etiqueta por foto** | **feito** | Antecipada da Fase 4 a pedido. Câmera no cadastro, extração por Gemini, validada contra o catálogo |
| **Botão flutuante de adicionar** | **feito** | |

**Remoção de fundo — decisão pendente.** Duas abordagens viáveis, com trocas diferentes:

- **Local, no servidor** (`@imgly/background-removal-node`, ONNX): sem chave de API, sem custo por imagem, funciona offline. Em troca, baixa um modelo de ~80 MB e consome CPU no servidor — alguns segundos por foto.
- **API externa** (remove.bg, Cloudinary e afins): rápida e melhor em casos difíceis, mas tem custo por imagem e depende de terceiro.

Como o volume esperado é de fotos tiradas no celular durante o cadastro, e não em lote, a opção local tende a ser suficiente. A decisão fica registrada aqui para ser tomada quando a Fase 4 começar; o campo no banco já existe e não bloqueia nenhuma das duas.

> **Estado atual:** todas as cinco fases têm implementação funcionando em
> produção. O registro do que existe, do que ficou de fora e por quê está em
> [05-ESTADO-ATUAL.md](05-ESTADO-ATUAL.md).

## FASE 1 — MVP

Ordem de implementação, cada etapa terminando com lint + typecheck + testes:

1. **Fundação** — scaffold Next.js, TypeScript estrito, Tailwind, shadcn/ui, ESLint, Vitest, estrutura de pastas.
2. **Banco** — `schema.prisma` completo (todas as fases), migration inicial, constraints e índices em SQL, extensão de soft delete.
3. **Autenticação** — Auth.js, login, middleware, permissões, sessão com role.
4. **Domínio de specs** — catálogo `SpecDefinition`, validação dinâmica, normalização.
5. **Catálogos** — CRUD de categorias, marcas, locais, tags.
6. **Produtos** — CRUD com formulário de specs dinâmico por categoria.
7. **Unidades de estoque** — CRUD, geração de código interno, serial final, duplicação em lote.
8. **Imagens** — upload validado, `sharp`, thumbnails, captura por câmera no celular.
9. **Movimentações** — `MovementService` transacional + telas. **Testes obrigatórios aqui.**
10. **Listagem e busca** — filtros server-side, paginação por cursor, tabela no desktop e cards no celular.
11. **Dashboard** — indicadores reais e gráficos.
12. **PWA** — manifest, Service Worker escrito à mão, ícones, prompt de instalação, prompt de atualização, indicador de conexão.
13. **Layout responsivo** — sidebar no desktop, bottom navigation no celular.
14. **Seed** — dados realistas da seção 30.
15. **Fechamento** — lint, typecheck, testes, verificação dos 12 critérios de aceite do PWA.

## Provedor de IA: Google Gemini

Escolhido por ser o único dos três com **camada gratuita real de API**. Correção de premissa que apareceu durante o projeto: a API da OpenAI também é paga — o que é gratuito é o site do ChatGPT, não a API. A Anthropic não tem plano gratuito de API.

Duas consequências práticas do plano gratuito, ambas tratadas em código:

- **Sobrecarga (HTTP 503)** é frequente nos modelos gratuitos, em picos de segundos. O provedor repete até 3 vezes com espera crescente. Sem isso, a leitura de etiqueta falharia na cara do usuário por algo que passa sozinho.
- **Limite de cota (HTTP 429)** tem mensagem própria, para o usuário entender que é limite de uso e não defeito.

**Modelo fixado em `gemini-3.6-flash`**, nunca `-latest`. Um modelo que se atualiza sozinho muda o comportamento da extração sem ninguém ter tocado em código.

Descoberta relevante: `gemini-2.5-flash` **aparece na listagem de modelos mas é recusado na chamada** para chaves novas. Listar não garante acesso — a escolha do modelo foi feita testando de verdade, não pela documentação.

### Por que a saída da IA passa pela validação humana

O que o modelo extrai da etiqueta é validado contra o mesmo catálogo `SpecDefinition` que valida a digitação de uma pessoa. Sem isso, a IA poderia gravar um socket `AM4+` — um valor que o motor de compatibilidade não conhece e que pareceria dado legítimo. Spec recusada é reportada ao usuário para preenchimento manual, em vez de descartada em silêncio.

## Banco de dados: Neon

`psql` e `docker` não estão instalados na máquina de desenvolvimento, e a spec exige banco real (sem mocks). A opção adotada é o **Neon** (PostgreSQL gerenciado, free tier).

Por que Neon, e não as alternativas avaliadas:

- **Supabase** foi tentado primeiro e descartado na prática: a conta atingiu o limite de projetos gratuitos, e o projeto existente só era alcançável pelo *Session Pooler* — o host direto `db.<ref>.supabase.co` não tem registro IPv4. Somava-se a isso o inconveniente de dividir o banco com outra aplicação.
- **PostgreSQL local** exigiria instalação e deixaria o banco inacessível de fora da máquina, o que atrapalha testar o PWA no celular.
- **Docker Desktop** é pesado no Windows para o ganho que traria aqui.

O Neon resolve os três pontos: conecta por IPv4 com TLS, não exige instalação, e integra com a Vercel caso a aplicação seja publicada lá.

### Detalhes de conexão que importam

- Usar a **Pooled connection** (host com sufixo `-pooler`).
- Usar `sslmode=verify-full`. O `pg-connection-string` desta versão já trata `require` como `verify-full`, mas emite aviso de depreciação; ser explícito evita o ruído e deixa a intenção clara. O Neon tem certificado público válido.
- Senhas com `#`, `@`, `/` ou `?` precisam estar percent-encoded na URL, ou o parser trunca a string em silêncio.
- `npm run db:check` valida DNS, autenticação e permissão de criar tabelas antes de tentar migrar, separando as três causas de falha.

A escolha do provedor não afeta o restante: schema, serviços, UI e testes de domínio são idênticos em qualquer PostgreSQL. Só migrations e seed precisam do banco de pé.
