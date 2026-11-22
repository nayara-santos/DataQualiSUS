# Banco de dados (PostgreSQL 16)

As migrações ficam em `migrations/` e são aplicadas em ordem pelo comando `npm run db:migrar`
(executado em `back/`), que registra cada arquivo aplicado na tabela `schema_migracoes`.

| Migração | Funcionalidade | Tabelas |
|----------|----------------|---------|
| `0001_autenticacao.sql` | F01 | `usuario`, `sessao` |
| `0002_datasets.sql` | F03/F04 | `dataset`, `versao_dataset` (+ gatilho de imutabilidade) |
| `0003_vocabularios.sql` | F05 | `vocabulario`, `vocabulario_codigo` |
| `0004_regras.sql` | F06 | `regra`, `regra_revisao`, `conjunto_regras`, `conjunto_revisao`, `conjunto_dataset` (+ gatilhos) |
| `0005_simulacoes.sql` | F07 | `simulacao`, `resultado_regra` |
| `0006_auditoria.sql` | F08 | `extrato_auditoria`, `alteracao_registro` (+ gatilhos somente de inserção) |
| `0007_diagnosticos.sql` | F10 | `diagnostico`, `indicador` |

O conteúdo dos CSV não é armazenado em colunas: cada versão é um arquivo imutável nomeado pelo
SHA-256, guardado no diretório `ARMAZENAMENTO_DIR` (ADR-003).

## Papel da aplicação

`papeis.sql` cria o usuário `dataqualisus_app`, usado pela API em `DATABASE_URL`, com privilégios
mínimos (ADR-006): `SELECT`/`INSERT` em todas as tabelas, `UPDATE` apenas nas tabelas com mudança
de estado prevista e nenhum `UPDATE`/`DELETE`/`TRUNCATE` em versões, revisões e auditoria. Execute
como dono do esquema, depois das migrações:

```bash
psql "$DATABASE_URL_MIGRACAO" -v senha_app="'troque-esta-senha'" -f database/papeis.sql
```

O dono do esquema (usado só nas migrações) mantém acesso administrativo; esse acesso deve ser
restrito à equipe responsável pela infraestrutura e documentado (ADR-006, Q04).
