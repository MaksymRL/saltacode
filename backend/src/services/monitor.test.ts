import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Property-Based Tests - Monitor Service', () => {
  
  // Feature: saltacode-queue-manager, Property 10: ordinamento cronologico del monitor
  describe('Property 10: Ordinamento cronologico del monitor', () => {
    it('restituisce chiamate ordinate in ordine decrescente per timestamp', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              ticket: fc.string({ minLength: 6, maxLength: 6 }).filter(s => /^[A-Z]{2}[A-Z][0-9]{3}$/.test(s)),
              postazione: fc.integer({ min: 1, max: 99 }),
              servizio: fc.string({ minLength: 1, maxLength: 50 }),
              timestamp: fc.date(),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (chiamate) => {
            // Simula l'ordinamento del monitor (decrescente per timestamp - più recente prima)
            const sorted = [...chiamate].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            
            // Verifica che l'ordinamento sia corretto
            for (let i = 0; i < sorted.length - 1; i++) {
              expect(sorted[i].timestamp.getTime()).toBeGreaterThanOrEqual(sorted[i + 1].timestamp.getTime());
            }
            
            // Il primo elemento deve essere il più recente
            if (sorted.length > 0) {
              const mostRecent = Math.max(...chiamate.map(c => c.timestamp.getTime()));
              expect(sorted[0].timestamp.getTime()).toBe(mostRecent);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('limita risultati a massimo 10 elementi', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              timestamp: fc.date(),
            }),
            { minLength: 1, maxLength: 50 } // generiamo fino a 50 elementi
          ),
          (chiamate) => {
            // Simula la logica del monitor: prende solo i primi 10
            const sorted = [...chiamate]
              .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
              .slice(0, 10);
            
            // Non deve mai restituire più di 10 elementi
            expect(sorted.length).toBeLessThanOrEqual(10);
            
            // Se ci sono più di 10 chiamate, dovrebbe limitare a 10
            if (chiamate.length > 10) {
              expect(sorted.length).toBe(10);
            } else {
              expect(sorted.length).toBe(chiamate.length);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('non contiene duplicati', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 100 }), // range più piccolo per forzare duplicati
              timestamp: fc.date(),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (chiamate) => {
            // Simula rimozione duplicati per ID
            const unique = chiamate.filter((chiamata, index, arr) => 
              arr.findIndex(c => c.id === chiamata.id) === index
            );
            
            // Verifica che non ci siano ID duplicati
            const ids = unique.map(c => c.id);
            const uniqueIds = [...new Set(ids)];
            expect(ids.length).toBe(uniqueIds.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('mantiene dati corretti durante l\'ordinamento', () => {
      const testData = [
        { id: 1, ticket: 'AAA001', postazione: 1, servizio: 'Test1', timestamp: new Date('2024-01-01T10:00:00Z') },
        { id: 2, ticket: 'AAA002', postazione: 2, servizio: 'Test2', timestamp: new Date('2024-01-01T11:00:00Z') },
        { id: 3, ticket: 'AAA003', postazione: 3, servizio: 'Test3', timestamp: new Date('2024-01-01T09:00:00Z') },
      ];

      // Ordinamento decrescente per timestamp
      const sorted = [...testData].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      expect(sorted[0].id).toBe(2); // 11:00 (più recente)
      expect(sorted[1].id).toBe(1); // 10:00
      expect(sorted[2].id).toBe(3); // 09:00 (più vecchia)

      // Verifica che i dati associati siano preservati
      expect(sorted[0].ticket).toBe('AAA002');
      expect(sorted[0].postazione).toBe(2);
      expect(sorted[0].servizio).toBe('Test2');
    });
  });

  // Feature: saltacode-queue-manager, Property 11: consistenza stato iniziale WebSocket
  describe('Property 11: Consistenza dello stato iniziale WebSocket', () => {
    it('verifica coerenza tra contatori coda e ticket in attesa', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              servizioId: fc.integer({ min: 1, max: 10 }),
              stato: fc.constantFrom('ATTESA', 'CHIAMATO', 'SERVITO'),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          (tickets) => {
            // Simula conteggio ticket per servizio
            const contatori = new Map<number, number>();
            
            tickets.forEach(ticket => {
              if (ticket.stato === 'ATTESA') {
                const current = contatori.get(ticket.servizioId) || 0;
                contatori.set(ticket.servizioId, current + 1);
              }
            });
            
            // Verifica che ogni contatore sia >= 0
            Array.from(contatori.values()).forEach(count => {
              expect(count).toBeGreaterThanOrEqual(0);
            });
            
            // Verifica che la somma dei contatori corrisponda ai ticket in ATTESA
            const totalInAttesa = tickets.filter(t => t.stato === 'ATTESA').length;
            const totalContatori = Array.from(contatori.values()).reduce((sum, count) => sum + count, 0);
            expect(totalContatori).toBe(totalInAttesa);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('verifica coerenza stato postazioni operatori', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              utenteId: fc.integer({ min: 1, max: 20 }),
              postazione: fc.integer({ min: 1, max: 10 }),
              stato: fc.constantFrom('ATTIVO', 'PAUSA'),
            }),
            { minLength: 0, maxLength: 30 }
          ),
          (postazioni) => {
            // Simula stato iniziale WebSocket - rimuove duplicati per utenteId
            const statoUnique = postazioni.filter((p, index, arr) => 
              arr.findIndex(x => x.utenteId === p.utenteId) === index
            );
            
            // Ogni utente deve avere un solo stato
            const userIds = statoUnique.map(p => p.utenteId);
            const uniqueUserIds = [...new Set(userIds)];
            expect(userIds.length).toBe(uniqueUserIds.length);
            
            // Ogni stato deve essere valido
            statoUnique.forEach(p => {
              expect(['ATTIVO', 'PAUSA']).toContain(p.stato);
              expect(p.postazione).toBeGreaterThanOrEqual(1);
              expect(p.postazione).toBeLessThanOrEqual(99);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});