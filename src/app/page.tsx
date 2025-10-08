"use client"
import React, { useState, useRef, useEffect, FC, FormEvent, useCallback } from 'react';

// Define the necessary types for Speech Recognition
declare global {
    interface Window {
        webkitSpeechRecognition: any;
        SpeechRecognition: any;
    }
}

// --- Types and Constants ---

interface MessageData {
    role: 'user' | 'assistant';
    text: string;
    type?: 'summary' | 'idea' | 'voice_chat';
    audioUrl?: string;
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface Payload {
    messages: ChatMessage[];
    model?: string;
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
}

const AVALAI_API_KEY = "aa-QzIvMriEbO9Rjf4mfG88WPp6Xx0rcqcaxvJHkGcm9EHvSUQG";
const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const isSpeechSupported = typeof SpeechRecognition === 'function';
const isVoiceAvailable = isSpeechSupported;

// --- Audio Utility Functions ---

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len); 
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const writeString = (view: DataView, offset: number, string: string): void => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

const pcmToWav = (pcm16: Int16Array, sampleRate: number): Blob => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    
    const dataSize = pcm16.length * 2; 
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    let offset = 0;

    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + dataSize, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;

    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, byteRate, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bitsPerSample, true); offset += 2;

    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, dataSize, true); offset += 4;
    
    for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(offset, pcm16[i], true);
        offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
};

// --- Icons ---

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

const MicIcon: FC<{ isRecording: boolean }> = ({ isRecording }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-6 h-6 ${isRecording ? 'text-white' : 'text-white'}`}>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
);

const StopIcon: FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
        <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
    </svg>
);

const SpeakerIcon: FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 text-emerald-400 hover:text-emerald-300`}>
        <polyline points="15 8 20 13 15 18"></polyline>
        <path d="M10 5V19"></path>
        <path d="M4 17L10 12L4 7V17Z"></path>
    </svg>
);

// --- API Helper Function ---

const fetchWithRetry = async (payload: Payload): Promise<string> => {
    const maxRetries = 5;
    let attempt = 0;
    
    const apiUrl = `https://api.avalai.ir/v1/chat/completions`;

    while (attempt < maxRetries) {
        try {
            if (!AVALAI_API_KEY) {
                throw new Error("AVALAI_API_KEY is not defined.");
            }

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AVALAI_API_KEY}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 403 || response.status === 429 || response.status >= 500) {
                     throw new Error(`API Error: ${response.status}. Retrying...`);
                }
                throw new Error(`Client or API configuration error! Status: ${response.status}. Details: ${errorText.substring(0, 150)}`);
            }

            const result = await response.json();
            const text = result.choices?.[0]?.message?.content as (string | undefined);

            return text || '';

        } catch (error) {
            const errorMessage = (error as Error).message;
            console.error(`Attempt ${attempt + 1} failed:`, errorMessage);
            
            if (errorMessage.includes("Client or API configuration error") || errorMessage.includes("AVALAI_API_KEY is not defined")) {
                throw error; 
            }

            attempt++;
            if (attempt >= maxRetries) {
                throw new Error('Failed to fetch response after multiple retries.');
            }
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return 'متأسفانه در حال حاضر قادر به برقراری ارتباط با هوش مصنوعی نیستم. لطفاً دوباره تلاش کنید.';
};

