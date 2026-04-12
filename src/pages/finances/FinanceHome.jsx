import { Link } from 'react-router-dom'


export default function ListsHome() {
  const greeting = "Finances"

  return (
    <div className="page">
      <div className="home-greeting">
        <h1>{greeting}</h1>
        <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="card-grid">
        <Link to="/finances/amex" className="nav-card">
          <h2>Amex Tracking</h2>
        </Link>
        <Link to="/finances/loan" className="nav-card">
          <h2>Loan Tracking</h2>
        </Link>
        <Link to="/finances/monthly" className="nav-card">
          <h2>Monthly Bills</h2>
        </Link>
        <Link to="/finances/spending" className="nav-card">
          <h2>Spending Tracking</h2>
        </Link>
      </div>

    </div>
  )
}