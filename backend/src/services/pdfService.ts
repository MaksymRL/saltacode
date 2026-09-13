import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import fs from 'fs';

interface TicketData {
  numero: string;
  nomeServizio: string;
  dataOra: Date;
  logo?: string; // percorso file PNG/JPEG (opzionale)
}

/**
 * Genera un PDF A5 per il ticket con logo, numero grande e servizio.
 */
export async function generateTicketPdf(data: TicketData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({ size: 'A6', margin: 24 });

    const writable = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    doc.on('error', reject);
    writable.on('finish', () => resolve(Buffer.concat(chunks)));
    doc.pipe(writable);

    const pageWidth = doc.page.width;   // A6 = 297.64 pt
    const margin = 24;
    const contentWidth = pageWidth - margin * 2;

    // ── Logo ──────────────────────────────────────────────────────
    if (data.logo && fs.existsSync(data.logo)) {
      try {
        const logoW = 110;
        const logoX = (pageWidth - logoW) / 2;
        doc.image(data.logo, logoX, margin, { width: logoW });
        doc.moveDown(2.5);
      } catch { doc.moveDown(0.5); }
    } else {
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a1a2e')
        .text('CISL', { align: 'center' });
      doc.moveDown(0.3);
    }

    // ── Linea rossa ───────────────────────────────────────────────
    const y1 = doc.y;
    doc.moveTo(margin, y1).lineTo(pageWidth - margin, y1).strokeColor('#e74c3c').lineWidth(1.5).stroke();
    doc.moveDown(0.5);

    // ── Nome servizio ─────────────────────────────────────────────
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text(data.nomeServizio, { align: 'center', width: contentWidth });
    doc.moveDown(0.3);

    // ── Etichetta ─────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
      .text('IL TUO NUMERO', { align: 'center', characterSpacing: 2 });
    doc.moveDown(0.2);

    // ── Numero ticket (grande) ────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(56).fillColor('#e74c3c')
      .text(data.numero, { align: 'center', width: contentWidth });
    doc.moveDown(0.3);

    // ── Linea grigia ──────────────────────────────────────────────
    const y2 = doc.y;
    doc.moveTo(margin, y2).lineTo(pageWidth - margin, y2).strokeColor('#e2e8f0').lineWidth(0.8).stroke();
    doc.moveDown(0.4);

    // ── Data e ora ────────────────────────────────────────────────
    const dataFormattata = data.dataOra.toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
      .text(`Emesso il: ${dataFormattata}`, { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(6).fillColor('#9ca3af')
      .text('Conservare questo biglietto fino alla chiamata', { align: 'center' });

    doc.end();
  });
}
