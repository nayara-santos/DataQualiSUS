import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AlteracaoDto, ExtratoDto } from '../../audit/auditoria.tipos';
import { DiagnosticoDto, IndicadorDto } from '../diagnostico.tipos';
import { campo, gerarPdf, paragrafo, secao, titulo } from './pdf-utilitarios';

export enum FormatoExportacao {
  PDF = 'PDF',
  XLSX = 'XLSX',
}

export interface ArquivoExportado {
  nomeArquivo: string;
  tipoConteudo: string;
  conteudo: Buffer;
}

const ROTULO_DIMENSAO: Record<string, string> = {
  UNICIDADE: 'Unicidade',
  COMPLETUDE: 'Completude',
  VALIDADE: 'Validade',
};

function rotuloSituacao(indicador: IndicadorDto): string {
  return indicador.situacao === 'AVALIADA' ? 'Avaliada' : 'Não avaliada';
}

function percentualTexto(indicador: IndicadorDto): string {
  return indicador.percentual === null ? 'Não avaliada' : `${indicador.percentual.toFixed(2)}%`;
}

/**
 * Escreve um valor como célula de texto inerte (RNF005/CTN005): tipo string e formato "@".
 * Nenhuma célula recebe fórmula, mesmo que o conteúdo comece por =, +, - ou @.
 */
function celulaTexto(celula: ExcelJS.Cell, valor: string | number | null | undefined): void {
  celula.numFmt = '@';
  celula.value = valor === null || valor === undefined ? '' : String(valor);
}

/** Quantidade de alterações detalhadas no PDF do extrato; as demais seguem disponíveis na consulta. */
export const LIMITE_ALTERACOES_PDF = 1000;

/**
 * ExportacaoService (P2, seção 2; ADR-007): gera os arquivos a partir dos mesmos DTOs exibidos na
 * interface. Valores vindos do CSV são escritos como texto literal.
 */
@Injectable()
export class ExportacaoService {
  /** exportarDiagnostico(dto, formato): os mesmos dados do DiagnosticoDTO exibido na tela T06. */
  async exportarDiagnostico(dto: DiagnosticoDto, formato: FormatoExportacao): Promise<ArquivoExportado> {
    const base = `diagnostico-${dto.dataset.id}-v${dto.versao.numero}`;
    if (formato === FormatoExportacao.XLSX) {
      return {
        nomeArquivo: `${base}.xlsx`,
        tipoConteudo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        conteudo: await this.diagnosticoXlsx(dto),
      };
    }
    return {
      nomeArquivo: `${base}.pdf`,
      tipoConteudo: 'application/pdf',
      conteudo: await this.diagnosticoPdf(dto),
    };
  }

  private diagnosticoPdf(dto: DiagnosticoDto): Promise<Buffer> {
    return gerarPdf(`Diagnóstico de qualidade ${dto.versao.id}`, (doc) => {
      titulo(doc, 'DataQualiSUS — Diagnóstico de qualidade');
      campo(doc, 'Dataset', `${dto.dataset.nome} (${dto.dataset.id})`);
      campo(doc, 'Versão avaliada', `v${dto.versao.numero} (${dto.versao.id})`);
      campo(doc, 'SHA-256 da versão', dto.versao.hashSha256);
      campo(doc, 'Conjunto de regras', `${dto.conjunto.nome} — revisão ${dto.conjunto.revisao}`);
      campo(doc, 'Simulação', dto.simulacaoId);
      campo(doc, 'Instante da avaliação (UTC)', dto.avaliadoEm);
      campo(doc, 'Total de linhas da versão', dto.totalLinhas);
      campo(
        doc,
        'Cobertura',
        `${dto.cobertura.dimensoesAvaliadas} de ${dto.cobertura.totalDimensoes} dimensões (${dto.cobertura.situacao})`,
      );
      for (const indicador of dto.indicadores) {
        secao(doc, `${ROTULO_DIMENSAO[indicador.dimensao]} — ${percentualTexto(indicador)}`);
        campo(doc, 'Situação', rotuloSituacao(indicador));
        campo(doc, 'Numerador (linhas aprovadas em todas as regras)', indicador.numerador);
        campo(doc, 'Denominador (total de linhas)', indicador.denominador);
        campo(doc, 'Linhas com violação', indicador.linhasComViolacao);
        for (const regra of indicador.regras) {
          paragrafo(
            doc,
            `Regra: ${regra.nome} (rev. ${regra.revisao}) — colunas: ${regra.colunas.join(', ')}`,
          );
        }
        if (indicador.regras.length === 0) {
          paragrafo(doc, 'Nenhuma regra desta dimensão foi executada.');
        }
      }
      doc.moveDown();
      paragrafo(doc, dto.aviso);
    });
  }

