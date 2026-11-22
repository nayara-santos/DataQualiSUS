-- Papel de banco da aplicação com privilégios mínimos (ADR-006).
-- Executar como administrador do banco, depois das migrações, informando a senha por variável:
--   psql "$DATABASE_URL_MIGRACAO" -v senha_app="'troque-esta-senha'" -f database/papeis.sql
-- O acesso administrativo à infraestrutura (dono do esquema) deve ser restrito e documentado.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dataqualisus_app') THEN
    CREATE ROLE dataqualisus_app LOGIN;
  END IF;
END
$$;

ALTER ROLE dataqualisus_app PASSWORD :senha_app;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dataqualisus_app;
GRANT USAGE ON SCHEMA public TO dataqualisus_app;

-- Leitura geral e inserção nas tabelas da aplicação.
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO dataqualisus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dataqualisus_app;

-- Atualizações permitidas apenas onde há mudança de estado prevista (metadados, situação,
-- revisão atual, sessão e status de simulação). Versões, revisões e auditoria não recebem UPDATE.
GRANT UPDATE ON usuario, sessao, dataset, regra, conjunto_regras, simulacao TO dataqualisus_app;

-- Remoção física só existe para a associação conjunto↔dataset (desassociação).
GRANT DELETE ON conjunto_dataset TO dataqualisus_app;

-- Tabelas de auditoria: somente INSERT e SELECT (o gatilho também rejeita UPDATE/DELETE).
REVOKE UPDATE, DELETE, TRUNCATE ON extrato_auditoria, alteracao_registro FROM dataqualisus_app;
REVOKE UPDATE, DELETE, TRUNCATE ON versao_dataset, regra_revisao, conjunto_revisao FROM dataqualisus_app;
