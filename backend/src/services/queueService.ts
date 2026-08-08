// import { prisma } from '../prisma/client.js';

/**
 * Estrae il prossimo ticket in coda per un servizio (FIFO: il più vecchio per emessoPer).
 * Registra la chiamata nel DB e aggiorna lo stato del ticket a CHIAMATO.
 * Invia l'evento WebSocket NUMERO_CHIAMATO.
 */
export async function callNext(
  servizioId: number,
  postazione: number,
  _utenteId: number
): Promise<{ chiamataId: number; ticketNumero: string; postazione: number } | null> {
  // TODO: implementare con Prisma
  //
  // const ticket = await prisma.ticket.findFirst({
  //   where: { servizioId, stato: 'ATTESA' },
  //   orderBy: { emessoPer: 'asc' },
  //   include: { servizio: { include: { area: true } } },
  // });
  //
  // if (!ticket) return null; // coda vuota
  //
  // const [chiamata] = await prisma.$transaction([
  //   prisma.chiamata.create({
  //     data: { utenteId, servizioId, ticketId: ticket.id, postazione },
  //   }),
  //   prisma.ticket.update({
  //     where: { id: ticket.id },
  //     data: { stato: 'CHIAMATO' },
  //   }),
  // ]);
  //
  // // Broadcast WebSocket
  // wsService.broadcast(ticket.servizio.areaId, {
  //   type: 'NUMERO_CHIAMATO',
  //   ticket: ticket.numero,
  //   postazione,
  //   servizio: ticket.servizio.nome,
  //   timestamp: new Date().toISOString(),
  // });
  //
  // return { chiamataId: chiamata.id, ticketNumero: ticket.numero, postazione };

  throw new Error('queueService.callNext not implemented');
}

/**
 * Annulla l'ultima chiamata effettuata dall'operatore.
 * Rimette il ticket in testa alla coda (stato ATTESA) e cancella la chiamata dal DB.
 */
export async function cancelCall(chiamataId: number, _utenteId: number): Promise<void> {
  // TODO: implementare con Prisma
  //
  // const chiamata = await prisma.chiamata.findUnique({
  //   where: { id: chiamataId },
  // });
  // if (!chiamata || chiamata.utenteId !== utenteId) throw httpError(403, 'Non autorizzato.');
  //
  // await prisma.$transaction([
  //   prisma.chiamata.delete({ where: { id: chiamataId } }),
  //   ...(chiamata.ticketId
  //     ? [prisma.ticket.update({ where: { id: chiamata.ticketId }, data: { stato: 'ATTESA', emessoPer: new Date(0) } })]
  //     : []),
  // ]);

  throw new Error('queueService.cancelCall not implemented');
}
