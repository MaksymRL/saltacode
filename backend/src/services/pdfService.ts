import PDFDocument from 'pdfkit';
import { Writable } from 'stream';

interface TicketData {
  numero: string;       // es. AA001
  nomeServizio: string;
  dataOra: Date;
  logo?: string;        // percorso file logo (opzionale)
}

/**
 * Genera un PDF A5 per un ticket e lo restituisce come Buffer.
 * Formato A5: 148mm × 210mm = 419.53pt × 595.28pt
 */
export async function generateTicketPdf(data: TicketData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      size: 'A5',
      margin: 30,
    });

    const writable = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    doc.on('error', reject);
    writable.on('finish', () => resolve(Buffer.concat(chunks)));
    doc.pipe(writable);

    // Logo (opzionale)
    if (data.logo) {
      try {
        doc.image(data.logo, { width: 120, align: 'center' });
        doc.moveDown();
      } catch {
        // Logo non trovato — continua senza
      }
    }

    // Intestazione
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('CAF CISL', { align: 'center' })
      .moveDown(0.5);

    // Nome servizio
    doc
      .font('Helvetica')
      .fontSize(12)
      .text(data.nomeServizio, { align: 'center' })
      .moveDown(1);

    // Numero ticket — grande e centrale
    doc
      .font('Helvetica-Bold')
      .fontSize(64)
      .text(data.numero, { align: 'center' })
      .moveDown(1);

    // Data e ora
    const dataFormattata = data.dataOra.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Emesso il: ${dataFormattata}`, { align: 'center' });

    doc.end();
  });
}
