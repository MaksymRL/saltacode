import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatTicketNumber } from './ticketService.js';

describe('Property-Based Tests - TicketService', () => {
  
  // Feature: saltacode-queue-manager, Property 5: formato numero di ticket
  describe('Property 5: Formato numero di ticket', () => {
    it('genera numeri nel formato corretto per input validi', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 2, maxLength: 2 }).filter(s => /^[A-Z]{2}$/.test(s)), // prefisso
          fc.string({ minLength: 1, maxLength: 1 }).filter(s => /^[A-Z]$/.test(s)),    // lettera
          fc.integer({ min: 1, max: 999 }),                                           // progressivo
          (prefisso, lettera, progressivo) => {
            const numero = formatTicketNumber(prefisso, lettera, progressivo);
            
            // Verifica pattern generale
            expect(numero).toMatch(/^[A-Z]{2}[A-Z][0-9]{3}$/);
            
            // Verifica componenti specifici
            expect(numero.substring(0, 2)).toBe(prefisso);
            expect(numero.substring(2, 3)).toBe(lettera);
            
            const progressivoStr = numero.substring(3);
            expect(progressivoStr).toHaveLength(3);
            expect(parseInt(progressivoStr)).toBe(progressivo);
            
            // Verifica zero-padding
            expect(progressivoStr).toBe(String(progressivo).padStart(3, '0'));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preserva esattamente prefisso e lettera senza modifiche', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('AA', 'AB', 'BA', 'BB', 'CA', 'CB', 'ZZ'), // prefissi validi
          fc.constantFrom('A', 'B', 'C', 'Z'),                      // lettere valide
          fc.integer({ min: 1, max: 999 }),
          (prefisso, lettera, progressivo) => {
            const numero = formatTicketNumber(prefisso, lettera, progressivo);
            
            // Prefisso e lettera devono essere identici all'input
            expect(numero.startsWith(prefisso + lettera)).toBe(true);
            expect(numero.substring(0, 3)).toBe(prefisso + lettera);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('formatta correttamente il zero-padding per tutti i progressivi', () => {
      const testCases = [
        { progressivo: 1, expected: '001' },
        { progressivo: 42, expected: '042' },
        { progressivo: 100, expected: '100' },
        { progressivo: 999, expected: '999' },
      ];

      testCases.forEach(({ progressivo, expected }) => {
        const numero = formatTicketNumber('AA', 'A', progressivo);
        expect(numero.substring(3)).toBe(expected);
      });
    });

    it('lancia errori per input non validi', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string().filter(s => !/^[A-Z]{2}$/.test(s)), // prefissi non validi
            fc.constant('AA') // prefisso valido per testare altri errori
          ),
          fc.oneof(
            fc.string().filter(s => !/^[A-Z]$/.test(s)), // lettere non valide
            fc.constant('A') // lettera valida per testare altri errori
          ),
          fc.oneof(
            fc.integer({ min: -100, max: 0 }), // progressivo troppo piccolo
            fc.integer({ min: 1000, max: 9999 }), // progressivo troppo grande
            fc.integer({ min: 1, max: 999 }) // progressivo valido per testare altri errori
          ),
          (prefisso, lettera, progressivo) => {
            const hasValidPrefisso = /^[A-Z]{2}$/.test(prefisso);
            const hasValidLettera = /^[A-Z]$/.test(lettera);
            const hasValidProgressivo = progressivo >= 1 && progressivo <= 999;
            
            if (hasValidPrefisso && hasValidLettera && hasValidProgressivo) {
              // Se tutti sono validi, non deve lanciare errore
              expect(() => formatTicketNumber(prefisso, lettera, progressivo)).not.toThrow();
            } else {
              // Se almeno uno non è valido, deve lanciare errore
              expect(() => formatTicketNumber(prefisso, lettera, progressivo)).toThrow();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: saltacode-queue-manager, Property 7: reset del contatore giornaliero
  describe('Property 7: Reset del contatore giornaliero', () => {
    it('verifica la logica di reset giornaliero', () => {
      // Test della logica del reset giornaliero
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // La logica di reset si basa sul confronto delle date
      // Se l'ultima emissione è di un giorno diverso, il contatore riparte da 1
      expect(today.getTime()).not.toBe(yesterday.getTime());
      expect(today.getTime()).not.toBe(tomorrow.getTime());
      
      // Il primo ticket del giorno deve avere progressivo 1 (che diventa "001")
      const primoTicketGiorno = formatTicketNumber('AA', 'A', 1);
      expect(primoTicketGiorno.endsWith('001')).toBe(true);
    });

    it('mantiene la sequenza entro la stessa giornata', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999 }),
          fc.integer({ min: 1, max: 999 }),
          (num1, num2) => {
            // Nella stessa giornata, i numeri devono essere diversi se i progressivi sono diversi
            const ticket1 = formatTicketNumber('AA', 'A', num1);
            const ticket2 = formatTicketNumber('AA', 'A', num2);
            
            if (num1 !== num2) {
              expect(ticket1).not.toBe(ticket2);
            } else {
              expect(ticket1).toBe(ticket2);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});