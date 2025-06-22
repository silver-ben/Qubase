import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Octokit } from '@octokit/rest';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// GitHub integration
const octokit = new Octokit({
  auth: process.env.GITHUB_PAT,
});

// TODO: Update with your GitHub repository details
const GITHUB_REPO = {
  owner: '{{GITHUB_OWNER}}', // Replace with your GitHub username/organization
  repo: '{{GITHUB_REPO}}'     // Replace with your repository name
};

// Projects that auto-sync from GitHub
// TODO: Update this list to match your project's folder structure
const SYNC_PROJECTS = [
  'project-frontend',
  'project-backend',
  'documentation'
];

// Project configurations
// TODO: Update this configuration for your projects
const PROJECTS = {
  'frontend': {
    name: '{{PROJECT_NAME}} Frontend',
    path: '../codebase/project-frontend',
    model: 'gpt-4.1-mini-2025-04-14',
    description: 'Frontend components and user interface code'
  },
  'backend': {
    name: '{{PROJECT_NAME}} Backend',
    path: '../codebase/project-backend',
    model: 'gpt-4.1-mini-2025-04-14',
    description: 'Backend API and server-side logic'
  },
  'docs': {
    name: 'Documentation',
    path: '../codebase/documentation',
    model: 'gpt-4.1-mini-2025-04-14',
    description: 'Project documentation and guides'
  }
  // Add more projects as needed
};

// Cache for loaded project files
const projectCache = new Map();
const cacheTimestamps = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Helper function to recursively read all files in a directory
function readDirectoryRecursive(dirPath, allowedExtensions = ['.js', '.md', '.txt', '.json', '.css', '.html', '.py', '.tsx', '.ts']) {
  const files = [];
  
  if (!fs.existsSync(dirPath)) {
    console.warn(`Directory does not exist: ${dirPath}`);
    return files;
  }
  
  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip hidden directories and node_modules
        if (!item.startsWith('.') && item !== 'node_modules') {
          traverse(fullPath);
        }
      } else {
        const ext = path.extname(item).toLowerCase();
        if (allowedExtensions.includes(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const relativePath = path.relative(dirPath, fullPath);
            files.push({
              path: relativePath,
              content: content,
              size: content.length
            });
          } catch (error) {
            console.warn(`Error reading file ${fullPath}: ${error.message}`);
          }
        }
      }
    }
  }
  
  traverse(dirPath);
  return files;
}

// Load project files with caching
function loadProjectFiles(projectId) {
  const now = Date.now();
  const cacheKey = projectId;
  
  // Check if we have valid cached data
  if (projectCache.has(cacheKey) && cacheTimestamps.has(cacheKey)) {
    const cacheTime = cacheTimestamps.get(cacheKey);
    if (now - cacheTime < CACHE_DURATION) {
      return projectCache.get(cacheKey);
    }
  }
  
  const project = PROJECTS[projectId];
  if (!project) {
    throw new Error(`Unknown project: ${projectId}`);
  }
  
  const projectPath = path.resolve(project.path);
  console.log(`Loading files from: ${projectPath}`);
  
  const files = readDirectoryRecursive(projectPath);
  
  // Create a combined context string with size limits
  let contextString = `# ${project.name}\\n${project.description}\\n\\n`;
  
  // Sort files by relevance (prioritize code files)
  const sortedFiles = files.sort((a, b) => {
    const aIsCode = /\\.(js|ts|tsx|py|css|html)$/.test(a.path);
    const bIsCode = /\\.(js|ts|tsx|py|css|html)$/.test(b.path);
    if (aIsCode && !bIsCode) return -1;
    if (!aIsCode && bIsCode) return 1;
    return 0;
  });
  
  let totalTokens = 0;
  const maxTokens = 500000; // 500K token budget per project
  
  for (const file of sortedFiles) {
    const fileContent = `## File: ${file.path}\\n\`\`\`\\n${file.content}\\n\`\`\`\\n\\n`;
    const estimatedTokens = Math.ceil(fileContent.length / 4); // Rough token estimation
    
    if (totalTokens + estimatedTokens > maxTokens) {
      console.log(`Stopping file inclusion at ${file.path} - token limit reached`);
      break;
    }
    
    contextString += fileContent;
    totalTokens += estimatedTokens;
  }
  
  const result = {
    context: contextString,
    fileCount: files.length,
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
    loadedAt: new Date().toISOString()
  };
  
  // Cache the result
  projectCache.set(cacheKey, result);
  cacheTimestamps.set(cacheKey, now);
  
  console.log(`Loaded ${result.fileCount} files (${Math.round(result.totalSize/1024)}KB) for project: ${project.name}`);
  
  return result;
}

