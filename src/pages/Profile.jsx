import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useUserRole } from '../hooks/useUserRole'
import {
    doc, getDoc, updateDoc, addDoc, deleteDoc,
    collection, getDocs, query, orderBy, onSnapshot,
    serverTimestamp,
} from 'firebase/firestore'

const FREQUENCIES = ['daily', 'weekly', 'monthly']

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
    const { isAdmin } = useUserRole()
    const [profile, setProfile] = useState(null)
    const [members, setMembers] = useState([])
    const [nickname, setNickname] = useState('')
    const [saving, setSaving] = useState(false)
    const [savedMsg, setSavedMsg] = useState(false)
    const [activity, setActivity] = useState({
        todosAssigned: 0, todosComplete: 0,
        shoppingAdded: 0, shoppingBought: 0,
    })
    const [routines, setRoutines] = useState([])
    // modalRoutine: null = closed | { frequency, id?, text } = open
    const [modalRoutine, setModalRoutine] = useState(null)
    const [workProjects, setWorkProjects] = useState([])
    // workModal: null = closed | { id?, name } = open
    const [workModal, setWorkModal] = useState(null)

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

    // Real-time routines for current user
    useEffect(() => {
        if (!user) return
        const q = query(
            collection(db, 'users', user.uid, 'routines'),
            orderBy('createdAt')
        )
        return onSnapshot(q, (snap) => {
            setRoutines(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        })
    }, [user])

    // Real-time work projects for current user
    useEffect(() => {
        if (!user) return
        const q = query(collection(db, 'users', user.uid, 'workProjects'), orderBy('createdAt'))
        return onSnapshot(q, (snap) => {
            setWorkProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        })
    }, [user])

    const saveNickname = async () => {
        if (!nickname.trim() || !user) return
        setSaving(true)
        await updateDoc(doc(db, 'users', user.uid), { nickname: nickname.trim() })
        setSaving(false)
        setSavedMsg(true)
        setTimeout(() => setSavedMsg(false), 2000)
    }

    const saveRoutine = async () => {
        if (!modalRoutine?.text?.trim() || !user) return
        const isDaily = modalRoutine.frequency === 'daily'
        if (modalRoutine.id) {
            await updateDoc(doc(db, 'users', user.uid, 'routines', modalRoutine.id), {
                text:       modalRoutine.text.trim(),
                timeOfDay:  isDaily ? (modalRoutine.timeOfDay || 'AM') : null,
            })
        } else {
            await addDoc(collection(db, 'users', user.uid, 'routines'), {
                text:       modalRoutine.text.trim(),
                frequency:  modalRoutine.frequency,
                timeOfDay:  isDaily ? (modalRoutine.timeOfDay || 'AM') : null,
                createdAt:  serverTimestamp(),
            })
        }
        setModalRoutine(null)
    }

    const deleteRoutine = async (id) => {
        if (!user) return
        await deleteDoc(doc(db, 'users', user.uid, 'routines', id))
        setModalRoutine(null)
    }

    const saveWorkProject = async () => {
        if (!workModal?.name?.trim() || !user) return
        const payload = {
            name:      workModal.name.trim(),
            startDate: workModal.startDate || null,
            endDate:   workModal.endDate   || null,
        }
        if (workModal.id) {
            await updateDoc(doc(db, 'users', user.uid, 'workProjects', workModal.id), payload)
        } else {
            await addDoc(collection(db, 'users', user.uid, 'workProjects'), {
                ...payload,
                createdAt: serverTimestamp(),
            })
        }
        setWorkModal(null)
    }

    const deleteWorkProject = async (id) => {
        if (!user) return
        await deleteDoc(doc(db, 'users', user.uid, 'workProjects', id))
        setWorkModal(null)
    }

    const changeUserType = async (memberId, newType) => {
        await updateDoc(doc(db, 'users', memberId), { userType: newType })
        setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, userType: newType } : m))
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

            

            {/* Routines */}
            <div className="profile-card" style={{ marginBottom: '12px' }}>
                <div className="profile-section-title">My Routines</div>
                {FREQUENCIES.map((freq) => {
                    const items = routines.filter((r) => r.frequency === freq)
                    return (
                        <div key={freq} style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                                {freq}
                            </div>
                            {items.length === 0 && (
                                <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '6px' }}>No {freq} routines yet</div>
                            )}
                            {items.map((r) => (
                                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '0.5px solid #f5f4f1' }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d0cdc8', flexShrink: 0 }} />
                                    <div style={{ flex: 1, fontSize: '13px' }}>{r.text}</div>
                                    {r.timeOfDay && (
                                        <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '20px', background: '#E6F1FB', color: '#185FA5' }}>
                                            {r.timeOfDay}
                                        </span>
                                    )}
                                    <button
                                        onClick={() => setModalRoutine({ frequency: freq, id: r.id, text: r.text, timeOfDay: r.timeOfDay || 'AM' })}
                                        style={{ fontSize: '11px', color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                                    >
                                        Edit
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => setModalRoutine({ frequency: freq, text: '', timeOfDay: freq === 'daily' ? 'AM' : null })}
                                style={{ fontSize: '12px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0 0', fontFamily: 'inherit' }}
                            >
                                + Add {freq} routine
                            </button>
                        </div>
                    )
                })}
            </div>


            {/* Work Projects */}
            <div className="profile-card" style={{ marginBottom: '12px' }}>
                <div className="profile-section-title">My Work Projects</div>
                {workProjects.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '6px' }}>No projects yet</div>
                )}
                {workProjects.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '0.5px solid #f5f4f1' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d0cdc8', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px' }}>{p.name}</div>
                            {(p.startDate || p.endDate) && (
                                <div style={{ fontSize: '11px', color: '#bbb', marginTop: '2px' }}>
                                    {p.startDate || '—'} → {p.endDate || '—'}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => setWorkModal({ id: p.id, name: p.name, startDate: p.startDate || '', endDate: p.endDate || '' })}
                            style={{ fontSize: '11px', color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                        >
                            Edit
                        </button>
                    </div>
                ))}
                <button
                    onClick={() => setWorkModal({ name: '', startDate: '', endDate: '' })}
                    style={{ fontSize: '12px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0 0', fontFamily: 'inherit' }}
                >
                    + Add project
                </button>
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
                                {isYou
                                    ? <span className="you-badge">you</span>
                                    : isAdmin && (
                                        <select
                                            value={member.userType || 'new'}
                                            onChange={(e) => changeUserType(member.id, e.target.value)}
                                            style={{ fontSize: '11px', color: '#555', background: 'none', border: '0.5px solid #e0ddd8', borderRadius: '6px', padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit' }}
                                        >
                                            <option value="admin">Admin</option>
                                            <option value="contributor">Contributor</option>
                                            <option value="new">New</option>
                                        </select>
                                    )
                                }
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Sign out */}
            <button className="btn-signout" onClick={logOut}>
                Sign out
            </button>

            {/* Work project add / edit modal */}
            {workModal && (
                <div className="modal-overlay" onClick={() => setWorkModal(null)}>
                    <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <h2 className="modal-title">{workModal.id ? 'Edit project' : 'Add project'}</h2>
                        <input
                            className="form-input"
                            placeholder="e.g. Client portal, Q3 campaign"
                            value={workModal.name}
                            onChange={(e) => setWorkModal({ ...workModal, name: e.target.value })}
                            autoFocus
                        />
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Start date</div>
                                <input
                                    className="form-input"
                                    style={{ margin: 0 }}
                                    type="date"
                                    value={workModal.startDate}
                                    onChange={(e) => setWorkModal({ ...workModal, startDate: e.target.value })}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>End date</div>
                                <input
                                    className="form-input"
                                    style={{ margin: 0 }}
                                    type="date"
                                    value={workModal.endDate}
                                    onChange={(e) => setWorkModal({ ...workModal, endDate: e.target.value })}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {workModal.id && (
                                <button
                                    onClick={() => deleteWorkProject(workModal.id)}
                                    style={{ background: 'none', border: '0.5px solid #f5c5c5', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', color: '#c0392b', cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                    Delete
                                </button>
                            )}
                            <button
                                className="btn-primary"
                                style={{ flex: 1, margin: 0 }}
                                onClick={saveWorkProject}
                                disabled={!workModal.name?.trim()}
                            >
                                {workModal.id ? 'Save changes' : 'Add project'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Routine add / edit modal */}
            {modalRoutine && (
                <div className="modal-overlay" onClick={() => setModalRoutine(null)}>
                    <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-handle" />
                        <h2 className="modal-title">
                            {modalRoutine.id ? 'Edit' : 'Add'} {modalRoutine.frequency} routine
                        </h2>
                        <input
                            className="form-input"
                            placeholder="e.g. Morning walk, Meal prep, Budget review"
                            value={modalRoutine.text}
                            onChange={(e) => setModalRoutine({ ...modalRoutine, text: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && saveRoutine()}
                            autoFocus
                        />
                        {modalRoutine.frequency === 'daily' && (
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                                {['AM', 'PM'].map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setModalRoutine({ ...modalRoutine, timeOfDay: t })}
                                        style={{
                                            flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                            fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
                                            background: modalRoutine.timeOfDay === t ? '#185FA5' : '#f0ede8',
                                            color: modalRoutine.timeOfDay === t ? '#fff' : '#666',
                                        }}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {modalRoutine.id && (
                                <button
                                    onClick={() => deleteRoutine(modalRoutine.id)}
                                    style={{ background: 'none', border: '0.5px solid #f5c5c5', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', color: '#c0392b', cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                    Delete
                                </button>
                            )}
                            <button
                                className="btn-primary"
                                style={{ flex: 1, margin: 0 }}
                                onClick={saveRoutine}
                                disabled={!modalRoutine.text?.trim()}
                            >
                                {modalRoutine.id ? 'Save changes' : 'Add routine'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}