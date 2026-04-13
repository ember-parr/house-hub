import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'

const navItems = [
  {
    to: '/',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    to: '/ToDos',
    label: 'To-Do\'s',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="2" />
        <path d="M7 12l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    ),
    children: [
      { to: '/ToDos/Household', label: 'Household' },
      { to: '/ToDos/Personal', label: 'Personal' },
      { to: '/ToDos/Routines', label: 'Routines' },
    ],
  },
  {
    to: '/Lists',
    label: 'Lists',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
    children: [
      { to: '/Lists/Inventory', label: 'Inventory' },
      { to: '/Lists/Shopping', label: 'Shopping Lists' },
      { to: '/Lists/Wishlist', label: 'Wish Lists' },
    ],
  },
  {
    to: '/finances',
    label: 'Finances',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />
      </svg>
    ),
    children: [
      { to: '/Finances/Amex', label: 'Amex Tracker' },
      { to: '/Finances/Loan', label: 'Loan Tracker' },
      { to: '/Finances/Bills', label: 'Monthly Bills' },
      { to: '/Finances/Spending', label: 'Spending Tracker' },
    ],
  },
  {
    to: '/work',
    label: 'Work',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2" />
      </svg>
    )
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
]

function NavAvatar({ user }) {
  const [imgError, setImgError] = useState(false)

  if (user?.photoURL && !imgError) {
    return (
      <div>
      <img
        src={user.photoURL}
        alt={user.displayName}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="nav-avatar"
      />
      <div className="member-name">{user.displayNamed}</div>
      </div>
    )
  }

  const initial = user?.displayName?.[0]?.toUpperCase() || '?'
  return (
    <div className="nav-avatar nav-avatar-fallback">{initial}
    <div className="member-name">{user.displayNamed}</div></div>
  )
}

export default function Navbar() {
  const { user, logOut } = useAuth()

  const [openDropdown, setOpenDropdown] = useState(null)
  const [workProjects, setWorkProjects] = useState([])

  const toggleDropdown = (label) => setOpenDropdown(label)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'workProjects'), orderBy('createdAt'))
    return onSnapshot(q, (snap) => {
      setWorkProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  const items = navItems.map((item) =>
    item.label === 'Work'
      ? { ...item, children: workProjects.length > 0 ? workProjects.map((p) => ({ to: `/work/${p.id}`, label: p.name })) : undefined }
      : item
  )





  return (
    <>
      {/* Desktop top bar */}
      <header className="desktop-nav">
        <div className="desktop-nav-logo">Mountain<span>Flax</span></div>
        <nav className="desktop-nav-links" >
          {items.map((item) =>
            item.children ? (
              <div key={item.label} className="desktop-nav-dropdown"
                onMouseEnter={() => toggleDropdown(item.label)}
                onMouseLeave={() => toggleDropdown(null)}
                >

                <NavLink key={item.to} to={item.to}
                  className={`desktop-nav-link ${item.children.some(c => location.pathname.startsWith(c.to.toLowerCase())) ? 'active' : ''}`}

                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
                {openDropdown === item.label && (
                  <div className="dropdown-menu" onMouseEnter={() => toggleDropdown(item.label)}>
                    {item.children.map(child => (
                      <NavLink key={child.to} to={child.to} className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                        {child.label}
                      </NavLink>
                    ))}
                    {/* {openDropdown && <DropdownMenu />} */}
                  </div>
                )}
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `desktop-nav-link ${isActive ? 'active' : ''}`}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            )
          )}
        </nav>
        {user && (
          <div className="nav-user">
            {/* <img src={user.photoURL} alt={user.displayName} className="nav-avatar" /> */}
            <NavAvatar user={user} />
            <div className="member-name">{user.displayNamed}</div>
            <button className="nav-signout" onClick={logOut}>Sign out</button>
          </div>
        )}
      </header>

      {/* Mobile bottom bar — keep exactly the same as before */}
      <nav className="mobile-nav">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `mobile-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <span className="nav-icon">{item.icon}</span>
            <span class="mobile-nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

    </>
  )
}