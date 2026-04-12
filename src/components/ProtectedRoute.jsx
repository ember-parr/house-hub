import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user } = useAuth()

  if (user === undefined) {
    // Still checking auth state — show nothing to avoid flash
    return <div className="loading-screen">Loading...</div>
  }

  if (user === null) {
    return <Navigate to="/login" replace />
  }

  return children
}