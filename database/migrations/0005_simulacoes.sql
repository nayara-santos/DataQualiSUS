-- F07 · RF003 · ADR-005/ADR-008 · MOD-06/MOD-12/MOD-16: simulações com configuração executada.

CREATE TABLE simulacao (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  versao_id                  UUID NOT NULL REFERENCES versao_dataset (id),
  dataset_id                 UUID NOT NULL REFERENCES dataset (id),
  conjunto_id                UUID NOT NULL REFERENCES conjunto_regras (id),
  conjunto_revisao           INTEGER NOT NULL,
  configuracao_executada     JSONB NOT NULL,     -- preservada: edições posteriores não a reescrevem
  status                     TEXT NOT NULL CHECK (status IN
                               ('EM_EXECUCAO', 'CONCLUIDA', 'TEMPO_ESGOTADO', 'FALHA', 'INVALIDADA', 'CONSOLIDADA')),
  mensagem                   TEXT,
  limite_ms                  INTEGER NOT NULL CHECK (limite_ms > 0),
  aceita_em                  TIMESTAMPTZ NOT NULL DEFAULT now(),   -- início da contagem do limite
  concluida_em               TIMESTAMPTZ,
  invalidada_em              TIMESTAMPTZ,
  consolidada_em             TIMESTAMPTZ,
  hash_entrada_conferido     CHAR(64),
  total_linhas               INTEGER,
  total_linhas_com_violacao  INTEGER,
  total_previsto_alteradas   INTEGER,
  total_previsto_removidas   INTEGER,
  previa                     JSONB,
  criado_por                 UUID NOT NULL REFERENCES usuario (id),
  FOREIGN KEY (conjunto_id, conjunto_revisao) REFERENCES conjunto_revisao (conjunto_id, revisao)
);

CREATE INDEX simulacao_versao_idx ON simulacao (versao_id, aceita_em DESC);
CREATE INDEX simulacao_conjunto_status_idx ON simulacao (conjunto_id, status);

CREATE TABLE resultado_regra (
  simulacao_id          UUID NOT NULL REFERENCES simulacao (id),
  ordem                 INTEGER NOT NULL,
  regra_id              UUID NOT NULL,
  regra_revisao         INTEGER NOT NULL,
  nome                  TEXT NOT NULL,
  dimensao              TEXT NOT NULL CHECK (dimensao IN ('UNICIDADE', 'COMPLETUDE', 'VALIDADE')),
  colunas               JSONB NOT NULL,
  total_avaliados       INTEGER NOT NULL,
  linhas_violadas       INTEGER[] NOT NULL,
  total_violacoes       INTEGER NOT NULL,
  percentual_aprovacao  NUMERIC(5, 2) NOT NULL,
  acao                  TEXT,
  linhas_previstas      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (simulacao_id, regra_id),
  FOREIGN KEY (regra_id, regra_revisao) REFERENCES regra_revisao (regra_id, revisao)
);
