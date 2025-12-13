require('dotenv').config();
const WebSocket = require('ws');
const Database = require('./db/database');
const logger = require('./utils/logger');
const {
    RateLimiter,
    validateBroadcastMessage,
    validateUsername,
    formatBroadcast
} = require('./utils/validator');

const PORT = process.env.PORT || 8080;
const AUTH_TIMEOUT_MS = 30000; // 30 seconds to authenticate
const PING_INTERVAL_MS = 15000; // 15 seconds ping interval
const MAX_MESSAGE_SIZE = 100000; // 100KB max message size (for messages with long URLs)
const RATE_LIMIT_MESSAGES = 100; // messages per minute (broadcasters only can send)
const RATE_LIMIT_WINDOW = 60000; // 1 minute

class WebSocketServer {
    constructor() {
        this.wss = null;
        this.db = new Database();
        this.clients = new Map(); // clientId -> { ws, username, isBroadcaster, isAdmin, authenticated, authTimer, ip, connectedAt, messagesReceived }
        this.rateLimiter = new RateLimiter(RATE_LIMIT_MESSAGES, RATE_LIMIT_WINDOW);
        this.pingInterval = null;
        this.clientIdCounter = 0;

        // Global stats
        this.stats = {
            totalConnections: 0,
            totalDisconnections: 0,
            totalBroadcasts: 0,
            totalMessagesDelivered: 0,
            serverStartedAt: Date.now()
        };
    }

    async start() {
        // Test database connection
        const connected = await this.db.testConnection();
        if (!connected) {
            logger.error('Failed to connect to database. Exiting.');
            process.exit(1);
        }

        // Create WebSocket server
        this.wss = new WebSocket.Server({ port: PORT });

        this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

        // Setup ping interval (15s, no pong wait)
        this.pingInterval = setInterval(() => this.sendPings(), PING_INTERVAL_MS);

        // Cleanup rate limiter periodically
        setInterval(() => this.rateLimiter.cleanup(), 60000);

        // Graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());

        logger.serverStarted(PORT);
    }

