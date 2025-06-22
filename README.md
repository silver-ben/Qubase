# Qubase

A complete multi-model AI assistant template for any project. Clone this template to create intelligent assistants that understand your entire codebase or knowledge base with full context.

## Features

✅ **Multi-project architecture** with dropdown selector, assign AI Model per project  
✅ **Full codebase context** (unlimited token budget per project)  
✅ **Smart file loading** with automatic GitHub sync  
✅ **Simple UI, ChatGPT-style interface**  
✅ **Mobile-responsive design**  
✅ **Interactive code features** (copy, define, locate, error check)  
✅ **Theme switching** (dark/light mode)  
✅ **Real-time streaming responses**  
✅ **Password protection** for team access  

## Quick Start

### 1. Setup Your Project Repository

First, organize your codebase into logical folders:

```
your-project-repo/
├── frontend-code/          # React/Vue/etc components  
├── backend-api/            # Server code
├── documentation/          # Project docs
├── mobile-app/            # Mobile code (optional)
└── design-assets/         # UI/UX files (optional)
```

### 2. Clone This Template

```bash
git clone https://github.com/silver-ben/qubase.git my-project-assistant
cd my-project-assistant
```

### 3. Configure for Your Project

#### Backend Configuration

Edit `backend/server-template.js`:

```javascript
// Update PROJECTS config (lines 47-67)
const PROJECTS = {
  'frontend': {
    name: 'Your Project Frontend',
    path: '../codebase/frontend-code',
    model: 'gpt-4.1-mini-2025-04-14',
    description: 'React frontend components and styling'
  },
  'backend': {
    name: 'Your Project Backend',
    path: '../codebase/backend-api', 
    model: 'gpt-4.1-mini-2025-04-14',
    description: 'Node.js/Python backend API code'
  },
  'docs': {
    name: 'Documentation',
    path: '../codebase/documentation',
    model: 'gpt-4.1-mini-2025-04-14', 
    description: 'Project documentation and guides'
  }
};

// Update GitHub repo config (lines 32-35)
const GITHUB_REPO = {
  owner: 'your-username',      // Your GitHub username
  repo: 'your-project-repo'    // Your project's codebase repo
};

// Update sync projects list (lines 39-43)
const SYNC_PROJECTS = [
  'frontend-code',
  'backend-api', 
  'documentation'
];
```

#### Frontend Branding

Edit `frontend/src/App-template.jsx` and replace these placeholders:

- `{{PROJECT_NAME}}` → Your Project Name
- `{{PROJECT_DESCRIPTION}}` → Short description  
- `{{FEATURE_1}}` → Main feature 1
- `{{FEATURE_2}}` → Main feature 2
- `{{FEATURE_3}}` → Main feature 3
- `{{FEATURE_4}}` → Main feature 4
- `{{DETAILED_PLACEHOLDER}}` → Detailed input placeholder

#### Package.json Files

Update `backend/package-template.json` and `frontend/package-template.json`:

- `{{PROJECT_SLUG}}` → your-project-name (lowercase, dashes)
- `{{PROJECT_NAME}}` → Your Project Name

### 4. Environment Setup

```bash
# Backend setup
cd backend
cp .env-template .env
# Edit .env with your API keys
npm install

# Frontend setup  
cd ../frontend
cp package-template.json package.json
# Update placeholders in package.json
npm install
```

### 5. Development

```bash
# Terminal 1: Start backend
cd backend && node server-template.js

# Terminal 2: Start frontend  
cd frontend && npm run dev
```

Visit `http://localhost:5173` to test your AI assistant.

### 6. Production Deployment

#### Build Frontend
```bash
cd frontend && npm run build
```

#### Deploy to Server
```bash
# Upload entire project to server
scp -r ./my-project-ai/ user@server:/var/www/ai.yourproject.com/

# Install dependencies on server
cd /var/www/ai.yourproject.com/backend && npm install
cd /var/www/ai.yourproject.com/frontend && npm install && npm run build

# Start with PM2
pm2 start server-template.js --name your-project-ai
pm2 save
```

#### Configure Web Server

**Apache VirtualHost:**
```apache
<VirtualHost *:443>
    ServerName ai.yourproject.com
    
    # Password Protection
    <Location />
        AuthType Basic
        AuthName "Your Project AI - Team Access"
        AuthUserFile /var/www/ai.yourproject.com/.htpasswd
        Require valid-user
    </Location>
    
    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/ai.yourproject.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/ai.yourproject.com/privkey.pem
    
    # Reverse Proxy
    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/
</VirtualHost>
```

#### Set Up Team Access
```bash
# Create password file
sudo htpasswd -c .htpasswd teamuser
# Enter secure password

# Add more users
sudo htpasswd .htpasswd developer1
sudo htpasswd .htpasswd manager1
```

## Configuration Reference

### Required Environment Variables

```bash
# OpenAI API Key (required)
OPENAI_API_KEY=sk-...

# GitHub Personal Access Token (optional, for auto-sync)
GITHUB_PAT=ghp_...

# Server Port (optional, defaults to 3001)
PORT=3001
```

### Project Configuration

Each project in the `PROJECTS` object supports:

- `name`: Display name for the project
- `path`: Relative path to project files  
- `model`: OpenAI model to use (recommend `gpt-4.1-mini-2025-04-14`)
- `description`: Brief description of the project

### GitHub Integration

To enable automatic code synchronization:

1. Create a GitHub Personal Access Token with repo access
2. Add token to `.env` file as `GITHUB_PAT`
3. Update `GITHUB_REPO` object with your repository details
4. List folders to sync in `SYNC_PROJECTS` array

The system will auto-update when you push to your repository's main branch.

## Cost Estimation

**Per Project Setup:**
- Domain: $10-15/year
- SSL: Free (Let's Encrypt)  
- Server: $5-20/month (can host multiple projects)
- OpenAI API: $5-50/month (depending on usage)

**Total: ~$10-85/month per project** (mostly OpenAI costs)

With 500K token context per project, typical usage costs $0.15 per 1M input tokens.

## File Structure

```
ai-assistant-template/
├── README.md                    # This file
├── backend/
│   ├── server-template.js      # Main server with placeholders
│   ├── package-template.json   # Package.json template
│   └── .env-template           # Environment variables template
├── frontend/
│   ├── src/
│   │   ├── App-template.jsx    # React app with placeholders
│   │   └── index.css           # Styling (ready to use)
│   ├── package-template.json   # Package.json template
│   └── vite.config.js          # Vite config (ready to use)
└── docs/
    └── clone-for-new-project.md # Detailed setup guide
```

## System Prompt Customization

The AI's behavior is controlled by the system prompt in `server-template.js` (lines 422-437). Customize this to:

- Define your team members
- Explain your project's architecture  
- Set response style and tone
- Add specific instructions for your domain

## Support

For issues or questions:

1. Check the detailed guide in `docs/clone-for-new-project.md`
2. Test with a simple project first
3. Open an issue in this repository

## Benefits

✅ **Rapid deployment** - 2-3 hours for new project  
✅ **Proven architecture** - Based on production system  
✅ **Full codebase context** - No chunking limitations  
✅ **Professional UX** - ChatGPT-style interface  
✅ **Team collaboration** - Shared knowledge base  
✅ **Auto-updating** - Syncs with code changes  
✅ **Cost-effective** - Minimal ongoing costs  

Transform any codebase into an intelligent assistant that knows your entire project inside and out!

---

**Created by [Ben Silver](https://github.com/silver-ben) | [bensilver.com.au](https://bensilver.com.au)**  
*Qubase: Query any knowledge base with full context*
