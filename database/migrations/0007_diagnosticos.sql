-- F10 · RF005 · RN01 · MOD-14: diagnóstico composto por exatamente três indicadores.

CREATE TABLE diagnostico (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulacao_id  UUID NOT NULL UNIQUE REFERENCES simulacao (id),
  versao_id     UUID NOT NULL REFERENCES versao_dataset (id),
  total_linhas  INTEGER NOT NULL CHECK (total_linhas >= 1),
  cobertura     INTEGER NOT NULL CHECK (cobertura BETWEEN 0 AND 3),
  avaliado_em   TIMESTAMPTZ NOT NULL,
  calculado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE indicador (
  diagnostico_id       UUID NOT NULL REFERENCES diagnostico (id),
  dimensao             TEXT NOT NULL CHECK (dimensao IN ('UNICIDADE', 'COMPLETUDE', 'VALIDADE')),
  situacao             TEXT NOT NULL CHECK (situacao IN ('AVALIADA', 'NAO_AVALIADA')),
  numerador            INTEGER,
  denominador          INTEGER,
  percentual           NUMERIC(5, 2),
  linhas_com_violacao  INTEGER,
  regras               JSONB NOT NULL,
  PRIMARY KEY (diagnostico_id, dimensao),
  -- "Não avaliada" não recebe percentual fictício (RF005).
  CHECK ((situacao = 'NAO_AVALIADA') = (percentual IS NULL AND numerador IS NULL AND denominador IS NULL))
);
