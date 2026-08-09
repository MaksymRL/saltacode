import { prisma } from '../prisma/client.js';
import { broadcastAll } from './wsService.js';

/**
 * Estrae il prossimo ticket in coda per un servizio (FIFO: il più vecchio per emessoPer).
 * Registra la chiamata nel DB e aggiorna lo stato del ticket a CHIAMATO.
 * Invia l'evento WebSocket NUMERO_CHIAMATO.
 */
export async function callNext(
  servizioId: number,
  postazione: number,
  utenteId: number
): Promise<{ chiamataId: number; ticketNumero: string; postazione: number } | null> {
  const ticket = await prisma.ticket.findFirst({
    where: { servizioId, stato: 'ATTESA' },
    orderBy: { emessoPer: 'asc' },
    include: { servizio: { include: { area: true } } },
  });

  if (!ticket) return null; // coda vuota

  const [chiamata] = await prisma.$transaction([
    prisma.chiamata.create({
      data: { utenteId, servizioId, ticketId: ticket.id, postazione },
    }),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: { stato: 'CHIAMATO' },
    }),
  ]);

  // Broadcast WebSocket
  broadcastAll(ticket.servizio.areaId, {
    type: 'NUMERO_CHIAMATO',
    ticket: ticket.numero,
    postazione,
    servizio: ticket.servizio.nome,
    timestamp: new Date().toISOString(),
  });

  return { chiamataId: chiamata.id, ticketNumero: ticket.numero, postazione };
}

/**
 * Annulla l'ultima chiamata effettuata dall'operatore.
 * Rimette il ticket in testa alla coda (stato ATTESA) e cancella la chiamata dal DB.
 */
export async function cancelCall(chiamataId: number, utenteId: number): Promise<void> {
  const chiamata = await prisma.chiamata.findUnique({
    where: { id: chiamataId },
  });
  
  if (!chiamata || chiamata.utenteId !== utenteId) {
    throw new Error('Non autorizzato.');
  }

  await prisma.$transaction([
    prisma.chiamata.delete({ where: { id: chiamataId } }),
    ...(chiamata.ticketId
      ? [prisma.ticket.update({ 
          where: { id: chiamata.ticketId }, 
          data: { stato: 'ATTESA', emessoPer: new Date(0) } 
        })]
      : []),
  ]);
}
