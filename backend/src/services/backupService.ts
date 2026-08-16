import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

interface BackupResult {
  success: boolean;
  filename?: string;
  size?: number;
  error?: string;
}

/**
 * Esegue backup del database PostgreSQL usando pg_dump.
 * Salva il backup in /var/backups/saltacode/ con timestamp.
 */
export async function createDatabaseBackup(): Promise<BackupResult> {
  const backupDir = '/var/backups/saltacode';
  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `backup_${timestamp}.sql.gz`;
  const filepath = join(backupDir, filename);

  try {
    // Crea directory se non esiste
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    // Estrai info di connessione dalla DATABASE_URL
    const dbUrl = new URL(config.database.url);
    const dbName = dbUrl.pathname.slice(1); // rimuove il '/' iniziale
    const dbHost = dbUrl.hostname;
    const dbPort = dbUrl.port || '5432';
    const dbUser = dbUrl.username;
    const dbPassword = dbUrl.password;

    // Comando pg_dump con compressione gzip
    const cmd = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} | gzip > ${filepath}`;
    
    logger.info('Avvio backup database...', { filename });
    
    const startTime = Date.now();
    await execAsync(cmd);
    const duration = Date.now() - startTime;
    
    // Verifica che il file sia stato creato
    if (!existsSync(filepath)) {
      throw new Error('File di backup non creato');
    }

    const stats = statSync(filepath);
    const sizeBytes = stats.size;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    
    logger.info('Backup completato con successo', {
      filename,
      sizeBytes,
      sizeMB,
      durationMs: duration,
    });

    return {
      success: true,
      filename,
      size: sizeBytes,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Errore sconosciuto';
    
    logger.error('Backup fallito', {
      filename,
      error: errorMsg,
    });

    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Rimuove backup più vecchi di 7 giorni.
 * Mantiene solo gli ultimi 7 backup.
 */
export async function cleanupOldBackups(): Promise<void> {
  const backupDir = '/var/backups/saltacode';
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 giorni in millisecondi
  const now = Date.now();

  try {
    if (!existsSync(backupDir)) {
      return;
    }

    const files = readdirSync(backupDir)
      .filter(file => file.startsWith('backup_') && file.endsWith('.sql.gz'))
      .map(file => {
        const filepath = join(backupDir, file);
        const stats = statSync(filepath);
        return {
          name: file,
          path: filepath,
          mtime: stats.mtime.getTime(),
        };
      })
      .sort((a, b) => b.mtime - a.mtime); // più recenti prima

    let deletedCount = 0;

    // Elimina file più vecchi di 7 giorni, ma mantieni sempre almeno 3 backup
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const age = now - file.mtime;
      
      // Mantieni sempre i primi 3 backup (più recenti)
      if (i < 3) continue;
      
      // Elimina se più vecchio di 7 giorni
      if (age > maxAge) {
        unlinkSync(file.path);
        deletedCount++;
        logger.info('Backup obsoleto eliminato', { filename: file.name, ageHours: Math.round(age / (60 * 60 * 1000)) });
      }
    }

    logger.info('Pulizia backup completata', { deletedCount, totalFiles: files.length });
  } catch (error) {
    logger.error('Errore durante pulizia backup', { error: error instanceof Error ? error.message : 'Sconosciuto' });
  }
}

/**
 * Esegue backup completo: crea backup + pulizia vecchi file.
 * Questa funzione viene chiamata dal cron job.
 */
export async function performDailyBackup(): Promise<BackupResult> {
  logger.info('Avvio backup giornaliero automatico');
  
  const result = await createDatabaseBackup();
  
  if (result.success) {
    // Solo se il backup è riuscito, pulisci i vecchi
    await cleanupOldBackups();
  }
  
  logger.info('Backup giornaliero completato', { success: result.success });
  
  return result;
}