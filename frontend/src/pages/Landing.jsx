import { useState } from 'react'
import BrandMark from '../components/BrandMark'
import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { useNavigate } from 'react-router-dom'
import LandingHero from '../components/LandingHero'

export default function Landing() {
  const navigate = useNavigate()
  // Homepage interaction state
  const [expandedFaq, setExpandedFaq] = useState(null)

  const features = [
    {
      icon: 'groups',
      title: 'Groups that just work',
      description: 'Trips, roommates, family, teams. Add people by email, split anything instantly.'
    },
    {
      icon: 'shuffle',
      title: 'Smart debt simplification',
      description: 'Collapses group debts into the mathematically minimal number of payments. Fewer transfers, zero math.',
      highlight: true
    },
    {
      icon: 'qr_code_2',
      title: 'Direct UPI Settlements',
      description: 'Generate standard QR codes and UPI links pre-filled with the exact amount. Zero fees, no middlemen.',
      highlight: true
    },
    {
      icon: 'auto_awesome',
      title: 'Gemini-powered insights',
      description: 'See where your money goes and get personalized recommendations weekly.'
    },
    {
      icon: 'bolt',
      title: 'Real-time balances',
      description: 'Every expense recomputes balances instantly across every device.'
    },
    {
      icon: 'shield',
      title: 'Private by default',
      description: 'Your data stays yours. No ads. No selling. JWT-secured sessions.'
    }
  ];

  const steps = [
    {
      number: '01',
      title: 'Create a group',
      description: 'Add friends by email. We invite them automatically.'
    },
    {
      number: '02',
      title: 'Log an expense',
      description: 'Equal, exact or percentage split. Any category.'
    },
    {
      number: '03',
      title: 'Settle via UPI',
      description: 'One tap to open your UPI app with the amount pre-filled.'
    }
  ];

  const scenarios = [
    {
      icon: 'home',
      title: 'Roommates & Rent',
      desc: 'Split monthly rent, high-speed WiFi, electricity bills, and shared cleaning supplies. Clear balances at the end of the month without awkward spreadsheets.'
    },
    {
      icon: 'flight_takeoff',
      title: 'Trips & Group Travel',
      desc: 'Keep track of hotel reservations, taxi bookings, dining bills, and site admissions. Settl simplifies balances into a few clean transfers.'
    },
    {
      icon: 'favorite',
      title: 'Couples & Co-living',
      desc: 'Share household expenses, grocery runs, subscriptions, and date nights fairly. Keep balances in check while maintaining separate bank accounts.'
    }
  ];

  const faqs = [
    {
      q: 'Is Settl free to use?',
      a: 'Yes. Settl is free to use because settlements occur peer-to-peer directly between your bank accounts. There are no subscription fees or platform-level transaction fees.'
    },
    {
      q: 'How does one-tap UPI settlement work?',
      a: 'Settl generates standard UPI deep links and QR codes pre-filled with the exact payee details and transaction amount. Tapping "Settle" opens GPay, PhonePe, Paytm, or BHIM directly to complete the transfer.'
    },
    {
      q: 'Do all group members need to download the app?',
      a: 'Yes. Anyone you want to add to a group must have signed up for a Settl account first. Once they are registered and added to your group, they can be included in all expenses and settlements, even if they do not check the app regularly.'
    },
    {
      q: 'Can I settle a debt partially?',
      a: 'Yes. You can settle any amount up to your total outstanding net debt to another member. The system will record the payment and update the remaining balance accordingly.'
    },
    {
      q: 'Can I edit an expense after adding it?',
      a: 'Expense changes need to respect the payment history. When a change could affect a confirmed payment, Settl keeps the original record auditable and may require a separate correction instead of silently rewriting the transaction.'
    },
    {
      q: 'Is my payment data secure?',
      a: 'We do not request or store sensitive bank account passwords, UPI PINs, or card credentials. Session access is secured using standard JSON Web Tokens (JWT). When you initiate a settlement, the actual transfer is executed entirely inside your secure, bank-native UPI application, meaning Settl never handles your money directly.'
    }
  ];

  return (
    <div className="public-page app-page relative min-h-screen flex flex-col font-sans overflow-hidden w-full">
      {/* Decorative Blur Orbs */}
      <div className="absolute top-[10%] left-[-15%] w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bg-secondary/5 rounded-full blur-[130px] pointer-events-none -z-10 animate-pulse-glow" />
      <div className="absolute bottom-[30%] right-[-15%] w-[300px] sm:w-[450px] h-[300px] sm:h-[450px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none -z-10 animate-pulse-glow" />

      {/* Navigation */}
      <nav className="public-nav home-nav fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 py-3.5 flex items-center justify-between" aria-label="Primary navigation">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Settl home">
          <span className="app-brand-mark w-9 h-9 rounded-xl flex items-center justify-center">
            <BrandMark size={19} />
          </span>
          <span className="text-xl font-black tracking-tight flex items-center gap-0.5 text-[var(--on-surface)]">
            Settl<span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          </span>
        </Link>
        <div className="home-nav-links hidden lg:flex items-center gap-7 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#scenarios" className="hover:text-white transition-colors">Use cases</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </div>
        <div className="flex items-center gap-2.5 sm:gap-4">
          <ThemeToggle className="public-theme-toggle" />
          <button
            onClick={() => navigate('/login')}
            className="home-nav-signin hidden sm:inline-flex text-xs font-extrabold uppercase tracking-wider text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Sign in
          </button>
          <Link
            to="/register"
            className="home-nav-cta px-4 py-2.5 rounded-xl bg-secondary text-white text-xs font-extrabold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-secondary/20"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <LandingHero />

      {/* Features Section */}
      <section id="features" className="home-section home-features-section py-24 border-t border-white/5 bg-black/[0.05]">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 w-full">
          <div className="flex flex-col items-start text-left mb-16">
            <span className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-3">/ 01 FEATURES</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
              Everything you need. <span className="text-slate-500 font-medium">Nothing you don't.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <div 
                key={idx} 
                className={`glass-card p-6 rounded-3xl border transition-all duration-300 flex flex-col items-start text-left group relative overflow-hidden ${
                  feature.highlight 
                    ? 'border-secondary/20 bg-gradient-to-b from-secondary/[0.06] to-white/[0.01] hover:border-secondary/35 shadow-lg shadow-secondary/5 hover:scale-[1.02]' 
                    : 'border-white/5 bg-gradient-to-b from-white/[0.03] to-white/[0.01] hover:border-white/10 hover:scale-[1.02]'
                }`}
              >
                {feature.highlight && (
                  <span className="absolute top-4 right-4 text-[8px] bg-secondary/15 text-secondary border border-secondary/20 px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest">
                    Core
                  </span>
                )}
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform ${
                  feature.highlight 
                    ? 'bg-secondary/20 text-secondary border border-secondary/30' 
                    : 'bg-white/5 text-slate-400 border border-white/5'
                }`}>
                  <span className="material-symbols-outlined text-[20px]">{feature.icon}</span>
                </div>
                <h3 className="font-bold text-white text-base mb-2">{feature.title}</h3>
                <p className="text-xs text-on-surface-variant font-medium leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="home-section home-steps-section py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 w-full relative">
          <div className="flex flex-col items-start text-left mb-16">
            <span className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-3">/ 02 HOW IT WORKS</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
              Three steps. <span className="text-slate-500 font-medium">Done.</span>
            </h2>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12 w-full">
            {/* Connecting Line SVG (Only visible on MD and up) */}
            <div className="hidden md:block absolute top-[45px] left-[15%] right-[15%] h-8 pointer-events-none z-0">
              <svg className="w-full h-full overflow-visible" fill="none" stroke="rgba(37,99,235,0.15)" strokeWidth="2.5" strokeDasharray="6 6">
                <path d="M 0 16 C 150 -8, 300 -8, 500 16" />
              </svg>
            </div>

            {steps.map((step, idx) => (
              <div 
                key={idx} 
                className="glass-card p-6 rounded-3xl border border-white/5 bg-gradient-to-b from-white/[0.03] to-white/[0.01] hover:border-white/10 transition-all duration-300 flex flex-col items-start text-left relative overflow-hidden group z-10"
              >
                <div className="w-8 h-8 rounded-full bg-secondary/10 border border-secondary/20 flex items-center justify-center text-xs font-black text-secondary mb-4">
                  {step.number}
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{step.title}</h3>
                <p className="text-xs text-on-surface-variant font-medium leading-relaxed">{step.description}</p>
                {/* Decorative background number */}
                <div className="absolute right-0 bottom-0 opacity-[0.015] text-[120px] font-black text-white select-none leading-none translate-y-6 translate-x-3 pointer-events-none group-hover:scale-105 transition-transform duration-500">
                  {step.number}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Built for Real Groups Scenarios */}
      <section id="scenarios" className="home-section home-scenarios-section py-24 border-t border-white/5 bg-black/[0.03]">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 w-full">
          <div className="flex flex-col items-start text-left mb-16">
            <span className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-3">/ 03 USE CASES</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
              Built for real groups. <span className="text-slate-500 font-medium">Made for everyday life.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {scenarios.map((sc, idx) => (
              <div 
                key={idx} 
                className="glass-card p-6 sm:p-7 rounded-3xl border border-white/5 bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:border-white/10 transition-all flex flex-col justify-between gap-4 group"
              >
                <div>
                  <div className="w-10 h-10 rounded-2xl bg-secondary/10 text-secondary border border-secondary/20 flex items-center justify-center mb-5 group-hover:scale-115 transition-all">
                    <span className="material-symbols-outlined text-[20px]">{sc.icon}</span>
                  </div>
                  <h3 className="font-extrabold text-white text-base mb-2">{sc.title}</h3>
                  <p className="text-xs text-on-surface-variant font-medium leading-relaxed">{sc.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="home-section home-faq-section py-24 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 w-full">
          <div className="flex flex-col items-center text-center mb-16">
            <span className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-3">/ 04 FAQ</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isExpanded = expandedFaq === idx
              return (
                <div 
                  key={idx} 
                  className="glass-card rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.02] to-white/[0.005] overflow-hidden transition-all duration-300"
                >
                  <button 
                    onClick={() => setExpandedFaq(isExpanded ? null : idx)}
                    className="home-faq-trigger w-full px-6 py-4.5 flex justify-between items-center text-left text-white font-bold text-sm sm:text-base hover:bg-white/[0.02] transition-colors cursor-pointer select-none"
                    aria-expanded={isExpanded}
                    aria-controls={`home-faq-answer-${idx}`}
                  >
                    <span>{faq.q}</span>
                    <span className={`material-symbols-outlined text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-secondary' : ''}`}>
                      keyboard_arrow_down
                    </span>
                  </button>
                  <div id={`home-faq-answer-${idx}`} className={`home-faq-answer transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[500px] border-t border-white/5' : 'max-h-0'}`}>
                    <p className="p-6 text-xs sm:text-sm text-on-surface-variant font-medium leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Closing CTA Section */}
      <section className="home-cta-section py-24 border-t border-white/5 bg-surface-container-low/30 relative overflow-hidden">
        {/* Glow Sphere */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bg-secondary/5 rounded-full blur-[120px] pointer-events-none -z-10" />
        
        <div className="max-w-4xl mx-auto px-6 text-center flex flex-col items-center gap-8 relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight">
            Less calculation.<br />
            <span className="text-secondary bg-clip-text">More celebration.</span>
          </h2>
          <p className="text-xs sm:text-sm text-on-surface-variant font-medium max-w-md leading-relaxed">
            An elegant, zero-fee way to track group expenses and settle up directly via UPI. Keep tabs without the awkward conversation.
          </p>
          <button 
            onClick={() => navigate('/register')} 
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-secondary to-blue-600 text-white text-xs font-extrabold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-lg shadow-secondary/25"
          >
            Start splitting free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer py-12 border-t border-white/5 bg-surface-container-low mt-auto">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 w-full flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center justify-center w-7 h-7 bg-gradient-to-tr from-secondary to-blue-600 rounded-lg text-white">
              <BrandMark size={15} />
            </div>
            <span className="text-base font-black text-white tracking-tight flex items-center gap-0.5">
              Settl<span className="w-1 h-1 rounded-full bg-secondary" />
            </span>
          </div>

          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest text-center sm:text-right leading-relaxed">
            &copy; {new Date().getFullYear()} Settl. All rights reserved.<br />
            <span className="text-[8px] text-slate-600">Powered by Gemini AI Insights</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
