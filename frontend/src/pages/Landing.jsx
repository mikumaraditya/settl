import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const getInitialsBg = (name) => {
  const colors = [
    'bg-blue-500/80 border-blue-400/30',
    'bg-purple-500/80 border-purple-400/30',
    'bg-indigo-500/80 border-indigo-400/30',
    'bg-violet-500/80 border-violet-400/30',
    'bg-fuchsia-500/80 border-fuchsia-400/30',
    'bg-pink-500/80 border-pink-400/30',
    'bg-emerald-500/80 border-emerald-400/30',
    'bg-teal-500/80 border-teal-400/30',
    'bg-cyan-500/80 border-cyan-400/30',
    'bg-sky-500/80 border-sky-400/30'
  ];
  if (!name) return colors[0];
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return colors[sum % colors.length];
};

export default function Landing() {
  const navigate = useNavigate()
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  // Interactive Split Calculator State
  const [billAmount, setBillAmount] = useState(1200)
  const [numFriends, setNumFriends] = useState(3)
  const [splitType, setSplitType] = useState('equal') // 'equal', 'unequal'

  // FAQ Accordion State
  const [expandedFaq, setExpandedFaq] = useState(null)

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
      localStorage.setItem('theme', 'light')
      setIsDark(false)
    } else {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
      setIsDark(true)
    }
  }

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
      a: 'No, in-place expense editing is not supported. However, the person who paid for/logged the expense can delete it within 2 hours of creation and re-add it. After 2 hours, the expense entry is locked.'
    },
    {
      q: 'Is my payment data secure?',
      a: 'We do not request or store sensitive bank account passwords, UPI PINs, or card credentials. Session access is secured using standard JSON Web Tokens (JWT). When you initiate a settlement, the actual transfer is executed entirely inside your secure, bank-native UPI application, meaning Settl never handles your money directly.'
    }
  ];

  return (
    <div className="relative min-h-screen bg-background text-on-surface flex flex-col font-sans overflow-hidden selection:bg-secondary/35 selection:text-white w-full">
      {/* Decorative Blur Orbs */}
      <div className="absolute top-[10%] left-[-15%] w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bg-secondary/5 rounded-full blur-[130px] pointer-events-none -z-10 animate-pulse-glow" />
      <div className="absolute bottom-[30%] right-[-15%] w-[300px] sm:w-[450px] h-[300px] sm:h-[450px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none -z-10 animate-pulse-glow" />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#0b1326]/70 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-tr from-secondary to-blue-600 rounded-xl shadow-md">
            <span className="material-symbols-outlined text-white text-[18px] font-bold">account_balance_wallet</span>
          </div>
          <span className="text-xl font-black text-white tracking-tight flex items-center gap-0.5">
            Settl<span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-xs font-bold uppercase tracking-wider text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#scenarios" className="hover:text-white transition-colors">Use Cases</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleTheme}
            className="w-9 h-9 rounded-lg flex items-center justify-center border border-white/5 text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer flex-shrink-0"
            aria-label="Toggle dark mode"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <button 
            onClick={() => navigate('/login')} 
            className="text-xs font-extrabold uppercase tracking-wider text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Sign in
          </button>
          <button 
            onClick={() => navigate('/register')} 
            className="px-4 py-2.5 rounded-xl bg-secondary text-white text-xs font-extrabold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-lg shadow-secondary/20"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-36 pb-24 px-6 sm:px-8 max-w-6xl mx-auto w-full flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-16">
        <div className="flex flex-col items-start max-w-xl text-left animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">AI-Powered • UPI-Native</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.15] tracking-tight mb-6">
            Split costs.<br />
            Settle up.<br />
            <span className="text-secondary bg-clip-text">Stay friends.</span>
          </h1>

          <p className="text-sm sm:text-base text-on-surface-variant font-medium leading-relaxed mb-8 max-w-lg">
            Settl is the AI-powered expense-sharing app for trips, roommates, and everything in between. 
            Smart splitting, one-tap UPI settlements, and weekly insights that actually help.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
            <button 
              onClick={() => navigate('/register')} 
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-secondary to-blue-600 text-white text-xs font-extrabold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-lg shadow-secondary/20 text-center"
            >
              Start splitting free
            </button>
            <button 
              onClick={() => navigate('/login')} 
              className="px-6 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-extrabold uppercase tracking-wider active:scale-95 transition-all cursor-pointer text-center"
            >
              I already have an account
            </button>
          </div>

          {/* Stats Badges */}
          <div className="flex items-center gap-6 mt-12 border-t border-white/5 pt-6 w-full">
            <div className="flex flex-col">
              <span className="text-white font-black text-lg">Keep every rupee</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">No fees on any settlement</span>
            </div>
            <div className="h-8 w-px bg-white/5" />
            <div className="flex flex-col">
              <span className="text-white font-black text-lg">Minimum payments, always</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Fewest transactions to settle any group</span>
            </div>
            <div className="h-8 w-px bg-white/5" />
            <div className="flex flex-col">
              <span className="text-white font-black text-lg">AI</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">insights</span>
            </div>
          </div>
        </div>

        {/* Supporting Visual (Interactive Split Calculator) */}
        <div className="w-full lg:w-auto flex justify-center max-w-full animate-in fade-in slide-in-from-bottom-12 duration-700">
          <div className="glass-card p-6 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] shadow-[0_20px_50px_rgba(0,0,0,0.3)] space-y-5 max-w-[380px] w-full select-none overflow-hidden hover:border-white/15 transition-all">
            <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interactive Split Demo</span>
              </div>
              <span className="text-[9px] bg-cyan-400/10 text-cyan-400 border border-cyan-400/25 px-2.5 py-0.5 rounded-full font-bold uppercase">Try It Live</span>
            </div>

            {/* Inputs */}
            <div className="space-y-4">
              {/* Bill Amount Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-on-surface-variant">Bill Amount</span>
                  <span className="text-white font-black">₹{billAmount.toLocaleString('en-IN')}</span>
                </div>
                <input 
                  type="range" 
                  min="300" 
                  max="6000" 
                  step="300" 
                  value={billAmount} 
                  onChange={(e) => setBillAmount(Number(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-secondary"
                />
              </div>

              {/* Friends Selector */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Number of Friends</span>
                <div className="flex gap-2">
                  {[2, 3, 4].map(n => (
                    <button 
                      key={n}
                      onClick={() => setNumFriends(n)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        numFriends === n 
                          ? 'bg-secondary text-white border-secondary/50 shadow-md shadow-secondary/15 scale-[1.03]' 
                          : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Split Type Selector */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Split Strategy</span>
                <div className="flex gap-2">
                  {['equal', 'unequal'].map(t => (
                    <button 
                      key={t}
                      onClick={() => setSplitType(t)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all uppercase tracking-wider cursor-pointer ${
                        splitType === t 
                          ? 'bg-secondary text-white border-secondary/50 shadow-md shadow-secondary/15 scale-[1.03]' 
                          : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Results Visualizer */}
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3 relative overflow-hidden">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Calculations & Simplified Transfers</span>

              <div className="space-y-2.5 z-10 relative">
                {splitType === 'equal' ? (
                  (() => {
                    const share = Math.round(billAmount / numFriends);
                    const names = ['Amit', 'Sara', 'Kabir', 'Priya'].slice(0, numFriends);
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2">
                          <span className="text-slate-400 font-medium">Each owes:</span>
                          <span className="text-emerald-400 font-black">₹{share}</span>
                        </div>
                        <div className="space-y-2 pt-1">
                          {names.slice(1).map((name, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] text-slate-300">
                              <span className="flex items-center gap-1.5">
                                <span className={`w-4 h-4 rounded-full ${getInitialsBg(name)} text-white text-[8px] flex items-center justify-center font-bold`}>{name[0]}</span>
                                {name}
                              </span>
                              <span className="material-symbols-outlined text-[12px] text-slate-500">arrow_forward</span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] flex items-center justify-center font-bold">A</span>
                                Amit (Paid)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  (() => {
                    const kabirOwes = Math.round(billAmount * 0.5);
                    const saraOwes = Math.round(billAmount * 0.3);
                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] text-slate-500 font-bold border-b border-white/5 pb-1.5">
                          <span>MEMBERS</span>
                          <span>SPENT SHARE</span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] flex items-center justify-center font-bold">A</span>
                              Amit (Paid)
                            </span>
                            <span className="text-slate-400">Spent 20% (₹{Math.round(billAmount * 0.2)})</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-400 text-[8px] flex items-center justify-center font-bold">K</span>
                              Kabir
                            </span>
                            <span className="text-rose-400 font-bold">Owes 50% (₹{kabirOwes})</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[8px] flex items-center justify-center font-bold">S</span>
                              Sara
                            </span>
                            <span className="text-rose-400 font-bold">Owes 30% (₹{saraOwes})</span>
                          </div>
                          {numFriends === 4 && (
                            <div className="flex justify-between text-[11px] text-slate-300">
                              <span className="flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8px] flex items-center justify-center font-bold">P</span>
                                Priya
                              </span>
                              <span className="text-slate-400">Spent 0% (₹0)</span>
                            </div>
                          )}
                        </div>
                        <div className="border-t border-white/5 pt-2 text-[10px] text-on-surface-variant leading-normal flex items-start gap-1">
                          <span className="material-symbols-outlined text-[14px] text-secondary flex-shrink-0">insights</span>
                          <span>Debt simplification resolves this so Kabir pays Amit ₹{kabirOwes} and Sara pays Amit ₹{saraOwes}.</span>
                        </div>
                      </div>
                    )
                  })()
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 border-t border-white/5 bg-black/[0.05]">
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
      <section id="how-it-works" className="py-24 border-t border-white/5">
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
      <section id="scenarios" className="py-24 border-t border-white/5 bg-black/[0.03]">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 w-full">
          <div className="flex flex-col items-start text-left mb-16">
            <span className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-3">/ 03 USE CASES</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
              Built for real groups. <span className="text-slate-500 font-medium">Grounding everyday life.</span>
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
      <section id="faq" className="py-24 border-t border-white/5">
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
                    className="w-full px-6 py-4.5 flex justify-between items-center text-left text-white font-bold text-sm sm:text-base hover:bg-white/[0.02] transition-colors cursor-pointer select-none"
                  >
                    <span>{faq.q}</span>
                    <span className={`material-symbols-outlined text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-secondary' : ''}`}>
                      keyboard_arrow_down
                    </span>
                  </button>
                  <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[200px] border-t border-white/5' : 'max-h-0'}`}>
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
      <section className="py-24 border-t border-white/5 bg-surface-container-low/30 relative overflow-hidden">
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
      <footer className="py-12 border-t border-white/5 bg-surface-container-low mt-auto">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 w-full flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center justify-center w-6 h-6 bg-gradient-to-tr from-secondary to-blue-600 rounded-lg">
              <span className="material-symbols-outlined text-white text-[14px] font-bold">account_balance_wallet</span>
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
