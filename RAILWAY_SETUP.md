# Railway Deployment Setup

## Quick Setup on Railway

1. **Create Railway Account** at [railway.app](https://railway.app)

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo" (or use Railway CLI)

3. **Add PostgreSQL Database**
   - In your project, click "New"
   - Select "Database" → "PostgreSQL"
   - Railway will automatically set `DATABASE_URL` environment variable

4. **Configure Environment Variables**
   - Go to project settings
   - Variables are auto-configured, but verify:
     - `DATABASE_URL` (set by PostgreSQL addon)
     - `PORT` (optional, Railway sets this automatically)
     - `NODE_ENV=production`

5. **Deploy**
   - Push to GitHub repository
   - Railway will auto-deploy
   - Or use Railway CLI: `railway up`

6. **Run Database Migration**
   ```bash
   # Using Railway CLI
   railway run npm run migrate
   
   # Or in Railway dashboard
   # Go to your service → Settings → Deploy
   # Add custom start command temporarily:
   # npm run migrate && npm start
   ```

7. **Add Initial Users**
   - Use admin-client.html pointing to your Railway URL
   - Or use Railway CLI:
   ```bash
   railway run node -e "
   const db = require('./db/database');
   const Database = new db();
   Database.addUser('admin').then(() => 
     Database.addBroadcaster('admin')
   ).then(() => Database.close());
   "
   ```

8. **Get Your WebSocket URL**
   ```
   ws://your-app-name.up.railway.app
   ```

## Monitoring

- View logs in Railway dashboard
- Check database in Railway PostgreSQL panel
- Use admin-client.html for real-time stats

## Scaling

Railway auto-scales, but you can adjust:
- **Settings → Resources** - Increase memory/CPU
- **Database** - Upgrade PostgreSQL plan for more connections

## Security Checklist

✅ DATABASE_URL is auto-secured by Railway
✅ Enable Railway's "Private Networking" for database
✅ Use environment variables (never commit .env)
✅ Whitelist only trusted users
✅ Regular database backups (Railway handles this)

## Custom Domain (Optional)

1. Go to Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed
4. WebSocket URL becomes: `ws://yourdomain.com`
