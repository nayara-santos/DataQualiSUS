# DataQualiSUS

Aplicação web para avaliação e tratamento controlado da qualidade de datasets de saúde
(unicidade, completude e validade), desenvolvida no Projeto Integrador de COMP0503 —
Engenharia de Software (UFS/DCOMP, 2026.2), equipe P2611.

Este repositório contém o backend (API NestJS), os scripts de banco e os testes automatizados.
A especificação de referência está na P1 v1.3 (requisitos) e na P2 v1.1 (análise, projeto e
arquitetura); a organização segue a seção 6.1 da P3.

## Estrutura

| Diretório | Conteúdo |
|-----------|----------|
| `back/` | API em Node.js 22 + NestJS + TypeScript (ADR-001) |
| `back/src/auth/` | Autenticação, sessões e autorização por perfil (RF007) |
| `back/src/datasets/` | Importação, validação, versionamento e exclusão lógica (RF001) |
| `back/src/rules/` | Regras, conjuntos, motor de regras e vocabulários (RF002) |
| `back/src/simulations/` | Simulação com limite de 60 s em worker threads (RF003) |
| `back/src/treatments/` | Aplicação transacional dos tratamentos (RF004) |
| `back/src/audit/` | Extratos de auditoria somente de inserção (RF006) |
| `back/src/diagnostics/` | Diagnóstico de qualidade e exportação PDF/XLSX (RF005) |
| `database/` | Migrações SQL do PostgreSQL 16 e script de papéis |
| `tests/` | Testes de integração (CT001–CT007, CTN) e datasets sintéticos com gabaritos |

## Execução local

Pré-requisitos: Node.js 22 LTS (ou superior), npm e Docker (para o PostgreSQL 16).

```bash
docker compose up -d                 # PostgreSQL 16 em localhost:55432
cd back
npm install
cp ../.env.example .env              # ajuste DATABASE_URL, senhas de seed etc.
npm run db:migrar                    # aplica database/migrations
npm run start:dev                    # API em http://localhost:3000/api
```

Verificação de disponibilidade: `GET /api/saude`.
