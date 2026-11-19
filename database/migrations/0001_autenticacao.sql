-- F01 · RF007 · ADR-006: contas previamente cadastradas e sessões mantidas no servidor.

CREATE TABLE usuario (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL,
  senha_hash  TEXT NOT NULL,                     -- bcrypt com salt aleatório (RNF003)
  papel       TEXT NOT NULL CHECK (papel IN ('ANALISTA', 'GESTOR', 'EQUIPE_TECNICA')),
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX usuario_email_unico ON usuario (lower(email));

CREATE TABLE sessao (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash        TEXT NOT NULL UNIQUE,          -- SHA-256 do token do cookie; o token não é guardado
  usuario_id        UUID NOT NULL REFERENCES usuario (id),
  papel             TEXT NOT NULL CHECK (papel IN ('ANALISTA', 'GESTOR', 'EQUIPE_TECNICA')),
  csrf_token        TEXT NOT NULL,
  criada_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em         TIMESTAMPTZ NOT NULL,
  ultimo_acesso_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrada_em      TIMESTAMPTZ
);

CREATE INDEX sessao_usuario_idx ON sessao (usuario_id);
