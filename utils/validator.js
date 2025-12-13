class RateLimiter {
    constructor(maxMessages = 10, windowMs = 60000) {
        this.maxMessages = maxMessages;
        this.windowMs = windowMs;
        this.clients = new Map(); // clientId -> [timestamps]
    }

    tryAcquire(clientId) {
        const now = Date.now();

        if (!this.clients.has(clientId)) {
            this.clients.set(clientId, [now]);
            return true;
        }

        const timestamps = this.clients.get(clientId);

        // Remove old timestamps outside the window
        const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);

        if (validTimestamps.length >= this.maxMessages) {
            this.clients.set(clientId, validTimestamps);
            return false;
        }

        validTimestamps.push(now);
        this.clients.set(clientId, validTimestamps);
        return true;
    }

    reset(clientId) {
        this.clients.delete(clientId);
    }

    cleanup() {
        const now = Date.now();
        for (const [clientId, timestamps] of this.clients.entries()) {
            const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);
            if (validTimestamps.length === 0) {
                this.clients.delete(clientId);
            } else {
                this.clients.set(clientId, validTimestamps);
            }
        }
    }
}

// Validate broadcast message format
function validateBroadcastMessage(data) {
    const requiredFields = ['title', 'url', 'icon', 'source', 'image'];

    if (typeof data !== 'object' || data === null) {
        return { valid: false, error: 'Message must be an object' };
    }

    for (const field of requiredFields) {
        if (!(field in data)) {
            return { valid: false, error: `Missing required field: ${field}` };
        }
        if (typeof data[field] !== 'string') {
            return { valid: false, error: `Field '${field}' must be a string` };
        }
        if (data[field].trim().length === 0) {
            return { valid: false, error: `Field '${field}' cannot be empty` };
        }
    }

    // Validate URLs
    if (!isValidUrl(data.url)) {
        return { valid: false, error: 'Invalid URL format' };
    }

    return { valid: true };
}

// Validate URL format
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Validate username format
function validateUsername(username) {
    if (typeof username !== 'string') {
        return { valid: false, error: 'Username must be a string' };
    }

    const trimmed = username.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'Username cannot be empty' };
    }

    if (trimmed.length > 50) {
        return { valid: false, error: 'Username too long (max 50 characters)' };
    }

    // Allow alphanumeric, underscores, hyphens
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
    }

    return { valid: true, username: trimmed };
}

// Sanitize string to prevent injection
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.trim().substring(0, 1000); // Limit length
}

// Format broadcast message for transmission
function formatBroadcast(data) {
    return {
        type: 'broadcast',
        data: {
            title: sanitizeString(data.title),
            url: sanitizeString(data.url),
            icon: sanitizeString(data.icon),
            source: sanitizeString(data.source),
            image: sanitizeString(data.image)
        },
        timestamp: Date.now()
    };
}

module.exports = {
    RateLimiter,
    validateBroadcastMessage,
    validateUsername,
    sanitizeString,
    formatBroadcast,
    isValidUrl
};
