# Modelagem do Banco de Dados

PostgreSQL + Prisma. O schema executável vive em `prisma/schema.prisma`; este documento
explica **por que** ele é assim.

## Diferenças em relação à lista da seção 20 da spec

A spec permitia propor modelagem melhor. As mudanças propostas:

| Spec original | Proposto | Motivo |
|---|---|---|
| `InventoryItem` | `Product` + `InventoryUnit` | A própria spec pede essa separação nas seções 23/24. `InventoryItem` viraria os dois papéis ao mesmo tempo. |
| `ItemSpecification` (tabela EAV) | `Product.specs` JSONB + `SpecDefinition` | EAV puro inviabiliza filtro por spec. Ver análise de riscos §2. |
| `ItemImage` | `ProductImage` + `UnitImage` | Foto do modelo (catálogo) é diferente de foto da unidade física (estado real, etiqueta, avaria). Ambas são necessárias. |
| `Role` como tabela | `enum Role` | Três perfis fixos e bem definidos. Tabela traria join em toda request sem ganho. Permissões ficam em código (`lib/auth/permissions.ts`), versionadas junto com as regras. |
| `CompatibilityRule` como tabela | Regras em código | Regra de compatibilidade é lógica, não dado. Em tabela ficaria intestável e sujeita a edição sem revisão. A tabela existe apenas para **overrides manuais** (`CompatibilityOverride`). |
| — | `StockLot` | Ausente na spec, necessário para custo médio e giro por lote. Fica preparado, sem uso no MVP. |

## Entidades

### Núcleo do catálogo

**`Category`** — árvore (`parentId`) para permitir "Armazenamento > SSD > NVMe". Campo `slug` estável usado pelo motor de compatibilidade (`cpu`, `motherboard`, `ram`, `gpu`, `psu`, `case`, `storage`, `cooler`...). O slug é o contrato entre catálogo e regras.

**`Brand`** — normalizada, com `slug` único. Evita "Kingston", "kingston" e "KINGSTON" como três marcas.

**`SpecDefinition`** — catálogo de specs por categoria: `key`, `label`, `type`, `unit`, `required`, `options[]`, `order`, `usedInCompatibility`. É a fonte do formulário dinâmico e da validação Zod.

**`Product`** — o **modelo**. Ex.: "Kingston Fury Beast 8GB DDR4 3200".
Campos: `name`, `brandId`, `categoryId`, `model`, `partNumber`, `specs` (JSONB), `trackingMode`, `defaultSalePrice`, `lowStockThreshold`, `notes`, `deletedAt`.
Aqui moram **todas as especificações técnicas**. Nunca repetidas por unidade.

**`ProductImage`** — fotos do modelo, com `isPrimary`, `sortOrder`, chaves de original e thumbnail.

### Núcleo do estoque

**`InventoryUnit`** — a **unidade física**. Ex.: "RTX3060-001, serial final 3729, usada, prateleira A3".

Campos individuais: `productId`, `internalCode` (único, gera o QR), `serialNumber`, `serialLast` (os últimos caracteres pedidos na seção 3 — coluna própria e indexada, não um `LIKE '%...'`), `condition` (`NEW | LIKE_NEW | USED | DEFECTIVE | FOR_TESTING`), `status` (`AVAILABLE | RESERVED | IN_BUILD | SOLD | DEFECTIVE | DISCARDED | IN_TRANSIT`), `locationId`, `quantity`, `purchaseCost`, `estimatedSalePrice`, `purchaseDate`, `entryDate`, `origin`, `notes`, `deletedAt`.

Invariantes garantidas no banco (migration `20260831000100_invariantes_estoque`):

- `quantity >= 0` — CHECK constraint.
- `InventoryMovement.quantity > 0` — CHECK constraint.
- `trackingMode = SERIALIZED` implica `quantity = 1` — **trigger**, não CHECK. A regra depende de `products.trackingMode`, e um CHECK do PostgreSQL não pode consultar outra tabela. Vale a pena estar no banco: é a invariante que sustenta a rastreabilidade individual, e precisa resistir até a uma correção manual feita por SQL.
- `internalCode` único — constraint do schema.

