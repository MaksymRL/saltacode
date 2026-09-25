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

    const doc = new PDFDocument({ size: [297.64, 419.53], layout: 'landscape', margin: 18 });

    const writable = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    doc.on('error', reject);
    writable.on('finish', () => resolve(Buffer.concat(chunks)));
    doc.pipe(writable);

    const pageWidth  = doc.page.width;   // A6 landscape = 419.53 pt
    const pageHeight = doc.page.height;  // A6 landscape = 297.64 pt
    const margin = 18;
    const contentWidth = pageWidth - margin * 2;

    // ── Logo — a sinistra ─────────────────────────────────────────
    const logoW = 100;
    const logoY = margin;

    if (data.logo && fs.existsSync(data.logo)) {
      try {
        doc.image(data.logo, margin, logoY, { width: logoW });
      } catch { /* ignora */ }
    } else {
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1a2e')
        .text('CISL', margin, logoY + 10);
    }

    // ── Linea rossa verticale separatrice ────────────────────────
    const lineX = margin + logoW + 16;
    doc.moveTo(lineX, margin).lineTo(lineX, pageHeight - margin)
      .strokeColor('#e74c3c').lineWidth(1.5).stroke();

    // ── Zona destra: servizio + numero + data ────────────────────
    const rightX = lineX + 16;
    const rightW = pageWidth - rightX - margin;

    // Zona disponibile in verticale (tra margine superiore e linea footer)
    const topY    = margin;
    const footerY = pageHeight - margin - 28; // sopra data/ora

    // ── Nome servizio — in alto ───────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e')
      .text(data.nomeServizio, rightX, topY + 6, { width: rightW, lineBreak: false });

    // ── Numero ticket — dimensione automatica ─────────────────────
    let numFontSize = 90;
    while (numFontSize > 24) {
      doc.font('Helvetica-Bold').fontSize(numFontSize);
      if (doc.widthOfString(data.numero) <= rightW) break;
      numFontSize -= 4;
    }

    // Altezza totale del blocco etichetta + numero
    const labelH  = 10; // "IL TUO NUMERO" a 7pt
    const numH    = numFontSize * 1.05;
    const blockH  = labelH + 4 + numH;

    // Zona verticale disponibile tra il nome servizio e il footer
    const zoneTop = topY + 28;
    const zoneH   = footerY - zoneTop;

    // Centra verticalmente il blocco nella zona
    const blockY  = zoneTop + (zoneH - blockH) / 2;

    // Etichetta
    doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
      .text('IL TUO NUMERO', rightX, blockY, { width: rightW, align: 'center', characterSpacing: 2, lineBreak: false });

    // Numero
    doc.font('Helvetica-Bold').fontSize(numFontSize).fillColor('#e74c3c')
      .text(data.numero, rightX, blockY + labelH + 4, { width: rightW, align: 'center', lineBreak: false });

    // ── Linea grigia + data/ora — in fondo ───────────────────────
    const lineY2 = footerY;
    doc.moveTo(rightX, lineY2).lineTo(pageWidth - margin, lineY2)
      .strokeColor('#e2e8f0').lineWidth(0.8).stroke();

    // Data e ora
    const dataFormattata = data.dataOra.toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
      .text(`Emesso il: ${dataFormattata}`, rightX, lineY2 + 6, { width: rightW });
    doc.font('Helvetica').fontSize(6).fillColor('#9ca3af')
      .text('Conservare questo biglietto fino alla chiamata', rightX, lineY2 + 16, { width: rightW });

    doc.end();
  });
}
