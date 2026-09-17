import { prisma } from '../prisma/client.js';
import { broadcast, broadcastMonitor } from './wsService.js';

export function formatTicketNumber(prefisso: string, lettera: string, progressivo: number): string {
  if (!/^[A-Z]{2}$/.test(prefisso)) throw new Error('Prefisso non valido');
  if (!/^[A-Z]$/.test(lettera)) throw new Error('Lettera non valida');
  if (progressivo < 1 || progressivo > 999) throw new Error('Progressivo fuori range (1-999)');
  return `${prefisso}${lettera}${String(progressivo).padStart(3, '0')}`;
}

/**
 * Emette un ticket per il servizio specificato.
 *
 * Bug fix: il contatore viene incrementato con UPDATE … RETURNING dentro una
 * transaction con SELECT FOR UPDATE, eliminando la race condition tra due
 * accoglienze concorrenti che leggevano lo stesso ultimoNumero.
 */
export async function emitTicket(servizioId: number, operatoreId: number): Promise<{
  id: number;
  numero: string;
  emessoPer: Date;
  stato: string;
}> {
  // Esegui la transaction — nessun broadcast dentro
  const { ticket, areaId, codaCount } = await prisma.$transaction(async (tx) => {
    const servizio = await tx.servizio.findUnique({
      where: { id: servizioId },
      include: { area: true },
    });
    if (!servizio || !servizio.attivo) throw new Error('Servizio non disponibile.');
    if (!servizio.area.attiva) throw new Error('Area non attiva.');

    await tx.$executeRaw`
      INSERT INTO contatore_giornaliero ("servizioId", data, "ultimoNumero")
      VALUES (${servizioId}, CURRENT_DATE, 0)
      ON CONFLICT ("servizioId", data) DO NOTHING
    `;

    const rows = await tx.$queryRaw<{ ultimoNumero: number }[]>`
      SELECT "ultimoNumero"
      FROM contatore_giornaliero
      WHERE "servizioId" = ${servizioId} AND data = CURRENT_DATE
      FOR UPDATE
    `;

    const ultimoNumero = rows[0]?.ultimoNumero ?? 0;
    if (ultimoNumero >= 999) throw new Error('Limite giornaliero (999) raggiunto per questo servizio.');

    const nuovoNumero = ultimoNumero + 1;

    await tx.$executeRaw`
      UPDATE contatore_giornaliero
      SET "ultimoNumero" = ${nuovoNumero}
      WHERE "servizioId" = ${servizioId} AND data = CURRENT_DATE
    `;

    const numero = formatTicketNumber(servizio.area.prefisso, servizio.lettera, nuovoNumero);

    const ticket = await tx.ticket.create({
      data: { servizioId, numero, stato: 'ATTESA' },
    });

    const codaCount = await tx.ticket.count({
      where: { servizioId, stato: 'ATTESA' },
    });

    return { ticket, areaId: servizio.areaId, codaCount };
  });

  // Broadcast DOPO il commit della transaction — nessun rischio di notifica per ticket rollbackati
  const message = { type: 'TICKET_EMESSO' as const, servizioId, coda: codaCount };
  broadcast(areaId, message);
  broadcastMonitor(message);

  return ticket;
}

/**
 * Ritorna mezzanotte UTC del giorno corrente come oggetto Date.
 * Coerente con Prisma @db.Date che memorizza senza ora.
 */
export function utcStartOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
