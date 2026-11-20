-- F03/F04 · RF001 · RN04 · ADR-003/ADR-005: datasets, versões imutáveis e exclusão lógica.

CREATE TABLE dataset (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 200),
  descricao     TEXT NOT NULL DEFAULT '' CHECK (length(descricao) <= 2000),
  situacao      TEXT NOT NULL DEFAULT 'ATIVO' CHECK (situacao IN ('ATIVO', 'EXCLUIDO_LOGICAMENTE')),
  criado_por    UUID NOT NULL REFERENCES usuario (id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  excluido_por  UUID REFERENCES usuario (id),
  excluido_em   TIMESTAMPTZ,
  CHECK ((situacao = 'EXCLUIDO_LOGICAMENTE') = (excluido_em IS NOT NULL))
);

CREATE INDEX dataset_situacao_idx ON dataset (situacao);

-- Cada versão referencia um arquivo CSV imutável nomeado pelo SHA-256 do conteúdo (ADR-003).
CREATE TABLE versao_dataset (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id              UUID NOT NULL REFERENCES dataset (id),
  numero                  INTEGER NOT NULL CHECK (numero >= 1),
  versao_predecessora_id  UUID REFERENCES versao_dataset (id),
  origem                  TEXT NOT NULL CHECK (origem IN ('IMPORTACAO', 'TRATAMENTO')),
  hash_sha256             CHAR(64) NOT NULL CHECK (hash_sha256 ~ '^[0-9a-f]{64}$'),
  caminho_arquivo         TEXT NOT NULL,
  nome_arquivo_original   TEXT,
  tamanho_bytes           BIGINT NOT NULL CHECK (tamanho_bytes BETWEEN 1 AND 10000000),
  separador               TEXT NOT NULL CHECK (separador IN (',', ';')),
  colunas                 JSONB NOT NULL,
  total_registros         INTEGER NOT NULL CHECK (total_registros BETWEEN 1 AND 100000),
  total_colunas           INTEGER NOT NULL CHECK (total_colunas BETWEEN 1 AND 100),
  criado_por              UUID NOT NULL REFERENCES usuario (id),
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, numero),
  CHECK ((numero = 1) = (versao_predecessora_id IS NULL))
);

CREATE INDEX versao_dataset_hash_idx ON versao_dataset (hash_sha256);

-- Versões são somente inseridas (ADR-005): não existe atualização nem remoção de versão.
CREATE FUNCTION rejeitar_alteracao_versao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Versões de dataset são imutáveis: % não permitido em versao_dataset', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER versao_dataset_imutavel
  BEFORE UPDATE OR DELETE ON versao_dataset
  FOR EACH ROW EXECUTE FUNCTION rejeitar_alteracao_versao();
