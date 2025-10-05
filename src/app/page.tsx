"use client"
import React, { useState, useRef, useEffect, FC, FormEvent } from 'react';

// 1. Define data type for messages
interface MessageData {
    role: 'user' | 'model';
    text: string;
}

// 2. Define data type for API content
interface ChatPart {
    text: string;
}

interface ChatContent {
    role: 'user' | 'model';
    parts: ChatPart[];
}

interface Payload {
    contents: ChatContent[];
    systemInstruction?: { parts: ChatPart[] };
}

// Simple icons for better appearance
const SendIcon: FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
);

const UserIcon: FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
);

const BotIcon: FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white"><path d="M12 11v6"></path><path d="M11 17h2"></path><circle cx="12" cy="5" r="2"></circle><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
);

// Define API key (uses the global variable provided by the environment, or a fallback)
// NOTE: We rely on the environment to handle the API key securely.
//@ts-ignore
const GEMINI_API_KEY = typeof __api_key !== 'undefined' ? __api_key : "AIzaSyCv4BNi1bigs-nGa5jzE5QzIW05mmwf4AI";


/**
 * Helper function for API call with exponential backoff
 * FIX: Now directly calls the Gemini model API address and uses the provided API key.
 */
const fetchWithRetry = async (payload: Payload): Promise<string> => {
    const maxRetries = 5;
    let attempt = 0;
    
    // API parameters for direct invocation
    const apiKey = GEMINI_API_KEY; 
    const modelName = "gemini-2.5-flash-preview-05-20";
    // Construct URL with API key
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    while (attempt < maxRetries) {
        try {
            // Direct invocation of the Gemini model API
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // Attempt to read the error body for more information
                const errorText = await response.text();
                // Retry for recoverable errors (like 429 or 5xx)
                if (response.status === 403 || response.status === 429 || response.status >= 500) {
                     throw new Error(`API Error: ${response.status} ${response.statusText}. Retrying...`);
                }
                // Skip retry for other errors (like fatal input error 400)
                throw new Error(`Client or API configuration error! Status: ${response.status}. Details: ${errorText.substring(0, 150)}`);
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text as (string | undefined);

            if (text) {
                return text;
            } else {
                // If API responds successfully but has no generated text content
                throw new Error('API returned successfully but contained no generated text content.');
            }

        } catch (error) {
            const errorMessage = (error as Error).message;
            console.error(`Attempt ${attempt + 1} failed:`, errorMessage);
            
            // If the error is fatal (e.g., error 400 which won't be resolved by retry)
            if (errorMessage.includes("Client or API configuration error")) {
                throw error; 
            }

            attempt++;
            if (attempt >= maxRetries) {
                throw new Error('Failed to fetch response after multiple retries.');
            }
            // Pause with exponential backoff
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return 'متأسفانه در حال حاضر قادر به برقراری ارتباط با هوش مصنوعی نیستم. لطفاً دوباره تلاش کنید.';
};

// Main Chatbot Application Component
const App: FC = () => {
    // State to hold messages using MessageData[] type
    const [messages, setMessages] = useState<MessageData[]>([
        { role: 'model', text: 'سلام! من یک چت‌بات هوش مصنوعی هستم. چطور می‌توانم امروز به شما کمک کنم؟' }
    ]);
    const [input, setInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    
    // States for summarization feature
    const [summary, setSummary] = useState<string | null>(null);
    const [isSummarizing, setIsSummarizing] = useState<boolean>(false);

    // New states for alternative idea generation feature
    const [generatedIdeas, setGeneratedIdeas] = useState<string | null>(null);
    const [isGeneratingIdeas, setIsGeneratingIdeas] = useState<boolean>(false);

    // Typing for useRef: refers to an HTMLDivElement or null
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the bottom when a new message is added
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Main function to send message and call API
    const sendMessage = async (e: FormEvent) => {
        e.preventDefault();
        const userMessage = input.trim();
        if (!userMessage) return;
        
        // Clear AI outputs when starting a new chat
        setSummary(null);
        setGeneratedIdeas(null);

        // 1. Add user message to history
        const newUserMessage: MessageData = { role: 'user', text: userMessage };
        const newMessages: MessageData[] = [...messages, newUserMessage];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        // Prepare chat history for API submission
        const chatHistory: ChatContent[] = newMessages.map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        }));

        const payload: Payload = {
            contents: chatHistory,
        };

        let botResponseText = 'متأسفانه در حال حاضر قادر به برقراری ارتباط با هوش مصنوعی نیستم. لطفاً دوباره تلاش کنید.';

        try {
            // **Gemini Model API Call**
            botResponseText = await fetchWithRetry(payload);
        } catch (error) {
            console.error('Final API fetch error:', (error as Error).message);
            botResponseText = `خطای اتصال: ${(error as Error).message}`;
        } finally {
            // 2. Add AI response to history
            const newBotMessage: MessageData = { role: 'model', text: botResponseText };
            setMessages(prev => [...prev, newBotMessage]);
            setIsLoading(false);
        }
    };
    
    // Function to summarize conversation using Gemini API
    const summarizeConversation = async () => {
        if (messages.length <= 1) { // Only welcome message
            setSummary("مکالمه‌ای برای خلاصه‌سازی وجود ندارد. لطفا ابتدا گفتگو را شروع کنید.");
            setGeneratedIdeas(null); // Reset other output
            return;
        }

        setIsSummarizing(true);
        setSummary(null);
        setGeneratedIdeas(null);

        // Prepare history for summarization (text only)
        const conversationText: string = messages.map(msg => `${msg.role === 'user' ? 'کاربر' : 'ربات'}: ${msg.text}`).join('\n');

        const systemPrompt: string = "شما یک دستیار خلاصه‌سازی هوشمند هستید. متن زیر یک مکالمه است. لطفاً آن را به فارسی و در یک پاراگراف، به صورت شیوا و مختصر خلاصه کنید. تمرکز بر نکات اصلی، تصمیمات یا موضوعات کلیدی مکالمه باشد.";
        
        // FIX: Added role: 'user' to match the ChatContent interface
        const payload: Payload = {
            contents: [{ role: 'user', parts: [{ text: conversationText }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        try {
            // **Gemini Model API Call**
            const summaryText = await fetchWithRetry(payload);
            setSummary(summaryText);
        } catch (error) {
            setSummary(`خطا در خلاصه‌سازی مکالمه: ${(error as Error).message}`);
        } finally {
            setIsSummarizing(false);
        }
    };
    
    // New function: Generate alternative ideas using Gemini API
    const generateAlternativeIdeas = async () => {
        if (messages.length <= 1) {
            setGeneratedIdeas("مکالمه‌ای برای تولید ایده وجود ندارد. لطفا ابتدا گفتگو را شروع کنید.");
            setSummary(null); // Reset other output
            return;
        }

        setIsGeneratingIdeas(true);
        setGeneratedIdeas(null);
        setSummary(null);

        // Prepare history for the model
        const conversationText: string = messages.map(msg => `${msg.role === 'user' ? 'کاربر' : 'ربات'}: ${msg.text}`).join('\n');

        const systemPrompt: string = "شما یک دستیار خلاق هستید. بر اساس مکالمه زیر، پنج ایده، راه‌حل یا پاسخ جایگزین برای موضوع اصلی گفتگو ارائه دهید. پاسخ را به صورت لیست شماره‌گذاری شده در قالب Markdown و به زبان فارسی برگردانید.";
        
        // FIX: Added role: 'user' to match the ChatContent interface
        const payload: Payload = {
            contents: [{ role: 'user', parts: [{ text: conversationText }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        try {
            // **Gemini Model API Call**
            const ideasText = await fetchWithRetry(payload);
            setGeneratedIdeas(ideasText);
        } catch (error) {
            setGeneratedIdeas(`خطا در تولید ایده‌های جایگزین: ${(error as Error).message}`);
        } finally {
            setIsGeneratingIdeas(false);
        }
    };

    // Typing Message component props
    interface MessageProps {
        message: MessageData;
    }

    // Message Component for displaying each message
    const Message: FC<MessageProps> = ({ message }) => {
        const isUser: boolean = message.role === 'user';
        const bgColor: string = isUser ? 'bg-indigo-600' : 'bg-gray-700';
        const align: string = isUser ? 'items-end' : 'items-start';
        const roleText: string = isUser ? 'شما' : 'ربات';
        const Icon: FC = isUser ? UserIcon : BotIcon;

        return (
            <div className={`flex w-full mt-4 ${align}`}>
                <div className={`flex flex-col max-w-3/4 ${align}`}>
                    {/* Message header (role) */}
                    <div className="flex items-center space-x-2 mb-1 dir-rtl">
                        <span className={`p-1 rounded-full ${isUser ? 'bg-indigo-700' : 'bg-gray-800'} text-white`}>
                            <Icon />
                        </span>
                        <span className="text-xs font-semibold text-gray-400">{roleText}</span>
                    </div>

                    {/* Message content */}
                    <div className={`p-4 rounded-xl shadow-lg whitespace-pre-wrap ${bgColor} text-white ${isUser ? 'rounded-br-none' : 'rounded-tl-none'}`}
                         style={{ direction: 'rtl', textAlign: 'right' }}>
                        {message.text}
                    </div>
                </div>
            </div>
        );
    };
    
    // Typing MarkdownRenderer component props
    interface MarkdownRendererProps {
        content: string | null;
    }

    // Markdown Renderer Component
    const MarkdownRenderer: FC<MarkdownRendererProps> = ({ content }) => {
        if (!content) return null;
        
        const lines: string[] = content.split('\n');
        return (
            <div className="space-y-2">
                {lines.map((line, index) => {
                    if (line.match(/^\d+\.\s/)) {
                        // Numbered Markdown list
                        return <li key={index} className="mr-6 list-decimal">{line.replace(/^\d+\.\s*/, '')}</li>;
                    }
                    if (line.match(/^- \s/)) {
                        // Bulleted Markdown list
                        return <li key={index} className="mr-6 list-disc">{line.replace(/^- \s*/, '')}</li>;
                    }
                    if (line.startsWith('## ')) {
                         return <h2 key={index} className="text-xl font-bold mt-4 mb-2">{line.substring(3)}</h2>;
                    }
                    if (line.startsWith('### ')) {
                         return <h3 key={index} className="text-lg font-bold mt-3 mb-1">{line.substring(4)}</h3>;
                    }
                    // Regular paragraphs
                    return <p key={index} className="text-gray-200 whitespace-pre-wrap">{line}</p>;
                })}
            </div>
        );
    };
    
    // Disable all inputs/buttons if LLM call is ongoing
    const isAppBusy: boolean = isLoading || isSummarizing || isGeneratingIdeas;

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center p-4 font-inter text-right" style={{ fontFamily: 'Vazirmatn, Tahoma, sans-serif' }}>
            {/* Load Persian fonts (Vazirmatn or alternative) */}
            <style jsx global>{`
                @font-face {
                    font-family: 'Vazirmatn';
                    src: url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.0.3/fonts/webfonts/Vazirmatn-Regular.woff2') format('woff2');
                    font-weight: 400;
                    font-style: normal;
                }
                body {
                    direction: rtl; /* Set writing direction for the whole page */
                }
                /* Style for a nice dark mode scrollbar */
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #374151; /* gray-700 */
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #6366f1; /* indigo-500 */
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #4f46e5; /* indigo-600 */
                }
            `}</style>

            <header className="w-full max-w-3xl mb-4 pt-4">
                <h1 className="text-3xl font-bold text-center text-indigo-400">
                    چت‌بات هوش مصنوعی
                </h1>
                <p className="text-center text-gray-500 mt-1">
                    با استفاده از مدل Gemini
                </p>
                
                {/* LLM capabilities buttons */}
                <div className="flex justify-center flex-wrap gap-3 mt-4">
                    
                    {/* Summarization button */}
                    <button
                        onClick={summarizeConversation}
                        disabled={isAppBusy || messages.length <= 1}
                        className="bg-purple-600 text-white p-3 rounded-lg shadow-md hover:bg-purple-700 transition duration-200 disabled:bg-purple-400 disabled:cursor-not-allowed flex items-center text-sm"
                    >
                        {isSummarizing ? (
                            <span className="flex items-center">
                                <svg className="animate-spin mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                خلاصه‌سازی...
                            </span>
                        ) : (
                            <>
                                <span>خلاصه‌سازی مکالمه ✨</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </>
                        )}
                    </button>
                    
                    {/* Alternative idea button */}
                    <button
                        onClick={generateAlternativeIdeas}
                        disabled={isAppBusy || messages.length <= 1}
                        className="bg-green-600 text-white p-3 rounded-lg shadow-md hover:bg-green-700 transition duration-200 disabled:bg-green-400 disabled:cursor-not-allowed flex items-center text-sm"
                    >
                        {isGeneratingIdeas ? (
                            <span className="flex items-center">
                                <svg className="animate-spin mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                تولید ایده...
                            </span>
                        ) : (
                            <>
                                <span>ایده‌های جایگزین ✨</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 w-4 h-4"><path d="M10.4 12.6l1.2-1.2 3.6 3.6-1.2 1.2c-1.8 1.8-4.8 1.8-6.6 0l-3.6-3.6 3.6-3.6c1.8-1.8 4.8-1.8 6.6 0z"></path><path d="M13.6 11.4l-1.2 1.2-3.6-3.6 1.2-1.2c1.8-1.8 4.8-1.8 6.6 0l3.6 3.6-3.6 3.6c-1.8 1.8-4.8 1.8-6.6 0z"></path></svg>
                            </>
                        )}
                    </button>
                </div>
            </header>

            {/* Main chat body */}
            <main className="w-full max-w-3xl flex flex-col bg-gray-800 rounded-2xl shadow-2xl h-[70vh]">
                
                {/* AI output display section (summary or idea) */}
                {(summary || generatedIdeas) && (
                    <div className="p-4 bg-yellow-900/30 border-b border-yellow-700/50 rounded-t-2xl text-yellow-100 text-sm" style={{ direction: 'rtl', textAlign: 'right' }}>
                        <h3 className="font-bold mb-2 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 w-4 h-4 text-yellow-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            {summary ? 'خلاصه مکالمه:' : 'ایده‌های جایگزین:'}
                        </h3>
                        {summary ? <p className="text-gray-200 whitespace-pre-wrap">{summary}</p> : <MarkdownRenderer content={generatedIdeas} />}
                    </div>
                )}
                
                {/* Display messages */}
                <div className="flex-grow p-5 overflow-y-auto custom-scrollbar">
                    {messages.map((msg, index) => (
                        <Message key={index} message={msg} />
                    ))}
                    {isLoading && (
                        <div className="flex items-center space-x-2 mt-4 dir-rtl">
                            <span className="p-1 rounded-full bg-gray-800 text-white">
                                <BotIcon />
                            </span>
                            <div className="p-3 bg-gray-700 rounded-xl rounded-tl-none text-white text-sm animate-pulse">
                                در حال فکر کردن...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input form */}
                <div className="p-4 border-t border-gray-700">
                    <form onSubmit={sendMessage} className="flex space-x-2 dir-rtl">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="پیام خود را بنویسید..."
                            disabled={isAppBusy}
                            className="flex-grow p-4 rounded-xl bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 transition shadow-inner text-right"
                            style={{ direction: 'rtl' }}
                        />
                        <button
                            type="submit"
                            disabled={isAppBusy || !input.trim()}
                            className="bg-indigo-600 text-white p-4 rounded-xl shadow-lg hover:bg-indigo-700 transition duration-200 disabled:bg-indigo-400 disabled:cursor-not-allowed flex items-center justify-center transform hover:scale-105"
                        >
                            <SendIcon />
                            <span className="mr-2 hidden sm:inline">ارسال</span>
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
};

export default App;