    handleConnection(ws, req) {
        const clientId = ++this.clientIdCounter;
        const ip = req.socket.remoteAddress;

        logger.connectionOpened(clientId, ip);

        // Set message size limit
        ws.on('message', (data) => {
            if (data.length > MAX_MESSAGE_SIZE) {
                logger.invalidMessage(clientId, 'Message too large');
                ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
                return;
            }
            this.handleMessage(clientId, data);
        });

        ws.on('close', () => this.handleDisconnect(clientId));
        ws.on('error', (error) => {
            logger.error('WebSocket error', { clientId, error: error.message });
        });

        // Store client info
        const authTimer = setTimeout(() => {
            if (!this.clients.get(clientId)?.authenticated) {
                logger.authTimeout(clientId);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Authentication timeout. Send "login <username>" within 30 seconds.'
                }));
                ws.close(1008, 'Authentication timeout');
            }
        }, AUTH_TIMEOUT_MS);

        this.stats.totalConnections++;

        this.clients.set(clientId, {
            ws,
            authenticated: false,
            username: null,
            isBroadcaster: false,
            isAdmin: false,
            sourceFilters: ['*'],
            authTimer,
            ip,
            connectedAt: Date.now(),
            messagesReceived: 0
        });

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'info',
            message: 'Connected. Authenticate with: login <username> [source1, source2] or login <username> [*]'
        }));
    }

    async handleMessage(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client) return;

        let message;
        try {
            message = data.toString().trim();
        } catch (error) {
            logger.invalidMessage(clientId, 'Invalid message format');
            return;
        }

        // Check rate limit
        if (!this.rateLimiter.tryAcquire(clientId)) {
            logger.rateLimitExceeded(clientId, client.username);
            client.ws.send(JSON.stringify({
                type: 'error',
                message: 'Rate limit exceeded. Please slow down.'
            }));
            return;
        }

        // Handle login command
        if (message.startsWith('login ')) {
            await this.handleLogin(clientId, message);
            return;
        }

        // Require authentication for all other commands
        if (!client.authenticated) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: 'Not authenticated. Use: login <username>'
            }));
            return;
        }

        // Handle admin commands
        if (message.startsWith('admin ')) {
            await this.handleAdminCommand(clientId, message);
            return;
        }

        // Handle stats command
        if (message === 'stats') {
            this.sendStats(clientId);
            return;
        }

        // Handle broadcast (only broadcasters can send)
        if (message.startsWith('broadcast ')) {
            await this.handleBroadcast(clientId, message);
            return;
        }

        // Try to parse as JSON broadcast message
        try {
            const jsonData = JSON.parse(message);
            await this.handleBroadcast(clientId, message, jsonData);
        } catch (error) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: 'Unknown command. Available: broadcast <json>, stats, admin <command>'
            }));
        }
    }

    async handleLogin(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;

        if (client.authenticated) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: 'Already authenticated'
            }));
            return;
        }

        // Parse: login username [filter1, filter2]
        const loginContent = message.substring(6).trim();

        // Extract filters if present
        let username, sourceFilters;
        const filterMatch = loginContent.match(/^(\S+)\s*\[([^\]]*)\]$/);

        if (filterMatch) {
            // Has filters: login username [source1, source2]
            username = filterMatch[1];
            const filterStr = filterMatch[2].trim();
            if (filterStr === '') {
                sourceFilters = []; // Empty = receive nothing
            } else if (filterStr === '*') {
                sourceFilters = ['*']; // * = receive all
            } else {
                sourceFilters = filterStr.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
            }
        } else {
            // No filters: login username (default to all)
            username = loginContent;
            sourceFilters = ['*'];
        }

        // Validate username format
        const validation = validateUsername(username);
        if (!validation.valid) {
            logger.authAttempt(clientId, username, false);
            client.ws.send(JSON.stringify({
                type: 'error',
                message: `Invalid username: ${validation.error}`
            }));
            return;
        }

        const validUsername = validation.username;

        // Check whitelist
        const isWhitelisted = await this.db.isUserWhitelisted(validUsername);
        if (!isWhitelisted) {
            logger.authAttempt(clientId, validUsername, false);
            client.ws.send(JSON.stringify({
                type: 'error',
                message: 'Access denied. Username not whitelisted.'
            }));
            client.ws.close(1008, 'Not whitelisted');
            return;
        }

        // Check if broadcaster
        const isBroadcaster = await this.db.isBroadcaster(validUsername);

        // Check if admin
        const isAdmin = await this.db.isAdmin(validUsername);

        // Authentication successful
        clearTimeout(client.authTimer);
        client.authenticated = true;
        client.username = validUsername;
        client.isBroadcaster = isBroadcaster;
        client.isAdmin = isAdmin;
        client.sourceFilters = sourceFilters;

        logger.authAttempt(clientId, validUsername, true);
        logger.info('Source filters set', { username: validUsername, filters: sourceFilters });

        client.ws.send(JSON.stringify({
            type: 'auth_success',
            username: validUsername,
            isBroadcaster,
            isAdmin,
            sourceFilters,
            message: `Welcome, ${validUsername}! Filters: ${sourceFilters.length === 0 ? 'none' : sourceFilters.join(', ')}`
        }));
    }

    async handleBroadcast(clientId, rawMessage, jsonData = null) {
        const client = this.clients.get(clientId);
        if (!client) return;

        // Check if user is a broadcaster
        if (!client.isBroadcaster) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: 'Permission denied. Only broadcasters can send messages.'
            }));
            return;
        }

        let broadcastData;

        if (jsonData) {
            // Already parsed JSON
            broadcastData = jsonData;
        } else {
            // Parse from "broadcast <json>" format
            const jsonString = rawMessage.substring(10).trim();
            try {
                broadcastData = JSON.parse(jsonString);
            } catch (error) {
                client.ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid JSON format'
                }));
                return;
            }
        }

        // Validate broadcast message format
        const validation = validateBroadcastMessage(broadcastData);
        if (!validation.valid) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: `Invalid broadcast: ${validation.error}`
            }));
            return;
        }

        // Format and send to all authenticated clients based on their source filters
        const formattedMessage = formatBroadcast(broadcastData);
        const broadcastSource = broadcastData.source.toLowerCase();
        let recipients = 0;

        for (const [id, otherClient] of this.clients.entries()) {
            if (otherClient.authenticated && otherClient.ws.readyState === WebSocket.OPEN) {
                // Check source filters
                const filters = otherClient.sourceFilters || ['*'];

                // Empty filters = receive nothing
                if (filters.length === 0) continue;

                // * = receive all, otherwise check if source matches
                if (filters[0] !== '*' && !filters.includes(broadcastSource)) continue;

                otherClient.ws.send(JSON.stringify(formattedMessage));
                otherClient.messagesReceived++;
                recipients++;
            }
        }

        this.stats.totalBroadcasts++;
        this.stats.totalMessagesDelivered += recipients;

        logger.broadcastSent(client.username, recipients);

        // Send confirmation to broadcaster
        client.ws.send(JSON.stringify({
            type: 'broadcast_sent',
            recipients,
            message: `Broadcast sent to ${recipients} clients`
        }));
    }

    async handleAdminCommand(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;

        // Check if user is an admin
        if (!client.isAdmin) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: 'Permission denied. Admin access required.'
            }));
            return;
        }

        const parts = message.split(' ');
        const command = parts[1];
        const password = parts[2];
        const target = parts[3];

        // Check admin password (extra security layer)
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (adminPassword && password !== adminPassword) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid admin password.'
            }));
            return;
        }

        if (!target) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: 'Usage: admin <command> <password> <username>'
            }));
            return;
        }

        try {
            switch (command) {
                case 'add_user':
                    await this.db.addUser(target);
                    client.ws.send(JSON.stringify({
                        type: 'admin_response',
                        message: `User ${target} added to whitelist`
                    }));
                    break;

                case 'remove_user':
                    await this.db.removeUser(target);
                    client.ws.send(JSON.stringify({
                        type: 'admin_response',
                        message: `User ${target} removed from whitelist`
                    }));
                    break;

                case 'add_broadcaster':
                    await this.db.addBroadcaster(target);
                    client.ws.send(JSON.stringify({
                        type: 'admin_response',
                        message: `${target} granted broadcaster permissions`
                    }));
                    break;

                case 'remove_broadcaster':
                    await this.db.removeBroadcaster(target);
                    client.ws.send(JSON.stringify({
                        type: 'admin_response',
                        message: `${target} removed from broadcasters`
                    }));
                    break;

                default:
                    client.ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Unknown admin command'
                    }));
            }
        } catch (error) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: `Admin command failed: ${error.message}`
            }));
        }
    }

    sendStats(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;

        const now = Date.now();
        const connectedUsers = Array.from(this.clients.values())
            .filter(c => c.authenticated)
            .map(c => ({
                username: c.username,
                isBroadcaster: c.isBroadcaster,
                isAdmin: c.isAdmin,
                sourceFilters: c.sourceFilters,
                ip: c.ip,
                connectedFor: Math.floor((now - c.connectedAt) / 1000),
                messagesReceived: c.messagesReceived
            }));

        const stats = {
            // Current connections
            currentConnections: this.clients.size,
            authenticatedUsers: connectedUsers.length,
            broadcasters: connectedUsers.filter(u => u.isBroadcaster).length,
            admins: connectedUsers.filter(u => u.isAdmin).length,

            // Lifetime stats
            totalConnections: this.stats.totalConnections,
            totalDisconnections: this.stats.totalDisconnections,
            totalBroadcasts: this.stats.totalBroadcasts,
            totalMessagesDelivered: this.stats.totalMessagesDelivered,

            // Uptime
            uptime: process.uptime(),
            serverStartedAt: this.stats.serverStartedAt,

            // Connected users detail
            connectedUsers
        };

        client.ws.send(JSON.stringify({
            type: 'stats',
            data: stats
        }));
    }

    sendPings() {
        for (const [clientId, client] of this.clients.entries()) {
            if (client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.ping();
                } catch (error) {
                    logger.error('Ping error', { clientId, error: error.message });
                }
            }
        }
    }

    handleDisconnect(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;

        if (client.authTimer) {
            clearTimeout(client.authTimer);
        }

        this.stats.totalDisconnections++;
        logger.connectionClosed(clientId, client.username, 'Client disconnected');
        this.rateLimiter.reset(clientId);
        this.clients.delete(clientId);
    }

    async shutdown() {
        logger.serverShutdown();

        // Close all client connections
        for (const [clientId, client] of this.clients.entries()) {
            client.ws.close(1001, 'Server shutting down');
        }

        // Clear intervals
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        // Close WebSocket server
        if (this.wss) {
            this.wss.close();
        }

        // Close database
        await this.db.close();

        process.exit(0);
    }
}

// Start server
const server = new WebSocketServer();
server.start().catch(error => {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
});
