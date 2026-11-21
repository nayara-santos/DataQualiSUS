-- F06 · RF002 · ADR-002/ADR-005 · MOD-04/MOD-12/MOD-16: regras e conjuntos com revisões imutáveis.

CREATE TABLE regra (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 200),
  descricao       TEXT NOT NULL DEFAULT '',
  dimensao        TEXT NOT NULL CHECK (dimensao IN ('UNICIDADE', 'COMPLETUDE', 'VALIDADE')),
  revisao_atual   INTEGER NOT NULL DEFAULT 1 CHECK (revisao_atual >= 1),
  situacao        TEXT NOT NULL DEFAULT 'ATIVO' CHECK (situacao IN ('ATIVO', 'EXCLUIDO_LOGICAMENTE')),
  criado_por      UUID NOT NULL REFERENCES usuario (id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada edição gera uma revisão; revisões antigas permanecem referenciáveis por simulações e extratos.
CREATE TABLE regra_revisao (
  regra_id      UUID NOT NULL REFERENCES regra (id),
  revisao       INTEGER NOT NULL CHECK (revisao >= 1),
  nome          TEXT NOT NULL,
  descricao     TEXT NOT NULL DEFAULT '',
  dimensao      TEXT NOT NULL CHECK (dimensao IN ('UNICIDADE', 'COMPLETUDE', 'VALIDADE')),
  configuracao  JSONB NOT NULL,
  criado_por    UUID NOT NULL REFERENCES usuario (id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (regra_id, revisao)
);

CREATE TABLE conjunto_regras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 200),
  descricao       TEXT NOT NULL DEFAULT '',
  revisao_atual   INTEGER NOT NULL DEFAULT 1 CHECK (revisao_atual >= 1),
  situacao        TEXT NOT NULL DEFAULT 'ATIVO' CHECK (situacao IN ('ATIVO', 'EXCLUIDO_LOGICAMENTE')),
  criado_por      UUID NOT NULL REFERENCES usuario (id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- itens: [{ "regraId", "regraRevisao", "ordem" }] na ordem explícita de execução.
CREATE TABLE conjunto_revisao (
  conjunto_id   UUID NOT NULL REFERENCES conjunto_regras (id),
  revisao       INTEGER NOT NULL CHECK (revisao >= 1),
  nome          TEXT NOT NULL,
  descricao     TEXT NOT NULL DEFAULT '',
  itens         JSONB NOT NULL,
  motivo        TEXT NOT NULL,
  criado_por    UUID NOT NULL REFERENCES usuario (id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conjunto_id, revisao)
);

CREATE INDEX conjunto_revisao_itens_idx ON conjunto_revisao USING gin (itens jsonb_path_ops);

CREATE TABLE conjunto_dataset (
  conjunto_id    UUID NOT NULL REFERENCES conjunto_regras (id),
  dataset_id     UUID NOT NULL REFERENCES dataset (id),
  associado_por  UUID NOT NULL REFERENCES usuario (id),
  associado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conjunto_id, dataset_id)
);

CREATE FUNCTION rejeitar_alteracao_revisao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Revisões são imutáveis: % não permitido em %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER regra_revisao_imutavel
  BEFORE UPDATE OR DELETE ON regra_revisao
  FOR EACH ROW EXECUTE FUNCTION rejeitar_alteracao_revisao();

CREATE TRIGGER conjunto_revisao_imutavel
  BEFORE UPDATE OR DELETE ON conjunto_revisao
  FOR EACH ROW EXECUTE FUNCTION rejeitar_alteracao_revisao();
