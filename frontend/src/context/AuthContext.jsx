/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import axios from '../api/axios'

const AuthContext = createContext()

const withoutToken = (userData) => {
  if (!userData) return null
  const safeUser = { ...userData }
  delete safeUser.token
  return safeUser
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  const refreshSession = useCallback(async () => {
    setIsAuthLoading(true)
    setAuthError('')

    try {
      const { data } = await axios.get('/auth/me')
      const safeUser = withoutToken(data)
      setUser(safeUser)
      localStorage.setItem('settl_user', JSON.stringify(safeUser))
      return safeUser
    } catch (error) {
      if (error.response?.status === 401) {
        setUser(null)
        localStorage.removeItem('settl_user')
        return null
      }

      setAuthError('We could not verify your session. Check your connection and try again.')
      return null
    } finally {
      setIsAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshSession()
  }, [refreshSession])

  const login = useCallback((userData) => {
    const safeUser = withoutToken(userData)
    if (safeUser) {
      localStorage.setItem('settl_user', JSON.stringify(safeUser))
      setUser(safeUser)
    } else {
      localStorage.removeItem('settl_user')
      setUser(null)
    }
    setAuthError('')
    setIsAuthLoading(false)
  }, [])

  const logout = useCallback(async () => {
    try {
      await axios.post('/auth/logout')
    } catch (error) {
      console.error('Failed to logout on server:', error)
    }

    localStorage.removeItem('settl_user')
    sessionStorage.removeItem('settl_tips')
    sessionStorage.removeItem('settl_tip_index')
    setUser(null)
    setAuthError('')
    setIsAuthLoading(false)
  }, [])

  const markEmailVerified = useCallback(() => {
    setUser(current => {
      if (!current) return current
      const updated = { ...current, isEmailVerified: true }
      localStorage.setItem('settl_user', JSON.stringify(updated))
      return updated
    })
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      isAuthLoading,
      authError,
      refreshSession,
      login,
      logout,
      markEmailVerified,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
