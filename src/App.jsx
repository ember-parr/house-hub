import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Profile from './pages/Profile'
import Login from './pages/Login'
import ToDoHome from "./pages/todos/ToDoHome"
import Household from "./pages/todos/Household"
import Personal from "./pages/todos/Personal"
import Routines from "./pages/todos/Routines"
import ListsHome from './pages/lists/ListsHome'
import Inventory from './pages/lists/Inventory'
import Shopping from './pages/lists/ShoppingList'
import Wishlist from './pages/lists/WishLists'
import Finances from './pages/finances/FinanceHome'
import Amex from './pages/finances/AmexTracking'
import Loan from './pages/finances/LoanTracking'
import Bills from './pages/finances/MonthlyBills'
import Spending from './pages/finances/SpendingTracking'
import Other from './pages/other/OtherHome'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="app-wrapper">
                  <Navbar />
                  <main className="main-content">
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/todos" element={<ToDoHome />} />
                      <Route path="/todos/household" element={<Household />} />
                      <Route path="/todos/personal" element={<Personal />} />
                      <Route path="/todos/routines" element={<Routines />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/lists" element={<ListsHome />} />
                      <Route path="/lists/inventory" element={<Inventory />} />
                      <Route path="/lists/shopping" element={<Shopping />} />
                      <Route path="/lists/Wishlist" element={<Wishlist />} />
                      <Route path="/finances" element={<Finances />} />
                      <Route path="/finances/amex" element={<Amex />} />
                      <Route path="/finances/loan" element={<Loan />} />
                      <Route path="/finances/bills" element={<Bills />} />
                      <Route path="/finances/spending" element={<Spending />} />
                      <Route path="/other" element={<Other />} />
                    </Routes>
                  </main>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App