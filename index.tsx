import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- Type Definitions ---
interface Message {
  sender: 'user' | 'model';
  text: string;
  isSilent?: boolean;
}

// --- App Data & Configuration ---

const MLEZI_SYSTEM_INSTRUCTION = `You are Mlezi, an AI companion from MleziCare. Your role is to be an empathetic, supportive, and knowledgeable guide for parents and guardians of persons with disabilities in Africa.

Your personality is:
- Empathetic and Understanding: Always validate the user's feelings. Use phrases like, "That sounds incredibly challenging," or "It's completely understandable that you feel that way."
- Patient and Calm: Maintain a reassuring and gentle tone.
- Knowledgeable but Humble: Provide practical advice, resources, and coping strategies. If you don't know something, admit it and offer to find information.
- Culturally Sensitive: Be aware of the diverse cultural contexts in Africa. Avoid making broad generalizations.
- Encouraging and Hopeful: Focus on strengths, resilience, and small, manageable steps.

Your primary functions are:
1.  **Emotional Support:** Act as a safe space for users to vent, share their struggles, and celebrate their victories.
2.  **Information & Resource Hub:** Provide information on specific disabilities, suggest local support networks (when possible, otherwise general types of support), and explain therapeutic techniques in simple terms.
3.  **Self-Care Advocate:** Gently remind users of the importance of their own well-being. Suggest simple, accessible self-care practices.
4.  **Coping Strategy Coach:** Teach practical, evidence-based techniques for managing stress, anxiety, and burnout (e.g., mindfulness, breathing exercises, grounding techniques).

Interaction Guidelines:
- Start conversations with a warm, welcoming tone.
- Use open-ended questions to encourage sharing (e.g., "How are you feeling today?", "What's been on your mind?").
- When a user shares a problem, first validate their feelings, then explore the situation before offering solutions.
- Keep responses concise and easy to read. Use formatting like lists and bold text.
- If the user expresses thoughts of self-harm or harming others, immediately provide crisis support information and urge them to contact a professional. This is critical.
`;

const INITIAL_MESSAGES: Message[] = [
  {
    sender: 'model',
    text: "Hello, I'm Mlezi, your personal wellness companion. How are you feeling today? Feel free to share what's on your mind."
  }
];

const JOURNAL_PROMPTS = [
    "What is one thing that brought you a moment of peace today?",
    "Describe a challenge you faced recently and how you navigated it.",
    "What are you grateful for right now, big or small?",
    "If you could give your past self some advice, what would it be?",
    "What's a small step you can take this week to care for yourself?",
    "Write about a person who has supported you and what they mean to you."
];

const MOODS = {
    happy: { emoji: '😊', label: 'Happy', color: 'var(--mood-happy)' },
    neutral: { emoji: '😐', label: 'Neutral', color: 'var(--mood-neutral)' },
    sad: { emoji: '😢', label: 'Sad', color: 'var(--mood-sad)' },
    anxious: { emoji: '😟', label: 'Anxious', color: 'var(--mood-anxious)' },
};

// --- Login Screen Component ---

const LoginScreen = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Please enter both email and password.');
            return;
        }
        if (!/\S+@\S+\.\S+/.test(email)) {
            setError('Please enter a valid email address.');
            return;
        }
        setError('');
        // In a real app, this would involve an API call.
        // For this demo, we'll just log in successfully.
        onLogin(email);
    };

    return (
        <div className="login-container">
            <div className="login-form">
                <div className="login-header">
                    <svg className="logo-svg" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path className="logo-heart-bg" d="M18 33.3137C12.4293 29.549 2.25 22.1034 2.25 13.5938C2.25 7.99219 6.84281 3.375 12.4219 3.375C15.3469 3.375 18 5.08594 18 5.08594C18 5.08594 20.6531 3.375 23.5781 3.375C29.1572 3.375 33.75 7.99219 33.75 13.5938C33.75 22.1034 23.5707 29.549 18 33.3137Z"/>
                        <path className="logo-plus" d="M18 10.125V21.375" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path className="logo-plus" d="M12.375 15.75H23.625" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <h1>Welcome to MleziCare</h1>
                    <p>Your personal wellness companion.</p>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label htmlFor="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            className="login-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            aria-label="Email Address"
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            className="login-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            aria-label="Password"
                        />
                    </div>
                     {error && <p className="login-error">{error}</p>}
                    <button type="submit" className="login-button">Log In</button>
                </form>
                <div className="login-footer">
                    <a href="#">Forgot Password?</a> • <a href="#">Sign Up</a>
                </div>
            </div>
        </div>
    );
};


