"use client"
import React, { useState, useRef, useEffect, FC, FormEvent, useCallback } from 'react';

// Define the necessary types for Speech Recognition
declare global {
    interface Window {
        webkitSpeechRecognition: any;
        SpeechRecognition: any;
    }
}

// --- TTS HELPER FUNCTIONS (Copied from TextToSpeechApp) ---
// Note: The TTS API returns raw PCM 16-bit audio data which must be wrapped in a WAV file container.

// تبدیل رشته Base64 به آرایه بافر
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// نوشتن هدر WAV
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// تبدیل داده‌های PCM (Int16Array) به Blob فایل WAV
function pcmToWav(pcm16, sampleRate) {
  const buffer = new ArrayBuffer(44 + pcm16.length * 2);
  const view = new DataView(buffer);
  
  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // File length
  view.setUint32(4, 36 + pcm16.length * 2, true);
  // 'WAVE'
  writeString(view, 8, 'WAVE');
  // fmt chunk
  writeString(view, 12, 'fmt ');
  // Chunk length (16 for PCM)
  view.setUint32(16, 16, true);
  // Audio format (1 for PCM)
  view.setUint16(20, 1, true);
  // Number of channels (Mono)
  view.setUint16(22, 1, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint32(28, sampleRate * 2, true);
  // Block align (NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true);
  // Bits per sample
  view.setUint16(34, 16, true);
  
  // data chunk
  writeString(view, 36, 'data');
  // Chunk length (data size)
  view.setUint32(40, pcm16.length * 2, true);
  
  // PCM data
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++, offset += 2) {
    view.setInt16(offset, pcm16[i], true);
  }
  
  return new Blob([view], { type: 'audio/wav' });
}

// --- Types and Constants ---

interface MessageData {
    role: 'user' | 'model';
    text: string;
    type?: 'summary' | 'idea' | 'voice_chat'; 
}

interface ChatPart {
    text: string;
}

interface ChatContent {
    role: 'user' | 'model' | 'function';
    parts: ChatPart[];
}

interface Payload {
    contents: ChatContent[];
    systemInstruction?: { parts: ChatPart[] };
}

const GEMINI_API_KEY = typeof __api_key !== 'undefined' ? __api_key : "AIzaSyCv4BNi1bigs-nGa5jzE5QzIW05mmwf4AI";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isSpeechSupported = typeof SpeechRecognition === 'function';
const isVoiceAvailable = isSpeechSupported; 

// --- Icons (Unchanged) ---

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

// --- API Helper Function (Unchanged, for text generation) ---

/**
 * Helper function for API call with exponential backoff (for Text Generation)
 */
