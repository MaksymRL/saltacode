// import { prisma } from '../prisma/client.js';

/**
 * Formatta un numero di ticket nel formato: prefisso (2) + lettera (1) + progressivo (3 cifre)
 * Es: formatTicketNumber('AA', 'A', 1) → 'AAA001'
 *     formatTicketNumber('AB', 'B', 42) → 'ABB042'
 */
export function formatTicketNumber(prefisso: string, lettera: string, progressivo: number): string {
  if (!/^[A-Z]{2}$/.test(prefisso)) throw new Error('Prefisso non valido');
  if (!/^[A-Z]$/.test(lettera)) throw new Error('Lettera non valida');
  if (progressivo < 1 || progressivo > 999) throw new Error('Progressivo fuori range (1-999)');
  return `${prefisso}${lettera}${String(progressivo).padStart(3, '0')}`;
}

/**
 * Emette un ticket per il servizio specificato.
 * Usa una transazione con SELECT FOR UPDATE per garantire l'atomicità del contatore.
 *
 * @throws {Error} se il servizio o l'area è disabilitato
 * @throws {Error} se il contatore ha raggiunto 999
 */
export async function emitTicket(servizioId: number, _operatoreId: number): Promise<{
  id: number;
  numero: string;
  emessoPer: Date;
  stato: string;
}> {
  // TODO: implementare con Prisma
  //
  // return await prisma.$transaction(async (tx) => {
  //   const servizio = await tx.servizio.findUnique({
  //     where: { id: servizioId },
  //     include: { area: true },
  //   });
  //   if (!servizio || !servizio.attivo) throw httpError(422, 'Servizio non disponibile.');
  //   if (!servizio.area.attiva) throw httpError(422, 'Area non attiva.');
  //
  //   const oggi = new Date();
  //   oggi.setHours(0, 0, 0, 0);
  //
  //   // SELECT FOR UPDATE per atomicità
  //   const contatore = await tx.$queryRaw<{ ultimo_numero: number }[]>`
  //     SELECT ultimo_numero FROM contatore_giornaliero
  //     WHERE servizio_id = ${servizioId} AND data = ${oggi}
  //     FOR UPDATE
  //   `;
  //
  //   const ultimoNumero = contatore[0]?.ultimo_numero ?? 0;
  //   if (ultimoNumero >= 999) throw httpError(422, 'Limite giornaliero (999) raggiunto per questo servizio.');
  //
  //   const nuovoNumero = ultimoNumero + 1;
  //
  //   await tx.contatoreGiornaliero.upsert({
  //     where: { servizioId_data: { servizioId, data: oggi } },
  //     update: { ultimoNumero: nuovoNumero },
  //     create: { servizioId, data: oggi, ultimoNumero: nuovoNumero },
  //   });
  //
  //   const numero = formatTicketNumber(servizio.area.prefisso, servizio.lettera, nuovoNumero);
  //
  //   return tx.ticket.create({
  //     data: { servizioId, numero, stato: 'ATTESA' },
  //   });
  // });

  throw new Error('ticketService.emitTicket not implemented');
}
