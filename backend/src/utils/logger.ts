import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const logDir = process.env['LOG_DIR'] ?? path.join(process.cwd(), 'logs');

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console (sviluppo)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      silent: process.env['NODE_ENV'] === 'test',
    }),
    // File rotante — solo ERROR e superiori
    new DailyRotateFile({
      dirname: logDir,
      filename: 'saltacode-error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '100m',
      maxFiles: '30d',
      zippedArchive: true,
    }),
    // File rotante — tutti i livelli
    new DailyRotateFile({
      dirname: logDir,
      filename: 'saltacode-combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '30d',
      zippedArchive: true,
    }),
  ],
});
