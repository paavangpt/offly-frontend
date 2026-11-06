import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import EmployeeLeaveWorkspace from './EmployeeLeaveWorkspace'

type Role = 'EMPLOYEE' | 'MANAGER' | 'HOD'
type User = { id: number; name: string; email: string; role: Role }
type PageState = 'checking' | 'login' | 'ready'

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const DEMO_PASSWORD = 'OfflyDemo!2026'
const demoUsers = [
  { name: 'Harper Director', email: 'harper.hod@offly.test', role: 'HOD' },
  { name: 'Morgan Manager', email: 'morgan.manager@offly.test', role: 'MANAGER' },
  { name: 'Riley Manager', email: 'riley.manager@offly.test', role: 'MANAGER' },
  { name: 'Alex Employee', email: 'alex.employee@offly.test', role: 'EMPLOYEE' },
  { name: 'Blake Employee', email: 'blake.employee@offly.test', role: 'EMPLOYEE' },
  { name: 'Casey Employee', email: 'casey.employee@offly.test', role: 'EMPLOYEE' },
  { name: 'Drew Employee', email: 'drew.employee@offly.test', role: 'EMPLOYEE' },
  { name: 'Emery Employee', email: 'emery.employee@offly.test', role: 'EMPLOYEE' },
  { name: 'Finley Employee', email: 'finley.employee@offly.test', role: 'EMPLOYEE' },
  { name: 'Gray Employee', email: 'gray.employee@offly.test', role: 'EMPLOYEE' },
]
const roles: Record<Role, { path: string; title: string; eyebrow: string; description: string; features: string[] }> = {
  EMPLOYEE: {
    path: '/dashboard', title: 'Your time,\nwell managed.', eyebrow: 'EMPLOYEE SPACE',
    description: 'Track your time away and leave requests.',
    features: ['Request time off', 'Track your leave balance', 'Keep up with request updates'],
  },
  MANAGER: {
    path: '/dashboard', title: 'Team leave', eyebrow: 'TEAM OVERVIEW',
    description: 'Review upcoming team leave and requests.',
    features: ['Review team requests', 'See upcoming absences', 'Keep decisions in one place'],
  },
  HOD: {
    path: '/dashboard', title: 'Department leave', eyebrow: 'DEPARTMENT OVERVIEW',
    description: 'View leave activity across your department.',
    features: ['Review department requests', 'Understand team coverage', 'Follow decisions across teams'],
  },
}