// Main Chatbot Application Component
const App: FC = () => {
    const [messages, setMessages] = useState<MessageData[]>([]);
    const [input, setInput] = useState<string>('');
    const [mode, setMode] = useState<'chat' | 'voice'>('chat'); 
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
    const [isGeneratingIdeas, setIsGeneratingIdeas] = useState<boolean>(false);
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [voiceStatusMessage, setVoiceStatusMessage] = useState<string | null>(null);
    const [ttsError, setTtsError] = useState<string | null>(null);
    const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
    const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
    const recognitionRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Function to replay audio
    const replayAudio = useCallback((message: MessageData, index: number) => {
        if (message.audioUrl) {
            setSpeakingIndex(index);
            const audio = new Audio(message.audioUrl);
            audio.onended = () => setSpeakingIndex(null);
            audio.onerror = () => setSpeakingIndex(null);
            audio.play().catch(e => {
                console.warn("Cached audio replay failed", e);
                setSpeakingIndex(null);
            });
        } else {
            speakResponse(message.text, index);
        }
    }, []);

    const availableVoices = [
        { name: 'Kore', label: 'Kore (Firm)' },
        { name: 'Puck', label: 'Puck (Upbeat)' },
        { name: 'Charon', label: 'Charon (Informative)' },
        { name: 'Zephyr', label: 'Zephyr (Bright)' },
        { name: 'Achernar', label: 'Achernar (Soft)' },
    ];
    
    // Cleanup
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    // Fetch Avalai models on component mount
    useEffect(() => {
        fetch("https://api.avalai.ir/v1/models", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${AVALAI_API_KEY}`
            }
        })
        .then(response => response.json())
        .then(data => console.log("Avalai Models:", data))
        .catch(error => console.error('Error fetching Avalai models:', error));
    }, []);

    // TTS Function
    const speakResponse = useCallback(async (text: string, messageIndex: number | null = null, onEndCallback?: () => void) => {
        setTtsError(null);
        
        if (messageIndex !== null) {
            setSpeakingIndex(messageIndex);
        }

        // استفاده از Web Speech API برای TTS (راه حل ساده)
        try {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'fa-IR';
                utterance.rate = 0.9;
                utterance.pitch = 1;
                
                utterance.onend = () => {
                    if (onEndCallback) onEndCallback();
                    if (messageIndex !== null) setSpeakingIndex(null);
                };
                
                utterance.onerror = (e) => {
                    console.error('TTS Error:', e);
                    setTtsError("خطا در پخش صدا");
                    if (onEndCallback) onEndCallback();
                    if (messageIndex !== null) setSpeakingIndex(null);
                };
                
                speechSynthesis.speak(utterance);
            } else {
                setTtsError("مرورگر شما از قابلیت متن به گفتار پشتیبانی نمی‌کند");
                if (onEndCallback) onEndCallback();
                if (messageIndex !== null) setSpeakingIndex(null);
            }
        } catch (e) {
            console.error("TTS failed:", e);
            setTtsError("خطا در پردازش صدا");
            if (onEndCallback) onEndCallback();
            if (messageIndex !== null) setSpeakingIndex(null);
        }
    }, []);
    
    // Initial Message Setup
    useEffect(() => {
        setMessages([]); 
        stopRecording(); 
        
        if (mode === 'chat') {
            setMessages([{ 
                role: 'assistant', 
                text: 'به حالت چت متنی خوش آمدید. چطور می‌توانم امروز به شما کمک کنم؟',
            }]);
            setInput(''); 
        } else if (mode === 'voice') {
            if (isVoiceAvailable) {
                setMessages([{ 
                    role: 'assistant', 
                    text: 'به دستیار صوتی خوش آمدید. دکمه میکروفون را فشار دهید.',
                    type: 'voice_chat'
                }]);
            } else {
                 setMessages([{ 
                    role: 'assistant', 
                    text: 'متأسفانه مرورگر شما از قابلیت تشخیص گفتار پشتیبانی نمی‌کند.',
                    type: 'voice_chat'
                }]);
            }
            setInput(''); 
        }
    }, [mode]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
    
    // Typing Effect
    const typeMessage = (
        fullText: string, 
        messageIndex: number, 
        finishCallback: () => void 
    ) => {
        let currentText = '';
        let i = 0;
        const typingSpeed = 25; 

        const interval = setInterval(() => {
            if (i < fullText.length) {
                currentText += fullText[i];
                
                setMessages(prevMessages => {
                    const updatedMessages = [...prevMessages];
                    if (updatedMessages[messageIndex]) {
                        updatedMessages[messageIndex] = { 
                            ...updatedMessages[messageIndex], 
                            text: currentText 
                        };
                    }
                    return updatedMessages;
                });
                
                i++;
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            } else {
                clearInterval(interval);
                finishCallback();
            }
        }, typingSpeed);
    };

    // Stop Recording
    const stopRecording = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop(); 
            recognitionRef.current = null;
        }
    };

    // Start Recording
    const startRecording = () => {
        if (isRecording || !isSpeechSupported || mode !== 'voice') return;
        
        stopRecording(); 

        const recognition = new SpeechRecognition();
        recognition.lang = "fa-IR"; 
        recognition.interimResults = false; 
        recognition.continuous = true; 
        recognition.maxAlternatives = 1;

        let finalTranscript = '';

        recognition.onstart = () => {
            setIsRecording(true);
            setVoiceStatusMessage(`در حال گوش دادن...`);
            setInput(''); 
            finalTranscript = '';
        };

        recognition.onresult = (event: any) => {
            let currentFinalTranscript = '';
            for (let i = 0; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    currentFinalTranscript += event.results[i][0].transcript;
                }
            }
            
            finalTranscript = currentFinalTranscript;
            setInput(finalTranscript); 
        };
        
        recognition.onend = () => {
            setIsRecording(false);
            
            const messageToSend = finalTranscript.trim();
            
            if (messageToSend) {
                 sendMessage(new Event('submit') as unknown as FormEvent, messageToSend);
                 setInput(''); 
            } else {
                setVoiceStatusMessage('صحبت شما تشخیص داده نشد.');
                setInput('');
            }
        };

        recognition.onerror = (event: any) => {
            setIsRecording(false);
            setVoiceStatusMessage(`خطای میکروفون: ${event.error}`);
            setInput('');
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
        } catch (e) {
            console.error("Error starting recognition:", e);
            setIsRecording(false);
            setVoiceStatusMessage('خطا در شروع ضبط');
        }
    };
    
    // Send Message
    const sendMessage = async (e: FormEvent, messageText: string) => {
        e.preventDefault();
        
        const isVoiceMode = mode === 'voice';
        
        if (!messageText.trim()) return;
        
        stopRecording();
        setTtsError(null);

        // Filter messages for API
        const historyForAPI = messages.filter(m => 
            m.type !== 'summary' && 
            m.type !== 'idea' && 
            !m.text.includes('به حالت چت متنی خوش آمدید')
        );
        
        const newUserMessage: MessageData = { 
            role: 'user', 
            text: messageText, 
            type: isVoiceMode ? 'voice_chat' : undefined 
        };
        
        const newMessages: MessageData[] = [...historyForAPI, newUserMessage];
        
        // Add empty assistant message
        const botMessageIndex = newMessages.length; 
        const botMessageType = isVoiceMode ? 'voice_chat' : undefined;
        const newMessagesWithBotPlaceholder: MessageData[] = [...newMessages, { 
            role: 'assistant', 
            text: '', 
            type: botMessageType 
        }];
        
        setMessages(newMessagesWithBotPlaceholder);
        if (mode === 'chat') {
            setInput(''); 
        }
        setIsLoading(true);
        setVoiceStatusMessage(null);

        // Prepare messages for Avalai API
        const chatHistory: ChatMessage[] = newMessages.map(msg => ({
            role: msg.role,
            content: msg.text
        }));

        // System message based on mode
        let systemMessage = "شما یک دستیار چت هوشمند هستید و به زبان فارسی پاسخ می‌دهید.";
        if (isVoiceMode) {
            systemMessage = "شما یک دستیار مکالمه صوتی سریع هستید. پاسخ شما باید بسیار کوتاه، محاوره‌ای و مستقیم باشد (حداکثر یک یا دو جمله کوتاه).";
        }

        // Add system message as the first message
        const apiMessages: ChatMessage[] = [
            { role: 'system', content: systemMessage },
            ...chatHistory
        ];

        const payload: Payload = {
            messages: apiMessages,
            model: "gpt-4o",
            stream: false,
            max_tokens: 1000,
            temperature: 0.7
        };

        let botResponseText = 'متأسفانه در حال حاضر قادر به برقراری ارتباط با هوش مصنوعی نیستم.';

        try {
            botResponseText = await fetchWithRetry(payload);
        } catch (error) {
            console.error('Final API fetch error:', error);
            botResponseText = `خطای اتصال: ${(error as Error).message}`;
            
            setMessages(prev => { 
                const updated = [...prev];
                if (updated[botMessageIndex]) updated[botMessageIndex].text = botResponseText;
                return updated;
            });
            setIsLoading(false);
            speakResponse(botResponseText); 
            return;
        }

        // Start TTS and typing
        speakResponse(botResponseText, botMessageIndex);
        typeMessage(botResponseText, botMessageIndex, () => {
            setIsLoading(false);
        });
    };
    
    // Feature Functions
    const getRelevantMessagesForFeatures = (currentMode: 'chat' | 'voice') => {
        const filterType = currentMode === 'voice' 
            ? (m: MessageData) => m.type === 'voice_chat'
            : (m: MessageData) => m.type !== 'summary' && m.type !== 'idea' && m.type !== 'voice_chat';
            
        const filteredMessages = messages.filter(filterType);
        
        return filteredMessages.filter((msg, index) => {
            if (msg.role === 'assistant' && index === 0 && msg.text.includes('خوش آمدید')) {
                return false;
            }
            return true;
        });
    };

    const summarizeConversation = async (currentMode: 'chat' | 'voice') => {
        const chatMessages = getRelevantMessagesForFeatures(currentMode);

        if (chatMessages.length < 2) {
            const noConvoMessage = "مکالمه‌ای برای خلاصه‌سازی وجود ندارد.";
            setMessages(prev => [...prev, { role: 'assistant', text: noConvoMessage, type: 'summary' }]);
            speakResponse(noConvoMessage);
            return;
        }

        setIsSummarizing(true);

        const conversationText = chatMessages.map(msg => 
            `${msg.role === 'user' ? 'کاربر' : 'ربات'}: ${msg.text}`
        ).join('\n');
        
        const apiMessages: ChatMessage[] = [
            { role: 'system', content: "شما یک دستیار خلاصه‌سازی هوشمند هستید. متن مکالمه را به فارسی و مختصر خلاصه کنید." },
            { role: 'user', content: `لطفاً این مکالمه را خلاصه کنید:\n\n${conversationText}` }
        ];

        const payload: Payload = {
            messages: apiMessages,
            model: "gpt-4o",
            stream: false
        };

        const placeholderMessage: MessageData = { role: 'assistant', text: '', type: 'summary' };
        let messageIndex = -1;
        
        setMessages(prev => {
            messageIndex = prev.length;
            return [...prev, placeholderMessage];
        });

        let summaryText = 'خطا در خلاصه‌سازی';
        try {
            summaryText = await fetchWithRetry(payload);
        } catch (error) {
            summaryText = `خطا: ${(error as Error).message}`;
        }
        
        speakResponse(summaryText, messageIndex);
        typeMessage(summaryText, messageIndex, () => {
            setIsSummarizing(false);
        });
    };
    
    const generateAlternativeIdeas = async (currentMode: 'chat' | 'voice') => {
        const chatMessages = getRelevantMessagesForFeatures(currentMode);
        
        if (chatMessages.length < 2) {
            const noIdeaMessage = "مکالمه‌ای برای تولید ایده وجود ندارد.";
            setMessages(prev => [...prev, { role: 'assistant', text: noIdeaMessage, type: 'idea' }]);
            speakResponse(noIdeaMessage);
            return;
        }

        setIsGeneratingIdeas(true);

        const conversationText = chatMessages.map(msg => 
            `${msg.role === 'user' ? 'کاربر' : 'ربات'}: ${msg.text}`
        ).join('\n');
        
        const apiMessages: ChatMessage[] = [
            { 
                role: 'system', 
                content: "شما یک دستیار خلاق هستید. بر اساس مکالمه، ایده‌های جایگزین ارائه دهید." 
            },
            { 
                role: 'user', 
                content: `بر اساس این مکالمه، پنج ایده یا راه‌حل جایگزین ارائه دهید:\n\n${conversationText}` 
            }
        ];

        const payload: Payload = {
            messages: apiMessages,
            model: "gpt-4o",
            stream: false
        };

        const placeholderMessage: MessageData = { role: 'assistant', text: '', type: 'idea' };
        let messageIndex = -1;
        
        setMessages(prev => {
            messageIndex = prev.length;
            return [...prev, placeholderMessage];
        });

        let ideasText = 'خطا در تولید ایده';
        try {
            ideasText = await fetchWithRetry(payload);
        } catch (error) {
            ideasText = `خطا: ${(error as Error).message}`;
        }
        
        speakResponse("ایده‌های جایگزین آماده شد", messageIndex);
        typeMessage(ideasText, messageIndex, () => {
            setIsGeneratingIdeas(false);
        });
    };
    
    // UI Components
    const IdeaMarkdownRenderer: FC<{ content: string }> = ({ content }) => {
        if (!content) return null;
        
        const lines = content.split('\n');
        return (
            <div className="space-y-2">
                {lines.map((line, index) => {
                    const lineTrimmed = line.trim();
                    if (lineTrimmed.match(/^\d+\.\s/)) {
                        return <li key={index} className="mr-6 list-decimal text-white">
                            {lineTrimmed.replace(/^\d+\.\s*/, '')}
                        </li>;
                    }
                    if (lineTrimmed.match(/^- \s/)) {
                        return <li key={index} className="mr-6 list-disc text-white">
                            {lineTrimmed.replace(/^- \s*/, '')}
                        </li>;
                    }
                    return lineTrimmed ? 
                        <p key={index} className="text-white whitespace-pre-wrap">{lineTrimmed}</p> : 
                        null;
                })}
            </div>
        );
    };

    const Message: FC<{
        message: MessageData,
        typing: boolean,
        index: number,
        speakingIndex: number | null,
        replayAudio: (message: MessageData, index: number) => void
    }> = ({ message, typing, index, speakingIndex, replayAudio }) => {
        const isUser = message.role === 'user';
        const isAssistantResponse = message.role === 'assistant';
        const isTextPresent = message.text && message.text.trim().length > 0;
        const isPlaying = isAssistantResponse && speakingIndex === index;
        
        const type = message.type; 
        
        let bgColor, Icon, roleText, iconBgColor;

        if (isUser) {
            bgColor = 'bg-emerald-600';
            Icon = UserIcon;
            roleText = 'شما';
            iconBgColor = 'bg-emerald-700';
        } else if (type === 'summary') {
            bgColor = 'bg-lime-600';
            Icon = BotIcon; 
            roleText = 'خلاصه مکالمه';
            iconBgColor = 'bg-lime-700';
        } else if (type === 'idea') {
            bgColor = 'bg-green-600';
            Icon = BotIcon; 
            roleText = 'ایده‌های جایگزین';
            iconBgColor = 'bg-green-700';
        } else if (type === 'voice_chat') {
            bgColor = 'bg-teal-700';
            Icon = BotIcon;
            roleText = 'دستیار صوتی';
            iconBgColor = 'bg-teal-800';
        } else {
            bgColor = 'bg-gray-700';
            Icon = BotIcon;
            roleText = 'ربات';
            iconBgColor = 'bg-gray-800';
        }

        const alignContainer = isUser ? 'justify-end' : 'justify-start';

        const Content = () => {
            if (type === 'idea') {
                return <IdeaMarkdownRenderer content={message.text} />;
            }
            return <>{message.text}</>;
        };

        return (
            <div className={`flex w-full mt-4 ${alignContainer}`}>
                <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center space-x-2 mb-1 dir-rtl">
                        <span className={`p-1 rounded-full ${iconBgColor} text-white`}>
                            <Icon />
                        </span>
                        <span className="text-xs font-semibold text-gray-400">{roleText}</span>
                    </div>

                    <div className="text-sm p-4 rounded-xl shadow-lg whitespace-pre-wrap text-white" 
                         style={{ direction: 'rtl', textAlign: 'right' }}>
                        
                        <div className={`${bgColor} p-2 rounded-xl ${isUser ? 'rounded-br-none' : 'rounded-tl-none'} flex justify-between items-start space-x-2`}>
                            
                            <div className={typing ? 'typing-cursor' : ''} style={{ maxWidth: '90%' }}>
                                <Content />
                            </div>

                            {isAssistantResponse && isTextPresent && (
                                <button
                                    onClick={() => replayAudio(message, index)}
                                    className={`flex-shrink-0 mr-2 p-1 rounded-full transition duration-150 ${
                                        isPlaying ? 'bg-red-200' : 'bg-transparent hover:bg-gray-600'
                                    }`}
                                    title="پخش مجدد پیام"
                                    disabled={isPlaying || typing}
                                >
                                    {isPlaying ? (
                                        <svg className="animate-spin h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <SpeakerIcon />
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };
    
    const isAppBusy = isLoading || isSummarizing || isGeneratingIdeas || isRecording;
    const isWaitingForLLM = isLoading || isSummarizing || isGeneratingIdeas;

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center p-4 font-inter text-right bg-tarhan-kuhdasht bg-cover bg-center" style={{ fontFamily: 'Vazirmatn, Tahoma, sans-serif' }}>
            <script src="https://cdn.tailwindcss.com"></script>
            <style jsx global>{`
                @font-face {
                    font-family: 'Vazirmatn';
                    src: url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.0.3/fonts/webfonts/Vazirmatn-Regular.woff2') format('woff2');
                    font-weight: 400;
                    font-style: normal;
                }
                body { direction: rtl; }
                .custom-scrollbar::-webkit-scrollbar { width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #374151; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4f46e5; }
                @keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
                .typing-cursor::after { content: '|'; margin-right: 2px; animation: cursor-blink 0.7s infinite; }
                .bg-tarhan-kuhdasht { 
                    background-image: url('/img/tarhan.jpg');
                    background-blend-mode: overlay;
                    background-color: rgba(0, 0, 0, 0.5);
                }
            `}</style>

            <header className="w-full max-w-3xl mb-4 pt-4">
                <h1 className="text-3xl font-bold text-center text-emerald-400">دیار طرهان</h1>
                
                <div className="flex justify-center p-1 bg-gray-800 rounded-xl shadow-inner mt-4">
                    <button
                        onClick={() => setMode('chat')}
                        className={`flex-1 p-3 rounded-xl transition-all font-semibold text-sm ${
                            mode === 'chat' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-700'
                        }`}
                        disabled={isAppBusy}
                    >
                        📝 چت (متنی)
                    </button>
                    <button
                        onClick={() => setMode('voice')}
                        className={`flex-1 p-3 rounded-xl transition-all font-semibold text-sm ${
                            mode === 'voice' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-700'
                        }`}
                        disabled={isAppBusy}
                    >
                        🎙️ مکالمه (صوتی)
                    </button>
                </div>

                {mode === 'chat' && (
                    <div className="flex justify-center flex-wrap gap-3 mt-4">
                        <button
                            onClick={() => summarizeConversation('chat')}
                            disabled={isAppBusy || getRelevantMessagesForFeatures('chat').length < 2}
                            className="bg-lime-600 text-white p-3 rounded-lg shadow-md hover:bg-lime-700 transition duration-200 disabled:bg-lime-400 disabled:cursor-not-allowed flex items-center text-sm"
                        >
                            {isSummarizing ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    خلاصه‌سازی...
                                </span>
                            ) : 'خلاصه‌سازی مکالمه ✨'}
                        </button>
                        
                        <button
                            onClick={() => generateAlternativeIdeas('chat')}
                            disabled={isAppBusy || getRelevantMessagesForFeatures('chat').length < 2}
                            className="bg-green-600 text-white p-3 rounded-lg shadow-md hover:bg-green-700 transition duration-200 disabled:bg-green-400 disabled:cursor-not-allowed flex items-center text-sm"
                        >
                            {isGeneratingIdeas ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    تولید ایده...
                                </span>
                            ) : 'ایده‌های جایگزین ✨'}
                        </button>
                    </div>
                )}
            </header>

            <main className="w-full max-w-3xl flex flex-col bg-gray-800 rounded-2xl shadow-2xl h-[75vh]">
                <div className="flex-grow p-5 overflow-y-auto custom-scrollbar">
                    {messages.map((msg, index) => (
                        <div key={index}>
                            <Message
                                message={msg}
                                index={index}
                                speakingIndex={speakingIndex}
                                replayAudio={replayAudio}
                                typing={
                                    !msg.text.includes('خطا') &&
                                    msg.role === 'assistant' &&
                                    index === messages.length - 1 &&
                                    isWaitingForLLM
                                }
                            />
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-4 border-t border-gray-700">
                    {mode === 'chat' ? (
                        <form onSubmit={(e) => sendMessage(e, input)} className="flex space-x-2 dir-rtl">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="پیام خود را بنویسید..."
                                disabled={isAppBusy}
                                className="flex-grow p-4 rounded-xl bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500 transition shadow-inner text-right"
                                style={{ direction: 'rtl' }}
                            />
                            <button
                                type="submit"
                                disabled={isAppBusy || !input.trim()}
                                className="bg-emerald-600 text-white p-4 rounded-xl shadow-lg hover:bg-emerald-700 transition duration-200 disabled:bg-emerald-400 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                <SendIcon />
                                <span className="mr-2 hidden sm:inline">ارسال</span>
                            </button>
                        </form>
                    ) : (
                        <div className="flex flex-col items-center justify-center">
                            <div className="flex justify-center flex-wrap gap-3 mb-4 w-full">
                                <button
                                    onClick={() => summarizeConversation('voice')}
                                    disabled={isAppBusy || getRelevantMessagesForFeatures('voice').length < 2}
                                    className="bg-lime-600 text-white p-3 rounded-lg shadow-md hover:bg-lime-700 transition duration-200 disabled:bg-lime-400 disabled:cursor-not-allowed flex items-center text-sm"
                                >
                                    {isSummarizing ? (
                                        <svg className="animate-spin mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : 'خلاصه‌سازی ✨'}
                                </button>
                                
                                <button
                                    onClick={() => generateAlternativeIdeas('voice')}
                                    disabled={isAppBusy || getRelevantMessagesForFeatures('voice').length < 2}
                                    className="bg-green-600 text-white p-3 rounded-lg shadow-md hover:bg-green-700 transition duration-200 disabled:bg-green-400 disabled:cursor-not-allowed flex items-center text-sm"
                                >
                                    {isGeneratingIdeas ? (
                                        <svg className="animate-spin mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : 'ایده‌های جایگزین ✨'}
                                </button>
                            </div>

                            {voiceStatusMessage && (
                                <div className={`p-3 mb-4 rounded-xl text-sm font-medium shadow-md w-full text-center ${
                                    isRecording ? 'bg-emerald-700 text-white' : 'bg-gray-700 text-gray-300'
                                }`}>
                                    {voiceStatusMessage}
                                </div>
                            )}
                            
                            {input && (
                                <div className="p-3 mb-4 rounded-xl text-base font-medium shadow-inner w-full text-center bg-gray-700 text-emerald-400">
                                    {input}
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={isRecording ? stopRecording : startRecording}
                                disabled={isWaitingForLLM || !isVoiceAvailable} 
                                className={`w-32 h-32 rounded-full shadow-2xl transition duration-300 flex flex-col items-center justify-center space-y-2 
                                    ${isRecording 
                                        ? 'bg-red-600 hover:bg-red-700 ring-4 ring-red-400 animate-pulse' 
                                        : isWaitingForLLM
                                        ? 'bg-gray-500 cursor-not-allowed'
                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                            >
                                {isWaitingForLLM ? (
                                    <>
                                        <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span className="text-sm font-bold text-white">منتظر پاسخ...</span>
                                    </>
                                ) : (
                                    <>
                                        {isRecording ? <StopIcon /> : <MicIcon isRecording={isRecording} />}
                                        <span className="text-sm font-bold text-white">
                                            {isRecording ? 'پایان ضبط' : 'شروع ضبط'}
                                        </span>
                                    </>
                                )}
                            </button>

                            {!isVoiceAvailable && (
                                <p className="mt-3 text-sm text-red-400">
                                    قابلیت تشخیص گفتار در مرورگر شما فعال نیست.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default App;