**Por que `condition` e `status` são separados:** condição é física e muda pouco (uma placa usada continua usada). Status é comercial/operacional e muda a cada movimentação. Misturar os dois — como a lista de "Estado" da seção 3 sugere — impediria representar "peça usada que está reservada". Na UI os dois aparecem juntos, mas no banco são independentes.

**`Location`** — hierárquica (`parentId`): "Depósito > Estante A > Prateleira A3".

**`InventoryMovement`** — **append-only**. Nunca alterada, nunca removida.
`unitId`, `productId`, `type`, `quantity`, `fromStatus`, `toStatus`, `fromLocationId`, `toLocationId`, `userId`, `reason`, `notes`, `buildId?`, `createdAt`.

Guardar `fromStatus`/`toStatus` permite reconstruir o estado do estoque em qualquer data passada, o que os relatórios de período exigem.

Tipos: `INBOUND, OUTBOUND, SALE, RESERVE, UNRESERVE, RETURN, DEFECT, DISCARD, BUILD_ALLOCATE, BUILD_RELEASE, TRANSFER, ADJUSTMENT`.

**`Tag`** / **`ProductTag`** — tags no produto (característica do modelo). Tag na unidade seria raramente útil e dobraria a superfície de busca.

### Montagens (Fase 2, schema pronto na Fase 1)

**`Build`** — `name`, `customerName?`, `status` (`PLANNED | RESERVED | ASSEMBLING | ASSEMBLED | SOLD | CANCELLED`), `totalCost`, `salePrice`, `margin` (calculada), `notes`, timestamps.

**`BuildItem`** — liga `Build` a `InventoryUnit` com `role` (`CPU`, `MOTHERBOARD`, `RAM`, ...) e `quantity`. A unidade alocada tem status `IN_BUILD`; cancelar a montagem devolve ao estoque via movimentação, nunca por edição direta.

**`BuildSuggestion`** — sugestões geradas pelo motor + IA, com `score`, `tier`, `useCase`, `compatibility` (JSONB com o resultado completo do motor), `missingParts` (JSONB). Persistidas para não recalcular e para dar histórico.

**`CompatibilityOverride`** — exceção manual verificada por humano ("essa B450 já está com a BIOS atualizada para Ryzen 5000"). Tem `verifiedBy` e `verifiedAt`.

### IA (Fase 3, schema pronto na Fase 1)

`AIConversation`, `AIMessage` (com `toolCalls` JSONB para auditabilidade do que a IA consultou), `AIAnalysis` (`type`, `period`, `result` JSONB, `generatedAt`).

Guardar as tool calls importa: permite depois auditar se uma recomendação da IA veio de dados reais.

### Sócios e dinheiro (acrescentado após a especificação inicial)

O requisito é: saber **quanto cada pessoa gastou em cada peça** e quanto ela retornou. Ex.: "a RTX 3060 foi comprada pelo Eduardo por R$ 1.100".

**`Partner`** — quem coloca dinheiro na operação. Deliberadamente **separado de `User`**: quem financia uma peça não precisa ter acesso ao sistema, e quem opera o sistema não necessariamente investe. Amarrar os dois obrigaria a criar login para um sócio que só quer saber seu saldo. O campo `userId` é opcional e cobre quem faz as duas coisas.

**`InventoryUnit.purchasedById`** — o comprador da peça. Um por unidade.

**`InventoryUnit.soldPrice` / `soldAt` / `soldToName`** — preenchidos na venda. Ficam na própria unidade, e não só no histórico, porque "por quanto isto foi vendido" é pergunta constante e não deve exigir varrer movimentações.

**`InventoryMovement.amount` + `partnerId`** — o razão financeiro. É aqui que o dinheiro realmente vive: o histórico é append-only, então o extrato por sócio é sempre reconstituível e não depende de campo mutável.

