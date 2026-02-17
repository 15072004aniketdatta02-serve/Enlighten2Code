import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Log Levels Enum
 */
export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  logDir: path.join(__dirname, '.logs'),
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  enableConsole: true,
  enableFile: true,
  dateFormat: 'ISO',
};

/**
 * Log Stream Manager - Handles file stream creation and management
 */
class LogStreamManager {
  #streams = new Map();
  #logDir;
  #maxFileSize;
  #maxFiles;

  constructor({ logDir, maxFileSize, maxFiles }) {
    this.#logDir = logDir;
    this.#maxFileSize = maxFileSize;
    this.#maxFiles = maxFiles;
  }

  /**
   * Ensures log directory exists
   */
  async ensureLogDir() {
    try {
      await fs.access(this.#logDir);
    } catch {
      await fs.mkdir(this.#logDir, { recursive: true });
    }
  }

  /**
   * Gets or creates a write stream for a file
   */
  async getStream(fileName) {
    await this.ensureLogDir();
    const target = path.join(this.#logDir, fileName);

    if (!this.#streams.has(target)) {
      // Check file size and rotate if needed
      await this.#rotateIfNeeded(target);
      
      const stream = fsSync.createWriteStream(target, {
        flags: 'a',
        encoding: 'utf8',
      });

      // Handle stream errors
      stream.on('error', (error) => {
        console.error(`Stream error for ${target}:`, error);
      });

      this.#streams.set(target, stream);
    }

    return this.#streams.get(target);
  }

  /**
   * Rotates log files if they exceed max size
   */
  async #rotateIfNeeded(filePath) {
    try {
      const stats = await fs.stat(filePath).catch(() => null);
      if (!stats || stats.size < this.#maxFileSize) return;

      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // Rotate existing files
      for (let i = this.#maxFiles - 1; i >= 1; i--) {
        const oldFile = path.join(dir, `${base}.${i}${ext}`);
        const newFile = path.join(dir, `${base}.${i + 1}${ext}`);
        
        if (fsSync.existsSync(oldFile)) {
          await fs.rename(oldFile, newFile);
        }
      }

      // Move current file to .1
      const firstRotated = path.join(dir, `${base}.1${ext}`);
      if (fsSync.existsSync(filePath)) {
        await fs.rename(filePath, firstRotated);
      }
    } catch (error) {
      console.error(`Error rotating log file ${filePath}:`, error);
    }
  }

  /**
   * Closes all streams
   */
  async closeAll() {
    const closePromises = Array.from(this.#streams.values()).map(
      (stream) =>
        new Promise((resolve) => {
          stream.end(() => resolve());
        })
    );
    await Promise.all(closePromises);
    this.#streams.clear();
  }
}

/**
 * Log Formatter - Handles log formatting
 */
class LogFormatter {
  static format(level, message, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...meta,
    };

    return JSON.stringify(logEntry);
  }

  static formatError(error) {
    if (!(error instanceof Error)) return error;

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
}

/**
 * Main Logger Class
 */
export class Logger {
  #streamManager;
  #context;
  #fileName;
  #config;
  #minLevel;

  constructor(context = 'app', fileName = 'app.log', config = {}) {
    this.#context = context;
    this.#fileName = fileName;
    this.#config = { ...DEFAULT_CONFIG, ...config };
    this.#minLevel = this.#config.minLevel || LogLevel.DEBUG;
    
    this.#streamManager = new LogStreamManager({
      logDir: this.#config.logDir,
      maxFileSize: this.#config.maxFileSize,
      maxFiles: this.#config.maxFiles,
    });
  }

  /**
   * Checks if log level should be logged
   */
  #shouldLog(level) {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
    const currentIndex = levels.indexOf(level);
    const minIndex = levels.indexOf(this.#minLevel);
    return currentIndex <= minIndex;
  }

  /**
   * Writes log entry
   */
  async #writeLog(level, message, meta = {}) {
    if (!this.#shouldLog(level)) return;

    const baseMeta = { context: this.#context };
    const mergedMeta = { ...baseMeta, ...meta };

    // Format error objects if present
    if (meta.error instanceof Error) {
      mergedMeta.error = LogFormatter.formatError(meta.error);
    }

    const formattedLine = LogFormatter.format(level, message, mergedMeta);

    // Write to file
    if (this.#config.enableFile) {
      try {
        const stream = await this.#streamManager.getStream(this.#fileName);
        stream.write(formattedLine + '\n');
      } catch (error) {
        // Fallback to console if file write fails
        if (this.#config.enableConsole) {
          console.error(`File write failed: ${error.message}`);
          console.log(formattedLine);
        }
      }
    }

    // Write to console
    if (this.#config.enableConsole) {
      const consoleMethod = this.#getConsoleMethod(level);
      consoleMethod(formattedLine);
    }
  }

  /**
   * Gets appropriate console method for log level
   */
  #getConsoleMethod(level) {
    const methods = {
      [LogLevel.ERROR]: console.error,
      [LogLevel.WARN]: console.warn,
      [LogLevel.INFO]: console.info,
      [LogLevel.DEBUG]: console.debug,
    };
    return methods[level] || console.log;
  }

  /**
   * Log info message
   */
  info(message, meta = {}) {
    return this.#writeLog(LogLevel.INFO, message, meta);
  }

  /**
   * Log warning message
   */
  warn(message, meta = {}) {
    return this.#writeLog(LogLevel.WARN, message, meta);
  }

  /**
   * Log error message
   */
  error(message, meta = {}) {
    return this.#writeLog(LogLevel.ERROR, message, meta);
  }

  /**
   * Log debug message
   */
  debug(message, meta = {}) {
    return this.#writeLog(LogLevel.DEBUG, message, meta);
  }

  /**
   * Creates a child logger with additional context
   */
  child(additionalContext, fileName) {
    const newContext = fileName 
      ? additionalContext 
      : `${this.#context}:${additionalContext}`;
    const newFileName = fileName || this.#fileName;
    return new Logger(newContext, newFileName, this.#config);
  }

  /**
   * Closes the logger and all streams
   */
  async close() {
    await this.#streamManager.closeAll();
  }
}

/**
 * HTTP Logger Middleware Class
 */
export class HttpLoggerMiddleware {
  #logger;
  #redactBody;
  #redactHeaders;
  #sensitiveHeaders;

  constructor(options = {}) {
    const fileName = options.fileName ?? 'http.log';
    const redactBody = options.redactBody ?? true;
    const redactHeaders = options.redactHeaders ?? true;
    const sensitiveHeaders = options.sensitiveHeaders ?? [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
    ];

    this.#logger = new Logger('http', fileName, options.loggerConfig);
    this.#redactBody = redactBody;
    this.#redactHeaders = redactHeaders;
    this.#sensitiveHeaders = sensitiveHeaders.map((h) => h.toLowerCase());
  }

  /**
   * Redacts sensitive headers
   */
  #redactSensitiveHeaders(headers) {
    if (!this.#redactHeaders) return headers;

    const redacted = { ...headers };
    this.#sensitiveHeaders.forEach((header) => {
      if (redacted[header]) {
        redacted[header] = '[REDACTED]';
      }
    });

    return redacted;
  }

