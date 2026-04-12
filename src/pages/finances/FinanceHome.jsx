import { Link } from 'react-router-dom'

const sections = [
  {
    to: '/finances/amex',
    title: 'AMEX Expenses',
    subtitle: 'Track shared card transactions',
    colorClass: 'card-teal',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    to: '/finances/loan',
    title: 'Loan Tracker',
    subtitle: 'Log payments & balance',
    colorClass: 'card-purple',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />
      </svg>
    ),
  },
  {
    to: '/finances/bills',
    title: 'Monthly Bills',
    subtitle: 'Recurring bills & payment status',
    colorClass: 'card-amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    to: '/finances/spending',
    title: 'Spending Tracker',
    subtitle: 'Import CSV & categorize',
    colorClass: 'card-blue',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
]

export default function Finances() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Finances</h1>
      </div>

      <div className="dashboard-grid">
        {sections.map((section) => (
          <Link key={section.to} to={section.to} className={`dashboard-card ${section.colorClass}`}>
            <div className="card-icon">{section.icon}</div>
            <div className="card-title">{section.title}</div>
            <div className="card-subtitle">{section.subtitle}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}