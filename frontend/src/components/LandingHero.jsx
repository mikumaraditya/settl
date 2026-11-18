import { useState } from 'react'
import { Link } from 'react-router-dom'

const friendNames = ['Amit', 'Sara', 'Kabir', 'Priya']

export default function LandingHero() {
  const [billAmount, setBillAmount] = useState(1200)
  const [numFriends, setNumFriends] = useState(3)
  const [splitType, setSplitType] = useState('equal')
  const equalShare = Math.round(billAmount / numFriends)

  return (
    <>
      <section className="home-hero relative pt-32 sm:pt-36 lg:pt-40 pb-16 lg:pb-24 px-5 sm:px-8 mx-auto w-full max-w-[1440px] grid grid-cols-1 lg:grid-cols-[minmax(0,1.04fr)_minmax(390px,.96fr)] items-center gap-12 lg:gap-16">
        <div className="home-hero-copy flex flex-col items-start text-left animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="home-hero-eyebrow inline-flex items-center gap-2 px-3.5 py-2 rounded-full border mb-7">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-[10px] font-extrabold uppercase tracking-[.16em]">Group expenses, made refreshingly simple</span>
          </div>
          <h1 className="home-hero-title text-4xl sm:text-5xl lg:text-[4.35rem] font-black leading-[1.02] tracking-[-.065em] mb-6">
            Every shared expense.<br />
            <span className="home-hero-gradient">Sorted together.</span>
          </h1>
          <p className="home-hero-description text-sm sm:text-base font-medium leading-relaxed mb-8 max-w-xl">
            Keep group spending clear, simplify who pays whom, and settle directly through UPI. Less time calculating. More time together.
          </p>
          <div className="home-hero-actions flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto">
            <Link to="/register" className="home-primary-cta px-6 py-3.5 rounded-xl text-white text-xs font-extrabold uppercase tracking-wider transition-all text-center">
              Start splitting free <span className="material-symbols-outlined align-middle text-base ml-1">arrow_forward</span>
            </Link>
            <a href="#how-it-works" className="home-secondary-cta px-6 py-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all text-center">See how it works</a>
          </div>
          <div className="home-proof-row flex flex-wrap items-center gap-x-6 gap-y-3 mt-10 pt-6 border-t w-full">
            <div className="home-proof-item flex items-center gap-2"><span className="material-symbols-outlined">verified</span><span>Free to use</span></div>
            <div className="home-proof-item flex items-center gap-2"><span className="material-symbols-outlined">account_balance_wallet</span><span>UPI stays in your app</span></div>
            <div className="home-proof-item flex items-center gap-2"><span className="material-symbols-outlined">call_split</span><span>Fewer repayments</span></div>
          </div>
        </div>

        <div className="home-demo-stage w-full max-w-[560px] lg:justify-self-end animate-in fade-in slide-in-from-bottom-12 duration-700">
          <div className="home-demo-orbit home-demo-orbit-one" />
          <div className="home-demo-orbit home-demo-orbit-two" />
          <div className="home-demo-float home-demo-float-top">
            <span className="material-symbols-outlined">groups</span>
            <span><strong>Your group</strong><small>Everyone in sync</small></span>
          </div>
          <div className="home-demo-float home-demo-float-bottom">
            <span className="home-demo-float-check material-symbols-outlined">check_circle</span>
            <span><strong>Balances simplified</strong><small>Fewer transfers to settle</small></span>
          </div>

          <div className="home-demo-card glass-card relative rounded-[28px] border p-5 sm:p-7 space-y-5 w-full select-none">
            <div className="flex items-start justify-between gap-3 border-b pb-5">
              <div>
                <div className="home-demo-kicker flex items-center gap-2 mb-2"><span className="home-demo-live-dot" />INTERACTIVE SPLIT CALCULATOR</div>
                <h2 className="home-demo-title text-xl sm:text-2xl font-black tracking-tight">Try a group bill</h2>
                <p className="home-demo-subtitle text-xs mt-1">Change the numbers. See the split update.</p>
              </div>
              <span className="home-demo-badge shrink-0 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider">Live demo</span>
            </div>

            <div className="home-demo-amount-panel rounded-2xl p-4 sm:p-5">
              <div className="flex justify-between items-center gap-3 mb-3">
                <label htmlFor="home-bill-amount" className="home-demo-label text-xs font-bold">Total bill</label>
                <output htmlFor="home-bill-amount" className="home-demo-amount text-2xl sm:text-3xl font-black tracking-tight tabular-nums">₹{billAmount.toLocaleString('en-IN')}</output>
              </div>
              <input id="home-bill-amount" aria-label="Bill amount" type="range" min="300" max="6000" step="300" value={billAmount} onChange={event => setBillAmount(Number(event.target.value))} className="home-demo-range w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-secondary" />
              <div className="home-demo-range-labels flex justify-between mt-2"><span>₹300</span><span>₹6,000</span></div>
            </div>

            <div className="home-demo-controls grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="home-demo-label block text-[10px] font-extrabold uppercase tracking-wider mb-2">Split between</span>
                <div className="flex gap-2">
                  {[2, 3, 4].map(count => (
                    <button key={count} type="button" onClick={() => setNumFriends(count)} aria-pressed={numFriends === count} className={numFriends === count ? 'home-demo-option is-active flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer' : 'home-demo-option flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer'}>{count}</button>
                  ))}
                </div>
              </div>
              <div>
                <span className="home-demo-label block text-[10px] font-extrabold uppercase tracking-wider mb-2">Split type</span>
                <div className="flex gap-2">
                  {['equal', 'unequal'].map(type => (
                    <button key={type} type="button" onClick={() => setSplitType(type)} aria-pressed={splitType === type} className={splitType === type ? 'home-demo-option is-active flex-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all uppercase tracking-wider cursor-pointer' : 'home-demo-option flex-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all uppercase tracking-wider cursor-pointer'}>{type}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="home-demo-result rounded-2xl border p-4 sm:p-5" aria-live="polite">
              <div className="flex justify-between items-center gap-3 mb-3">
                <span className="home-demo-kicker">YOUR SPLIT PREVIEW</span>
                <span className="home-demo-result-chip">Illustrative</span>
              </div>
              {splitType === 'equal' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 pb-3 border-b">
                    <span className="home-demo-result-label text-sm font-semibold">Each person pays</span>
                    <span className="home-demo-share text-2xl font-black tabular-nums">₹{equalShare.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="space-y-2">
                    {friendNames.slice(1, numFriends).map((name, index) => (
                      <div key={name} className="home-demo-transfer flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-2"><span className={index === 0 ? 'home-demo-avatar home-demo-avatar-0' : index === 1 ? 'home-demo-avatar home-demo-avatar-1' : 'home-demo-avatar home-demo-avatar-2'}>{name[0]}</span><span>{name}</span></span>
                        <span className="flex items-center gap-2"><span className="home-demo-transfer-arrow material-symbols-outlined">arrow_forward</span><span>Amit</span></span>
                        <strong className="home-demo-transfer-amount tabular-nums">₹{equalShare.toLocaleString('en-IN')}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex justify-between gap-3 text-[10px] font-extrabold uppercase tracking-wider pb-2 border-b"><span className="home-demo-result-label">Member</span><span className="home-demo-result-label">Assigned share</span></div>
                  <div className="home-demo-transfer flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2"><span className="home-demo-avatar home-demo-avatar-0">A</span>Amit (paid)</span><strong className="home-demo-transfer-amount">20% · ₹{Math.round(billAmount * 0.2).toLocaleString('en-IN')}</strong></div>
                  <div className="home-demo-transfer flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2"><span className="home-demo-avatar home-demo-avatar-1">K</span>Kabir</span><strong className="home-demo-transfer-amount">50% · ₹{Math.round(billAmount * 0.5).toLocaleString('en-IN')}</strong></div>
                  <div className="home-demo-transfer flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2"><span className="home-demo-avatar home-demo-avatar-2">S</span>Sara</span><strong className="home-demo-transfer-amount">30% · ₹{Math.round(billAmount * 0.3).toLocaleString('en-IN')}</strong></div>
                  {numFriends === 4 && <div className="home-demo-transfer flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2"><span className="home-demo-avatar home-demo-avatar-3">P</span>Priya</span><strong className="home-demo-result-label">Not assigned yet</strong></div>}
                  <p className="home-demo-note text-[10px] leading-relaxed pt-2 border-t">Settl can simplify the resulting group balances into fewer transfers.</p>
                </div>
              )}
            </div>
            <p className="home-demo-footnote text-[10px] text-center">A preview of how shared costs can be organised before anyone settles up.</p>
          </div>
        </div>
      </section>

      <section className="home-value-strip max-w-6xl mx-auto w-full px-5 sm:px-8 pb-16 lg:pb-20">
        <div className="home-value-grid grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="home-value-item flex items-center gap-3 p-4 rounded-2xl border"><span className="material-symbols-outlined">account_balance_wallet</span><div><strong>UPI, peer to peer</strong><span>Payments stay in your UPI app</span></div></div>
          <div className="home-value-item flex items-center gap-3 p-4 rounded-2xl border"><span className="material-symbols-outlined">call_split</span><div><strong>Simpler settlements</strong><span>Reduce the number of transfers</span></div></div>
          <div className="home-value-item flex items-center gap-3 p-4 rounded-2xl border"><span className="material-symbols-outlined">lock</span><div><strong>Your banking stays private</strong><span>Settl never asks for your UPI PIN</span></div></div>
        </div>
      </section>
    </>
  )
}
