const LOG_LEVELS = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR'
};

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'INFO';
    }

    log(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...meta
        };

        const formatted = this.format(logEntry);

        if (level === LOG_LEVELS.ERROR) {
            console.error(formatted);
        } else if (level === LOG_LEVELS.WARN) {
            console.warn(formatted);
        } else {
            console.log(formatted);
        }
    }

    format(entry) {
        const { timestamp, level, message, ...meta } = entry;
        const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
        return `[${timestamp}] ${level}: ${message}${metaStr}`;
    }

    info(message, meta) {
        this.log(LOG_LEVELS.INFO, message, meta);
    }

    warn(message, meta) {
        this.log(LOG_LEVELS.WARN, message, meta);
    }

    error(message, meta) {
        this.log(LOG_LEVELS.ERROR, message, meta);
    }

    // Connection events
    connectionOpened(clientId, ip) {
        this.info('Client connected', { clientId, ip });
    }

    connectionClosed(clientId, username, reason) {
        this.info('Client disconnected', { clientId, username, reason });
    }

    authAttempt(clientId, username, success) {
        if (success) {
            this.info('Authentication successful', { clientId, username });
        } else {
            this.warn('Authentication failed', { clientId, username });
        }
    }

    authTimeout(clientId) {
        this.warn('Authentication timeout', { clientId });
    }

    broadcastSent(username, recipients) {
        this.info('Broadcast sent', { username, recipients });
    }

    rateLimitExceeded(clientId, username) {
        this.warn('Rate limit exceeded', { clientId, username });
    }

    invalidMessage(clientId, reason) {
        this.warn('Invalid message', { clientId, reason });
    }

    serverStarted(port) {
        this.info(`WebSocket server started on port ${port}`);
    }

    serverShutdown() {
        this.info('Server shutting down gracefully');
    }
}

module.exports = new Logger();