**Sobre compra dividida entre sócios:** `purchasedById` guarda um comprador só. Quando duas pessoas racham uma compra, a divisão é registrada como **dois lançamentos** na mesma unidade, com `partnerId` e `amount` diferentes — o modelo já suporta, sem tabela nova. O campo na unidade continua indicando o comprador principal, para exibição rápida. Se o rateio virar rotina, a evolução natural é somar os lançamentos em vez de ler o campo; nada precisa ser migrado.

Consulta pronta: `npm run extrato`.

### Anúncios de venda (acrescentado após a especificação inicial)

O sistema também será usado para **vender** computadores, e a IA deve gerar descrições para o Facebook Marketplace.

**`Listing`** — entidade própria, e não um campo de texto na unidade, por três motivos:

1. o mesmo computador é anunciado em mais de um canal, e cada um tem tom e limite de caracteres diferentes;
2. o texto é reescrito várias vezes até vender, e o histórico mostra qual versão funcionou;
3. descrição gerada por IA precisa registrar provedor, modelo e prompt — para que uma especificação errada no anúncio possa ser rastreada até a peça.

Liga-se a uma `InventoryUnit` (peça avulsa) ou a um `Build` (computador montado). `imageKeys` guarda a seleção de fotos do anúncio, que quase nunca é a mesma do cadastro.

### Imagens sem fundo (acrescentado após a especificação inicial)

**`ProductImage.cutoutKey` / `UnitImage.cutoutKey`** — a versão recortada fica **ao lado** da original, nunca no lugar dela. Remoção de fundo erra com frequência em peça escura sobre bancada escura, e o operador precisa poder voltar atrás. A foto original também continua sendo a melhor entrada para o OCR da Fase 4.

### Auditoria e usuários

**`User`** — `email`, `passwordHash`, `name`, `role` (enum), `active`, `deletedAt`.

**`AuditLog`** — `userId`, `action`, `entity`, `entityId`, `before` (JSONB), `after` (JSONB), `ip`, `userAgent`, `createdAt`. Preenchido pelo `AuditService`, chamado pelos serviços — não por trigger, para que o `userId` da aplicação esteja sempre disponível.

### Promoções (Fase 5, schema pronto)

`PromotionStore`, `Promotion`, `PriceHistory`. Criados agora porque adicionar tabelas isoladas depois é barato, mas mudar `Product` depois para acomodá-las não seria.

## Índices planejados

| Tabela | Índice | Serve a |
|---|---|---|
| `Product` | GIN `jsonb_path_ops` em `specs` | filtro por spec |
| `Product` | `(categoryId, deletedAt)`, `(brandId, deletedAt)` | listagens filtradas |
| `InventoryUnit` | `serialLast` | busca por final de serial |
| `InventoryUnit` | `serialNumber` (parcial, não nulo) | busca por serial completo |
| `InventoryUnit` | `internalCode` (único) | QR Code |
| `InventoryUnit` | `(status, deletedAt)`, `(productId, status)` | disponibilidade |
| `InventoryUnit` | `(locationId, status)` | "onde está?" |
| `InventoryMovement` | `(createdAt)`, `(unitId, createdAt)`, `(type, createdAt)` | relatórios por período |
| `AuditLog` | `(entity, entityId, createdAt)` | trilha por registro |

### Busca textual: o que ficou de fora, e por quê

O plano inicial previa índices GIN trigram (`pg_trgm`) em `name`, `model` e `partNumber`, para tolerar erro de digitação. Isso **não foi implementado** no MVP, por uma razão prática: o Prisma gerencia os índices declarados no schema e removeria, na migration seguinte, qualquer índice criado por fora que ele não reconheça. Manter trigram exigiria ou a extensão `postgresqlExtensions`, ou conviver com migrations que tentam derrubar o índice a cada alteração.

No MVP a busca usa `ILIKE %termo%` (via `contains` + `mode: insensitive`). Para a ordem de grandeza real deste estoque — milhares de linhas, não milhões — isso responde em poucos milissegundos. Quando o volume justificar, trigram entra como migration própria, com a extensão declarada.

O que **não** se abriu mão: busca por serial e por código interno usa índice de verdade. `serialLast` existe justamente para não precisar de `LIKE '%7812'`, que ignora índice e varre a tabela inteira.
