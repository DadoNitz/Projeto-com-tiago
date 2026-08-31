# Estado Atual do Sistema

Produção: **https://estoque-hardware.vercel.app**

Todas as cinco fases do roadmap têm implementação funcionando. Este documento
registra o que existe, o que ficou de fora e por quê.

## O que está implementado

### Fase 1 — Inventário

| Recurso | Onde |
|---|---|
| Autenticação, três perfis, permissões | `/login`, `lib/auth/permissions.ts` |
| Cadastro de peça em 4 passos, com specs dinâmicas | `/estoque/novo` |
| Listagem com busca e filtros server-side | `/estoque/itens` |
| Detalhe da unidade (destino do QR Code) | `/estoque/itens/[id]` |
| Movimentações pela interface + histórico | `/estoque/movimentacoes` |
| Fotos com câmera do celular | detalhe da unidade |
| Extrato por sócio | `/socios` |
| Marcas, locais e sócios | `/configuracoes` |
| Dashboard | `/dashboard` |
| PWA completo | `manifest.ts`, `public/sw.js` |

### Fase 2 — Montagens

- Motor de compatibilidade com 16 regras determinísticas (`domain/compatibility/`)
- Sugestão de montagens a partir do estoque real (`/montagens`)
- Identificação de gargalos
- Montagens persistidas com **reserva** de peças (`/montagens/minhas`)
- Cancelamento devolve as peças; venda rateia o valor pelo custo

### Fase 3 — IA

- Camada desacoplada `AIProvider`, com Gemini implementado
- Chat com 8 ferramentas de consulta somente leitura (`/inteligencia`)
- Análise de negócio do estoque (`/inteligencia/analise`)
- Geração de anúncio para Marketplace, OLX, WhatsApp e Instagram
- Relatórios com período e exportação CSV (`/relatorios`)

### Fase 4 — Avançado

- Leitura de etiqueta por foto, preenchendo o cadastro
- Geração e impressão de etiquetas com QR Code (`/estoque/etiquetas`)
- Leitura de QR Code pela câmera (`/estoque/ler`)
- Exportação CSV

### Fase 5 — Promoções

- Cadastro de ofertas e histórico de preço (`/promocoes`)
- Avaliação pela IA comparando com o custo real de compra da operação

## Decisões que valem ser lembradas

**A IA nunca decide compatibilidade.** O motor determinístico produz o
veredito; o modelo só o traduz. A instrução do chat proíbe explicitamente
suavizar um "incompatível" ou promover um "precisa verificar".

**Dado ausente nunca vira "compatível".** Vira "precisa verificar", com o nome
do campo que falta preencher.

**Confirmar montagem reserva, não retira.** Cancelar devolve tudo. A saída
definitiva acontece só na venda.

**A saída da IA passa pela validação da entrada humana.** O que a leitura de
etiqueta extrai é validado contra o mesmo catálogo `SpecDefinition`. Spec
recusada é reportada, não descartada em silêncio.

**Nenhuma operação de estoque é otimista.** Sem conexão, a interface recusa e
avisa — nunca mostra como concluído o que o servidor não confirmou.

**O Service Worker não cacheia rota autenticada.** Cache Storage é por origem,
não por usuário: cachear resposta autenticada vazaria dados entre contas na
mesma máquina.

## O que ficou de fora, conscientemente

**Sincronização offline de escrita.** A especificação (seção 33) autoriza
deixar para depois, e a arquitetura não a impede. Enfileirar movimentação de
estoque sem mecanismo de resolução de conflito criaria inconsistência pior que
a ausência da funcionalidade.

**Push notifications.** Schema e arquitetura comportam; falta a implementação
e as chaves VAPID.

**Remoção de fundo das fotos.** O campo `cutoutKey` existe no banco. Falta
escolher o provedor — a análise das duas opções está em `04-ROADMAP.md`.

**Busca com trigram (`pg_trgm`).** A busca atual usa `ILIKE`, adequada para a
ordem de grandeza real do estoque. O motivo de não ter entrado está em
`02-MODELAGEM.md`.

**Criação de categorias pela interface.** Categoria sem especificações
definidas produz formulário vazio e uma categoria que o motor de
compatibilidade não conhece. Elas nascem do catálogo versionado em código,
aplicado pelo seed.

**Edição de produto e unidade já cadastrados.** Existe cadastro, movimentação e
exclusão lógica, mas não uma tela de edição dos campos. É a lacuna mais
sentida hoje.

## Restrições operacionais conhecidas

**O plano gratuito do Gemini tem limite por minuto e por dia.** Ao estourar, o
sistema mostra "limite de requisições atingido" em vez de um erro genérico. Os
testes que chamam o modelo são opt-in (`TESTAR_IA=1`) exatamente por isso.

**O Neon suspende o compute quando ocioso.** A primeira consulta depois de um
tempo parado falha; o sistema repete automaticamente até 3 vezes.

**`vercel.app` pode não resolver em alguns DNS.** Aconteceu na máquina de
desenvolvimento. O script de fumaça tem fallback para DNS público.

## Verificação

```
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # 125 testes (5 de IA são opt-in)
npm run build       # build de produção
npm run smoke       # login real + 20 rotas em produção
```
