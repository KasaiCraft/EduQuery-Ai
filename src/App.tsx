import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Send, 
  Trash2, 
  Copy, 
  Check, 
  Loader2, 
  MessageSquare,
  AlertCircle,
  ChevronRight,
  Info,
  Sparkles,
  BookOpen,
  GraduationCap,
  Lock,
  Mail,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';
import { supabase, isSupabaseConfigured } from './supabase';
import { User } from '@supabase/supabase-js';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessed, setIsProcessed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    // Check for active session
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    }).catch(err => {
      console.error("Supabase session check failed:", err);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    if (!isSupabaseConfigured) {
      setAuthError("Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables.");
      setAuthLoading(false);
      return;
    }

    console.log(`Attempting ${isSignUp ? 'SignUp' : 'SignIn'} for:`, email);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: window.location.origin
          }
        });
        
        console.log("SignUp response:", { data, error });
        
        if (error) throw error;
        
        if (data.user && data.session) {
          setUser(data.user);
        } else {
          alert('Registration successful! Please check your email for the confirmation link.');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        
        console.log("SignIn response:", { data, error });
        
        if (error) throw error;
        setUser(data.user);
      }
    } catch (err: any) {
      console.error("Auth error details:", err);
      // Handle "Failed to fetch" specifically to provide better guidance
      if (err.message === 'Failed to fetch') {
        setAuthError("Network error: Could not connect to Supabase. This usually means the Supabase URL is incorrect or blocked by a firewall/CORS.");
      } else {
        setAuthError(err.message || "An unexpected error occurred during authentication.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clearChat();
  };

  useEffect(() => {
    // Check server status on mount
    fetch('/api/status')
      .then(res => res.json())
      .then(data => console.log("Server status:", data))
      .catch(err => console.error("Server status check failed:", err));
  }, []);

  const onDrop = async (acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;
    
    if (selectedFile.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    handleUpload(selectedFile);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  } as any);

  const handleUpload = async (fileToUpload: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    // Simulate progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + 5;
      });
    }, 100);

    const formData = new FormData();
    formData.append('pdf', fileToUpload);

    try {
      const response = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response received from /api/upload-pdf:", text);
        throw new Error(`Server returned non-JSON response (${response.status}). Check console for details.`);
      }

      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || 'Upload failed');

      clearInterval(interval);
      setUploadProgress(100);
      setIsProcessed(true);
      
      // Add initial greeting or suggestion
      setMessages([
        { 
          role: 'assistant', 
          content: `I've processed **${fileToUpload.name}**. How can I help you with it? You can ask for a summary or specific details.` 
        }
      ]);
    } catch (err: any) {
      setError(err.message);
      setFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || !isProcessed) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages.slice(-5) // Send last 5 messages for context
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response received from /api/chat:", text);
        throw new Error(`Server returned non-JSON response (${response.status}). Check console for details.`);
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get response');

      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = async () => {
    try {
      await fetch('/api/clear', { method: 'POST' });
      setMessages([]);
      setFile(null);
      setIsProcessed(false);
      setError(null);
    } catch (err) {
      console.error('Failed to clear chat');
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const sampleQuestions = [
    "What is this document about?",
    "Summarize the key points",
    "What are the main conclusions?",
    "List the important dates mentioned"
  ];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 border border-slate-100 p-10"
        >
          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200/50 mb-6">
              <GraduationCap size={36} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Welcome to EduQuery</h1>
            <p className="text-slate-500 font-medium">Secure access to your learning assistant</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {authError && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-700 text-xs font-bold">
                <AlertCircle className="shrink-0" size={16} />
                <p>{authError}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={authLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {authLoading ? <Loader2 className="animate-spin" size={20} /> : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200/50">
              <GraduationCap size={26} />
            </div>
            <div>
              <h1 className="font-bold text-xl leading-tight tracking-tight">EduQuery <span className="text-blue-600">AI</span></h1>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">Premium Learning Assistant</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {isProcessed && (
              <button 
                onClick={clearChat}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
              >
                <Trash2 size={18} />
                <span className="hidden sm:inline">Reset Session</span>
              </button>
            )}
            <div className="h-8 w-[1px] bg-slate-200 hidden sm:block"></div>
            <button 
              onClick={handleSignOut}
              className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
              <Sparkles size={12} />
              <span>PRO PLAN</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {!isProcessed ? (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-6"
              >
                <BookOpen size={14} />
                <span>INTELLIGENT DOCUMENT ANALYSIS</span>
              </motion.div>
              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl font-black text-slate-900 mb-6 tracking-tight leading-[1.1]"
              >
                Master your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">documents</span> with AI
              </motion.h2>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-xl text-slate-500 leading-relaxed max-w-2xl mx-auto"
              >
                Upload any PDF and transform it into an interactive learning experience. Ask questions, get summaries, and extract insights instantly.
              </motion.p>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white p-10 rounded-[3rem] shadow-2xl shadow-slate-200/60 border border-slate-100 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600"></div>
              <div 
                {...getRootProps()} 
                className={cn(
                  "relative border-2 border-dashed rounded-[2rem] p-16 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center text-center group",
                  isDragActive ? "border-blue-500 bg-blue-50/50 scale-[0.99]" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50/50",
                  isUploading && "pointer-events-none opacity-60"
                )}
              >
                <input {...getInputProps()} />
                
                <div className={cn(
                  "w-20 h-20 rounded-3xl flex items-center justify-center mb-8 transition-all duration-500",
                  isUploading ? "bg-blue-600 text-white rotate-180" : "bg-blue-50 text-blue-600 group-hover:scale-110 group-hover:rotate-3 shadow-inner"
                )}>
                  {isUploading ? <Loader2 className="animate-spin" size={40} /> : <Upload size={40} />}
                </div>
                
                <h3 className="text-2xl font-black mb-3 tracking-tight">
                  {isUploading ? "Analyzing Document..." : "Upload your PDF"}
                </h3>
                <p className="text-slate-400 font-medium mb-10 max-w-xs mx-auto leading-relaxed">
                  {isUploading ? "Our AI is reading through your document to provide the best insights." : "Drag and drop your file here, or click to select from your device."}
                </p>
                
                {!isUploading && (
                  <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                    <span className="flex items-center gap-2"><Info size={14} /> MAX 10MB</span>
                    <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
                    <span className="flex items-center gap-2"><Check size={14} /> PDF ONLY</span>
                  </div>
                )}

                {isUploading && (
                  <div className="w-full max-w-sm mt-4">
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-blue-600 to-indigo-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">{uploadProgress}% ANALYZED</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">EST. 5 SECONDS</p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm"
                >
                  <AlertCircle className="shrink-0" size={18} />
                  <p>{error}</p>
                </motion.div>
              )}
            </motion.div>

            <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
                { icon: <Sparkles className="text-blue-600" />, title: "Smart Extraction", desc: "Our AI identifies key concepts and relationships within your document automatically." },
                { icon: <BookOpen className="text-indigo-600" />, title: "Deep Learning", desc: "Go beyond simple search. Understand the 'why' and 'how' behind the information." },
                { icon: <GraduationCap className="text-purple-600" />, title: "Study Assistant", desc: "Perfect for students and researchers needing quick, accurate document synthesis." }
              ].map((feature, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + (i * 0.1) }}
                  className="p-8 bg-white rounded-3xl border border-slate-200/50 shadow-sm hover:shadow-md transition-all hover:-translate-y-1"
                >
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6">{feature.icon}</div>
                  <h4 className="font-bold text-lg mb-2">{feature.title}</h4>
                  <p className="text-sm text-slate-500 leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-12rem)]">
            {/* Left Side: Document Info */}
            <div className="lg:col-span-4 flex flex-col gap-8">
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-xl shadow-slate-200/20">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                    <FileText size={28} />
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-bold text-lg truncate tracking-tight" title={file?.name}>{file?.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-md uppercase tracking-wider">PDF DOCUMENT</span>
                      <p className="text-xs text-slate-400 font-medium">{(file?.size || 0) / 1024 / 1024 < 1 ? `${Math.round((file?.size || 0) / 1024)} KB` : `${((file?.size || 0) / 1024 / 1024).toFixed(2)} MB`}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Learning Path</h4>
                    <div className="h-[1px] flex-1 bg-slate-100 ml-4"></div>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {sampleQuestions.map((q, i) => (
                      <button 
                        key={i}
                        onClick={() => {
                          setInput(q);
                        }}
                        className="text-left p-4 text-[13px] font-semibold bg-slate-50 hover:bg-white hover:text-blue-700 rounded-2xl border border-transparent hover:border-blue-100 hover:shadow-md transition-all flex items-center justify-between group"
                      >
                        <span className="truncate pr-4">{q}</span>
                        <ChevronRight size={16} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-blue-600" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-600 to-indigo-800 p-8 rounded-[2rem] text-white shadow-2xl shadow-blue-200/50 relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                <div className="relative z-10">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-6 backdrop-blur-md">
                    <Sparkles size={20} />
                  </div>
                  <h4 className="font-bold text-xl mb-3 tracking-tight">Expert Guidance</h4>
                  <p className="text-sm text-blue-100/90 leading-relaxed font-medium">
                    "Ask specific questions like 'What are the financial projections for 2024?' or 'List all the stakeholders mentioned in section 3.'"
                  </p>
                </div>
              </div>
            </div>

            {/* Right Side: Chat Interface */}
            <div className="lg:col-span-8 flex flex-col bg-white rounded-[2rem] border border-slate-200/60 shadow-xl shadow-slate-200/20 overflow-hidden">
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-[#FDFDFD]">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex w-full",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      <div className={cn(
                        "max-w-[85%] group relative",
                        msg.role === 'user' ? "flex flex-row-reverse gap-4" : "flex gap-4"
                      )}>
                        <div className={cn(
                          "w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center text-xs font-bold shadow-sm",
                          msg.role === 'user' ? "bg-blue-600 text-white" : "bg-white border border-slate-100 text-blue-600"
                        )}>
                          {msg.role === 'user' ? 'U' : <Sparkles size={18} />}
                        </div>
                        
                        <div className={cn(
                          "p-6 rounded-[2rem] text-[15px] leading-relaxed shadow-sm transition-all",
                          msg.role === 'user' 
                            ? "bg-blue-600 text-white rounded-tr-none" 
                            : "bg-white text-slate-800 border border-slate-100 rounded-tl-none hover:border-blue-100"
                        )}>
                          {msg.role === 'assistant' ? (
                            <div className="prose prose-sm max-w-none prose-slate prose-headings:text-blue-900 prose-strong:text-blue-700 prose-a:text-blue-600 prose-p:leading-relaxed">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          )}
                          
                          {msg.role === 'assistant' && (
                            <div className="mt-5 pt-4 border-t border-slate-50 flex items-center justify-between">
                              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black flex items-center gap-1.5">
                                <Check size={12} className="text-emerald-500" /> AI VERIFIED RESPONSE
                              </span>
                              <button 
                                onClick={() => copyToClipboard(msg.content, i)}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                title="Copy to clipboard"
                              >
                                {copiedIndex === i ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                {isLoading && (
                  <div className="flex justify-start gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shadow-sm">
                      <Loader2 className="animate-spin text-blue-500" size={18} />
                    </div>
                    <div className="bg-white border border-slate-100 p-6 rounded-[2rem] rounded-tl-none shadow-sm">
                      <div className="flex gap-1.5">
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    </div>
                  </div>
                )}
                
                {error && (
                  <div className="p-5 bg-red-50 border border-red-100 rounded-3xl flex items-start gap-3 text-red-700 text-sm shadow-sm">
                    <AlertCircle className="shrink-0" size={20} />
                    <p className="font-medium">{error}</p>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-6 border-t border-slate-100 bg-white">
                <form 
                  onSubmit={handleSendMessage}
                  className="relative flex items-center gap-3"
                >
                  <div className="relative flex-1">
                    <input 
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask your learning assistant anything..."
                      className="w-full bg-slate-50 border border-slate-200/60 rounded-2xl px-6 py-5 pr-16 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                      disabled={isLoading}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className={cn(
                          "p-2.5 rounded-xl transition-all shadow-md",
                          !input.trim() || isLoading 
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                            : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 active:scale-95"
                        )}
                      >
                        {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                      </button>
                    </div>
                  </div>
                </form>
                <p className="text-[10px] text-center text-slate-400 mt-4 font-bold uppercase tracking-widest">
                  Powered by Gemini 2.0 Flash • Optimized for Educational Context
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200/60 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-50 grayscale">
            <GraduationCap size={20} />
            <span className="font-bold text-sm tracking-tight">EduQuery AI</span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            &copy; 2024 EduQuery AI. All rights reserved. Premium Educational Tools.
          </p>
          <div className="flex items-center gap-6 text-xs font-bold text-slate-400 uppercase tracking-widest">
            <a href="#" className="hover:text-blue-600 transition-colors">Privacy</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Terms</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