// --- Main Dashboard Component ---

const Dashboard = ({ userEmail, onLogout }) => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [moodHistory, setMoodHistory] = useState([]);
  const [journalPrompt, setJournalPrompt] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);


  const aiRef = useRef<GoogleGenAI | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Initialize the Gemini AI Client
  useEffect(() => {
    try {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    } catch (e) {
      console.error(e);
      setError("Failed to initialize the AI model. Please check the API key.");
    }
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
            setIsDropdownOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Set initial journal prompt
  useEffect(() => {
    handleNewPrompt();
  }, [])

  // Auto-resize textarea height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [input]);

  // Scroll to the latest message
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleNewChat = () => {
    setMessages(INITIAL_MESSAGES);
    setInput('');
    setIsLoading(false);
    setError('');
  };
  
  const handleSendMessage = async (messageText = input) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = { sender: 'user', text: messageText };
    setMessages(prev => [...prev, userMessage]);
    if (messageText === input) {
        setInput('');
    }
    setIsLoading(true);
    setError('');

    try {
      if (!aiRef.current) throw new Error("AI not initialized.");

      const messagesWithUser = [...messages, userMessage];

      // Take last 20 messages (10 turns) for context.
      const history = messagesWithUser.slice(-20);

      const contents = history
        // Don't include silent system messages in the API call
        .filter(msg => !msg.isSilent)
        // Convert to the format the API expects
        .map(msg => ({
            role: msg.sender,
            parts: [{ text: msg.text }]
        }));
      
      const mergedContents = contents.reduce((acc, msg) => {
        const lastMsg = acc[acc.length - 1];
        if (lastMsg && lastMsg.role === msg.role) {
          lastMsg.parts[0].text += `\n${msg.parts[0].text}`;
        } else {
          acc.push(msg);
        }
        return acc;
      }, []);
      
      if (mergedContents.length > 0 && mergedContents[0].role === 'model') {
        mergedContents.shift();
      }
      
      if (mergedContents.length === 0) {
        setIsLoading(false);
        return;
      }

      const response = await aiRef.current.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: mergedContents,
        config: {
          systemInstruction: MLEZI_SYSTEM_INSTRUCTION,
        },
      });
      
      const modelMessage: Message = { sender: 'model', text: response.text };
      setMessages(prev => [...prev, modelMessage]);
    } catch (e) {
      console.error(e);
      const errorMessage: Message = { sender: 'model', text: "I'm having a little trouble connecting right now. Please try again in a moment." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleMoodSelection = (mood) => {
    const newEntry = { mood, date: new Date() };
    setMoodHistory(prev => [...prev, newEntry].slice(-7)); // Keep last 7 days
    const moodMessage = `I'm feeling ${mood}.`;
    setMessages(prev => [...prev, { sender: 'user', text: moodMessage, isSilent: true }]);
    handleSendMessage(`I've just logged my mood as ${mood}. Can you give me a brief, supportive thought for the day based on that?`);
  };
  
  const handleNewPrompt = () => {
      const randomIndex = Math.floor(Math.random() * JOURNAL_PROMPTS.length);
      setJournalPrompt(JOURNAL_PROMPTS[randomIndex]);
  };

  const handleWriteInJournal = () => {
      setInput(prev => `${prev}${prev ? '\n\n' : ''}Regarding the prompt "${journalPrompt}": `);
      textareaRef.current?.focus();
  };

  const openToolModal = (toolId) => {
      setActiveTool(toolId);
      setIsToolModalOpen(true);
  };
  
  const closeToolModal = () => setIsToolModalOpen(false);

  // --- Render Methods ---

  const renderMoodChart = () => {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        return d;
    }).reverse();

    return (
        <div className="mood-chart-container">
            <div className="mood-chart">
                {days.map(day => {
                    const entry = moodHistory.find(h => h.date.toDateString() === day.toDateString());
                    const moodKey = entry?.mood;
                    const moodData = moodKey ? MOODS[moodKey] : null;
                    const height = moodKey ? { happy: '100%', neutral: '70%', sad: '40%', anxious: '55%' }[moodKey] : '5%';
                    
                    return (
                        <div key={day.toISOString()} className="chart-day">
                            <div className="chart-bar-wrapper">
                                <div 
                                    className={`chart-bar bar-${moodKey || 'none'}`}
                                    style={{ height: height, backgroundColor: moodData?.color || '#f0f0f0' }}
                                    title={moodData?.label || 'No entry'}
                                >
                                    {moodData?.emoji}
                                </div>
                            </div>
                            <span className="day-label">{day.toLocaleString('en-US', { weekday: 'short' })}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
  };

  const renderToolContent = () => {
    switch(activeTool) {
        case 'breathing':
            return (
                <div className="tool-content">
                    <h3>Box Breathing</h3>
                    <p>A simple technique to calm your nervous system. Follow the animation.</p>
                    <div className="breathing-container">
                        <div className="breathing-circle breathing"></div>
                    </div>
                    <p>Inhale for 4s, Hold for 4s, Exhale for 4s, Hold for 4s. Repeat.</p>
                </div>
            );
        case 'grounding':
            return (
                <div className="tool-content">
                    <h3>5-4-3-2-1 Grounding</h3>
                    <p>Use your senses to connect with the present moment.</p>
                    <div className="grounding-step">Acknowledge 5 things you see around you.</div>
                    <div className="grounding-step">Acknowledge 4 things you can touch.</div>
                    <div className="grounding-step">Acknowledge 3 things you can hear.</div>
                    <div className="grounding-step">Acknowledge 2 things you can smell.</div>
                    <div className="grounding-step">Acknowledge 1 thing you can taste.</div>
                </div>
            );
        case 'affirmations':
             return (
                <div className="tool-content">
                    <h3>Positive Affirmation</h3>
                    <p>Repeat this to yourself, and believe it.</p>
                    <div className="affirmation-card">
                       "I am resilient, capable, and doing the best I can. I am enough."
                    </div>
                </div>
            );
        case 'crisis':
            return (
                <div className="tool-content">
                    <h3 style={{color: 'var(--crisis-text)'}}>Crisis Support</h3>
                    <div className="crisis-warning">
                        If you are in immediate danger or distress, please reach out. You are not alone.
                    </div>
                    <p>These resources are a starting point. Contact a local professional for immediate help.</p>
                    <ul className="resource-list">
                        <li><strong>Befrienders Africa:</strong> A network of emotional support centers across Africa.</li>
                        <li><strong>Local Emergency Services:</strong> Contact your local police or hospital.</li>
                        <li><strong>Find a Helpline:</strong> Search online for "mental health helpline [your country]".</li>
                    </ul>
                </div>
            );
        default: return null;
    }
  }

  return (
    <div className="app-container">
        <header className="header">
            <div className="header-left">
                <svg className="logo-svg" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path className="logo-heart-bg" d="M18 33.3137C12.4293 29.549 2.25 22.1034 2.25 13.5938C2.25 7.99219 6.84281 3.375 12.4219 3.375C15.3469 3.375 18 5.08594 18 5.08594C18 5.08594 20.6531 3.375 23.5781 3.375C29.1572 3.375 33.75 7.99219 33.75 13.5938C33.75 22.1034 23.5707 29.549 18 33.3137Z"/>
                    <path className="logo-plus" d="M18 10.125V21.375" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path className="logo-plus" d="M12.375 15.75H23.625" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <h1>MleziCare</h1>
            </div>
             <div className="header-right">
                <div className="user-menu" ref={userMenuRef}>
                    <button className="user-avatar-button" onClick={() => setIsDropdownOpen(!isDropdownOpen)} aria-label="User menu" aria-haspopup="true" aria-expanded={isDropdownOpen}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M0 0h24v24H0z" fill="none"/>
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                    </button>
                    {isDropdownOpen && (
                        <div className="dropdown-menu">
                            <div className="dropdown-header">{userEmail}</div>
                            <button className="dropdown-item" onClick={onLogout}>
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>

        <main className="dashboard">
            {/* Mood Check-in Widget */}
            <div className="widget">
                <div className="widget-header">
                    <h2>Mood Check-in</h2>
                    <p>How are you feeling right now?</p>
                </div>
                <div className="mood-options">
                    {Object.entries(MOODS).map(([key, { emoji, label }]) => (
                        <button key={key} className={`mood-option mood-${key}`} onClick={() => handleMoodSelection(key)}>
                            <span className="mood-emoji">{emoji}</span>
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Mood History Widget */}
            {moodHistory.length > 0 && (
                 <div className="widget">
                    <div className="widget-header">
                        <h2>Your Week in Moods</h2>
                        <p>A look at your recent check-ins.</p>
                    </div>
                    {renderMoodChart()}
                </div>
            )}
           
            {/* Chat Widget */}
            <div className="widget">
                 <div className="widget-header chat-widget-header">
                    <div>
                        <h2>Chat with Mlezi</h2>
                        <p>Talk. Vent. Get support.</p>
                    </div>
                    <button className="new-chat-button" onClick={handleNewChat} aria-label="Start New Chat" title="Start New Chat">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M0 0h24v24H0z" fill="none"/>
                            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                        </svg>
                    </button>
                </div>
                <div className="chat-widget-container">
                    <div ref={chatWindowRef} className="chat-window">
                        {messages.map((msg, index) => !msg.isSilent && (
                        <div key={index} className={`message ${msg.sender}`}>
                            <div className="message-content" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br />') }}></div>
                        </div>
                        ))}
                        {isLoading && (
                        <div className="message model">
                            <div className="message-content">
                            <div className="loading-indicator"><span></span><span></span><span></span></div>
                            </div>
                        </div>
                        )}
                    </div>
                    {error && <p className="error-message">{error}</p>}
                    <form className="message-form" onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}>
                        <textarea
                        ref={textareaRef}
                        className="message-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                        placeholder="What's on your mind"
                        rows={1}
                        />
                        <button type="submit" className="send-button" disabled={!input.trim() || isLoading}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                        </button>
                    </form>
                </div>
            </div>

            {/* Journal Prompt Widget */}
            <div className="widget">
                <div className="widget-header">
                    <h2>Daily Journal Prompt</h2>
                </div>
                <div className="journal-prompt-content">
                    <p className="journal-prompt-text">"{journalPrompt}"</p>
                    <div className="journal-prompt-actions">
                         <button className="journal-button secondary" onClick={handleNewPrompt}>New Prompt</button>
                         <button className="journal-button primary" onClick={handleWriteInJournal}>Write in Journal</button>
                    </div>
                </div>
            </div>
            
            {/* Toolkit Section */}
            <div>
                 <h2 className="toolkit-title">Wellbeing Toolkit</h2>
                 <div className="tools-grid">
                    <div className="tool-widget widget">
                        <div className="widget-header">
                            <h2>Box Breathing</h2>
                            <p>Calm your mind with a guided breathing exercise.</p>
                        </div>
                        <div className="widget-content">
                            <button className="widget-button" onClick={() => openToolModal('breathing')}>Start Exercise</button>
                        </div>
                    </div>
                    <div className="tool-widget widget">
                        <div className="widget-header">
                            <h2>5-4-3-2-1 Grounding</h2>
                            <p>Reconnect with the present moment using your senses.</p>
                        </div>
                         <div className="widget-content">
                            <button className="widget-button" onClick={() => openToolModal('grounding')}>Begin Grounding</button>
                        </div>
                    </div>
                     <div className="tool-widget widget">
                        <div className="widget-header">
                            <h2>Positive Affirmations</h2>
                            <p>A reminder of your strength and resilience.</p>
                        </div>
                         <div className="widget-content">
                            <button className="widget-button" onClick={() => openToolModal('affirmations')}>View Affirmation</button>
                        </div>
                    </div>
                    <div className="tool-widget widget crisis">
                        <div className="widget-header">
                            <h2>Crisis Support</h2>
                            <p>Immediate resources if you are in distress.</p>
                        </div>
                         <div className="widget-content">
                            <button className="widget-button" onClick={() => openToolModal('crisis')}>Get Help Now</button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
        
        {isToolModalOpen && (
            <div className="modal-overlay" onClick={closeToolModal}>
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                    {renderToolContent()}
                    <button className="close-button" onClick={closeToolModal}>Close</button>
                </div>
            </div>
        )}
    </div>
  );
};


// --- App Component (Authentication Controller) ---

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const handleLogin = (email: string) => {
    // In a real app, this would involve API calls, setting tokens, etc.
    setUserEmail(email);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserEmail('');
  };

  return (
    <div className="app-wrapper">
      {!isAuthenticated ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <Dashboard userEmail={userEmail} onLogout={handleLogout} />
      )}
    </div>
  );
};


const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);