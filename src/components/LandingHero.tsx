'use client';

import React, { useState } from 'react';
import {
  BrainCircuit,
  Captions,
  Film,
  ArrowRight,
  CheckCircle2,
  Share2,
  Layers,
  Mail,
  X,
  MessageSquare,
  Send,
} from 'lucide-react';
import { useAuthStore } from '@/lib/use-auth-store';

export const LandingHero: React.FC = () => {
  const { openAuthModal } = useAuthStore();
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);

    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      setContactError('Please fill in all fields before sending.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail.trim())) {
      setContactError('Please enter a valid email address.');
      return;
    }

    setIsSubmittingContact(true);
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: contactName, email: contactEmail, message: contactMessage }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to send your request.');
      }
      setContactSubmitted(true);
      setTimeout(() => {
        setContactSubmitted(false);
        setShowContactModal(false);
        setContactName('');
        setContactEmail('');
        setContactMessage('');
      }, 2500);
    } catch (error: any) {
      setContactError(error.message || 'Unable to send your request.');
    } finally {
      setIsSubmittingContact(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-zinc-950 text-zinc-100 selection:bg-amber-400 selection:text-black">
      {/* Background Decorative Ambient Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -left-40 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Hero Content Section */}
      <section className="relative max-w-5xl w-full mx-auto px-4 sm:px-8 pt-16 sm:pt-24 pb-16 text-center space-y-8 z-10">
        {/* Release Pill Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-900/90 border border-white/10 text-xs font-semibold text-zinc-300 shadow-xl backdrop-blur-md">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <BrainCircuit className="w-3.5 h-3.5 text-amber-400" />
          <span>Cloudflare D1 & Workers AI Engine</span>
        </div>

        {/* Main Headline */}
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight leading-[1.1]">
            Turn Long Videos Into <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-white">
              Viral Short Reels
            </span>
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            AI speech recognition, word-level animated karaoke captions, viral clip detection, and auto-thumbnail creator — all in one modern studio.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => openAuthModal('login')}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white hover:bg-zinc-200 text-zinc-950 font-black text-sm shadow-xl shadow-white/10 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Sign In to Access Studio</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => openAuthModal('register')}
            className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 text-white font-bold text-sm border border-white/10 hover:border-white/20 transition-all cursor-pointer backdrop-blur-md"
          >
            <span>Create Free Account</span>
          </button>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-12 text-left">
          {/* Card 1 */}
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-white/10 hover:border-amber-400/30 transition-all group backdrop-blur-md">
            <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Film className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">AI Moment Finder</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Discovers 60-second viral clips from speeches, interviews, and podcasts with semantic depth scoring.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-white/10 hover:border-amber-400/30 transition-all group backdrop-blur-md">
            <div className="w-10 h-10 rounded-xl bg-sky-400/10 border border-sky-400/20 text-sky-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Captions className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Animated Karaoke</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Word-by-word active spoken highlight, Hormozi & MrBeast styles, auto viral emojis, and Hinglish support.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-white/10 hover:border-amber-400/30 transition-all group backdrop-blur-md">
            <div className="w-10 h-10 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Thumbnail Creator</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Designed for 9:16 vertical covers with custom branding badges, high-contrast fonts, and auto-merge.
            </p>
          </div>

          {/* Card 4 */}
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-white/10 hover:border-amber-400/30 transition-all group backdrop-blur-md">
            <div className="w-10 h-10 rounded-xl bg-purple-400/10 border border-purple-400/20 text-purple-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Share2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Social Copywriter</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Generates viral hooks, post captions, call-to-actions, and hashtag clusters for Instagram, Shorts, & TikTok.
            </p>
          </div>
        </div>

        {/* Platform Compatibility Badges */}
        <div className="pt-8 border-t border-white/5 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>9:16 Reels & Shorts Optimized</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Cloudflare D1 & R2 Powered</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>1080p MP4 Hardware Render</span>
          </div>
        </div>
      </section>

      {/* Footer with Contact Link */}
      <footer className="w-full border-t border-white/10 py-6 px-4 text-center text-xs text-zinc-500 relative z-10 flex flex-col sm:flex-row items-center justify-between max-w-5xl mx-auto gap-3">
        <p>© {new Date().getFullYear()} ReelMaker — AI Video Reel Studio. All rights reserved.</p>
        <div className="flex items-center gap-4 text-zinc-400">
          <button
            type="button"
            onClick={() => setShowContactModal(true)}
            className="hover:text-amber-400 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5 text-amber-400" />
            <span>Contact & Support</span>
          </button>
          <span>•</span>
          <span className="text-zinc-500">100% Private Local Processing</span>
        </div>
      </footer>

      {/* Contact & Support Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div role="dialog" aria-modal="true" aria-labelledby="contact-support-title" className="relative w-full max-w-md p-6 bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl text-left">
            <button
              type="button"
              onClick={() => setShowContactModal(false)}
              aria-label="Close contact and support dialog"
              className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 id="contact-support-title" className="text-sm font-bold text-white">Contact & Support</h3>
                <p className="text-[11px] text-zinc-400">Send an inquiry or feature request to the ReelMaker team.</p>
              </div>
            </div>

            {contactSubmitted ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">Message Received!</h4>
                <p className="text-xs text-zinc-400">Thank you for reaching out. We will get back to you shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-3">
                {contactError && (
                  <div role="alert" className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                    {contactError}
                  </div>
                )}
                <div>
                  <label htmlFor="support-name" className="block text-[11px] font-semibold text-zinc-300 mb-1">Your Name</label>
                  <input
                    id="support-name"
                    name="name"
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="support-email" className="block text-[11px] font-semibold text-zinc-300 mb-1">Email Address</label>
                  <input
                    id="support-email"
                    name="email"
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="support-message" className="block text-[11px] font-semibold text-zinc-300 mb-1">Message</label>
                  <textarea
                    id="support-message"
                    name="message"
                    rows={3}
                    required
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="How can we help you?"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 transition-colors resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingContact}
                  className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingContact ? 'Sending…' : 'Send Message'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
};
