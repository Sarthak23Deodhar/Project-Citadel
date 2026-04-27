import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { NeuButton } from './NeuButton';
import { NeuCard } from './NeuCard';
import { processSupportChat } from '@/src/services/aiService';
import Markdown from 'react-markdown';

export function SupportChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'model', content: string}[]>([
    { role: 'model', content: 'Hello! I am the Citadel Support Bot. How can I help you regarding the app, features, or disaster response protocols?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(newMessages);
    setIsTyping(true);

    try {
      const response = await processSupportChat(userMsg, newMessages.slice(0, -1)); // exclude the latest userMsg to give it separately if we wanted, but aiService handles it.
      // Wait, processSupportChat takes (message, history). 
      // Let's pass the message AND the history BEFORE the message.
      setMessages([...newMessages, { role: 'model', content: response }]);
    } catch (e) {
      setMessages([...newMessages, { role: 'model', content: 'Support AI is currently unavailable.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[9999]">
        <NeuButton
          onClick={() => setIsOpen(!isOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center p-0 transition-all duration-300 shadow-lg ${isOpen ? 'bg-accent text-white blur-[2px] opacity-0 scale-90' : 'bg-background hover:bg-accent hover:text-white'}`}
        >
          <MessageCircle className="w-6 h-6" />
        </NeuButton>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-24 right-6 z-[10000] w-[350px] max-w-[calc(100vw-48px)] h-[500px] max-h-[calc(100vh-120px)] flex flex-col"
          >
            <NeuCard className="flex flex-col h-full !p-0 overflow-hidden border-accent/20">
              <div className="bg-accent/10 p-4 border-b border-accent/20 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-text">Support Bot</h3>
                    <p className="text-[10px] uppercase tracking-wider text-text-muted">Citadel Help</p>
                  </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-text-muted hover:text-text p-1 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 no-scrollbar">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                      msg.role === 'user' 
                        ? 'bg-accent text-white rounded-br-sm' 
                        : 'bg-background shadow-inner border border-text-muted/10 text-text rounded-bl-sm prose prose-sm dark:prose-invert max-w-full prose-p:my-1 prose-ul:my-1 prose-li:my-0'
                    }`}>
                      {msg.role === 'user' ? msg.content : <Markdown>{msg.content}</Markdown>}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex w-full justify-start">
                    <div className="bg-background shadow-inner border border-text-muted/10 px-4 py-3 rounded-2xl rounded-bl-sm">
                      <div className="flex gap-1.5 items-center">
                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-accent/60 rounded-full" />
                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-accent/60 rounded-full" />
                        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-accent/60 rounded-full" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 bg-background border-t border-text-muted/10">
                <div className="relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question..."
                    className="w-full bg-background border border-text-muted/20 rounded-full pl-4 pr-12 py-2.5 text-sm focus:outline-none focus:border-accent transition-colors shadow-inner"
                    disabled={isTyping}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isTyping}
                    className="absolute right-1.5 top-1.5 w-8 h-8 flex items-center justify-center bg-accent text-white rounded-full hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Send className="w-4 h-4 ml-0.5" />
                  </button>
                </div>
              </div>
            </NeuCard>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
