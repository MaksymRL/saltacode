import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validatePassword, generateUsername } from './authService.js';

describe('Property-Based Tests - AuthService', () => {
  
  // Feature: saltacode-queue-manager, Property 2: password validation accepts iff all criteria met
  describe('Property 2: Validazione della policy di password', () => {
    it('accetta solo stringhe che soddisfano tutti i criteri simultaneamente', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), (pwd) => {
          const result = validatePassword(pwd);
          const hasLength = pwd.length >= 10 && pwd.length <= 64;
          const hasUpper = /[A-Z]/.test(pwd);
          const hasSpecial = /[!@#$%^&*()\\_+\-=\[\]{}|;:,.<>?]/.test(pwd);
          const shouldPass = hasLength && hasUpper && hasSpecial;
          
          return result === shouldPass;
        }),
        { numRuns: 100 }
      );
    });

    it('rifiuta password troppo corte o troppo lunghe', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ maxLength: 9 }), // troppo corte
            fc.string({ minLength: 65, maxLength: 200 }) // troppo lunghe
          ),
          (pwd) => {
            expect(validatePassword(pwd)).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('rifiuta password senza maiuscole', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 64 })
            .filter(s => !/[A-Z]/.test(s) && /[!@#$%^&*()\\_+\-=\[\]{}|;:,.<>?]/.test(s)),
          (pwd) => {
            expect(validatePassword(pwd)).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('rifiuta password senza caratteri speciali', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 64 })
            .filter(s => /[A-Z]/.test(s) && !/[!@#$%^&*()\\_+\-=\[\]{}|;:,.<>?]/.test(s)),
          (pwd) => {
            expect(validatePassword(pwd)).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // Feature: saltacode-queue-manager, Property 3: formato generazione username
  describe('Property 3: Formato generazione username', () => {
    it('genera username nel formato corretto per input alfabetici', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          (nome, cognome) => {
            const username = generateUsername(nome, cognome);
            const expected = (nome.charAt(0) + cognome).toLowerCase();
            
            // Il risultato deve essere corretto e alfanumerico
            expect(username).toBe(expected);
            expect(/^[a-z0-9]+$/.test(username)).toBe(true);
            expect(username).not.toContain(' ');
            expect(username.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rimuove caratteri non alfanumerici', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          (nome, cognome) => {
            const username = generateUsername(nome, cognome);
            
            // Il risultato non deve mai contenere caratteri speciali o spazi
            expect(/^[a-z0-9]*$/.test(username)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('gestisce input con caratteri speciali', () => {
      const testCases = [
        { nome: "M@rio", cognome: "R-ossi", expected: "mrossi" },
        { nome: "A'nna", cognome: "V.erdi", expected: "averdi" },
        { nome: "L!uca", cognome: "Bia#nchi", expected: "lbianchi" },
      ];

      testCases.forEach(({ nome, cognome, expected }) => {
        expect(generateUsername(nome, cognome)).toBe(expected);
      });
    });
  });
});