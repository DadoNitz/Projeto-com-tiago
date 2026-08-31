# Análise da Especificação — Riscos e Pontos Críticos de Modelagem

Documento de decisão inicial. Escrito antes de qualquer linha de código.

---

## 1. O risco central: Product vs. InventoryUnit

A especificação (seções 23 e 24) já identifica corretamente o ponto mais crítico do projeto. Reforçando por que ele é crítico:

Se as especificações técnicas (socket, frequência, TDP...) ficarem na unidade física, cadastrar 10 memórias iguais significa repetir 10x os mesmos dados, e qualquer correção posterior (ex.: descobrir que a frequência real é 3200 e não 2666) precisa ser aplicada 10 vezes. Pior: o motor de compatibilidade passaria a comparar unidades que *deveriam* ser idênticas mas divergem por erro de digitação.

**Decisão:** especificação técnica pertence ao `Product` (o modelo). A `InventoryUnit` carrega apenas o que é individual: serial, estado, localização, custo de aquisição, data de entrada, código interno/QR.

### O sub-risco: itens não serializados

Nem tudo merece unidade individual. Um cabo SATA, um parafuso, uma pasta térmica — são fungíveis. Criar 200 linhas de `InventoryUnit` para 200 parafusos é desperdício e polui a UI.

**Decisão:** `Product.trackingMode` com dois valores:

- `SERIALIZED` — cada unidade física vira uma `InventoryUnit` (GPUs, CPUs, placas-mãe, notebooks, PCs montados; qualquer coisa com serial ou que entre em montagem).
- `QUANTITY` — controle por saldo agregado (cabos, adaptadores, parafusos, pasta térmica).

Para não criar dois caminhos de código completamente diferentes (fonte permanente de bugs), adotamos uma solução unificadora: **itens `QUANTITY` também usam `InventoryUnit`, mas uma única linha com `quantity > 1`**. Itens `SERIALIZED` sempre têm `quantity = 1`, garantido por CHECK constraint no banco.

Assim:

- Uma só query calcula disponibilidade: soma de `quantity` onde `status = AVAILABLE`.
- Movimentações têm um só formato.
- O motor de montagem consome "uma unidade" da mesma forma nos dois casos.

Este é o ponto de modelagem que mais barato sai agora e mais caro sairia depois.

---

## 2. Risco: especificações flexíveis vs. consultáveis

A spec pede (seção 3) que novas categorias e specs possam ser adicionadas "sem grandes alterações estruturais". A solução ingênua é EAV puro (tabela chave/valor). A solução oposta é uma coluna por spec.

Ambas falham:

- **EAV puro**: para achar "placas-mãe AM4 com DDR4 e pelo menos 4 slots" você precisa de N self-joins. Fica lento e o código fica ilegível. Pior: sem tipagem, `"3200"`, `"3200MHz"` e `"3.2GHz"` convivem, e o motor de compatibilidade quebra.
- **Coluna por spec**: cada categoria nova é uma migration. Inviável a longo prazo.

**Decisão: híbrido com JSONB tipado + catálogo de definições.**

1. `Product.specs` é uma coluna `JSONB` — todas as specs daquele produto num objeto.
2. `SpecDefinition` é um **catálogo em banco** que descreve, por categoria, quais chaves existem, seu tipo (`STRING | NUMBER | BOOLEAN | ENUM`), unidade, se é obrigatória e quais valores o enum aceita. É isso que gera o formulário dinâmico da seção 23 e valida a entrada.
3. Índices GIN em `specs` e índices B-tree em expressões para as chaves realmente usadas em filtro pesado (`socket`, `memoryType`, `formFactor`, `wattage`).

Ganhamos flexibilidade (categoria nova = linhas em `SpecDefinition`, zero migration) sem perder consultabilidade nem tipagem — porque a validação Zod é **gerada a partir do catálogo** em runtime.

### Sub-risco: normalização de valores

`AM4`, `am4` e `Socket AM4` precisam ser o mesmo valor, senão a regra de compatibilidade falha silenciosamente — o pior tipo de falha aqui, porque o usuário acredita no resultado.

**Decisão:** specs usadas em compatibilidade são obrigatoriamente `ENUM` com vocabulário controlado no catálogo. O usuário escolhe de uma lista, não digita. Normalização feita na camada de validação, antes de persistir.

---

## 3. Risco: "quantidade disponível" como campo mutável

A spec (seção 10) já proíbe alterar `quantidade` diretamente, e com razão. Mas há uma armadilha adicional: mesmo com tabela de movimentações, se a disponibilidade for um campo **desnormalizado** atualizado pela aplicação, dois requests concorrentes causam saldo negativo ou peça reservada duas vezes.

**Decisão:**

- `InventoryUnit.status` é a fonte de verdade (`AVAILABLE`, `RESERVED`, `IN_BUILD`, `SOLD`, `DEFECTIVE`, `DISCARDED`, `IN_TRANSIT`).
- Toda transição de status **só** acontece dentro de uma transação que também grava a `InventoryMovement`. Um serviço único (`MovementService`) é o único caminho de escrita. Nenhuma Server Action escreve status diretamente.
- Reserva usa lock pessimista (`SELECT ... FOR UPDATE`) sobre a unidade, dentro da transação, para impedir reserva dupla sob concorrência.
- O histórico de movimentações é **append-only**: nunca editado, nunca deletado.

Este é o segundo ponto onde erros são caros: inconsistência de estoque destrói a confiança no sistema inteiro, e a IA passa a responder com base em dados errados.

---

## 4. Risco: a IA inventar compatibilidade

