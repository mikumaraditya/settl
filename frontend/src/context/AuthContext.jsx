/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem('settl_user')) || null
  )

  const login = (userData) => {
    localStorage.setItem('settl_user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('settl_user')
    sessionStorage.removeItem('settl_tips')
    sessionStorage.removeItem('settl_tip_index')
    setUser(null)
  }

  // Called after email verification to update the stored user
  const markEmailVerified = () => {
    if (!user) return
    const updated = { ...user, isEmailVerified: true }
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