  private async diagnosticoXlsx(dto: DiagnosticoDto): Promise<Buffer> {
    const pasta = new ExcelJS.Workbook();
    pasta.creator = 'DataQualiSUS';
    pasta.created = new Date(dto.avaliadoEm);
    const resumo = pasta.addWorksheet('Diagnóstico');
    const identificacao: [string, string | number][] = [
      ['Dataset', dto.dataset.nome],
      ['ID do dataset', dto.dataset.id],
      ['Versão avaliada', dto.versao.numero],
      ['ID da versão', dto.versao.id],
      ['SHA-256 da versão', dto.versao.hashSha256],
      ['Conjunto de regras', dto.conjunto.nome],
      ['Revisão do conjunto', dto.conjunto.revisao],
      ['Simulação', dto.simulacaoId],
      ['Instante da avaliação (UTC)', dto.avaliadoEm],
      ['Total de linhas', dto.totalLinhas],
      ['Dimensões avaliadas', `${dto.cobertura.dimensoesAvaliadas} de ${dto.cobertura.totalDimensoes}`],
      ['Cobertura', dto.cobertura.situacao],
    ];
    identificacao.forEach(([rotulo, valor], i) => {
      celulaTexto(resumo.getCell(i + 1, 1), rotulo);
      celulaTexto(resumo.getCell(i + 1, 2), valor);
    });
    const inicio = identificacao.length + 2;
    [
      'Dimensão',
      'Situação',
      'Percentual',
      'Numerador',
      'Denominador',
      'Linhas com violação',
      'Regras',
    ].forEach((rotulo, c) => celulaTexto(resumo.getCell(inicio, c + 1), rotulo));
    dto.indicadores.forEach((indicador, i) => {
      const linha = inicio + 1 + i;
      celulaTexto(resumo.getCell(linha, 1), ROTULO_DIMENSAO[indicador.dimensao]);
      celulaTexto(resumo.getCell(linha, 2), rotuloSituacao(indicador));
      celulaTexto(
        resumo.getCell(linha, 3),
        indicador.percentual === null ? 'Não avaliada' : indicador.percentual.toFixed(2),
      );
      celulaTexto(resumo.getCell(linha, 4), indicador.numerador);
      celulaTexto(resumo.getCell(linha, 5), indicador.denominador);
      celulaTexto(resumo.getCell(linha, 6), indicador.linhasComViolacao);
      celulaTexto(resumo.getCell(linha, 7), indicador.regras.map((r) => r.nome).join('; '));
    });
    celulaTexto(resumo.getCell(inicio + 5, 1), dto.aviso);
    resumo.getColumn(1).width = 30;
    resumo.getColumn(2).width = 45;
    resumo.getColumn(7).width = 50;

    const regras = pasta.addWorksheet('Regras');
    ['Dimensão', 'Regra', 'ID da regra', 'Revisão', 'Colunas'].forEach((rotulo, c) =>
      celulaTexto(regras.getCell(1, c + 1), rotulo),
    );
    let linha = 2;
    for (const indicador of dto.indicadores) {
      for (const regra of indicador.regras) {
        celulaTexto(regras.getCell(linha, 1), ROTULO_DIMENSAO[indicador.dimensao]);
        celulaTexto(regras.getCell(linha, 2), regra.nome);
        celulaTexto(regras.getCell(linha, 3), regra.regraId);
        celulaTexto(regras.getCell(linha, 4), regra.revisao);
        celulaTexto(regras.getCell(linha, 5), regra.colunas.join(', '));
        linha += 1;
      }
    }
    return Buffer.from(await pasta.xlsx.writeBuffer());
  }

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
