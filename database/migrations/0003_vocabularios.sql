-- F05 · RN02 · ADR-009: vocabulários oficiais versionados, importados por script da equipe.

CREATE TABLE vocabulario (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT NOT NULL CHECK (length(btrim(nome)) > 0),
  origem         TEXT NOT NULL CHECK (length(btrim(origem)) > 0),
  versao         TEXT NOT NULL CHECK (length(btrim(versao)) > 0),
  licenca        TEXT NOT NULL CHECK (length(btrim(licenca)) > 0),
  hash_arquivo   CHAR(64) NOT NULL CHECK (hash_arquivo ~ '^[0-9a-f]{64}$'),
  total_codigos  INTEGER NOT NULL CHECK (total_codigos > 0),
  importado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nome, versao)
);

CREATE TABLE vocabulario_codigo (
  vocabulario_id  UUID NOT NULL REFERENCES vocabulario (id),
  codigo          TEXT NOT NULL CHECK (length(codigo) > 0),   -- texto: preserva zeros à esquerda
  descricao       TEXT,
  PRIMARY KEY (vocabulario_id, codigo)
);
