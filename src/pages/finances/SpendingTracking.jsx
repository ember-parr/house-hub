import { Link } from 'react-router-dom'


export default function ListsHome() {
  const greeting = "Finances | Spending Tracker"

  return (
    <div className="page">
      <div className="home-greeting">
        <h1>{greeting}</h1>
        <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="section-label">Coming Soon...</div>
      
    </div>
  )
}