import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'

export default function WorkHome() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'workProjects'), orderBy('createdAt'))
    return onSnapshot(q, (snap) => {
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Work</h1>
      </div>

      {projects.length > 0 && (
        <div className="card-grid" style={{ marginBottom: '1.5rem' }}>
          {projects.map((p) => (
            <Link key={p.id} to={`/work/${p.id}`} className="nav-card">
              <h2>{p.name}</h2>
            </Link>
          ))}
        </div>
      )}

      {projects.length === 0 && (
        <div className="empty-state">
          No projects yet — add them from your Profile page.
        </div>
      )}
    </div>
  )
}
