-- Invariantes de estoque que o schema do Prisma não consegue expressar.
--
-- Ficam no banco, e não apenas no serviço, porque são verdades sobre os dados:
-- precisam valer para qualquer caminho de escrita, incluindo uma correção
-- manual feita por SQL às pressas. É a última linha de defesa contra um
-- inventário inconsistente.

-- ---------------------------------------------------------------------------
-- 1. Saldo nunca é negativo
-- ---------------------------------------------------------------------------
-- Saldo negativo seria uma afirmação falsa sobre o estoque físico, e
-- envenenaria todo relatório e toda resposta da IA daí em diante.
ALTER TABLE "inventory_units"
  ADD CONSTRAINT "inventory_units_quantity_nao_negativa"
  CHECK ("quantity" >= 0);

-- ---------------------------------------------------------------------------
-- 2. Movimentação sempre move alguma coisa
-- ---------------------------------------------------------------------------
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_quantity_positiva"
  CHECK ("quantity" > 0);

-- ---------------------------------------------------------------------------
-- 3. Item serializado tem exatamente uma peça por linha
-- ---------------------------------------------------------------------------
-- É a invariante que sustenta a separação Product x InventoryUnit: uma unidade
-- serializada representa UMA peça física, com um serial e uma localização.
-- Se ela pudesse ter quantity = 5, a rastreabilidade individual se perderia e
-- o motor de montagem passaria a alocar peças que não existem.
--
-- Precisa ser trigger, e não CHECK: a regra depende de `products.trackingMode`,
-- e um CHECK no PostgreSQL não pode consultar outra tabela.
CREATE OR REPLACE FUNCTION "estoque_valida_quantidade_unidade"()
RETURNS trigger AS $$
DECLARE
  modo "TrackingMode";
BEGIN
  SELECT p."trackingMode" INTO modo
    FROM "products" p
   WHERE p."id" = NEW."productId";

  IF modo = 'SERIALIZED' AND NEW."quantity" <> 1 THEN
    RAISE EXCEPTION
      'Unidade de produto serializado deve ter quantity = 1 (recebido: %). Produto: %',
      NEW."quantity", NEW."productId"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_units_valida_quantidade"
  BEFORE INSERT OR UPDATE OF "quantity", "productId" ON "inventory_units"
  FOR EACH ROW
  EXECUTE FUNCTION "estoque_valida_quantidade_unidade"();

-- ---------------------------------------------------------------------------
-- 4. Busca por número de série completo
-- ---------------------------------------------------------------------------
-- O índice de `serialLast` já existe (vem do schema) e atende a busca pelos
-- últimos dígitos, que é o caso comum. Este atende a busca pelo serial
-- inteiro, digitado ou lido de uma etiqueta.
--
-- Não é UNIQUE de propósito: fabricantes reaproveitam sequências, e peças
-- genéricas às vezes trazem o mesmo número gravado. Duplicidade é tratada como
-- aviso na hora do cadastro, não como impedimento.
CREATE INDEX "inventory_units_serialNumber_idx"
  ON "inventory_units" ("serialNumber")
  WHERE "serialNumber" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Sequencia dos codigos internos
-- ---------------------------------------------------------------------------
-- O codigo interno (EST-00431) e o que vai impresso na etiqueta e dentro do
-- QR Code. Precisa ser unico e nunca reaproveitado.
--
-- Calcular "maior codigo + 1" na aplicacao criaria uma corrida: dois cadastros
-- simultaneos leriam o mesmo maximo e tentariam gravar o mesmo codigo. Uma
-- sequencia do proprio Postgres resolve isso sem lock e sem retry.
CREATE SEQUENCE IF NOT EXISTS "estoque_codigo_interno_seq"
  AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;
