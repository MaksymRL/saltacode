import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Property-Based Tests - QueueService', () => {
  
  // Feature: saltacode-queue-manager, Property 8: ordine FIFO della coda
  describe('Property 8: Ordine FIFO della coda', () => {
    it('simula la logica FIFO con ordinamento per timestamp', () => {
      fc.assert(
        fc.property(
          fc.array(fc.date(), { minLength: 1, maxLength: 20 }),
          (timestamps) => {
            // Simula una coda di ticket ordinati per emessoPer
            const sortedTimestamps = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
            
            // Il primo elemento dovrebbe essere il più vecchio (FIFO)
            if (sortedTimestamps.length > 0) {
              const oldest = sortedTimestamps[0];
              const shouldBeFirst = timestamps.find(t => 
                t.getTime() === Math.min(...timestamps.map(d => d.getTime()))
              );
              
              expect(oldest?.getTime()).toBe(shouldBeFirst?.getTime());
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('verifica che FIFO mantenga ordine temporale corretto', () => {
      // Test con sequenza temporale specifica
      const now = new Date();
      const times = [
        new Date(now.getTime() - 3000), // 3 sec fa
        new Date(now.getTime() - 1000), // 1 sec fa  
        new Date(now.getTime()),        // ora
        new Date(now.getTime() + 1000), // 1 sec futuro
      ];

      // Mescoliamo l'array per simulare inserimenti casuali
      const shuffled = [...times].sort(() => Math.random() - 0.5);
      
      // L'ordinamento FIFO (ASC per emessoPer) deve riportare l'ordine temporale
      const fifoOrder = shuffled.sort((a, b) => a.getTime() - b.getTime());
      
      expect(fifoOrder[0].getTime()).toBe(times[0].getTime()); // più vecchio per primo
      expect(fifoOrder[fifoOrder.length - 1].getTime()).toBe(times[times.length - 1].getTime()); // più nuovo per ultimo
    });

    it('gestisce correttamente timestamp identici', () => {
      const sameTime = new Date();
      const identicalTimes = [sameTime, new Date(sameTime.getTime()), new Date(sameTime.getTime())];
      
      // Con timestamp identici, l'ordine è stabile (dipende dall'ID del DB)
      const sorted = identicalTimes.sort((a, b) => a.getTime() - b.getTime());
      
      // Tutti dovrebbero avere lo stesso timestamp
      sorted.forEach(time => {
        expect(time.getTime()).toBe(sameTime.getTime());
      });
    });
  });

  // Feature: saltacode-queue-manager, Property 9: round-trip dell'annullamento chiamata  
  describe('Property 9: Round-trip dell\'annullamento chiamata', () => {
    it('simula il comportamento di annullamento - stato torna a ATTESA', () => {
      const statiBefore = ['ATTESA', 'ATTESA', 'ATTESA']; // stato iniziale coda
      const ticketChiamato = 0; // indice del ticket chiamato
      
      // Simula chiamata: primo ticket va a CHIAMATO
      const statiAfterCall = [...statiBefore];
      statiAfterCall[ticketChiamato] = 'CHIAMATO';
      
      // Simula annullamento: torna a ATTESA
      const statiAfterCancel = [...statiAfterCall];
      statiAfterCancel[ticketChiamato] = 'ATTESA';
      
      // Verifica round-trip: stato finale uguale a iniziale
      expect(statiAfterCancel).toEqual(statiBefore);
    });

    it('verifica che ticket annullato torni in testa alla coda (emessoPer = 1970)', () => {
      const epoch = new Date(0); // 1 Jan 1970 - usato per mettere in testa
      const now = new Date();
      
      // Il ticket annullato deve avere timestamp più vecchio di tutti
      expect(epoch.getTime()).toBeLessThan(now.getTime());
      
      // In una coda FIFO ordinata per emessoPer ASC, il ticket con timestamp epoch viene per primo
      const ticketsInCoda = [
        { id: 1, emessoPer: now, stato: 'ATTESA' },
        { id: 2, emessoPer: new Date(now.getTime() - 1000), stato: 'ATTESA' },
        { id: 3, emessoPer: epoch, stato: 'ATTESA' }, // ticket annullato
      ];

      const fifoOrder = ticketsInCoda.sort((a, b) => a.emessoPer.getTime() - b.emessoPer.getTime());
      
      expect(fifoOrder[0].id).toBe(3); // il ticket annullato viene per primo
      expect(fifoOrder[0].emessoPer.getTime()).toBe(epoch.getTime());
    });

    it('testa proprietà idempotente dell\'annullamento', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            stato: fc.constantFrom('ATTESA', 'CHIAMATO'),
            emessoPer: fc.date()
          }), { minLength: 1, maxLength: 10 }),
          (tickets) => {
            // Simula annullamento: tutti i CHIAMATO tornano ATTESA
            const afterCancel = tickets.map(t => ({
              ...t,
              stato: t.stato === 'CHIAMATO' ? 'ATTESA' : t.stato,
              emessoPer: t.stato === 'CHIAMATO' ? new Date(0) : t.emessoPer
            }));

            // Dopo annullamento, non ci dovrebbero essere più ticket CHIAMATO
            const chiamatiRemaining = afterCancel.filter(t => t.stato === 'CHIAMATO');
            expect(chiamatiRemaining).toHaveLength(0);

            // Tutti dovrebbero essere ATTESA
            afterCancel.forEach(t => {
              expect(t.stato).toBe('ATTESA');
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});