import { Link } from 'react-router-dom'

const Hubs = [
  {
    to: '/todos',
    title: 'ToDos',
    subtitle: 'Home tasks & repairs',
    colorClass: 'card-teal',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none">
  <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="2"/>
  <path d="M7 12l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
    ),
  },
  {
    to: '/lists',
    title: 'Lists',
    subtitle: 'Shopping lists',
    colorClass: 'card-amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
  },
  {
    to: '/finances',
    title: 'Finances',
    subtitle: 'Mo Money Mo Problems',
    colorClass: 'card-blue',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />
      </svg>
    ),
  },
  {
    to: '/work',
    title: 'Work',
    subtitle: 'Desk Prison Stuff',
    colorClass: 'card-blue',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2" />
      </svg>
    ),
  },
]


export default function Home() {
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="page">
      <div className="home-greeting">
        <h1>{greeting}</h1>
        <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="section-label">Hubs</div>
      <div className="dashboard-grid">
        {Hubs.map((section) => (
          <Link key={section.to} to={section.to} className={`dashboard-card ${section.colorClass}`}>
            <div className="card-icon">{section.icon}</div>
            <div className="card-title">{section.title}</div>
            <div className="card-subtitle">{section.subtitle}</div>
          </Link>
        ))}
      </div>
      <div style={{ marginTop: '1.5rem' }}>
        <div className="section-label">Quick add</div>
        <Link to="/lists/shopping?add=consumable" className="quick-add-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16">
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          Add to shopping list
        </Link>
      </div>

    </div>
  )
}