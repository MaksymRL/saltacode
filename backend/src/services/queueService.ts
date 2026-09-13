import { prisma } from '../prisma/client.js';
import { broadcastAll } from './wsService.js';

/**
 * Estrae il prossimo ticket in coda per un servizio (FIFO: il più vecchio per emessoPer).
 * Registra la chiamata nel DB e aggiorna lo stato del ticket a CHIAMATO.
 * Invia l'evento WebSocket NUMERO_CHIAMATO.
 */
export async function callNext(
  servizioId: number,
  postazione: string,
  utenteId: number
): Promise<{ chiamataId: number; ticketNumero: string; postazione: string } | null> {

  const result = await prisma.$transaction(async (tx) => {
    const tickets = await tx.$queryRaw<{ id: number; numero: string; servizioId: number }[]>`
      SELECT t.id, t.numero, t."servizioId"
      FROM ticket t
      WHERE t."servizioId" = ${servizioId} AND t.stato = 'ATTESA'
      ORDER BY t."emessoPer" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (tickets.length === 0) return null;

    const ticket = tickets[0]!;

    // Il ticket precedente CHIAMATO da questo operatore diventa SERVITO
    const ultimaChiamata = await tx.chiamata.findFirst({
      where: { utenteId, servizioId },
      orderBy: { timestamp: 'desc' },
      include: { ticket: { select: { id: true, stato: true } } },
    });
    if (ultimaChiamata?.ticket && ultimaChiamata.ticket.stato === 'CHIAMATO') {
      await tx.ticket.update({
        where: { id: ultimaChiamata.ticket.id },
        data: { stato: 'SERVITO' },
      });
    }

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
      servizioId,           // aggiunto: permette ai client di aggiornare la coda esatta
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

  await prisma.$transaction(async (tx) => {
    await tx.chiamata.delete({ where: { id: chiamataId } });

    if (chiamata.ticketId) {
      // Recupera il ticket originale per mantenere emessoPer originale.
      // Per metterlo in testa usiamo un timestamp di oggi meno 1s — valido
      // come "oggi" per il filtro INITIAL_STATE ma prima degli altri ticket.
      const ticketOriginale = await tx.ticket.findUnique({
        where: { id: chiamata.ticketId },
        select: { emessoPer: true },
      });
      // Se emessoPer originale è di oggi, lo conserva; altrimenti usa ora-1s
      const oggi = new Date(); oggi.setUTCHours(0, 0, 0, 0);
      const emessoPer = ticketOriginale?.emessoPer && ticketOriginale.emessoPer >= oggi
        ? new Date(ticketOriginale.emessoPer.getTime() - 1) // 1ms prima per priorità FIFO
        : new Date(Date.now() - 1000); // fallback: ora meno 1s

      await tx.ticket.update({
        where: { id: chiamata.ticketId },
        data: { stato: 'ATTESA', emessoPer },
      });
    }
  });

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