const fetchWithRetry = async (payload: Payload): Promise<string> => {
    const maxRetries = 5;
    let attempt = 0;
    
    const apiKey = GEMINI_API_KEY; 
    const modelName = "gemini-2.5-flash-preview-05-20";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    while (attempt < maxRetries) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text as (string | undefined);

            return text || '';

        } catch (error) {
            const errorMessage = (error as Error).message;
            console.error(`Attempt ${attempt + 1} failed:`, errorMessage);
            
            if (errorMessage.includes("Client or API configuration error")) {
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
    const recognitionRef = useRef<any>(null); 
    const messagesEndRef = useRef<HTMLDivElement>(null); 
    
    // Ref for the Audio object used for TTS playback
    const audioInstanceRef = useRef<HTMLAudioElement | null>(null);

    // Initialize the Audio element once
    useEffect(() => {
        if (!audioInstanceRef.current) {
            audioInstanceRef.current = new Audio();
        }
    }, []);


    // --- TTS Playback Function (Rewritten to use Gemini API) ---

    /**
     * Text-to-Speech (TTS) function using Gemini API
     */
    const speakResponse = useCallback(async (text: string, onEndCallback?: () => void) => {
        if (!text.trim() || !audioInstanceRef.current) {
             if (onEndCallback) onEndCallback();
             return;
        }

        // 1. Stop any current playback
        const currentAudio = audioInstanceRef.current;
        currentAudio.pause();
        currentAudio.src = '';
        
        // 2. TTS API Setup
        const ttsApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`;
        const voiceConfig = {
            prebuiltVoiceConfig: { voiceName: "Kore" } // Using Kore for high-quality Persian voice
        };
        
        const payload = {
            contents: [{ parts: [{ text: text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: voiceConfig }
            },
            model: "gemini-2.5-flash-preview-tts"
        };
        
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                const response = await fetch(ttsApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`خطا در API TTS: ${response.status}. Retrying...`);
                }

                const result = await response.json();
                const part = result?.candidates?.[0]?.content?.parts?.[0];
                const audioData = part?.inlineData?.data;
                const mimeType = part?.inlineData?.mimeType;

                if (audioData && mimeType && mimeType.startsWith("audio/")) {
                    // Conversion to WAV
                    const rateMatch = mimeType.match(/rate=(\d+)/);
                    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000; 

                    const pcmDataBuffer = base64ToArrayBuffer(audioData);
                    const pcm16 = new Int16Array(pcmDataBuffer);
                    const wavBlob = pcmToWav(pcm16, sampleRate);
                    
                    const audioUrl = URL.createObjectURL(wavBlob);
                    
                    // 3. Play audio
                    currentAudio.src = audioUrl;
                    
                    // Attach cleanup and callback
                    const handleEnded = () => {
                        if (onEndCallback) onEndCallback();
                        URL.revokeObjectURL(audioUrl); // Clean up the Blob URL
                        currentAudio.removeEventListener('ended', handleEnded);
                    };
                    currentAudio.addEventListener('ended', handleEnded);
                    
                    currentAudio.play().catch(e => console.error("Audio playback failed:", e));

                    return; // Success
                } else {
                    throw new Error("پاسخ صوتی معتبر نبود.");
                }
            } catch (error) {
                console.error(`Attempt ${attempts + 1} failed for TTS:`, (error as Error).message);
                attempts++;
                if (attempts >= maxAttempts) {
                    // Log failure but continue execution
                    console.error('TTS: Failed to generate audio after multiple retries.');
                    break;
                }
                const delay = Math.pow(2, attempts) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        // Fallback on failure
        if (onEndCallback) onEndCallback();

    }, [GEMINI_API_KEY]); // Dependency on API key (constant)


    // Initial Message Setup based on Mode
    useEffect(() => {
        setMessages([]); 
        stopRecording(); 
        if (audioInstanceRef.current) {
            audioInstanceRef.current.pause(); // Stop TTS playback
            audioInstanceRef.current.src = '';
        }

        if (mode === 'chat') {
            setMessages([{ 
                role: 'model', 
                text: 'به حالت چت متنی خوش آمدید. چطور می‌توانم امروز به شما کمک کنم؟ (پاسخ‌ها به‌صورت همزمان با متن، صوتی پخش می‌شوند)',
            }]);
            setInput(''); 
        } else if (mode === 'voice') {
            if (isVoiceAvailable) {
                setMessages([{ 
                    role: 'model', 
                    text: 'به دستیار صوتی خوش آمدید. دکمه میکروفون را فشار دهید. پس از توقف ضبط، پیام شما به‌صورت خودکار ارسال می‌شود.',
                    type: 'voice_chat'
                }]);
            } else {
                 setMessages([{ 
                    role: 'model', 
                    text: 'متأسفانه مرورگر شما از قابلیت‌های تشخیص گفتار پشتیبانی نمی‌کند. لطفاً از تب چت استفاده کنید.',
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
    
    
    /**
     * Simulated Typing Effect (Streaming)
     */
    const typeMessage = (
        fullText: string, 
        messageIndex: number, 
        finishCallback: () => void // Callback no longer needs fullText
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
                finishCallback(); // Call the finish callback
            }
        }, typingSpeed);
    };


    /**
     * Stops the speech recognition process cleanly.
     */
    const stopRecording = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop(); 
            recognitionRef.current = null;
        }
    };

    /**
     * Speech-to-Text (STT) function with auto-send on stop
     */
    const startRecording = () => {
        if (isRecording || !isSpeechSupported || mode !== 'voice') return;
        
        stopRecording(); 
        if (audioInstanceRef.current) {
            audioInstanceRef.current.pause(); // Stop TTS playback
        }

        const recognition = new SpeechRecognition();
        recognition.lang = "fa-IR"; 
        recognition.interimResults = false; 
        recognition.continuous = true; 
        recognition.maxAlternatives = 1;

        let finalTranscript = '';

        recognition.onstart = () => {
            setIsRecording(true);
            setVoiceStatusMessage(`در حال گوش دادن... دکمه را دوباره بزنید تا ضبط متوقف شده و پیام ارسال شود.`);
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
                 // AUTOMATIC SENDING after stop
                 sendMessage(new Event('submit') as unknown as FormEvent, messageToSend);
                 setInput(''); 
            } else {
                setVoiceStatusMessage('صحبت شما تشخیص داده نشد. برای شروع مجدد، دکمه را فشار دهید.');
                setInput('');
            }
        };

        recognition.onerror = (event: any) => {
            setIsRecording(false);
            setVoiceStatusMessage(`خطای میکروفون: ${event.error}. برای شروع مجدد، دکمه را فشار دهید.`);
            setInput('');
            console.error('Speech Recognition Error:', event.error);
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
        } catch (e) {
            console.error("Error starting recognition:", e);
            setIsRecording(false);
            setVoiceStatusMessage('خطا در شروع ضبط. برای شروع مجدد، دکمه را فشار دهید.');
        }
    };
    
    /**
     * Function to handle message sending (text or voice)
     */
    const sendMessage = async (e: FormEvent, messageText: string) => {
        e.preventDefault();
        
        const isVoiceMode = mode === 'voice';
        
        if (!messageText.trim()) return;
        
        stopRecording();
        if (audioInstanceRef.current) {
            audioInstanceRef.current.pause();
        }


        // 1. Add user message to history
        const newUserMessage: MessageData = { 
            role: 'user', 
            text: messageText, 
            type: isVoiceMode ? 'voice_chat' : undefined 
        };
        
        const historyForAPI = messages.filter(m => m.type !== 'summary' && m.type !== 'idea');
        const newMessages: MessageData[] = [...historyForAPI, newUserMessage];
        
        // 2. Add empty model message placeholder and get its index
        const botMessageIndex = newMessages.length; 
        const botMessageType = isVoiceMode ? 'voice_chat' : undefined;
        const newMessagesWithBotPlaceholder: MessageData[] = [...newMessages, { role: 'model', text: '', type: botMessageType }];
        
        setMessages(newMessagesWithBotPlaceholder);
        if (mode === 'chat') {
             setInput(''); 
        }
        setIsLoading(true);
        setVoiceStatusMessage(null);

        // Prepare chat history for API submission
        const chatHistory: ChatContent[] = newMessages.map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        }));

        let systemInstructionText: string = "شما یک دستیار چت هوشمند هستید و به زبان فارسی پاسخ می‌دهید.";
        if (isVoiceMode) {
            systemInstructionText = "شما یک دستیار مکالمه صوتی سریع هستید. پاسخ شما باید بسیار کوتاه، محاوره‌ای و مستقیم باشد (حداکثر یک یا دو جمله کوتاه).";
        }


        const payload: Payload = {
            contents: chatHistory,
            systemInstruction: { parts: [{ text: systemInstructionText }] },
        };

        let botResponseText = 'متأسفانه در حال حاضر قادر به برقراری ارتباط با هوش مصنوعی نیستم. لطفاً دوباره تلاش کنید.';

        try {
            botResponseText = await fetchWithRetry(payload);
        } catch (error) {
            console.error('Final API fetch error:', (error as Error).message);
            botResponseText = `خطای اتصال: ${(error as Error).message}`;
            
            setMessages(prev => { 
                const updated = [...prev];
                if (updated[botMessageIndex]) updated[botMessageIndex].text = botResponseText;
                return updated;
            });
            setIsLoading(false);
            
            speakResponse(botResponseText); // Speak error message
            return;
        }

        // === منطق جدید برای همزمانی: بلافاصله بعد از دریافت متن، پخش صدا را شروع می‌کنیم ===
        speakResponse(botResponseText);
        
        // 4. Start typing simulation for the AI response concurrently
        typeMessage(botResponseText, botMessageIndex, () => {
            // Callback after typing finishes
            setIsLoading(false);
            // TTS is already running/finished, no need to call speakResponse here.
        });
    };
    
    // --- Special Features (Available in BOTH Chat and Voice Modes) ---

    const getRelevantMessagesForFeatures = (currentMode: 'chat' | 'voice') => {
        const filterType = currentMode === 'voice' ? (m: MessageData) => m.type === 'voice_chat' : (m: MessageData) => m.type !== 'summary' && m.type !== 'idea' && m.type !== 'voice_chat';
        return messages.filter(filterType);
    };

    const summarizeConversation = async (currentMode: 'chat' | 'voice') => {
        const chatMessages = getRelevantMessagesForFeatures(currentMode);

        if (chatMessages.length <= 1) { 
            const noConvoMessage = "مکالمه‌ای برای خلاصه‌سازی وجود ندارد. لطفا ابتدا گفتگو را شروع کنید.";
            setMessages(prev => [...prev, { role: 'model', text: noConvoMessage, type: 'summary' }]);
            speakResponse(noConvoMessage);
            return;
        }

        setIsSummarizing(true);
        if (audioInstanceRef.current) { audioInstanceRef.current.pause(); }

        const conversationText: string = chatMessages.map(msg => `${msg.role === 'user' ? 'کاربر' : 'ربات'}: ${msg.text}`).join('\n');
        const systemPrompt: string = "شما یک دستیار خلاصه‌سازی هوشمند هستید. متن زیر یک مکالمه است. لطفاً آن را به فارسی و در یک پاراگراف، به صورت شیوا و مختصر خلاصه کنید. تمرکز بر نکات اصلی، تصمیمات یا موضوعات کلیدی مکالمه باشد.";
        
        const payload: Payload = {
            contents: [{ role: 'user', parts: [{ text: conversationText }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        const placeholderMessage: MessageData = { role: 'model', text: '', type: 'summary' };
        let messageIndex = -1;
        
        setMessages(prev => {
            messageIndex = prev.length;
            return [...prev, placeholderMessage];
        });

        let summaryText = 'متأسفانه خطایی در ارتباط با هوش مصنوعی رخ داده است.';
        try {
            summaryText = await fetchWithRetry(payload);
        } catch (error) {
            summaryText = `خطا در خلاصه‌سازی مکالمه: ${(error as Error).message}`;
        }
        
        // همزمانی: ابتدا صدا، سپس تایپ
        speakResponse(summaryText);
        
        typeMessage(summaryText, messageIndex, () => {
            setIsSummarizing(false);
            // TTS is handled above
        });
    };
    
    const generateAlternativeIdeas = async (currentMode: 'chat' | 'voice') => {
        const chatMessages = getRelevantMessagesForFeatures(currentMode);
        
        if (chatMessages.length <= 1) {
            const noIdeaMessage = "مکالمه‌ای برای تولید ایده وجود ندارد. لطفا ابتدا گفتگو را شروع کنید.";
            setMessages(prev => [...prev, { role: 'model', text: noIdeaMessage, type: 'idea' }]);
            speakResponse(noIdeaMessage);
            return;
        }

        setIsGeneratingIdeas(true);
        if (audioInstanceRef.current) { audioInstanceRef.current.pause(); }

        const conversationText: string = chatMessages.map(msg => `${msg.role === 'user' ? 'کاربر' : 'ربات'}: ${msg.text}`).join('\n');
        const systemPrompt: string = "شما یک دستیار خلاق هستید. بر اساس مکالمه زیر، پنج ایده، راه‌حل یا پاسخ جایگزین برای موضوع اصلی گفتگو ارائه دهید. پاسخ را به صورت لیست شماره‌گذاری شده در قالب Markdown و به زبان فارسی برگردانید.";
        
        const payload: Payload = {
            contents: [{ role: 'user', parts: [{ text: conversationText }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        const placeholderMessage: MessageData = { role: 'model', text: '', type: 'idea' };
        let messageIndex = -1;
        
        setMessages(prev => {
            messageIndex = prev.length;
            return [...prev, placeholderMessage];
        });

        let ideasText = 'متأسفانه خطایی در ارتباط با هوش مصنوعی رخ داده است.';
        try {
            ideasText = await fetchWithRetry(payload);
        } catch (error) {
            ideasText = `خطا در تولید ایده‌های جایگزین: ${(error as Error).message}`;
        }
        
        // همزمانی: ابتدا صدا، سپس تایپ
        speakResponse("ایده‌های جایگزین آماده شد."); 
        
        typeMessage(ideasText, messageIndex, () => {
            setIsGeneratingIdeas(false);
            // TTS is handled above
        });
    };
    
    // --- UI Components ---
    
    const IdeaMarkdownRenderer: FC<{ content: string }> = ({ content }) => {
        if (!content) return null;
        
        const lines: string[] = content.split('\n');
        return (
            <div className="space-y-2">
                {lines.map((line, index) => {
                    const lineTrimmed = line.trim();
                    if (lineTrimmed.match(/^\d+\.\s/)) {
                        return <li key={index} className="mr-6 list-decimal text-white">{lineTrimmed.replace(/^\d+\.\s*/, '')}</li>;
                    }
                    if (lineTrimmed.match(/^- \s/)) {
                        return <li key={index} className="mr-6 list-disc text-white">{lineTrimmed.replace(/^- \s*/, '')}</li>;
                    }
                    if (lineTrimmed.startsWith('## ')) {
                         return <h2 key={index} className="text-xl font-bold mt-4 mb-2 text-white">{lineTrimmed.substring(3)}</h2>;
                    }
                    if (lineTrimmed.startsWith('### ')) {
                         return <h3 key={index} className="text-lg font-bold mt-3 mb-1 text-white">{lineTrimmed.substring(4)}</h3>;
                    }
                    return lineTrimmed ? <p key={index} className="text-white whitespace-pre-wrap">{lineTrimmed}</p> : null;
                })}
            </div>
        );
    };

    const Message: FC<{ message: MessageData, typing: boolean }> = ({ message, typing }) => {
        const isUser: boolean = message.role === 'user';
        const type = message.type; 
        
        let bgColor: string;
        let Icon: FC;
        let roleText: string;
        let iconBgColor: string;

        if (isUser) {
            bgColor = 'bg-indigo-600';
            Icon = UserIcon;
            roleText = 'شما';
            iconBgColor = 'bg-indigo-700';
        } else if (type === 'summary') {
            bgColor = 'bg-purple-600';
            Icon = BotIcon; 
            roleText = 'خلاصه مکالمه';
            iconBgColor = 'bg-purple-700';
        } else if (type === 'idea') {
            bgColor = 'bg-green-600';
            Icon = BotIcon; 
            roleText = 'ایده‌های جایگزین';
            iconBgColor = 'bg-green-700';
        } else if (type === 'voice_chat') {
            bgColor = 'bg-sky-700';
            Icon = BotIcon;
            roleText = 'دستیار صوتی';
            iconBgColor = 'bg-sky-800';
        } else {
            bgColor = 'bg-gray-700';
            Icon = BotIcon;
            roleText = 'ربات';
            iconBgColor = 'bg-gray-800';
        }

        const alignContainer: string = isUser ? 'justify-end' : 'justify-start';
        const align: string = isUser ? 'items-end' : 'items-start';

        const Content = () => {
            if (type === 'idea') {
                return <IdeaMarkdownRenderer content={message.text} />;
            }
            return <>{message.text}</>;
        };


        return (
            <div className={`flex w-full mt-4 ${alignContainer}`}>
                <div className={`flex flex-col max-w-[80%] ${align}`}>
                    <div className="flex items-center space-x-2 mb-1 dir-rtl">
                        <span className={`p-1 rounded-full ${iconBgColor} text-white`}>
                            <Icon />
                        </span>
                        <span className="text-xs font-semibold text-gray-400">{roleText}</span>
                    </div>

                    <div className="text-sm p-4 rounded-xl shadow-lg whitespace-pre-wrap text-white" 
                         style={{ direction: 'rtl', textAlign: 'right' }}>
                        
                        <div className={`${bgColor} p-2 rounded-xl ${isUser ? 'rounded-br-none' : 'rounded-tl-none'}`}>
                            <div className={typing ? 'typing-cursor' : ''}>
                                <Content />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };
    
    const isAppBusy: boolean = isLoading || isSummarizing || isGeneratingIdeas || isRecording;
    const isWaitingForLLM = isLoading || isSummarizing || isGeneratingIdeas;

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center p-4 font-inter text-right" style={{ fontFamily: 'Vazirmatn, Tahoma, sans-serif' }}>
            <style jsx global>{`
                @font-face {
                    font-family: 'Vazirmatn';
                    src: url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.0.3/fonts/webfonts/Vazirmatn-Regular.woff2') format('woff2');
                    font-weight: 400;
                    font-style: normal;
                }
                body {
                    direction: rtl; 
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #374151; 
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #6366f1; 
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #4f46e5; 
                }
                @keyframes cursor-blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
                .typing-cursor::after {
                    content: '|';
                    margin-right: 2px;
                    animation: cursor-blink 0.7s infinite;
                }
            `}</style>

            <header className="w-full max-w-3xl mb-4 pt-4">
                <h1 className="text-3xl font-bold text-center text-indigo-400">
                    دستیار هوش مصنوعی
                </h1>
                
                <div className="flex justify-center p-1 bg-gray-800 rounded-xl shadow-inner mt-4">
                    <button
                        onClick={() => setMode('chat')}
                        className={`flex-1 p-3 rounded-xl transition-all font-semibold text-sm ${
                            mode === 'chat' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-700'
                        }`}
                        disabled={isAppBusy}
                    >
                        📝 چت (متنی)
                    </button>
                    <button
                        onClick={() => setMode('voice')}
                        className={`flex-1 p-3 rounded-xl transition-all font-semibold text-sm ${
                            mode === 'voice' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-700'
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
                            disabled={isAppBusy || getRelevantMessagesForFeatures('chat').length <= 1}
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
                                </>
                            )}
                        </button>
                        
                        <button
                            onClick={() => generateAlternativeIdeas('chat')}
                            disabled={isAppBusy || getRelevantMessagesForFeatures('chat').length <= 1}
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
                                </>
                            )}
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
                                typing={
                                    !msg.text.includes('خطا') && 
                                    msg.role === 'model' && 
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
                    ) : (
                        <div className="flex flex-col items-center justify-center">
                            
                            <div className="flex justify-center flex-wrap gap-3 mb-4 w-full">
                                <button
                                    onClick={() => summarizeConversation('voice')}
                                    disabled={isAppBusy || getRelevantMessagesForFeatures('voice').length <= 1}
                                    className="bg-purple-600 text-white p-3 rounded-lg shadow-md hover:bg-purple-700 transition duration-200 disabled:bg-purple-400 disabled:cursor-not-allowed flex items-center text-sm"
                                >
                                    {isSummarizing ? (
                                        <svg className="animate-spin mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : 'خلاصه‌سازی ✨'}
                                </button>
                                
                                <button
                                    onClick={() => generateAlternativeIdeas('voice')}
                                    disabled={isAppBusy || getRelevantMessagesForFeatures('voice').length <= 1}
                                    className="bg-green-600 text-white p-3 rounded-lg shadow-md hover:bg-green-700 transition duration-200 disabled:bg-green-400 disabled:cursor-not-allowed flex items-center text-sm"
                                >
                                    {isGeneratingIdeas ? (
                                        <svg className="animate-spin mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : 'ایده‌های جایگزین ✨'}
                                </button>
                            </div>


                            {voiceStatusMessage && (
                                <div 
                                    className={`p-3 mb-4 rounded-xl text-sm font-medium shadow-md w-full text-center ${isRecording ? 'bg-indigo-700 text-white' : 'bg-gray-700 text-gray-300'}`}
                                    style={{ whiteSpace: 'pre-wrap' }} 
                                >
                                    {voiceStatusMessage}
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
                                        : 'bg-indigo-600 hover:bg-indigo-700'
                                    }
                                    ${!isVoiceAvailable ? 'opacity-50 cursor-not-allowed' : ''}
                                `}
                            >
                                {isWaitingForLLM ? (
                                    <>
                                        <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
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
                                    قابلیت‌های تشخیص گفتار در مرورگر شما فعال نیست.
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
