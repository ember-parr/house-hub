import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'

/**
 * Returns the current user's role from their Firestore profile.
 * Stays in sync in real-time so role changes (e.g. admin grants access)
 * take effect without a page reload.
 *
 * userType values: 'admin' | 'contributor' | 'new' | null
 */
export function useUserRole() {
  const { user } = useAuth()
  // undefined = still loading; null = doc missing or no userType field
  const [userType, setUserType] = useState(undefined)

  useEffect(() => {
    if (!user) { setUserType(null); return }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setUserType(snap.exists() ? (snap.data().userType ?? null) : null)
    })
    return unsub
  }, [user])

  const loading        = userType === undefined
  const isAdmin        = userType === 'admin'
  const isContributor  = userType === 'contributor'
  const isBlocked      = !loading && (userType === 'new' || userType === null)

  return { userType, loading, isAdmin, isContributor, isBlocked }
}
