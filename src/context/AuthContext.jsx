import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase'

const AuthContext = createContext(null)

const MEMBER_COLORS = ['teal', 'purple', 'amber', 'coral', 'blue', 'green']

function colorForUid(uid) {
  const index = uid.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return MEMBER_COLORS[index % MEMBER_COLORS.length]
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null)
    })
    return unsub
  }, [])

  const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider)
    const u = result.user
    // Save profile to Firestore — merge so we don't overwrite nickname
    await setDoc(doc(db, 'users', u.uid), {
      displayName: u.displayName,
      email:       u.email,
      photoURL:    u.photoURL,
      color:       colorForUid(u.uid),
      joinedAt:    serverTimestamp(),
    }, { merge: true })
  }

  const logOut = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, signInWithGoogle, logOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}