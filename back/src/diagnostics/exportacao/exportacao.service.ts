import { Injectable } from '@nestjs/common';
import { AlteracaoDto, ExtratoDto } from '../../audit/auditoria.tipos';
import { campo, gerarPdf, paragrafo, secao, titulo } from './pdf-utilitarios';

/** Quantidade de alterações detalhadas no PDF do extrato; as demais seguem disponíveis na consulta. */
export const LIMITE_ALTERACOES_PDF = 1000;

/**
 * ExportacaoService (P2, seção 2; ADR-007): gera os arquivos a partir dos mesmos DTOs exibidos na
 * interface. Valores vindos do CSV são escritos como texto literal.
 */
@Injectable()
export class ExportacaoService {
  /** exportarExtratoPdf(extrato): campos da RN03 e alterações por linha. */
  exportarExtratoPdf(extrato: ExtratoDto, alteracoes: AlteracaoDto[]): Promise<Buffer> {
    return gerarPdf(`Extrato de auditoria ${extrato.id}`, (doc) => {
      titulo(doc, 'DataQualiSUS — Extrato de auditoria');
      campo(doc, 'Extrato', extrato.id);
      campo(doc, 'Operação', extrato.operacao);
      campo(doc, 'Instante (UTC)', extrato.instanteUtc);
      campo(doc, 'Usuário (ID técnico)', extrato.usuarioId);
      campo(doc, 'Dataset', `${extrato.dataset.nome} (${extrato.dataset.id}) — ${extrato.dataset.situacao}`);
      campo(doc, 'Simulação de origem', extrato.simulacaoId);

      secao(doc, 'Versões');
      campo(
        doc,
        'Entrada',
        `v${extrato.versaoEntrada.numero} (${extrato.versaoEntrada.id}) SHA-256 ${extrato.versaoEntrada.hashSha256}`,
      );
      campo(
        doc,
        'Saída',
        `v${extrato.versaoSaida.numero} (${extrato.versaoSaida.id}) SHA-256 ${extrato.versaoSaida.hashSha256}`,
      );

      secao(doc, 'Regras e ações aplicadas');
      campo(doc, 'Conjunto', `${extrato.conjunto.id} — revisão ${extrato.conjunto.revisao}`);
      for (const regra of extrato.revisoesRegras) {
        paragrafo(doc, `${regra.ordem}. ${regra.nome} (${regra.regraId}) — revisão ${regra.revisao}`);
      }
      for (const acao of extrato.acoesAplicadas) {
        paragrafo(
          doc,
          `Ação ${acao.ordem}: ${acao.acao}${acao.coluna ? ` na coluna "${acao.coluna}"` : ''} (regra ${acao.regraId})`,
        );
      }

      secao(doc, 'Totais (cada linha contada uma vez)');
      campo(doc, 'Linhas alteradas', extrato.totalLinhasAlteradas);
      campo(doc, 'Linhas removidas', extrato.totalLinhasRemovidas);
      campo(doc, 'Total de linhas afetadas', extrato.totalLinhasAfetadas);
      campo(doc, 'Registros de alteração', extrato.totalAlteracoes);

      secao(doc, 'Alterações por linha (versão de entrada)');
      for (const a of alteracoes.slice(0, LIMITE_ALTERACOES_PDF)) {
        const detalhe =
          a.tipo === 'REMOCAO'
            ? `removida por repetir a linha ${a.linhaRepresentante}`
            : `coluna "${a.coluna}": "${a.valorAnterior}" -> "${a.valorNovo}"`;
        paragrafo(
          doc,
          `Linha ${a.linha} — ${a.acao} — ${detalhe} (regra ${a.regraId}, rev. ${a.regraRevisao})`,
        );
      }
      if (extrato.totalAlteracoes > Math.min(alteracoes.length, LIMITE_ALTERACOES_PDF)) {
        paragrafo(
          doc,
          `… ${extrato.totalAlteracoes - Math.min(alteracoes.length, LIMITE_ALTERACOES_PDF)} alterações adicionais disponíveis na consulta do extrato.`,
        );
      }
      doc.moveDown();
      paragrafo(
        doc,
        'Extrato gerado a partir do registro persistido; registros de auditoria não são editáveis pela aplicação.',
      );
    });
  }
}
