/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'
import axios from '../api/axios'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('settl_user')
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser)
        if (parsed && parsed.token) {
          delete parsed.token
          localStorage.setItem('settl_user', JSON.stringify(parsed))
        }
        return parsed
      } catch (e) {
        console.error('Failed to parse stored user:', e)
        localStorage.removeItem('settl_user')
      }
    }
    return null
  })

  const login = (userData) => {
    if (userData) {
      const userWithoutToken = { ...userData }
      delete userWithoutToken.token
      localStorage.setItem('settl_user', JSON.stringify(userWithoutToken))
      setUser(userWithoutToken)
    } else {
      setUser(null)
    }
  }

  const logout = async () => {
    try {
      await axios.post('/auth/logout')
    } catch (error) {
      console.error('Failed to logout on server:', error)
    }
    localStorage.removeItem('settl_user')
    sessionStorage.removeItem('settl_tips')
    sessionStorage.removeItem('settl_tip_index')
    setUser(null)
  }

  // Called after email verification to update the stored user
  const markEmailVerified = () => {
    if (!user) return
    const updated = { ...user, isEmailVerified: true }
    delete updated.token
    localStorage.setItem('settl_user', JSON.stringify(updated))
    setUser(updated)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, markEmailVerified }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
