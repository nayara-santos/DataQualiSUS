-- F08 · RF006 · RN03 · ADR-004/ADR-006 · MOD-02/MOD-08: extratos somente de inserção.

CREATE TABLE extrato_auditoria (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao               TEXT NOT NULL CHECK (operacao IN ('TRATAMENTO')),
  simulacao_id           UUID NOT NULL UNIQUE REFERENCES simulacao (id),   -- um extrato por simulação aplicada
  dataset_id             UUID NOT NULL REFERENCES dataset (id),
  usuario_id             UUID NOT NULL REFERENCES usuario (id),            -- somente o ID técnico (D04)
  instante_utc           TIMESTAMPTZ NOT NULL DEFAULT now(),
  versao_entrada_id      UUID NOT NULL REFERENCES versao_dataset (id),
  versao_saida_id        UUID NOT NULL UNIQUE REFERENCES versao_dataset (id),
  conjunto_id            UUID NOT NULL REFERENCES conjunto_regras (id),
  conjunto_revisao       INTEGER NOT NULL,
  revisoes_regras        JSONB NOT NULL,
  acoes_aplicadas        JSONB NOT NULL,
  total_linhas_alteradas INTEGER NOT NULL CHECK (total_linhas_alteradas >= 0),
  total_linhas_removidas INTEGER NOT NULL CHECK (total_linhas_removidas >= 0),
  total_linhas_afetadas  INTEGER NOT NULL CHECK (total_linhas_afetadas = total_linhas_alteradas + total_linhas_removidas),
  CHECK (versao_entrada_id <> versao_saida_id)
);

CREATE INDEX extrato_auditoria_dataset_idx ON extrato_auditoria (dataset_id, instante_utc DESC);

CREATE TABLE alteracao_registro (
  id                   BIGSERIAL PRIMARY KEY,
  extrato_id           UUID NOT NULL REFERENCES extrato_auditoria (id),
  linha                INTEGER NOT NULL CHECK (linha >= 1),          -- linha na versão de entrada
  tipo                 TEXT NOT NULL CHECK (tipo IN ('ATUALIZACAO', 'REMOCAO')),
  regra_id             UUID NOT NULL,
  regra_revisao        INTEGER NOT NULL,
  acao                 TEXT NOT NULL CHECK (acao IN ('APARAR_ESPACOS', 'CONVERTER_CAIXA', 'PREENCHER_VAZIO', 'REMOVER_REPETICOES')),
  coluna               TEXT,
  valor_anterior       TEXT,
  valor_novo           TEXT,
  linha_representante  INTEGER,
  FOREIGN KEY (regra_id, regra_revisao) REFERENCES regra_revisao (regra_id, revisao)
);

CREATE INDEX alteracao_registro_extrato_idx ON alteracao_registro (extrato_id, linha);

-- Extratos não são editáveis nem removíveis pela aplicação (RF006): gatilho de rejeição.
CREATE FUNCTION rejeitar_alteracao_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria são somente de inserção: % não permitido em %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER extrato_auditoria_somente_insercao
  BEFORE UPDATE OR DELETE ON extrato_auditoria
  FOR EACH ROW EXECUTE FUNCTION rejeitar_alteracao_auditoria();

CREATE TRIGGER alteracao_registro_somente_insercao
  BEFORE UPDATE OR DELETE ON alteracao_registro
  FOR EACH ROW EXECUTE FUNCTION rejeitar_alteracao_auditoria();
