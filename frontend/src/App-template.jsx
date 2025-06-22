import React, { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './index.css';

// Utility function for mobile detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

// Theme context
const ThemeContext = React.createContext();

const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true; // Default to dark mode
  });

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', newTheme ? 'dark' : 'light');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Icon components
const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

// Main App Component
const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [projectStatuses, setProjectStatuses] = useState({});
  const [codeContextMenu, setCodeContextMenu] = useState(null);
  const [selectedCodeText, setSelectedCodeText] = useState('');
  
  const chatContainerRef = useRef(null);
  const lastMessageRef = useRef(null);
  const { isDarkMode, toggleTheme } = useTheme();
  const isMobile = useIsMobile();

  // Load projects on component mount
  useEffect(() => {
    fetchProjects();
  }, []);

  // Load project statuses when projects change
  useEffect(() => {
    if (projects.length > 0) {
      loadProjectStatuses();
    }
  }, [projects]);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      setProjects(data);
      if (data.length > 0 && !selectedProject) {
        setSelectedProject(data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const loadProjectStatuses = async () => {
    const statuses = {};
    for (const project of projects) {
      try {
        statuses[project.id] = { status: 'loading', error: null };
        setProjectStatuses(prev => ({ ...prev, [project.id]: { status: 'loading', error: null } }));
        
        const response = await fetch(`/api/projects/${project.id}/status`);
        const data = await response.json();
        
        if (response.ok) {
          statuses[project.id] = { status: 'online', error: null, ...data };
        } else {
          statuses[project.id] = { status: 'error', error: data.error };
        }
      } catch (error) {
        statuses[project.id] = { status: 'error', error: error.message };
      }
    }
    setProjectStatuses(statuses);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue;
    setInputValue('');
    setIsLoading(true);

    // Add user message and switch to compact mode
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setCompactMode(true);

    // Add empty assistant message for streaming
    const assistantMessageIndex = newMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    // Scroll user message to top
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          history: newMessages.slice(0, -1).map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          project: selectedProject
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      let assistantResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantResponse += parsed.content;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[assistantMessageIndex] = { role: 'assistant', content: assistantResponse };
                  return updated;
                });
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantMessageIndex] = {
          role: 'assistant',
          content: `Error: ${error.message}`
        };
        return updated;
      });
    }

    setIsLoading(false);
  };

  const resetToHome = () => {
    setMessages([]);
    setCompactMode(false);
    setInputValue('');
  };

  const formatMessage = (content) => {
    // Split content into segments
    const segments = content.split(/(```[\s\S]*?```|`[^`\n]+`)/);
    
    return segments.map((segment, index) => {
      if (segment.startsWith('```') && segment.endsWith('```')) {
        // Code block
        const lines = segment.slice(3, -3).split('\n');
        const language = lines[0].trim() || 'text';
        const code = lines.slice(1).join('\n');
        
        return (
          <SyntaxHighlighter
            key={index}
            language={language}
            style={isDarkMode ? atomDark : oneLight}
            className="code-block"
            customStyle={{ margin: '1rem 0', borderRadius: '4px' }}
          >
            {code}
          </SyntaxHighlighter>
        );
      } else if (segment.startsWith('`') && segment.endsWith('`')) {
        // Inline code
        const code = segment.slice(1, -1);
        return (
          <code 
            key={index} 
            className="inline-code clickable-code"
            onClick={(e) => handleCodeClick(e, code)}
          >
            {code}
          </code>
        );
      } else {
        // Regular text with basic markdown
        return (
          <span 
            key={index}
            dangerouslySetInnerHTML={{
              __html: segment
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>')
            }}
          />
        );
      }
    });
  };

  const handleCodeClick = (e, code) => {
    e.preventDefault();
    setSelectedCodeText(code);
    setCodeContextMenu({
      x: e.clientX,
      y: e.clientY,
      code: code
    });
  };

  const closeContextMenu = () => {
    setCodeContextMenu(null);
    setSelectedCodeText('');
  };

  const handleMenuAction = async (action) => {
    if (!selectedCodeText) return;

    const actions = {
      copy: () => navigator.clipboard.writeText(selectedCodeText),
      define: () => sendCodeQuery(`What does this code do: ${selectedCodeText}`),
      locate: () => sendCodeQuery(`Where can I find this in the codebase: ${selectedCodeText}`),
      errorcheck: () => sendCodeQuery(`Check this code for errors: ${selectedCodeText}`, true)
    };

    await actions[action]?.();
    closeContextMenu();
  };

  const sendCodeQuery = async (query, isErrorCheck = false) => {
    setInputValue(query);
    const event = { preventDefault: () => {} };
    await handleSubmit(event);
  };

  useEffect(() => {
    const handleClickOutside = () => closeContextMenu();
    if (codeContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [codeContextMenu]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (lastMessageRef.current && !compactMode) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const getStatusInfo = (projectId) => {
    const status = projectStatuses[projectId];
    if (!status) return { indicator: 'loading', text: 'Loading...' };
    
    switch (status.status) {
      case 'online':
        return { indicator: 'online', text: 'Online' };
      case 'error':
        return { indicator: 'error', text: 'Error' };
      case 'loading':
      default:
        return { indicator: 'loading', text: 'Loading...' };
    }
  };

  const statusInfo = getStatusInfo(selectedProject);

  return (
    <div className={`container ${compactMode ? 'with-compact-header' : ''}`}>
      {/* Context Menu */}
      {codeContextMenu && (
        <div
          className="code-context-menu"
          style={{
            left: codeContextMenu.x,
            top: codeContextMenu.y
          }}
        >
          <button className="menu-item" onClick={() => handleMenuAction('copy')}>
            Copy Code
          </button>
          <button className="menu-item" onClick={() => handleMenuAction('define')}>
            Define Function
          </button>
          <button className="menu-item" onClick={() => handleMenuAction('locate')}>
            Locate in Files
          </button>
          <button className="menu-item" onClick={() => handleMenuAction('errorcheck')}>
            Error Check
          </button>
        </div>
      )}

      {/* Header */}
      <header className={`header ${compactMode ? 'compact' : ''}`}>
        <div className="header-left">
          <h1 
            className={`gradient-text ${compactMode ? 'clickable-title' : ''}`}
            onClick={compactMode ? resetToHome : undefined}
          >
            {isMobile ? '{{PROJECT_NAME}}' : '{{PROJECT_NAME}} - {{PROJECT_DESCRIPTION}}'}
          </h1>
          
          {!compactMode && (
            <div className="project-selector">
              <select
                className="project-dropdown"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              
              <div className="project-status">
                <div className={`status-indicator ${statusInfo.indicator}`}></div>
                <span className="status-text">{statusInfo.text}</span>
              </div>
            </div>
          )}
          
          {!isMobile && !compactMode && (
            <p className="last-updated">
              Files last updated automatically from GitHub
            </p>
          )}
        </div>

        {compactMode && (
          <div className="header-right">
            <div className="project-selector">
              <select
                className="project-dropdown"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              
              <div className="project-status">
                <div className={`status-indicator ${statusInfo.indicator}`}></div>
                {!isMobile && <span className="status-text">{statusInfo.text}</span>}
              </div>
            </div>
            
            {!isMobile && (
              <button className="theme-toggle" onClick={toggleTheme}>
                {isDarkMode ? <SunIcon /> : <MoonIcon />}
              </button>
            )}
          </div>
        )}

        {!compactMode && (
          <button className="theme-toggle" onClick={toggleTheme}>
            {isDarkMode ? <SunIcon /> : <MoonIcon />}
          </button>
        )}
      </header>

      {/* Chat Card */}
      <div className="card">
        <h2>{{PROJECT_NAME}} Qubase</h2>
        
        <div className="chat-container" ref={chatContainerRef}>
          {messages.length === 0 ? (
            <div className="empty-state">
              <p className="text-lg mb-4">I can help you understand:</p>
              <div className="space-y-2">
                <p>• {{FEATURE_1}}</p>
                <p>• {{FEATURE_2}}</p>
                <p>• {{FEATURE_3}}</p>
                <p>• {{FEATURE_4}}</p>
              </div>
            </div>
          ) : (
            <div className="messages-container">
              {messages.map((message, index) => (
                <div 
                  key={index} 
                  className={`message ${message.role}`}
                  ref={index === messages.length - 1 ? lastMessageRef : null}
                >
                  {message.role === 'assistant' ? formatMessage(message.content) : message.content}
                </div>
              ))}
              {isLoading && (
                <div className="message assistant">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="chat-form">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={isMobile ? "Ask about {{PROJECT_NAME}}..." : "Ask about {{DETAILED_PLACEHOLDER}}..."}
            className="chat-input"
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={isLoading || !inputValue.trim()}
            className="apply-button"
          >
            {isLoading ? 'Thinking...' : 'Send'}
          </button>
        </form>
      </div>

      {/* Footer */}
      <footer className={`footer ${compactMode ? 'hidden' : ''}`}>
        <div className="footer-content">
          <p>
            Powered by{' '}
            <a href="https://openai.com" target="_blank" rel="noopener noreferrer">
              OpenAI
            </a>
            {' '}• Built with Qubase for {{PROJECT_NAME}} team
          </p>
        </div>
      </footer>
    </div>
  );
};

// App wrapper with theme provider
const AppWithTheme = () => (
  <ThemeProvider>
    <App />
  </ThemeProvider>
);

export default AppWithTheme;