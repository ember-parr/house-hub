import { Link } from 'react-router-dom'

export default function Bills() {
  return (
    <div className="page">
      <div className="page-header">
        <Link to="/finances" className="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Finances
        </Link>
      </div>
      <h1 className="page-title">Monthly Bills</h1>
      <div className="empty-state">Coming soon</div>
    </div>
  )
}