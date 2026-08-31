import { formatarCodigoInterno } from "@/domain/inventory/serial";

/**
 * Geração do código interno das unidades (EST-00431).
 *
 * Deliberadamente sem `server-only`: o seed também precisa gerar códigos, e
 * ele roda fora do Next.
 *
 * Usa uma sequência do PostgreSQL (criada na migration
 * `20260831000100_invariantes_estoque`) em vez de "maior código + 1". Dois
 * cadastros simultâneos leriam o mesmo máximo e tentariam gravar o mesmo
 * código; a sequência resolve isso sem lock e sem retry.
 */

/** Cliente mínimo aceito: qualquer coisa que execute SQL cru. */
export interface ExecutorSql {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

interface LinhaNextval {
  valor: bigint | number | string;
}

/** Reserva os próximos `quantidade` códigos internos, em uma única ida ao banco. */
export async function proximosCodigosInternos(
  db: ExecutorSql,
  quantidade: number,
): Promise<string[]> {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error("A quantidade de códigos precisa ser um inteiro positivo.");
  }

  // generate_series faz o nextval ser chamado N vezes numa só consulta,
  // em vez de N idas ao banco ao cadastrar um lote de 50 peças.
  const linhas = await db.$queryRawUnsafe<LinhaNextval[]>(
    `SELECT nextval('estoque_codigo_interno_seq') AS valor
       FROM generate_series(1, $1)`,
    quantidade,
  );

  return linhas.map((linha) => formatarCodigoInterno(Number(linha.valor)));
}

/** Reserva um único código interno. */
export async function proximoCodigoInterno(db: ExecutorSql): Promise<string> {
  const [codigo] = await proximosCodigosInternos(db, 1);
  if (!codigo) throw new Error("Não foi possível gerar o código interno.");
  return codigo;
}

/**
 * Alinha a sequência ao maior código já existente.
 *
 * Necessário depois de importar dados por fora (o seed insere unidades
 * diretamente). Sem isso, a sequência continuaria em 1 e o primeiro cadastro
 * pela interface colidiria com um código já usado.
 */
export async function sincronizarSequenciaDeCodigos(
  db: ExecutorSql,
): Promise<void> {
  await db.$queryRawUnsafe(
    `SELECT setval(
       'estoque_codigo_interno_seq',
       GREATEST(
         (SELECT COALESCE(MAX(NULLIF(regexp_replace("internalCode", '\\D', '', 'g'), '')::bigint), 0)
            FROM "inventory_units"),
         1
       )
     )`,
  );
}
