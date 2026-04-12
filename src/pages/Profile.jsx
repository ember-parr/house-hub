import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import {
    doc, getDoc, updateDoc,
    collection, getDocs, query, orderBy, onSnapshot,
} from 'firebase/firestore'

const COLOR_STYLES = {
    teal: { bg: '#E1F5EE', color: '#0F6E56' },
    purple: { bg: '#EEEDFE', color: '#534AB7' },
    amber: { bg: '#FAEEDA', color: '#854F0B' },
    coral: { bg: '#FAECE7', color: '#993C1D' },
    blue: { bg: '#E6F1FB', color: '#185FA5' },
    green: { bg: '#EAF3DE', color: '#3B6D11' },
}

function initials(name) {
    if (!name) return '?'
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

// Add this helper component near the top of the file, above the main export
function Avatar({ photoURL, name, style, size = 52 }) {
    const [imgError, setImgError] = useState(false)

    if (photoURL && !imgError) {
        return (
            <img
                src={photoURL}
                alt={name}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
        )
    }

    return (
        <div style={{ width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.34, fontWeight: 500, flexShrink: 0, ...style }}>
            {initials(name)}
        </div>
    )
}

export default function Profile() {
    const { user, logOut } = useAuth()
    const [profile, setProfile] = useState(null)
    const [members, setMembers] = useState([])
    const [nickname, setNickname] = useState('')
    const [saving, setSaving] = useState(false)
    const [savedMsg, setSavedMsg] = useState(false)
    const [activity, setActivity] = useState({
        todosAssigned: 0, todosComplete: 0,
        shoppingAdded: 0, shoppingBought: 0,
    })

    // Load current user's profile
    useEffect(() => {
        if (!user) return
        const load = async () => {
            const snap = await getDoc(doc(db, 'users', user.uid))
            if (snap.exists()) {
                const data = snap.data()
                setProfile(data)
                setNickname(data.nickname || data.displayName || '')
            }
        }
        load()
    }, [user])

    // Load all household members
    useEffect(() => {
        const load = async () => {
            const snap = await getDocs(query(collection(db, 'users'), orderBy('joinedAt')))
            setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        }
        load()
    }, [])

    // Live activity stats across collections
    useEffect(() => {
        if (!user) return
        const unsubTodos = onSnapshot(collection(db, 'todos'), (snap) => {
            const all = snap.docs.map((d) => d.data())
            const assigned = all.filter((t) => t.assignedTo === user.uid).length
            const complete = all.filter((t) => t.assignedTo === user.uid && t.status === 'Complete').length
            setActivity((prev) => ({ ...prev, todosAssigned: assigned, todosComplete: complete }))
        })
        const unsubShopping = onSnapshot(collection(db, 'shopping'), (snap) => {
            const all = snap.docs.map((d) => d.data())
            const added = all.filter((i) => i.addedBy === user.uid).length
            const bought = all.filter((i) => i.addedBy === user.uid && i.bought).length
            setActivity((prev) => ({ ...prev, shoppingAdded: added, shoppingBought: bought }))
        })
        return () => { unsubTodos(); unsubShopping() }
    }, [user])

    const saveNickname = async () => {
        if (!nickname.trim() || !user) return
        setSaving(true)
        await updateDoc(doc(db, 'users', user.uid), { nickname: nickname.trim() })
        setSaving(false)
        setSavedMsg(true)
        setTimeout(() => setSavedMsg(false), 2000)
    }

    const avatarStyle = COLOR_STYLES[profile?.color] || COLOR_STYLES.teal

    return (
        <div className="page">
            <div className="page-header">
                <h1 className="page-title">Profile</h1>
            </div>

            {/* Identity card */}
            <div className="profile-card" style={{ marginBottom: '12px' }}>
                <div className="profile-user-row">
                    <Avatar
                        photoURL={user?.photoURL}
                        name={profile?.nickname || user?.displayName}
                        style={avatarStyle}
                        size={52}
                    />

                    {/* {user?.photoURL ? (
            <img src={user.photoURL} alt={user.displayName} className="profile-avatar-img" />
          ) : (
            <div className="profile-avatar-initials" style={avatarStyle}>
              {initials(user?.displayName)}
            </div>
          )} */}
                    <div>
                        <div className="profile-name">{profile?.nickname || user?.displayName}</div>
                        <div className="profile-email">{user?.email}</div>
                    </div>
                </div>

                <div className="pp-field-label" style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Nickname
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                        className="form-input"
                        style={{ margin: 0, flex: 1 }}
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveNickname()}
                        placeholder="How should we call you?"
                    />
                    <button
                        className="btn-primary"
                        style={{ width: 'auto', padding: '9px 14px', marginTop: 0 }}
                        onClick={saveNickname}
                        disabled={saving}
                    >
                        {savedMsg ? '✓ Saved' : saving ? '...' : 'Save'}
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="profile-card" style={{ marginBottom: '12px' }}>
                <div className="profile-section-title">Your activity</div>
                <div className="stats-grid">
                    <div className="stat-box">
                        <div className="stat-val">{activity.todosAssigned}</div>
                        <div className="stat-lbl">To-dos assigned</div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-val">{activity.todosComplete}</div>
                        <div className="stat-lbl">To-dos complete</div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-val">{activity.shoppingAdded}</div>
                        <div className="stat-lbl">Items added</div>
                    </div>
                    <div className="stat-box">
                        <div className="stat-val">{activity.shoppingBought}</div>
                        <div className="stat-lbl">Items bought</div>
                    </div>
                </div>
            </div>

            {/* Household members */}
            <div className="profile-card" style={{ marginBottom: '12px' }}>
                <div className="profile-section-title">Household members</div>
                <div className="members-list">
                    {members.map((member) => {
                        const mStyle = COLOR_STYLES[member.color] || COLOR_STYLES.teal
                        const isYou = member.id === user?.uid
                        const name = member.nickname || member.displayName || 'Member'
                        return (
                            <div key={member.id} className="member-row">
                                <Avatar
                                    photoURL={member.photoURL}
                                    name={name}
                                    style={mStyle}
                                    size={34}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="member-name">{name}</div>
                                    <div className="member-email">{member.email}</div>
                                </div>
                                {isYou && <span className="you-badge">you</span>}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Sign out */}
            <button className="btn-signout" onClick={logOut}>
                Sign out
            </button>
        </div>
    )
}