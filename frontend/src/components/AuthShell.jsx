import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import BrandMark from './BrandMark'

export default function AuthShell({ eyebrow, title, description, children, footer }) {
  return (
    <div className="auth-shell">
      <aside className="auth-visual hidden lg:flex">
        <div className="auth-brand-lockup">
          <Link to="/" className="auth-brand" aria-label="Settl home">
            <span className="app-brand-mark auth-brand-mark">
              <BrandMark size={22} />
            </span>
            <span className="auth-brand-word">settl<span>.</span></span>
          </Link>
          <p className="auth-brand-tagline">Split expenses. Settle easily. Stay together.</p>
        </div>

        <div className="auth-visual-copy">
          <p className="auth-visual-eyebrow">Group finance, without the friction</p>
          <h2>Money stays clear.<br /><span>Friendships stay easy.</span></h2>
          <p>A calmer way to manage shared expenses. See the split, track who pays, know who gets back, and settle directly with your people.</p>
        </div>

        <div className="auth-hero-illustration">
          <img
            src="/auth-hero-illustration.webp"
            alt="Settl app preview showing a group expense snapshot, shared balances and simple payment directions"
            fetchPriority="high"
          />
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
          <Link to="/" className="auth-mobile-brand" aria-label="Settl home">
            <span className="app-brand-mark auth-brand-mark">
              <BrandMark size={20} />
            </span>
            <span className="auth-mobile-brand-copy">
              <span className="auth-brand-word">settl<span>.</span></span>
              <small>Shared expenses, made simple.</small>
            </span>
          </Link>
          <div className="auth-top-actions">
            <Link to="/" className="auth-home-link"><span className="material-symbols-outlined">arrow_back</span> Home</Link>
            <ThemeToggle className="auth-theme-toggle" />
          </div>
        </div>

        <div className="auth-content">
          <div className="auth-mobile-intro lg:hidden">
            <p className="auth-visual-eyebrow">Group finance, without the friction</p>
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
