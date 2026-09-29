import winston from 'winston';

// Di Vercel/Lambda filesystem read-only — hanya pakai Console transport.
// Di Railway/self-hosted — tambah file rotation.
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
];

if (!isServerless) {
  try {
    require('winston-daily-rotate-file');
    transports.push(new (winston.transports as any).DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }));
  } catch {
    // Filesystem tidak writable — abaikan, console saja
  }
}

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
});
