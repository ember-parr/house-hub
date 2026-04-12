import { Link } from 'react-router-dom'


export default function ListsHome() {
  const greeting = "To-Do | Routines"

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