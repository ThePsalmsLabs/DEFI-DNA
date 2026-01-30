import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: isProduction
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} ${level}: ${message}${metaStr}`;
        })
      ),
  defaultMeta: { service: 'defi-dna-backend' },
  transports: [new winston.transports.Console()],
});

export function captureException(error: unknown): void {
  logger.error('Exception', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
  if (typeof global !== 'undefined' && (global as any).__sentry) {
    (global as any).__sentry.captureException(error);
  }
}
