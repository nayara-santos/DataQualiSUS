import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { Separador } from './limites-csv';

export interface ConteudoCsv {
  colunas: string[];
  /** Registros de dados na ordem original; o índice 0 corresponde à linha de dados 1. */
  registros: string[][];
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Lê um CSV já validado e retorna cabeçalho e registros como texto (RegistroDataset como mapa
 * coluna→texto, ADR-003). A conversão de tipos é feita somente pelo motor de regras.
 */
export function lerCsv(conteudo: Buffer, separador: Separador): Promise<ConteudoCsv> {
  const semBom = conteudo.subarray(0, 3).equals(BOM) ? conteudo.subarray(3) : conteudo;
  const texto = semBom.toString('utf8').replace(/(\r?\n)+$/, '');
  return new Promise((resolver, rejeitarLeitura) => {
    const linhas: string[][] = [];
    const leitor = parse({ delimiter: separador, quote: '"', escape: '"', skip_empty_lines: false });
    leitor.on('data', (registro: string[]) => linhas.push(registro));
    leitor.on('error', rejeitarLeitura);
    leitor.on('end', () => {
      const [colunas, ...registros] = linhas;
      resolver({ colunas: colunas ?? [], registros });
    });
    Readable.from([texto]).pipe(leitor);
  });
}

function escaparCampo(valor: string, separador: Separador): string {
  if (valor.includes('"') || valor.includes(separador) || valor.includes('\n') || valor.includes('\r')) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/** Serializa registros em CSV UTF-8 (sem BOM), com aspas duplas quando necessário. */
export function escreverCsv(colunas: string[], registros: string[][], separador: Separador): Buffer {
  const linhas = [colunas, ...registros].map((campos) =>
    campos.map((c) => escaparCampo(c, separador)).join(separador),
  );
  return Buffer.from(linhas.join('\n') + '\n', 'utf8');
}