// Helper function to detect if query needs multi-call error checking
function needsErrorChecking(message, isErrorCheckAction = false) {
  return isErrorCheckAction;
}

// Multi-call error checking function
async function performMultiCallErrorCheck(code, context, model) {
  const calls = [
    {
      name: 'Code Analysis',
      prompt: `Analyze this code for potential issues: ${code}\\n\\nContext: ${context}\\n\\nIdentify potential issue categories and areas of concern.`
    },
    {
      name: 'Syntax & Logic Check', 
      prompt: `Check for syntax and logic errors in: ${code}\\n\\nContext: ${context}\\n\\nFocus on syntax, logic flow, and common mistakes.`
    },
    {
      name: 'Best Practices',
      prompt: `Review best practices for: ${code}\\n\\nContext: ${context}\\n\\nCheck against coding standards and best practices.`
    },
    {
      name: 'Edge Cases & Issues',
      prompt: `Identify edge cases and potential issues for: ${code}\\n\\nContext: ${context}\\n\\nFocus on specific problems and potential pitfalls.`
    }
  ];

  let results = [];
  for (const call of calls) {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: call.prompt }
      ],
      temperature: 0.1,
      max_tokens: 1000
    });
    results.push({
      step: call.name,
      analysis: response.choices[0].message.content
    });
  }
  
  return results;
}

// === GitHub Sync Functions ===

