# DataQualiSUS

Aplicação web para avaliação e tratamento controlado da qualidade de datasets de saúde
(unicidade, completude e validade), desenvolvida no Projeto Integrador de COMP0503 —
Engenharia de Software (UFS/DCOMP, 2026.2), equipe P2611.

Este repositório contém o **backend** (API NestJS), os scripts de banco e os testes automatizados.
A especificação de referência está na P1 v1.3 (requisitos) e na P2 v1.1 (análise, projeto e
arquitetura); a organização segue a seção 6.1 da P3.

## Estrutura

| Diretório | Conteúdo |
|-----------|----------|
| `back/` | API em Node.js 22 + NestJS + TypeScript (ADR-001) |
| `back/src/auth/` | Autenticação, sessões, matriz perfil × operação e CSRF (RF007) |
| `back/src/datasets/` | Validação de CSV, armazenamento imutável, versões e exclusão lógica (RF001) |
| `back/src/rules/` | Regras, conjuntos, revisões, motor de regras e vocabulários (RF002) |
| `back/src/simulations/` | Simulação com limite de 60 s em worker threads (RF003) |
| `back/src/treatments/` | Aplicação transacional dos tratamentos (RF004) |
| `back/src/audit/` | Extratos de auditoria somente de inserção e PDF (RF006) |
| `back/src/diagnostics/` | Diagnóstico de qualidade e exportação PDF/XLSX (RF005) |
| `back/src/cli/` | Scripts de migração, contas de demonstração, vocabulário e limpeza de órfãos |
| `database/` | Migrações SQL do PostgreSQL 16 e script de papéis do banco |
| `tests/integracao/` | Testes de integração (CT001–CT007 e CTN aplicáveis) |
| `tests/fixtures/` | Datasets sintéticos com gabaritos por linha e regra e amostra de vocabulário |
| `.github/workflows/` | Integração contínua do backend |

## Pré-requisitos

- Node.js 22 LTS (ou superior) e npm;
- Docker, para subir o PostgreSQL 16 de desenvolvimento e testes.

## Execução local

```bash
docker compose up -d                          # PostgreSQL 16 em localhost:55432
cd back
npm ci
cp ../.env.example .env                       # ajuste URLs, senhas e diretório de armazenamento
npm run db:migrar                             # aplica database/migrations (usa DATABASE_URL_MIGRACAO)
psql "$DATABASE_URL_MIGRACAO" -v senha_app="'troque-esta-senha'" -f ../database/papeis.sql
npm run db:seed                               # contas de demonstração (senhas SEED_SENHA_* do .env)
npm run vocabulario:importar -- --arquivo=<cid10.csv> --nome=CID-10 \
  --origem="<fonte oficial>" --versao="<versão>" --licenca="<condições de uso>"
npm run build && npm run start:prod           # API em http://localhost:3000/api
```

Contas criadas pelo seed: `analista@dataqualisus.local`, `gestor@dataqualisus.local` e
`equipe.tecnica@dataqualisus.local`. Não há autocadastro (P1, seção 8.3).

A sessão usa cookie `HttpOnly`, `Secure` e `SameSite=Lax`. Navegadores aceitam cookies `Secure`
em `http://localhost`; fora disso, a API deve ser servida por HTTPS. Requisições que alteram estado
exigem o cabeçalho `X-CSRF-Token` com o token devolvido em `/api/auth/entrar` ou `/api/auth/sessao`.

## Testes e verificações

```bash
cd back
npm run format:check      # Prettier
npm run lint              # ESLint (src/ e ../tests/)
npm run typecheck         # TypeScript em modo estrito
npm test                  # testes unitários (sem banco)
npm run test:integracao   # testes de integração (PostgreSQL 16 em TEST_DATABASE_URL)
npm run test:cov          # cobertura dos testes unitários
```

Os testes de integração recriam o banco `dataqualisus_teste` a cada execução. Por padrão usam
`postgres://dataqualisus:dataqualisus_dev@localhost:55432/dataqualisus_teste` (o contêiner do
`docker-compose.yml`); para outro servidor, defina `TEST_DATABASE_URL`.

## Rotas da API (prefixo `/api`)

| Método e rota | Perfis | Requisito |
|---------------|--------|-----------|
| `GET /saude` | público | P3, seção 11 |
| `POST /auth/entrar` | público | RF007 |
| `GET /auth/sessao`, `POST /auth/sair` | todos | RF007 |
| `POST /datasets` (multipart: `arquivo`, `nome`, `descricao`, `separador`) | analista | RF001 |
| `GET /datasets`, `GET /datasets/:id`, `PATCH /datasets/:id`, `DELETE /datasets/:id` | analista | RF001 |
| `POST /datasets/:id/versoes`, `GET /datasets/:id/versoes` | analista | RF001 |
| `GET /datasets/:id/versoes/:versaoId/registros?pagina&tamanho` | analista | RF001 |
| `GET /vocabularios`, `GET /vocabularios/:id` | analista | RN02 |
| `GET /catalogo` | analista | RF002 |
| `POST/GET /regras`, `GET/PUT/DELETE /regras/:id`, `GET /regras/:id/revisoes` | analista | RF002 |
| `POST/GET /conjuntos`, `GET/PUT/DELETE /conjuntos/:id`, `GET /conjuntos/:id/revisoes` | analista | RF002 |
| `PUT/DELETE /conjuntos/:id/datasets/:datasetId` | analista | RF002 |
| `POST /simulacoes`, `GET /simulacoes?versaoId`, `GET /simulacoes/:id` | analista | RF003 |
| `POST /tratamentos` (`simulacaoId`, `confirmado: true`) | analista | RF004 |
| `GET /diagnosticos/versoes`, `GET /diagnosticos/versoes/:versaoId` | analista, gestor | RF005 |
| `GET /diagnosticos/versoes/:versaoId/exportar?formato=PDF\|XLSX` | analista, gestor | RF005 |
| `GET /auditoria/datasets`, `GET /auditoria/extratos?datasetId`, `GET /auditoria/extratos/:id` | todos | RF006 |
| `GET /auditoria/extratos/:id/pdf` | todos | RF006 |

Erros seguem o formato `{ statusCode, erro, mensagem, detalhes? }`, com códigos estáveis em `erro`
(por exemplo `CONFIGURACAO_INVALIDA`, `SIMULACAO_JA_APLICADA`, `SEM_AVALIACAO`).

## Dados

Use apenas datasets sintéticos ou abertos, sem informações pessoais identificáveis (P1, seção 10.1).
O diretório de armazenamento dos CSV (`ARMAZENAMENTO_DIR`) fica fora do controle de versão.