function App() {
  const [page, setPage] = useState<PageState>('checking')
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [demoEmail, setDemoEmail] = useState(demoUsers[3].email)
  const initialAuthCheckStarted = useRef(false)

  const routeUser = useCallback((nextUser: User, path = window.location.pathname) => {
    const destination = '/dashboard'
    if (path !== destination) window.history.replaceState({}, '', destination)
    setUser(nextUser)
    setPage('ready')
  }, [])

  useEffect(() => {
    if (initialAuthCheckStarted.current) return
    initialAuthCheckStarted.current = true
    fetch(`${apiBase}/api/auth/me`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('No active session')
        return response.json() as Promise<User>
      })
      .then((profile) => routeUser(profile))
      .catch(() => {
        if (window.location.pathname !== '/') window.history.replaceState({}, '', '/')
        setPage('login')
      })
  }, [routeUser])

  useEffect(() => {
    if (!user) return
    const onPopState = () => {
      if (window.location.pathname !== '/dashboard') window.history.replaceState({}, '', '/dashboard')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [user])

  async function signIn(emailValue: string, passwordValue: string) {
    setError('')
    setBusy(true)
    try {
      const authorization = `Basic ${btoa(`${emailValue.trim()}:${passwordValue}`)}`
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST', headers: { Authorization: authorization }, credentials: 'include',
      })
      if (!response.ok) throw new Error(response.status === 401 ? 'That email and password don’t match.' : 'We couldn’t sign you in. Please try again.')
      await response.json()
      const profileResponse = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' })
      if (!profileResponse.ok) throw new Error('You signed in, but we couldn’t load your account. Please try again.')
      const profile = await profileResponse.json() as User
      if (!roles[profile.role]) throw new Error('This account has an unrecognized role. Please contact your administrator.')
      routeUser(profile, '/')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We couldn’t sign you in. Please try again.')
    } finally { setBusy(false) }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await signIn(email, password)
  }

  async function handleLogout() {
    try { await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' }) } finally {
      setUser(null); setEmail(''); setPassword(''); window.history.replaceState({}, '', '/'); setPage('login')
    }
  }

  if (page === 'checking') return <main className="loading-screen" aria-label="Checking your session"><span className="loader" /></main>

  if (page === 'ready' && user) {
    const content = roles[user.role]
    return (
      <main className="workspace">
        <aside className="sidebar">
          <a className="brand" href={content.path} aria-label="Offly home"><span className="brand-mark">o</span><span>offly<span className="brand-period">.</span></span></a>
          <div className="workspace-label">WORKSPACE</div>
          <nav className="sidebar-nav" aria-label="Workspace navigation">
            <a className="sidebar-nav-item sidebar-nav-active" href="/dashboard"><span className="sidebar-nav-icon">▦</span><span>Overview</span></a>
            {user.role === 'EMPLOYEE' && <a className="sidebar-nav-item" href="#requests"><span className="sidebar-nav-icon">▤</span><span>My leave requests</span></a>}
          </nav>
          <div className="sidebar-bottom">
            <span className="sidebar-role-avatar">{user.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
            <span className="sidebar-role-copy"><strong>{user.name}</strong><small>{user.role.toLowerCase()}</small></span>
          </div>
        </aside>
        <section className="dashboard-main">
          <header className="topbar"><span className="crumb">Workspace <span>/</span> Overview</span><div className="profile"><div className="avatar">{user.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><div className="profile-copy"><strong>{user.name}</strong><span>{user.email}</span></div><button className="logout-button" onClick={handleLogout}>Sign out</button></div></header>
    <div id="overview" className="dashboard-content">
      {user.role === 'EMPLOYEE' ? <EmployeeLeaveWorkspace userName={user.name} /> : <>
            <div className="section-kicker"><span className="kicker-line" />{content.eyebrow}</div>
            <div className="welcome-row"><div><h1>{content.title.split('\n').map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h1><p className="welcome-copy">{content.description}</p></div><div className="date-stamp"><span>YOUR SPACE</span><strong>0{(Object.keys(roles) as Role[]).indexOf(user.role) + 1}</strong><i>OF 03</i></div></div>
            <div className="content-rule" />
            <div className="overview-heading"><div><span className="section-number">01</span><h2>What’s ahead</h2></div><span className="preview-label">WORKSPACE PREVIEW</span></div>
            <div className="feature-list">{content.features.map((feature, index) => <article className="feature-row" key={feature}><span className="feature-index">0{index + 1}</span><h3>{feature}</h3><span className="feature-arrow">↗</span></article>)}</div>
            <p className="coming-soon"><span />More of your workspace is on its way.</p>
          </>}
          </div>
          <footer className="dashboard-footer"><span>OFFLY <b>© 2026</b></span><span>LEAVE MANAGEMENT WORKSPACE</span></footer>
        </section>
      </main>
    )
  }

  return (
    <main className="login-layout">
      <section className="story-panel" aria-label="Welcome to Offly">
        <a className="brand brand-light" href="/" aria-label="Offly home"><span className="brand-mark">o</span><span>offly<span className="brand-period">.</span></span></a>
        <div className="story-content"><div className="story-index"><span>01</span><span className="index-rule" /><span>WORK, WITH ROOM TO BREATHE</span></div><h1>Make space<br />for <em>what matters.</em></h1><p>A thoughtful little corner for time off, team plans, and the days in between.</p><div className="orbit-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><div className="orbit-center"><span>o</span></div><span className="orbit-spark spark-a">✳</span><span className="orbit-spark spark-b">✳</span><span className="orbit-label label-a">TIME WELL SPENT</span><span className="orbit-label label-b">OFF THE CLOCK</span></div></div>
        <div className="story-footer"><span>LESS ADMIN. MORE LIVING.</span><span>✳ &nbsp; EST. FOR BETTER DAYS</span></div>
      </section>
      <section className="form-panel"><div className="form-wrap"><div className="form-topline"><span>YOUR WORKSPACE</span><span className="topline-spark">✳</span></div><div className="form-intro"><div className="welcome-tag"><span /> A GOOD DAY STARTS HERE</div><h2>Welcome<br />back<span className="form-period">.</span></h2><p>Sign in to find your space.</p></div>
          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="email">Work email</label><div className="input-shell"><span className="input-icon">@</span><input id="email" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <div className="password-heading"><label htmlFor="password">Password</label></div><div className="input-shell"><span className="input-icon lock-icon">⌑</span><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="show-password" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'HIDE' : 'SHOW'}</button></div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="submit-button" type="submit" disabled={busy}><span>{busy ? 'Finding your space…' : 'Sign in'}</span><span className="submit-arrow">↗</span></button>
          </form>
          <details className="demo-login"><summary>Try a demo account</summary><div className="demo-login-content"><label htmlFor="demo-account">Choose a user</label><div className="demo-login-controls"><select id="demo-account" value={demoEmail} onChange={(event) => setDemoEmail(event.target.value)}>{demoUsers.map((demoUser) => <option key={demoUser.email} value={demoUser.email}>{demoUser.name} · {demoUser.role}</option>)}</select><button type="button" className="demo-login-button" disabled={busy} onClick={() => void signIn(demoEmail, DEMO_PASSWORD)}>{busy ? 'Signing in…' : 'Sign in'} <span>↗</span></button></div><p>Local demo users · password filled in automatically</p></div></details>
          <div className="form-note"><span className="note-lock">⌑</span><span>Your sign-in is private and secure.</span><span className="note-rule" /></div>
          <p className="access-note">Need an account? <span>Ask your workspace administrator.</span></p>
        </div><footer className="form-footer"><span>© OFFLY 2026</span><span>TAKE YOUR TIME <i>✳</i></span></footer></section>
    </main>
  )
}

export default App