async function downloadFolderFromGitHub(folderPath, localPath) {
  try {
    console.log(`Downloading ${folderPath} from GitHub...`);
    
    // Get folder contents from GitHub
    const { data } = await octokit.rest.repos.getContent({
      ...GITHUB_REPO,
      path: folderPath,
    });

    // Create local directory
    await fs.promises.mkdir(localPath, { recursive: true });

    // Download all files and subdirectories
    for (const item of data) {
      const itemLocalPath = path.join(localPath, item.name);
      
      if (item.type === 'file') {
        // Download file content
        const fileResponse = await octokit.rest.repos.getContent({
          ...GITHUB_REPO,
          path: item.path,
        });
        
        const content = Buffer.from(fileResponse.data.content, 'base64');
        await fs.promises.writeFile(itemLocalPath, content);
        console.log(`  Downloaded: ${item.path}`);
        
      } else if (item.type === 'dir') {
        // Recursively download subdirectory
        await downloadFolderFromGitHub(item.path, itemLocalPath);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Failed to download ${folderPath}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function syncProjectFromGitHub(projectFolder) {
  try {
    console.log(`Starting sync for ${projectFolder}...`);
    
    // 1. Test GitHub connection first
    await octokit.rest.repos.get(GITHUB_REPO);
    console.log(`✓ GitHub connection OK`);
    
    // 2. Define paths
    const tempPath = path.resolve(`/tmp/${projectFolder}-sync-${Date.now()}`);
    const livePath = path.resolve(`../codebase/${projectFolder}`);
    const backupPath = `${livePath}-backup-${Date.now()}`;
    
    // 3. Download to temp folder
    const downloadResult = await downloadFolderFromGitHub(projectFolder, tempPath);
    if (!downloadResult.success) {
      throw new Error(`Download failed: ${downloadResult.error}`);
    }
    
    // 4. Backup existing folder
    if (fs.existsSync(livePath)) {
      await fs.promises.rename(livePath, backupPath);
      console.log(`✓ Backed up existing folder to ${backupPath}`);
    }
    
    // 5. Move new folder into place
    await fs.promises.rename(tempPath, livePath);
    console.log(`✓ Updated ${projectFolder} from GitHub`);
    
    // 6. Clean up backup after successful sync
    if (fs.existsSync(backupPath)) {
      await fs.promises.rm(backupPath, { recursive: true });
      console.log(`✓ Cleaned up backup`);
    }
    
    // 7. Clear cache for this project
    const projectId = Object.keys(PROJECTS).find(id => 
      PROJECTS[id].path.includes(projectFolder)
    );
    if (projectId) {
      projectCache.delete(projectId);
      cacheTimestamps.delete(projectId);
      console.log(`✓ Cleared cache for ${projectId}`);
    }
    
    return { 
      success: true, 
      message: `Successfully synced ${projectFolder} from GitHub`,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Sync failed for ${projectFolder}:`, error.message);
    
    // Restore backup if move failed
    const livePath = path.resolve(`../codebase/${projectFolder}`);
    const backupPath = `${livePath}-backup-${Date.now()}`;
    
    if (fs.existsSync(backupPath) && !fs.existsSync(livePath)) {
      try {
        await fs.promises.rename(backupPath, livePath);
        console.log(`✓ Restored backup after failed sync`);
      } catch (restoreError) {
        console.error(`Failed to restore backup:`, restoreError.message);
      }
    }
    
    return { 
      success: false, 
      error: error.message,
      message: `Kept existing files for ${projectFolder} - sync failed safely`
    };
  }
}

async function syncAllProjects() {
  const results = [];
  
  for (const projectFolder of SYNC_PROJECTS) {
    const result = await syncProjectFromGitHub(projectFolder);
    results.push({ project: projectFolder, ...result });
  }
  
  return results;
}

// === API Routes ===

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  const { 
    message, 
    isErrorCheck = false, 
    code = '', 
    history = [],
    project = Object.keys(PROJECTS)[0] // Default to first project
  } = req.body;
  
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Load project context
    const projectData = loadProjectFiles(project);
    const config = PROJECTS[project];
    
    // Check if we need multi-call error checking
    if (needsErrorChecking(message, isErrorCheck)) {
      res.write(`data: ${JSON.stringify({ status: 'Analyzing code structure...' })}\\n\\n`);
      
      const errorResults = await performMultiCallErrorCheck(code || message, projectData.context, config.model);
      
      // Stream each step result
      for (let i = 0; i < errorResults.length; i++) {
        const step = errorResults[i];
        res.write(`data: ${JSON.stringify({ status: `${step.step} complete...` })}\\n\\n`);
        
        // For final step, stream the comprehensive result
        if (i === errorResults.length - 1) {
          const finalPrompt = `Based on the multi-step analysis, provide a comprehensive error report for: ${code || message}

Analysis Results:
${errorResults.map(r => `${r.step}: ${r.analysis}`).join('\\n\\n')}

Context from codebase: ${projectData.context}

Provide a clear, actionable error report focusing on specific issues found and how to fix them.`;

          const stream = await openai.chat.completions.create({
            model: config.model,
            messages: [
              { role: 'system', content: finalPrompt },
              ...history
            ],
            temperature: 0.2,
            stream: true,
          });

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\\n\\n`);
            }
          }
        }
      }
    } else {
      // Standard single-call response with full project context
      const systemPrompt = `You are an AI assistant for the {{PROJECT_NAME}} team. You help developers understand their codebase and projects.

You have full access to the ${config.name} project, including its source files and configuration:
${projectData.context}

{{PROJECT_DESCRIPTION}}

Team members are {{TEAM_MEMBERS}}.

User question: ${message}

Answer clearly and technically using project context. Include code snippets when helpful, reference specific files, line numbers or functions, and keep explanations concise.

Current project: ${config.name}
Files loaded: ${projectData.fileCount} files (${Math.round(projectData.totalSize/1024)}KB)
Last updated: ${projectData.loadedAt}`;

      const stream = await openai.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message }
        ],
        temperature: 0.2,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\\n\\n`);
        }
      }
    }
    
    res.write('data: [DONE]\\n\\n');
    res.end();
  } catch (error) {
    console.error('Chat error:', error.message, error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get available projects
app.get('/api/projects', (req, res) => {
  const projectList = Object.entries(PROJECTS).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.description,
    model: config.model
  }));
  
  res.json(projectList);
});

// Get project status
app.get('/api/projects/:projectId/status', (req, res) => {
  const { projectId } = req.params;
  
  if (!PROJECTS[projectId]) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    const projectData = loadProjectFiles(projectId);
    res.json({
      id: projectId,
      name: PROJECTS[projectId].name,
      status: 'online',
      fileCount: projectData.fileCount,
      totalSize: projectData.totalSize,
      lastLoaded: projectData.loadedAt
    });
  } catch (error) {
    res.status(500).json({
      id: projectId,
      name: PROJECTS[projectId].name,
      status: 'error',
      error: error.message
    });
  }
});

// Manual refresh endpoint for admin
app.post('/api/projects/:projectId/refresh', (req, res) => {
  const { projectId } = req.params;
  
  if (!PROJECTS[projectId]) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    // Clear cache
    projectCache.delete(projectId);
    cacheTimestamps.delete(projectId);
    
    // Reload
    const projectData = loadProjectFiles(projectId);
    
    res.json({
      success: true,
      message: `Project ${PROJECTS[projectId].name} refreshed successfully`,
      fileCount: projectData.fileCount,
      totalSize: projectData.totalSize,
      loadedAt: projectData.loadedAt
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    projects: Object.keys(PROJECTS)
  });
});

// === GitHub Sync Endpoints ===

// Webhook endpoint for GitHub push events
app.post('/api/github-webhook', async (req, res) => {
  try {
    console.log('GitHub webhook received:', req.body?.ref || 'unknown ref');
    
    // Verify it's a push to main/master branch
    const ref = req.body?.ref;
    if (!ref || (!ref.endsWith('/main') && !ref.endsWith('/master'))) {
      return res.json({ message: 'Ignoring non-main branch push' });
    }
    
    console.log('Starting auto-sync from GitHub webhook...');
    const results = await syncAllProjects();
    
    res.json({
      success: true,
      message: 'GitHub webhook processed',
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('GitHub webhook error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Webhook failed safely - existing files preserved'
    });
  }
});

// Manual sync endpoint
app.post('/api/sync-from-github', async (req, res) => {
  try {
    console.log('Manual sync requested...');
    const results = await syncAllProjects();
    
    res.json({
      success: true,
      message: 'Manual sync completed',
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Manual sync error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Sync failed safely - existing files preserved'
    });
  }
});

// Sync single project endpoint
app.post('/api/sync-project/:projectFolder', async (req, res) => {
  try {
    const { projectFolder } = req.params;
    
    if (!SYNC_PROJECTS.includes(projectFolder)) {
      return res.status(400).json({
        success: false,
        error: `Project ${projectFolder} is not in sync list`,
        syncProjects: SYNC_PROJECTS
      });
    }
    
    console.log(`Manual sync requested for ${projectFolder}...`);
    const result = await syncProjectFromGitHub(projectFolder);
    
    res.json({
      success: result.success,
      project: projectFolder,
      ...result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`Manual sync error for ${req.params.projectFolder}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Sync failed safely - existing files preserved'
    });
  }
});

// Get sync status and configuration
app.get('/api/sync-status', (req, res) => {
  res.json({
    syncProjects: SYNC_PROJECTS,
    githubRepo: GITHUB_REPO,
    hasGithubToken: !!process.env.GITHUB_PAT,
    timestamp: new Date().toISOString()
  });
});

// === Serve frontend from Express ===
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AI Assistant backend running on http://localhost:${PORT}`);
  console.log(`Available projects: ${Object.keys(PROJECTS).join(', ')}`);
});