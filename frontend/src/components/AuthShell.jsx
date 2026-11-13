import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

export default function AuthShell({ eyebrow, title, description, children, footer }) {
  return (
    <div className="auth-shell">
      <aside className="auth-visual hidden lg:flex">
        <Link to="/" className="auth-brand" aria-label="Settl home">
          <span className="app-brand-mark auth-brand-mark">
            <span className="material-symbols-outlined">account_balance_wallet</span>
          </span>
          <span className="auth-brand-word">settl<span>.</span></span>
        </Link>

        <div className="auth-visual-copy">
          <p className="auth-visual-eyebrow">Shared money, made simple</p>
          <h2>Everyone on the same page.<br /><span>Every rupee accounted for.</span></h2>
          <p>Keep group expenses clear, understand who owes whom, and settle directly with the people you know.</p>
        </div>

        <div className="auth-preview-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="auth-preview-kicker">Example group</p>
              <p className="auth-preview-title">Goa Trip</p>
            </div>
            <span className="auth-preview-status"><span /> In balance</span>
          </div>
          <div className="auth-preview-rule" />
          <div className="auth-preview-row">
            <span className="auth-avatar auth-avatar-blue">A</span>
            <span className="flex-1 min-w-0"><strong>Aditya</strong><small>Paid for dinner</small></span>
            <b>₹2,400</b>
          </div>
          <div className="auth-preview-row">
            <span className="auth-avatar auth-avatar-violet">R</span>
            <span className="flex-1 min-w-0"><strong>Rahul</strong><small>Share of expenses</small></span>
            <b className="auth-preview-debit">Owes ₹800</b>
          </div>
          <div className="auth-preview-row">
            <span className="auth-avatar auth-avatar-green">S</span>
            <span className="flex-1 min-w-0"><strong>Sara</strong><small>Share of expenses</small></span>
            <b className="auth-preview-credit">Owes ₹400</b>
          </div>
          <div className="auth-preview-note">
            <span className="material-symbols-outlined">auto_awesome</span>
            Settl simplifies group balances into fewer payments.
          </div>
        </div>

        <div className="auth-benefits">
          <span><span className="material-symbols-outlined">receipt_long</span> Clear expense splits</span>
          <span><span className="material-symbols-outlined">account_balance_wallet</span> Direct UPI handoff</span>
          <span><span className="material-symbols-outlined">history</span> Transparent payment history</span>
        </div>
        <p className="auth-visual-footnote">Split now. Settl later.</p>
      </aside>

      <main className="auth-main">
        <div className="auth-topbar">
          <Link to="/" className="auth-mobile-brand lg:hidden" aria-label="Settl home">
            <span className="app-brand-mark auth-brand-mark"><span className="material-symbols-outlined">account_balance_wallet</span></span>
            <span className="auth-brand-word">settl<span>.</span></span>
          </Link>
          <div className="auth-top-actions">
            <Link to="/" className="auth-home-link"><span className="material-symbols-outlined">arrow_back</span> Home</Link>
            <ThemeToggle className="auth-theme-toggle" />
          </div>
        </div>

        <div className="auth-content">
          <div className="auth-mobile-intro lg:hidden">
            <p className="auth-visual-eyebrow">Shared money, made simple</p>
            <p>Everything your group spends, clearly organised.</p>
          </div>
          <div className="auth-heading">
            <p className="auth-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <section className="auth-card">
            <div className="auth-card-accent" />
            {children}
          </section>
          {footer && <div className="auth-footer">{footer}</div>}
          <p className="auth-legal-note">By continuing, you agree to use Settl responsibly and keep group payment details accurate.</p>
        </div>
      </main>
    </div>
  )
}
