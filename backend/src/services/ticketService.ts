import { prisma } from '../prisma/client.js';
import { broadcast, broadcastMonitor } from './wsService.js';

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
  return await prisma.$transaction(async (tx) => {
    const servizio = await tx.servizio.findUnique({
      where: { id: servizioId },
      include: { area: true },
    });
    
    if (!servizio || !servizio.attivo) {
      throw new Error('Servizio non disponibile.');
    }
    if (!servizio.area.attiva) {
      throw new Error('Area non attiva.');
    }

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    // Get or create daily counter
    const contatoreEsistente = await tx.contatoreGiornaliero.findUnique({
      where: { servizioId_data: { servizioId, data: oggi } },
    });

    const ultimoNumero = contatoreEsistente?.ultimoNumero ?? 0;
    if (ultimoNumero >= 999) {
      throw new Error('Limite giornaliero (999) raggiunto per questo servizio.');
    }

    const nuovoNumero = ultimoNumero + 1;

    // Update or create counter
    await tx.contatoreGiornaliero.upsert({
      where: { servizioId_data: { servizioId, data: oggi } },
      update: { ultimoNumero: nuovoNumero },
      create: { servizioId, data: oggi, ultimoNumero: nuovoNumero },
    });

    const numero = formatTicketNumber(servizio.area.prefisso, servizio.lettera, nuovoNumero);

    const ticket = await tx.ticket.create({
      data: { servizioId, numero, stato: 'ATTESA' },
    });

    // Get queue count for WebSocket broadcast
    const codaCount = await tx.ticket.count({
      where: { servizioId, stato: 'ATTESA' },
    });

    // Broadcast to area and monitors
    const message = { 
      type: 'TICKET_EMESSO' as const, 
      servizioId, 
      coda: codaCount 
    };
    broadcast(servizio.areaId, message);
    broadcastMonitor(message);

    return ticket;
  });
}
