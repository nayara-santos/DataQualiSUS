import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { IndicadorDto } from './diagnostico.tipos';

export interface DiagnosticoRegistro {
  id: string;
  simulacao_id: string;
  versao_id: string;
  total_linhas: number;
  cobertura: number;
  avaliado_em: Date;
}

@Injectable()
export class DiagnosticoRepository {
  constructor(private readonly banco: DatabaseService) {}

  /** Materializa o diagnóstico de uma avaliação uma única vez (idempotente por simulação). */
  async registrar(dados: {
    simulacaoId: string;
    versaoId: string;
    totalLinhas: number;
    cobertura: number;
    avaliadoEm: Date;
    indicadores: IndicadorDto[];
  }): Promise<void> {
    await this.banco.transacao(async (tx) => {
      const criado = await this.banco.consultarUm<{ id: string }>(
        `INSERT INTO diagnostico (simulacao_id, versao_id, total_linhas, cobertura, avaliado_em)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (simulacao_id) DO NOTHING RETURNING id`,
        [dados.simulacaoId, dados.versaoId, dados.totalLinhas, dados.cobertura, dados.avaliadoEm],
        tx,
      );
      if (!criado) {
        return;
      }
      for (const indicador of dados.indicadores) {
        await this.banco.consultar(
          `INSERT INTO indicador (diagnostico_id, dimensao, situacao, numerador, denominador, percentual,
             linhas_com_violacao, regras)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            criado.id,
            indicador.dimensao,
            indicador.situacao,
            indicador.numerador,
            indicador.denominador,
            indicador.percentual,
            indicador.linhasComViolacao,
            JSON.stringify(indicador.regras),
          ],
          tx,
        );
      }
    });
  }

  buscarPorSimulacao(simulacaoId: string): Promise<DiagnosticoRegistro | null> {
    return this.banco.consultarUm<DiagnosticoRegistro>(
      'SELECT id, simulacao_id, versao_id, total_linhas, cobertura, avaliado_em FROM diagnostico WHERE simulacao_id = $1',
      [simulacaoId],
    );
  }

  /** Avaliação mais recente da versão entre as que produziram resultado (concluídas ou não mais vigentes). */
  ultimaAvaliacao(versaoId: string) {
    return this.banco.consultarUm<{
      id: string;
      status: string;
      conjunto_id: string;
      conjunto_revisao: number;
    }>(
      `SELECT id, status, conjunto_id, conjunto_revisao FROM simulacao
        WHERE versao_id = $1 AND status IN ('CONCLUIDA', 'CONSOLIDADA', 'INVALIDADA') AND total_linhas IS NOT NULL
        ORDER BY concluida_em DESC NULLS LAST, aceita_em DESC LIMIT 1`,
      [versaoId],
    );
  }

  /** Versões de datasets ativos, para o gestor selecionar a versão avaliada (UC-07, passo 1). */
  listarVersoesAvaliaveis() {
    return this.banco.consultar<{
      dataset_id: string;
      dataset_nome: string;
      versao_id: string;
      numero: number;
      criado_em: Date;
      possui_avaliacao: boolean;
    }>(
      `SELECT d.id AS dataset_id, d.nome AS dataset_nome, v.id AS versao_id, v.numero, v.criado_em,
              EXISTS (SELECT 1 FROM simulacao s WHERE s.versao_id = v.id AND s.status IN ('CONCLUIDA', 'CONSOLIDADA'))
                AS possui_avaliacao
         FROM dataset d JOIN versao_dataset v ON v.dataset_id = d.id
        WHERE d.situacao = 'ATIVO'
        ORDER BY d.nome, v.numero`,
    );
  }
}
