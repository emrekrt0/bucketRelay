# WebSocket Receiver & Broadcaster

A comprehensive, secure WebSocket server with database-backed authentication, role-based broadcasting permissions, and Railway deployment support.

## 🚀 Features

- **Database-backed Authentication**: PostgreSQL whitelist for secure user management
- **Role-based Permissions**: Separate broadcaster and regular user roles
- **Security First**:
  - 30-second authentication timeout
  - Rate limiting (20 messages/minute)
  - Message size limits (10KB)
  - Input validation and sanitization
  - Automatic ping every 15 seconds
- **Admin Commands**: Manage users and broadcasters without restart
- **Real-time Statistics**: Monitor connections and active users
- **Graceful Shutdown**: Properly close all connections
- **Railway Ready**: Environment-based configuration

## 📋 Message Format

Broadcasters must send messages with all 5 required fields:

```json
{
  "title": "Breaking News",
  "url": "https://example.com/article",
  "icon": "https://example.com/icon.png",
  "source": "NewsSource",
  "image": "https://example.com/image.jpg"
}
```

## 🛠️ Installation

### Local Development

1. **Clone and install dependencies**:
```bash
npm install
```

2. **Set up PostgreSQL database**:
```bash
# Create a database
createdb websocket_relay

# Copy environment template
cp .env.example .env

# Edit .env with your DATABASE_URL
```

3. **Run migrations**:
```bash
npm run migrate
```

4. **Start the server**:
```bash
npm start
```

### Railway Deployment

1. **Create new project** on Railway
2. **Add PostgreSQL** addon
3. **Set environment variables**:
   - `DATABASE_URL` (auto-set by PostgreSQL addon)
   - `PORT` (optional, defaults to 8080)
   - `NODE_ENV=production`

4. **Deploy**:
```bash
# Railway will auto-detect package.json
# Run migration after first deploy:
railway run npm run migrate
```

## 📚 API Reference

### Connection

Connect to WebSocket server:
```javascript
const ws = new WebSocket('ws://localhost:8080');
```

### Authentication

**Required within 30 seconds of connection:**
```
login <username>
```

**Response on success:**
```json
{
  "type": "auth_success",
  "username": "yourname",
  "isBroadcaster": false,
  "message": "Welcome, yourname! You can receive broadcasts."
}
```

### Broadcasting (Broadcasters Only)

Send JSON message directly:
```json
{
  "title": "Title",
  "url": "https://example.com",
  "icon": "https://icon.url",
  "source": "Source Name",
  "image": "https://image.url"
}
```

Or use command format:
```
broadcast {"title":"Title","url":"https://...","icon":"...","source":"...","image":"..."}
```

### Admin Commands

Manage users and broadcasters:
```
admin add_user <username>
admin remove_user <username>
admin add_broadcaster <username>
admin remove_broadcaster <username>
```

### Statistics

Get server stats:
```
stats
```

**Response:**
```json
{
  "type": "stats",
  "data": {
    "totalConnections": 5,
    "authenticatedUsers": 3,
    "broadcasters": 1,
    "uptime": 3600,
    "connectedUsers": [...]
  }
}
```

## 🎨 Demo Clients

### User Client (`client-example.html`)
- Connect and authenticate
- Send broadcasts (if broadcaster)
- Receive and display broadcasts
- View connection logs

### Admin Panel (`admin-client.html`)
- Manage whitelisted users
- Grant/revoke broadcaster permissions
- View real-time server statistics
- Monitor connected users

**Usage:**
1. Open HTML files in browser
2. Update WebSocket URL if needed
3. Enter username and connect

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);
```

### Broadcasters Table
```sql
CREATE TABLE broadcasters (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔐 Security Features

1. **Authentication Timeout**: 30 seconds to send login command
2. **Rate Limiting**: 20 messages per minute per client
3. **Message Size Limit**: 10KB maximum
4. **Username Validation**: Alphanumeric, underscores, hyphens only (max 50 chars)
5. **URL Validation**: Proper URL format required for broadcast URLs
6. **Input Sanitization**: All strings trimmed and length-limited
7. **Database Injection Prevention**: Parameterized queries
8. **Connection Monitoring**: Ping every 15 seconds

## 📊 Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ WebSocket
       ↓
┌──────────────────┐
│  WebSocket       │
│  Server          │
│  (server.js)     │
└────┬─────────┬───┘
     │         │
     ↓         ↓
┌─────────┐ ┌──────────┐
│Database │ │Validators│
│ (pg)    │ │ & Logger │
└─────────┘ └──────────┘
```

## 🔧 Configuration

Environment variables (`.env`):

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Optional
PORT=8080
NODE_ENV=development
LOG_LEVEL=INFO
SEED_DATA=false
```

## 📝 Message Types

### Server → Client

- `info`: General information
- `auth_success`: Authentication successful
- `broadcast`: Incoming broadcast message
- `broadcast_sent`: Confirmation after sending
- `admin_response`: Admin command result
- `stats`: Server statistics
- `error`: Error message

### Client → Server

- `login <username>`: Authenticate
- `{broadcast JSON}`: Send broadcast (broadcasters only)
- `admin <command> <args>`: Admin commands
- `stats`: Request statistics

## 🚦 Error Handling

The server handles:
- Connection timeouts
- Invalid authentication
- Non-whitelisted users
- Missing broadcast fields
- Invalid message formats
- Rate limit exceeded
- Database connection errors
- Graceful shutdown

## 📈 Monitoring

Server logs include:
- Connection events (open/close)
- Authentication attempts
- Broadcast activity
- Rate limit violations
- Database operations
- Errors and warnings

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

## 📄 License

MIT

## 🆘 Troubleshooting

**Database connection failed:**
- Verify `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Check network/firewall settings

**Authentication timeout:**
- Send `login <username>` within 30 seconds
- Verify username is whitelisted in database

**Permission denied (broadcasting):**
- User must be in `broadcasters` table
- Use admin panel to grant permissions

**Rate limit exceeded:**
- Limit is 20 messages per minute
- Wait and try again

## 🔗 Quick Links

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [ws Library](https://github.com/websockets/ws)
- [Railway Deployment](https://railway.app/)
