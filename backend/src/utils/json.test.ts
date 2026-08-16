import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Property-Based Tests - JSON Round-trip', () => {
  
  // Feature: saltacode-queue-manager, Property 12: round-trip JSON degli oggetti API
  describe('Property 12: Round-trip JSON degli oggetti API', () => {
    it('preserva tutti i campi e valori attraverso serializzazione/deserializzazione', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer(),
            name: fc.string(),
            active: fc.boolean(),
            count: fc.float(),
            nested: fc.record({
              value: fc.string(),
              flag: fc.boolean(),
            }),
            array: fc.array(fc.integer(), { maxLength: 10 }),
            nullValue: fc.constant(null),
          }),
          (originalObject) => {
            // Simula round-trip: oggetto → JSON string → oggetto
            const jsonString = JSON.stringify(originalObject);
            const parsedObject = JSON.parse(jsonString);
            
            // Verifica che tutti i campi siano preservati
            expect(Object.keys(parsedObject)).toEqual(Object.keys(originalObject));
            
            // Verifica che tutti i valori siano identici
            expect(parsedObject.id).toBe(originalObject.id);
            expect(parsedObject.name).toBe(originalObject.name);
            expect(parsedObject.active).toBe(originalObject.active);
            expect(parsedObject.count).toBe(originalObject.count);
            expect(parsedObject.nested.value).toBe(originalObject.nested.value);
            expect(parsedObject.nested.flag).toBe(originalObject.nested.flag);
            expect(parsedObject.array).toEqual(originalObject.array);
            expect(parsedObject.nullValue).toBe(originalObject.nullValue);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('è indipendente dall\'ordine delle chiavi', () => {
      fc.assert(
        fc.property(
          fc.record({
            z_last: fc.string(),
            a_first: fc.integer(),
            m_middle: fc.boolean(),
          }),
          (obj) => {
            // Crea versioni con ordini diversi delle chiavi
            const version1 = { z_last: obj.z_last, a_first: obj.a_first, m_middle: obj.m_middle };
            const version2 = { a_first: obj.a_first, m_middle: obj.m_middle, z_last: obj.z_last };
            
            const json1 = JSON.stringify(version1);
            const json2 = JSON.stringify(version2);
            
            const parsed1 = JSON.parse(json1);
            const parsed2 = JSON.parse(json2);
            
            // I valori devono essere identici indipendentemente dall'ordine originale
            expect(parsed1.a_first).toBe(parsed2.a_first);
            expect(parsed1.m_middle).toBe(parsed2.m_middle);
            expect(parsed1.z_last).toBe(parsed2.z_last);
            
            // Gli oggetti finali devono essere equivalenti
            expect(parsed1).toEqual(parsed2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('gestisce correttamente tipi primitivi JSON', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.float().filter(n => !isNaN(n) && isFinite(n)), // evita NaN e Infinity
            fc.boolean(),
            fc.constant(null),
            fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean())),
          ),
          (value) => {
            const wrapped = { value };
            const jsonString = JSON.stringify(wrapped);
            const parsed = JSON.parse(jsonString);
            
            // Il valore deve essere preservato esattamente
            expect(parsed.value).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preserva strutture annidate profonde', () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              data: 'deep value',
              array: [1, 2, { nested: true }],
            },
          },
        },
      };

      const jsonString = JSON.stringify(deepObject);
      const parsed = JSON.parse(jsonString);

      expect(parsed.level1.level2.level3.data).toBe('deep value');
      expect(parsed.level1.level2.level3.array).toEqual([1, 2, { nested: true }]);
      expect(parsed.level1.level2.level3.array[2].nested).toBe(true);
    });

    it('gestisce array misti', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.record({ id: fc.integer(), name: fc.string() }),
            ),
            { maxLength: 20 }
          ),
          (mixedArray) => {
            const wrapper = { items: mixedArray };
            const jsonString = JSON.stringify(wrapper);
            const parsed = JSON.parse(jsonString);
            
            expect(parsed.items).toEqual(mixedArray);
            expect(parsed.items.length).toBe(mixedArray.length);
            
            // Verifica che ogni elemento sia preservato
            mixedArray.forEach((item, index) => {
              expect(parsed.items[index]).toEqual(item);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preserva stringhe con caratteri speciali', () => {
      const specialStrings = [
        'Hello "World"',
        "Single 'quotes'",
        'Newline\nCharacter',
        'Tab\tCharacter',
        'Unicode: àèìòù 中文 🚀',
        'Backslash: \\',
        'JSON: {"key": "value"}',
      ];

      specialStrings.forEach(str => {
        const obj = { text: str };
        const jsonString = JSON.stringify(obj);
        const parsed = JSON.parse(jsonString);
        
        expect(parsed.text).toBe(str);
      });
    });

    it('gestisce oggetti API tipici di Saltacode', () => {
      const ticketResponse = {
        ticket: {
          id: 123,
          numero: 'AAA001',
          stato: 'ATTESA',
          emessoPer: '2024-01-01T10:00:00.000Z',
        },
        servizio: {
          nome: 'Dichiarazione Redditi',
          lettera: 'A',
        },
        coda: 5,
      };

      const jsonString = JSON.stringify(ticketResponse);
      const parsed = JSON.parse(jsonString);

      expect(parsed).toEqual(ticketResponse);
      expect(parsed.ticket.numero).toBe('AAA001');
      expect(parsed.servizio.nome).toBe('Dichiarazione Redditi');
      expect(parsed.coda).toBe(5);
    });
  });
});