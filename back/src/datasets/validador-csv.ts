import { Injectable } from '@nestjs/common';
import { CsvError, parse } from 'csv-parse';
import { Readable } from 'stream';
import { LIMITE_BYTES, LIMITE_COLUNAS, LIMITE_REGISTROS, Separador } from './limites-csv';

export type MotivoRejeicaoCsv =
  | 'EXTENSAO_INVALIDA'
  | 'ARQUIVO_VAZIO'
  | 'LIMITE_BYTES_EXCEDIDO'
  | 'CODIFICACAO_INVALIDA'
  | 'ESTRUTURA_INVALIDA'
  | 'ESTRUTURA_INCONSISTENTE'
  | 'CABECALHO_INVALIDO'
  | 'CABECALHO_DUPLICADO'
  | 'LIMITE_COLUNAS_EXCEDIDO'
  | 'SEM_REGISTROS'
  | 'LIMITE_REGISTROS_EXCEDIDO';

export type ResultadoValidacao =
  | { valido: true; colunas: string[]; totalRegistros: number; tamanhoBytes: number }
  | { valido: false; motivo: MotivoRejeicaoCsv; mensagem: string };

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const decodificador = new TextDecoder('utf-8', { fatal: true });

function rejeitar(motivo: MotivoRejeicaoCsv, mensagem: string): ResultadoValidacao {
  return { valido: false, motivo, mensagem };
}

/** Remove apenas quebras de linha finais, comuns em editores, sem descartar registros. */
function removerQuebrasFinais(texto: string): string {
  return texto.replace(/(\r?\n)+$/, '');
}

/**
 * ValidadorCsv (P2, seção 2): aplica codificação, cabeçalho, estrutura e limites da P1, seção 8.3.
 * O conteúdo é tratado apenas como dado (RNF005): nenhum valor é interpretado ou executado.
 */
@Injectable()
export class ValidadorCsv {
  async validar(
    conteudo: Buffer,
    opcoes: { separador: Separador; nomeArquivo?: string },
  ): Promise<ResultadoValidacao> {
    if (opcoes.nomeArquivo !== undefined && !/\.csv$/i.test(opcoes.nomeArquivo.trim())) {
      return rejeitar('EXTENSAO_INVALIDA', 'O arquivo deve ter a extensão .csv.');
    }
    if (conteudo.length === 0) {
      return rejeitar('ARQUIVO_VAZIO', 'O arquivo está vazio.');
    }
    if (conteudo.length > LIMITE_BYTES) {
      return rejeitar(
        'LIMITE_BYTES_EXCEDIDO',
        `O arquivo excede o limite de ${LIMITE_BYTES.toLocaleString('pt-BR')} bytes.`,
      );
    }
    let texto: string;
    try {
      const semBom = conteudo.subarray(0, 3).equals(BOM) ? conteudo.subarray(3) : conteudo;
      texto = decodificador.decode(semBom);
    } catch {
      return rejeitar('CODIFICACAO_INVALIDA', 'O arquivo não está codificado em UTF-8.');
    }
    if (texto.includes('\u0000')) {
      return rejeitar('CODIFICACAO_INVALIDA', 'O arquivo contém caracteres nulos e não é um CSV de texto.');
    }
    texto = removerQuebrasFinais(texto);
    if (texto.length === 0) {
      return rejeitar('ARQUIVO_VAZIO', 'O arquivo não contém cabeçalho nem registros.');
    }
    return this.validarEstrutura(texto, opcoes.separador, conteudo.length);
  }

  private validarEstrutura(
    texto: string,
    separador: Separador,
    tamanhoBytes: number,
  ): Promise<ResultadoValidacao> {
    return new Promise((resolver) => {
      let colunas: string[] | null = null;
      let totalRegistros = 0;
      let concluido = false;
      const finalizar = (resultado: ResultadoValidacao): void => {
        if (!concluido) {
          concluido = true;
          resolver(resultado);
        }
      };
      const leitor = parse({
        delimiter: separador,
        quote: '"',
        escape: '"',
        relax_column_count: false,
        relax_quotes: false,
        skip_empty_lines: false,
      });
      leitor.on('data', (registro: string[]) => {
        if (concluido) {
          return;
        }
        if (!colunas) {
          const erroCabecalho = this.validarCabecalho(registro);
          if (erroCabecalho) {
            finalizar(erroCabecalho);
            leitor.destroy();
            return;
          }
          colunas = registro;
          return;
        }
        totalRegistros += 1;
        if (totalRegistros > LIMITE_REGISTROS) {
          finalizar(
            rejeitar(
              'LIMITE_REGISTROS_EXCEDIDO',
              `O arquivo excede o limite de ${LIMITE_REGISTROS.toLocaleString('pt-BR')} registros de dados.`,
            ),
          );
          leitor.destroy();
        }
      });
      leitor.on('error', (erro: CsvError) => {
        if (
          erro.code === 'CSV_RECORD_INCONSISTENT_FIELDS_LENGTH' ||
          erro.code === 'CSV_RECORD_INCONSISTENT_COLUMNS'
        ) {
          finalizar(
            rejeitar(
              'ESTRUTURA_INCONSISTENTE',
              `Registro na linha ${erro.lines ?? '?'} com número de campos diferente do cabeçalho.`,
            ),
          );
        } else {
          finalizar(
            rejeitar('ESTRUTURA_INVALIDA', `Estrutura CSV inválida próximo à linha ${erro.lines ?? '?'}.`),
          );
        }
      });
      leitor.on('end', () => {
        if (!colunas) {
          finalizar(rejeitar('ARQUIVO_VAZIO', 'O arquivo não contém cabeçalho.'));
        } else if (totalRegistros === 0) {
          finalizar(rejeitar('SEM_REGISTROS', 'O arquivo não contém registros de dados.'));
        } else {
          finalizar({ valido: true, colunas, totalRegistros, tamanhoBytes });
        }
      });
      Readable.from([texto]).pipe(leitor);
    });
  }

  private validarCabecalho(cabecalho: string[]): ResultadoValidacao | null {
    if (cabecalho.length > LIMITE_COLUNAS) {
      return rejeitar('LIMITE_COLUNAS_EXCEDIDO', `O arquivo excede o limite de ${LIMITE_COLUNAS} colunas.`);
    }
    const vistos = new Set<string>();
    for (const [indice, nome] of cabecalho.entries()) {
      const normalizado = nome.trim();
      if (!normalizado) {
        return rejeitar('CABECALHO_INVALIDO', `A coluna ${indice + 1} do cabeçalho não tem nome.`);
      }
      if (vistos.has(normalizado)) {
        return rejeitar('CABECALHO_DUPLICADO', `O cabeçalho repete o nome de coluna "${normalizado}".`);
      }
      vistos.add(normalizado);
    }
    return null;
  }
}
