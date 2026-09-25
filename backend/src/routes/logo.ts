import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOGO_PNG_PATH = path.join(__dirname, 'logo-test.png');
const LOGO_SVG_PATH = path.join(__dirname, '../../../frontend/dist/logo.svg');
const LOGO_PNG_BAK  = path.join(__dirname, '../../assets/logo-test.png');

const router = Router();

// Parser raw per file binari (max 2MB) — nessuna dipendenza esterna
import express from 'express';
const rawParser = express.raw({ type: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'], limit: '2mb' });

/**
 * GET /api/logo/current
 * Pubblico — restituisce info sul logo attuale
 */
router.get('/current', (_req: Request, res: Response) => {
  const pngExists = fs.existsSync(LOGO_PNG_PATH);
  const svgExists = fs.existsSync(LOGO_SVG_PATH);
  res.json({
    hasPng: pngExists,
    hasSvg: svgExists,
    pdfLogoUrl: pngExists ? '/api/logo/pdf-preview' : null,
  });
});

/**
 * GET /api/logo/pdf-preview
 * Pubblico — restituisce il logo PNG usato nel PDF
 */
router.get('/pdf-preview', (_req: Request, res: Response) => {
  if (fs.existsSync(LOGO_PNG_PATH)) {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(LOGO_PNG_PATH);
  } else {
    res.status(404).json({ error: 'Logo PDF non trovato.' });
  }
});

/**
 * POST /api/logo/upload
 * Solo SUPERADMIN — carica un nuovo logo.
 * - PNG/JPEG → sostituisce il logo del PDF
 * - SVG → sostituisce il logo del frontend
 * - PNG/JPEG → viene anche convertito/usato come SVG nel frontend (come img)
 *
 * Il frontend usa /logo.svg — se carichi un PNG, viene anche salvato come
 * logo.png e il Logo.tsx viene aggiornato per usarlo.
 */
router.post('/upload',
  authenticate,
  authorize('SUPERADMIN'),
  rawParser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const buffer = req.body as Buffer;
      const contentType = req.headers['content-type'] ?? '';

      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        res.status(400).json({ error: 'Nessun file caricato. Invia il file come body raw con Content-Type image/png, image/jpeg o image/svg+xml.' });
        return;
      }

      if (buffer.length > 2 * 1024 * 1024) {
        res.status(400).json({ error: 'File troppo grande. Max 2MB.' });
        return;
      }

      const isSvg = contentType.includes('svg');
      const mimetype = contentType.split(';')[0].trim();

      if (isSvg) {
        // SVG → salva direttamente come logo.svg nel frontend dist
        fs.writeFileSync(LOGO_SVG_PATH, buffer);
        res.json({ message: 'Logo SVG aggiornato.', type: 'svg' });
      } else {
        // PNG/JPEG → salva come logo PDF
        fs.writeFileSync(LOGO_PNG_PATH, buffer);
        // Backup in assets/
        try { fs.writeFileSync(LOGO_PNG_BAK, buffer); } catch { /* ignora */ }

        // Crea anche un SVG wrapper che punta al PNG come data URL
        // così il frontend vede il nuovo logo
        const ext = mimetype === 'image/png' ? 'png' : 'jpg';
        const dataUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
        const svgWrapper = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80">
  <image href="${dataUrl}" width="300" height="80" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
        fs.writeFileSync(LOGO_SVG_PATH, svgWrapper);

        res.json({ message: `Logo ${ext.toUpperCase()} aggiornato (PDF + frontend).`, type: ext });
      }
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/logo/reset
 * Solo SUPERADMIN — ripristina il logo di default (rimuove i file caricati)
 */
router.delete('/reset', authenticate, authorize('SUPERADMIN'), (_req: Request, res: Response) => {
  // Non eliminiamo — ripristiniamo il logo originale dal backup o dal sorgente
  const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80" width="240" height="80">
  <rect width="240" height="80" rx="8" fill="#1a1a2e"/>
  <rect x="0" y="0" width="8" height="80" rx="4" fill="#e74c3c"/>
  <text x="24" y="30" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="900" fill="#ffffff" letter-spacing="6">CISL</text>
  <text x="24" y="50" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="#94a3b8" letter-spacing="2">Confederazione Italiana</text>
  <text x="24" y="64" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="#94a3b8" letter-spacing="2">Sindacati Lavoratori</text>
  <rect x="180" y="8" width="52" height="18" rx="4" fill="#e74c3c"/>
  <text x="206" y="21" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="700" fill="white" text-anchor="middle" letter-spacing="1">TEST</text>
</svg>`;
  try { fs.writeFileSync(LOGO_SVG_PATH, defaultSvg); } catch { /* ignora */ }
  res.json({ message: 'Logo ripristinato al default.' });
});

export default router;
