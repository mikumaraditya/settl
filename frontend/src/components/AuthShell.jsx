import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import BrandMark from './BrandMark'
import AuthHeroIllustration from './AuthHeroIllustration'
import SignupHeroIllustration from './SignupHeroIllustration'

export default function AuthShell({ eyebrow, title, description, children, footer, compact = false, variant = 'default' }) {
  return (
    <div className={`auth-shell${compact ? ' auth-shell-compact' : ''}${variant === 'signup' ? ' auth-shell-signup' : ''}`}>
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
          {variant === 'signup' ? (
            <>
              <p className="auth-visual-eyebrow">MAKE ROOM FOR BETTER SHARED PLANS</p>
              <h2>Bring your people.<br /><span>Balance the plans.</span></h2>
              <p>Create your Settl space, bring your group together and keep every shared expense clear from the very first split.</p>
            </>
          ) : (
            <>
              <p className="auth-visual-eyebrow">Group finance, without the friction</p>
              <h2>Money stays clear.<br /><span>Friendships stay easy.</span></h2>
              <p>A calmer way to manage shared expenses. See the split, track who pays, know who gets back, and settle directly with your people.</p>
            </>
          )}
        </div>

        <div className="auth-hero-illustration">
          {variant === 'signup' ? <SignupHeroIllustration /> : <AuthHeroIllustration />}
        </div>

        {variant === 'signup' ? (
          <div className="auth-benefits signup-auth-benefits">
            <span><span className="material-symbols-outlined">groups</span> Bring every member together</span>
            <span><span className="material-symbols-outlined">receipt_long</span> Keep shared costs organised</span>
            <span><span className="material-symbols-outlined">account_balance_wallet</span> Settle simply with UPI</span>
          </div>
        ) : (
          <div className="auth-benefits">
            <span><span className="material-symbols-outlined">receipt_long</span> Clear expense splits</span>
            <span><span className="material-symbols-outlined">account_balance_wallet</span> Direct UPI handoff</span>
            <span><span className="material-symbols-outlined">history</span> Transparent payment history</span>
          </div>
        )}
        <p className="auth-visual-footnote">{variant === 'signup' ? 'Start together. Stay in sync.' : 'Split now. Settl later.'}</p>
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
