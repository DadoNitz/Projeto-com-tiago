-- Remove build_suggestions: tabela criada "preparada para o futuro" e nunca
-- usada por nenhuma linha de codigo.
--
-- A decisao nao e so de limpeza. Sugestao de montagem e calculada ao vivo a
-- partir do estoque atual, e envelhece no instante em que uma peca e vendida.
-- Uma sugestao gravada citando uma GPU que ja saiu do estoque e uma afirmacao
-- falsa com aparencia de dado — o oposto do que o resto do sistema faz.
--
-- A tabela estava vazia (verificado antes da remocao). Nenhum dado se perde.

-- DropTable
DROP TABLE "build_suggestions";

