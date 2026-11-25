import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import GroupDetail from './pages/GroupDetail'
import SettleUp from './pages/SettleUp'
import VerifyEmail from './pages/VerifyEmail'
import Profile from './pages/Profile'
import Landing from './pages/Landing'
import Groups from './pages/Groups'
import Activity from './pages/Activity'

import FinancialMentorWidget from './components/FinancialMentorWidget'

const AuthLoadingState = () => (
  <main className="app-page min-h-screen flex items-center justify-center p-6" role="status" aria-live="polite">
    <div className="app-card px-6 py-5 flex items-center gap-3">
      <span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span>
      <span className="text-sm font-semibold">Checking your session…</span>
    </div>
  </main>
)

const AuthErrorState = ({ onRetry }) => (
  <main className="app-page min-h-screen flex items-center justify-center p-6">
    <section className="app-card w-full max-w-md p-6 text-center" role="alert">
      <span className="material-symbols-outlined text-3xl app-muted" aria-hidden="true">wifi_off</span>
      <h1 className="text-lg font-bold mt-3">Could not verify your session</h1>
      <p className="text-sm app-muted mt-2">Check your internet connection and try again. Your account has not been signed out.</p>
      <button type="button" onClick={onRetry} className="app-button-primary mt-5">Try again</button>
    </section>
  </main>
)

const ProtectedRoute = ({ children }) => {
  const { user, isAuthLoading, authError, retrySession } = useAuth()

  if (isAuthLoading) return <AuthLoadingState />
  if (authError) return <AuthErrorState onRetry={retrySession} />

  return user ? (
    <>
      {children}
      <FinancialMentorWidget />
    </>
  ) : (
    <Navigate to="/login" replace />
  )
}

const RootRoute = () => {
  const { user, isAuthLoading, authError, refreshSession } = useAuth()

  if (isAuthLoading) return <AuthLoadingState />
  if (authError) return <AuthErrorState onRetry={refreshSession} />

  return user ? <Navigate to="/dashboard" replace /> : <Landing />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
      <Route path="/activity" element={<ProtectedRoute><Activity /></ProtectedRoute>} />
      <Route path="/group/:id" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
      <Route path="/settle/:id" element={<ProtectedRoute><SettleUp /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