  /**
   * Express middleware function
   */
  middleware() {
    return async (req, res, next) => {
      const start = process.hrtime.bigint();
      const { method, url, headers, ip, body } = req;
      const userAgent = headers['user-agent'];

      // Redact sensitive headers
      const safeHeaders = this.#redactSensitiveHeaders(headers);

      // Capture request body if needed
      const requestBody = this.#redactBody ? undefined : body;

      // Capture response
      res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const duration = Math.round(durationMs * 100) / 100;

        const logMeta = {
          method,
          url,
          statusCode: res.statusCode,
          durationMs: duration,
          ip,
          userAgent,
          headers: safeHeaders,
          ...(requestBody && { requestBody }),
        };

        // Log based on status code
        if (res.statusCode >= 500) {
          this.#logger.error('http_request', logMeta);
        } else if (res.statusCode >= 400) {
          this.#logger.warn('http_request', logMeta);
        } else {
          this.#logger.info('http_request', logMeta);
        }
      });

      res.on('error', (error) => {
        this.#logger.error('http_response_error', {
          method,
          url,
          error: LogFormatter.formatError(error),
        });
      });

      next();
    };
  }
}

/**
 * Socket Logger Class for Baileys
 */
export class SocketLogger {
  #logger;

  constructor(options = {}) {
    const fileName = options.fileName ?? 'baileys.log';
    this.#logger = new Logger('baileys', fileName, options.loggerConfig);
  }

  /**
   * Wires socket logging events
   */
  wireSocketLogging(socket) {
    if (!socket?.ev) {
      throw new Error('Socket must have an "ev" event emitter');
    }

    // Connection updates
    socket.ev.on('connection.update', (update = {}) => {
      const { connection, lastDisconnect } = update;
      this.#logger.info('connection.update', {
        connection,
        lastDisconnectCode: lastDisconnect?.error?.output?.statusCode,
        lastDisconnectError: lastDisconnect?.error?.message,
      });
    });

    // Credentials update
    socket.ev.on('creds.update', () => {
      this.#logger.info('creds.update');
    });

    // Messages upsert
    socket.ev.on('messages.upsert', (update) => {
      const count = update?.messages?.length ?? 0;
      this.#logger.info('messages.upsert', {
        count,
        type: update?.type,
      });
    });

    // Messages update
    socket.ev.on('messages.update', (updates) => {
      const count = Array.isArray(updates) ? updates.length : 0;
      this.#logger.info('messages.update', { count });
    });

    // Error handling
    socket.ev.on('error', (error) => {
      this.#logger.error('socket_error', {
        error: LogFormatter.formatError(error),
      });
    });
  }
}

/**
 * Factory function for creating app logger (backward compatibility)
 */
export function appLogger(context = 'app', fileName = 'app.log', config = {}) {
  return new Logger(context, fileName, config);
}

/**
 * Factory function for creating HTTP logger middleware (backward compatibility)
 */
export function httpLogger(options = {}) {
  const middleware = new HttpLoggerMiddleware(options);
  return middleware.middleware();
}

/**
 * Factory function for wiring socket logging (backward compatibility)
 */
export function wireSocketLogging(socket, loggerOptions = {}) {
  const socketLogger = new SocketLogger(loggerOptions);
  socketLogger.wireSocketLogging(socket);
}

// Export default logger instance
export default new Logger('app', 'app.log');