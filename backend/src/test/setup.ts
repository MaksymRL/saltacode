// Setup file per i test
import { beforeAll, afterAll } from 'vitest';

// Configurazione ambiente di test
beforeAll(async () => {
  // Setup test database se necessario
  process.env.NODE_ENV = 'test';
  
  // Imposta variabili d'ambiente per test
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/saltacode_test?schema=public';
  }
  
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret-very-long-for-testing-purposes-minimum-64-chars';
  }
  
  process.env.BCRYPT_COST_FACTOR = '4'; // Più veloce nei test
});

afterAll(async () => {
  // Cleanup se necessario
});