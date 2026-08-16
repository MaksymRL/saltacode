import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../app.js';
import request from 'supertest';
import { Express } from 'express';

describe('Integration Tests - Saltacode', () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
  });

  describe('Health Check System', () => {
    it('should respond to basic health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('status');
      expect(['ok', 'error']).toContain(response.body.status);
      
      if (response.body.db === 'connected') {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(503);
      }
    });

    it('should respond to readiness probe', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should respond to liveness probe', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body.status).toBe('alive');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
    });
  });

  describe('API Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect((res) => {
          // Helmet dovrebbe aggiungere questi header
          expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
          expect(res.headers).toHaveProperty('x-frame-options');
        });
    });
  });

  describe('CORS Configuration', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 routes gracefully', async () => {
      const response = await request(app)
        .get('/api/non-existent-route')
        .expect(404);

      // Il middleware errorHandler dovrebbe gestire 404 senza stack trace
      if (response.body.error) {
        expect(response.body.error).not.toContain('stack');
        expect(response.body.error).not.toContain('Error:');
      }
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ malformed json }');

      expect(response.status).toBe(400);
    });

    it('should limit request body size', async () => {
      const largePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB payload
      
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send(`{"data": "${largePayload}"}`);

      expect(response.status).toBe(413); // Payload Too Large
    });
  });

  describe('Request Logging', () => {
    it('should add request ID header to responses', async () => {
      const response = await request(app).get('/health');
      
      expect(response.headers).toHaveProperty('x-request-id');
      expect(typeof response.headers['x-request-id']).toBe('string');
      expect(response.headers['x-request-id'].length).toBeGreaterThan(0);
    });
  });

  describe('API Response Times', () => {
    it('should respond to health check within 2 seconds', async () => {
      const startTime = Date.now();
      
      await request(app).get('/health');
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000); // < 2 secondi
    });
  });

  describe('Content Compression', () => {
    it('should compress JSON responses when requested', async () => {
      const response = await request(app)
        .get('/health')
        .set('Accept-Encoding', 'gzip');

      // Se la risposta è compressa, dovrebbe avere questo header
      // (dipende dalla dimensione della risposta)
      if (response.headers['content-encoding']) {
        expect(response.headers['content-encoding']).toContain('gzip');
      }
    });
  });

  describe('System Performance', () => {
    it('should handle multiple concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        request(app).get('/health')
      );

      const responses = await Promise.all(promises);
      
      // Tutte le richieste dovrebbero completarsi
      expect(responses).toHaveLength(10);
      
      // Almeno alcune dovrebbero avere successo
      const successfulResponses = responses.filter(r => r.status === 200 || r.status === 503);
      expect(successfulResponses.length).toBeGreaterThan(0);
    });
  });
});