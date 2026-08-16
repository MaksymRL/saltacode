#!/usr/bin/env node

/**
 * Script per backup giornaliero automatico.
 * Viene eseguito dal cron job alle 03:00 ogni giorno.
 * 
 * Uso:
 * node dist/scripts/daily-backup.js
 * 
 * Cron job (aggiungi con `crontab -e`):
 * 0 3 * * * cd /opt/saltacode/backend && node dist/scripts/daily-backup.js
 */

import { performDailyBackup } from '../services/backupService.js';
import { logger } from '../utils/logger.js';

async function main() {
  try {
    logger.info('=== Avvio script backup giornaliero ===');
    
    const result = await performDailyBackup();
    
    if (result.success) {
      logger.info('✅ Backup giornaliero completato con successo', {
        filename: result.filename,
        sizeMB: result.size ? (result.size / (1024 * 1024)).toFixed(2) : undefined,
      });
      process.exit(0);
    } else {
      logger.error('❌ Backup giornaliero fallito', { error: result.error });
      process.exit(1);
    }
  } catch (error) {
    logger.error('❌ Errore fatale nel backup giornaliero', {
      error: error instanceof Error ? error.message : 'Sconosciuto',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Esegui solo se chiamato direttamente (non importato)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}