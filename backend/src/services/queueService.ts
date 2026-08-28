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

  // Usa SELECT FOR UPDATE SKIP LOCKED per evitare race condition
  // quando più postazioni chiamano lo stesso servizio simultaneamente.
  // Solo una transaction per volta acquisisce il lock sul ticket.
  const result = await prisma.$transaction(async (tx) => {
    // Trova e blocca il prossimo ticket disponibile
    const tickets = await tx.$queryRaw<{ id: number; numero: string; servizioId: number }[]>`
      SELECT t.id, t.numero, t."servizioId"
      FROM ticket t
      WHERE t."servizioId" = ${servizioId} AND t.stato = 'ATTESA'
      ORDER BY t."emessoPer" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (tickets.length === 0) return null; // coda vuota o già presa da altra postazione

    const ticket = tickets[0]!;

    // Aggiorna stato e crea chiamata nella stessa transaction
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { stato: 'CHIAMATO' },
    });

    const chiamata = await tx.chiamata.create({
      data: { utenteId, servizioId, ticketId: ticket.id, postazione },
    });

    return { chiamata, ticket };
  });

  if (!result) return null;

  const { chiamata, ticket } = result;

  // Recupera info area per il broadcast (fuori dalla transaction)
  const servizio = await prisma.servizio.findUnique({
    where: { id: servizioId },
    include: { area: true },
  });

  if (servizio) {
    broadcastAll(servizio.areaId, {
      type: 'NUMERO_CHIAMATO',
      ticket: ticket.numero,
      postazione,
      servizio: servizio.nome,
      timestamp: new Date().toISOString(),
    });

    const codaRimasta = await prisma.ticket.count({
      where: { servizioId, stato: 'ATTESA' },
    });

    broadcastAll(servizio.areaId, {
      type: 'CODA_AGGIORNATA',
      servizioId,
      count: codaRimasta,
    });
  }

  return { chiamataId: chiamata.id, ticketNumero: ticket.numero, postazione };
}

/**
 * Annulla l'ultima chiamata effettuata dall'operatore.
 * Rimette il ticket in testa alla coda (stato ATTESA) e cancella la chiamata dal DB.
 */
export async function cancelCall(chiamataId: number, utenteId: number): Promise<void> {
  const chiamata = await prisma.chiamata.findUnique({
    where: { id: chiamataId },
    include: {
      servizio: { include: { area: true } }
    }
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

  // Broadcast WebSocket per l'aggiornamento della coda dopo l'annullamento
  if (chiamata.ticketId) {
    const codaAggiornata = await prisma.ticket.count({
      where: { servizioId: chiamata.servizioId, stato: 'ATTESA' },
    });

    broadcastAll(chiamata.servizio.areaId, {
      type: 'CODA_AGGIORNATA',
      servizioId: chiamata.servizioId,
      count: codaAggiornata,
    });
  }
}
