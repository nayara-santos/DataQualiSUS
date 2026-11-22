import PDFDocument from 'pdfkit';

export type DocumentoPdf = PDFKit.PDFDocument;

/** Cria um documento A4 e devolve o buffer ao final, sem gravar arquivos temporários. */
export function gerarPdf(titulo: string, desenhar: (doc: DocumentoPdf) => void): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      compress: false,
      info: { Title: titulo, Author: 'DataQualiSUS', Creator: 'DataQualiSUS API', Producer: 'PDFKit' },
    });
    const partes: Buffer[] = [];
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolver(Buffer.concat(partes)));
    doc.on('error', rejeitar);
    try {
      desenhar(doc);
      doc.end();
    } catch (erro) {
      rejeitar(erro);
    }
  });
}

export function titulo(doc: DocumentoPdf, texto: string): void {
  doc.font('Helvetica-Bold').fontSize(16).text(texto);
  doc.moveDown(0.5);
}

export function secao(doc: DocumentoPdf, texto: string): void {
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).text(texto);
  doc.moveDown(0.2);
}

/** Linha "rótulo: valor". O valor é sempre escrito como texto literal (RNF005). */
export function campo(doc: DocumentoPdf, rotulo: string, valor: string | number | null | undefined): void {
  doc.font('Helvetica-Bold').fontSize(9).text(`${rotulo}: `, { continued: true });
  doc.font('Helvetica').text(valor === null || valor === undefined || valor === '' ? '—' : String(valor));
}

export function paragrafo(doc: DocumentoPdf, texto: string): void {
  doc.font('Helvetica').fontSize(9).text(texto);
}