A spec é explícita (seções 6 e 25) e está certa. Um LLM perguntado "esse processador cabe nessa placa?" responde com confiança mesmo sem dados. Isso é inaceitável num sistema onde a resposta vira uma compra ou uma montagem física.

**Decisão arquitetural — a IA nunca decide compatibilidade:**

```
Banco (fatos)  ->  CompatibilityEngine (regras determinísticas, testadas)  ->  IA (linguagem)
```

O `CompatibilityEngine` é TypeScript puro, sem I/O, coberto por testes unitários. Ele produz um resultado estruturado com quatro níveis, como pedido:

| Nível | Significado | Quando |
|---|---|---|
| `COMPATIBLE` | Dados suficientes e regra satisfeita | Todos os campos da regra preenchidos e OK |
| `LIKELY_COMPATIBLE` | Regra OK, mas com premissa razoável | Ex.: consumo estimado por heurística |
| `NEEDS_VERIFICATION` | **Dados insuficientes** | Campo necessário está vazio no cadastro |
| `INCOMPATIBLE` | Regra violada | Ex.: socket AM4 x LGA1700 |

Regra de ouro codificada no motor: **campo ausente nunca produz `COMPATIBLE`**. Produz `NEEDS_VERIFICATION`, sempre. A IA recebe esse veredito pronto e só o traduz para linguagem natural — ela não pode elevá-lo.

Como o veredito já vem calculado, não há espaço para alucinação alterar a conclusão.

---

## 5. Risco: enviar o banco inteiro para o LLM

A spec (seção 7) já antecipa. Com 2.000 itens isso seria caro, lento e estouraria a janela de contexto.

**Decisão:** tool calling. A IA tem um conjunto pequeno e fechado de ferramentas (`searchInventory`, `getStockSummary`, `findCompatibleParts`, `suggestBuilds`, `findBottlenecks`, `simulatePurchase`...). Cada tool é uma função tipada que executa SQL com `LIMIT` e devolve JSON compacto.

Restrições de segurança das tools:

- São **somente leitura**. Nenhuma tool escreve no banco. A IA nunca move estoque.
- Recebem o `userId`/role e aplicam o mesmo filtro de autorização das telas.
- Têm limite rígido de linhas retornadas.

---

## 6. Risco: acoplamento a um fornecedor de IA

A spec pede desacoplamento (seção 18). O risco real não é trocar de fornecedor — é que a lógica de negócio vaze para dentro dos prompts.

**Decisão:** `AIService` expõe uma interface estreita (`chat`, `analyze`) e recebe um `AIProvider`. Os providers (`AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`) implementam só transporte e tradução de formato de tool-call. Prompts, tools e regras vivem fora dos providers. Trocar de modelo = trocar uma variável de ambiente.

---

## 7. Risco: PWA tratado como enfeite

A seção 34 promove o PWA para a Fase 1, e isso muda decisões estruturais — não dá para "adicionar PWA depois" sem retrabalho:

- **Cache e multiusuário**: o Cache Storage do Service Worker é por origem, não por usuário. Cachear respostas de API vazaria dados entre contas na mesma máquina. **Decisão:** o Service Worker cacheia **apenas assets estáticos**. Nenhuma resposta de rota autenticada entra em cache. No logout, todos os caches são limpos.
- **Nunca mentir sobre uma operação**: a seção 33 é explícita. **Decisão:** nenhuma mutação de estoque é otimista. O estado "concluído" só aparece após confirmação do servidor. Offline, a operação é bloqueada com aviso claro — não enfileirada silenciosamente.
- **Atualização**: usuário preso em versão antiga é um risco real de SW mal configurado. **Decisão:** SW novo entra em `waiting`, a UI mostra "Nova versão disponível — Atualizar", e só então `skipWaiting` + reload. Nunca `skipWaiting` automático (trocaria assets sob os pés do usuário no meio de um cadastro).
- **Biblioteca**: a spec pede para verificar manutenção ativa. `next-pwa` está praticamente abandonado e não suporta bem App Router. **Decisão:** Serwist (sucessor mantido, com suporte oficial a App Router). Ver `03-DECISOES-TECNICAS.md`.

---

## 8. Risco: soft delete mal feito

A spec pede soft delete (seção 17). A armadilha clássica: esquecer o filtro `deletedAt: null` em uma query e mostrar item excluído, ou pior, contá-lo no valor do estoque.

**Decisão:** o filtro nunca é responsabilidade de quem escreve a query. Usamos uma **Prisma Client Extension** que injeta `deletedAt: null` automaticamente em todo `find*`/`count`/`aggregate` das tabelas com soft delete, e converte `delete` em `update { deletedAt: now() }`. Consultas que precisam ver excluídos usam um caminho explícito e nomeado.

---

## 9. Risco: escopo

A especificação descreve um ERP completo. Tentar tudo de uma vez produz um sistema meio-pronto em todos os módulos e funcional em nenhum. A própria spec (seção 27) determina fases — vamos segui-las à risca.

**Corte do MVP (Fase 1):** cadastro, estoque, movimentações, busca, dashboard, auth, PWA. Sem IA, sem montagens. A aplicação precisa estar **inteiramente funcional** nesse recorte antes de qualquer coisa da Fase 2.

**O que fica preparado mas não implementado:** tabelas e interfaces para IA, promoções, OCR e provedores externos de dados existem no schema e como interfaces, sem implementação. Custo hoje: baixo. Economia depois: alta (evita migrations dolorosas em base com dados reais).

---

## 10. Risco de ambiente (constatado nesta máquina)

`psql` e `docker` não estão instalados. O sistema exige PostgreSQL real — a spec proíbe mocks. Precisa de decisão sobre onde o banco vai rodar antes de executar as migrations. Opções levantadas em `04-ROADMAP.md`.
