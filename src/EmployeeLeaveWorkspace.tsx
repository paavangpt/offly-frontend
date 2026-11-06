import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'

const API = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const ROOT = `${API}/api/employee/leave-requests`
const MAX_FILE = 10 * 1024 * 1024
const MAX_TOTAL = 30 * 1024 * 1024
const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.txt,.doc,.docx'

type Status = 'PENDING' | 'MORE_INFO_REQUIRED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
type Document = { id: number; fileName: string; contentType: string; size: number; uploadedAt: string; downloadUrl?: string }
type Event = { id: number; action: string; stage?: string | null; fromStatus?: Status | null; toStatus?: Status | null; comment?: string | null; actorName: string; actorRole: string; createdAt: string }
type LeaveRequest = { id: number; fromDate: string; toDate: string; reason: string; totalDays: number; requiresHod: boolean; status: Status; stage?: 'MANAGER' | 'HOD' | null; createdAt: string; updatedAt: string; documents: Document[]; timeline: Event[] }
type Filter = 'ALL' | Status

const filters: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'All requests' }, { id: 'PENDING', label: 'In review' },
  { id: 'MORE_INFO_REQUIRED', label: 'Needs your input' }, { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Declined' }, { id: 'CANCELLED', label: 'Cancelled' },
]

function dateLabel(date: string, includeYear = false) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en', { month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' as const } : {}) })
}
function fullDate(value: string) { return new Date(value).toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) }
function dayCount(from: string, to: string) {
  if (!from || !to) return 0
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  return end >= start ? Math.floor((end - start) / 86400000) + 1 : 0
}
function statusLabel(status: Status) { return status === 'MORE_INFO_REQUIRED' ? 'Needs your input' : status === 'PENDING' ? 'In review' : status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Declined' : 'Cancelled' }
function stageLabel(stage?: string | null) { return stage === 'HOD' ? 'Department review' : stage === 'MANAGER' ? 'Manager review' : null }
function eventLabel(action: string) {
  const labels: Record<string, string> = { APPLIED: 'Request submitted', APPROVED: 'Request approved', REJECTED: 'Request declined', MORE_INFO_REQUESTED: 'More information requested', INFO_PROVIDED: 'You replied', DOCUMENT_ADDED: 'Document added', CANCELLED: 'Request cancelled' }
  return labels[action] ?? action.replaceAll('_', ' ').toLowerCase()
}
function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB` }
async function responseError(response: Response) {
  if (response.status === 401) return 'Your session has expired. Sign in again to continue.'
  if (response.status === 403) return 'This action is only available to employee accounts.'
  if (response.status === 404) return 'This leave request or document could not be found.'
  if (response.status === 409) return 'This request has changed and this action is no longer available. Refresh the list and try again.'
  if (response.status === 413) return 'The files are too large. Each file must be 10 MB or less and the total upload must be 30 MB or less.'
  if (response.status === 415) return 'One of these file types is not supported. Use PDF, JPG, PNG, TXT, DOC, or DOCX.'
  if (response.status === 400) return 'Check the dates, reason, and supporting documents, then try again.'
  return `Something went wrong (${response.status}). Please try again.`
}
function StatusBadge({ status }: { status: Status }) { return <span className={`leave-status status-${status.toLowerCase()}`}><i />{statusLabel(status)}</span> }
function FilePicker({ files, onChange, id }: { files: File[]; onChange: (files: File[]) => void; id: string }) {
  const [dragging, setDragging] = useState(false)
  function takeFiles(next: FileList | null) {
    if (!next) return
    onChange([...files, ...Array.from(next)])
  }
  return <div className={`file-picker${dragging ? ' is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); takeFiles(event.dataTransfer.files) }}>
    <input id={id} type="file" accept={ACCEPTED} multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { takeFiles(event.target.files); event.target.value = '' }} />
    <label htmlFor={id} className="file-pick-label"><span className="upload-symbol">↑</span><span><strong>Choose files</strong> or drag them here</span></label>
    <small>PDF, JPG, PNG, TXT, DOC or DOCX · 10 MB max per file</small>
    {files.length > 0 && <ul className="selected-files">{files.map((file, index) => <li key={`${file.name}-${index}`}><span>↳</span><span className="selected-file-name">{file.name}<small>{formatSize(file.size)}</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}>×</button></li>)}</ul>}
  </div>
}

function LeaveForm({ mode, request, onClose, onSaved }: { mode: 'apply' | 'reply'; request?: LeaveRequest; onClose: () => void; onSaved: (item: LeaveRequest) => void }) {
  const [fromDate, setFromDate] = useState(mode === 'reply' ? request?.fromDate ?? '' : '')
  const [toDate, setToDate] = useState(mode === 'reply' ? request?.toDate ?? '' : '')
  const [reason, setReason] = useState(mode === 'reply' ? request?.reason ?? '' : '')
  const [comment, setComment] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const days = dayCount(fromDate, toDate)
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  const hasExistingDocument = Boolean(request?.documents.length)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const datesChanged = mode === 'apply' || fromDate !== request?.fromDate || toDate !== request?.toDate
    const reasonChanged = mode === 'apply' || reason.trim() !== request?.reason
    if (datesChanged && days < 1) { setError('Choose a valid date range. The end date must be on or after the start date.'); return }
    if (mode === 'reply' && reasonChanged && !reason.trim()) { setError('The reason cannot be blank.'); return }
    if (mode === 'apply' && days > 3 && !files.length) { setError('Requests longer than 3 days need at least one supporting document.'); return }
    if (mode === 'reply' && days > 3 && !files.length && !hasExistingDocument) { setError('This request needs at least one supporting document for a leave longer than 3 days.'); return }
    if (files.some((file) => file.size > MAX_FILE) || totalBytes > MAX_TOTAL) { setError('Each file must be 10 MB or less and all new files together must be 30 MB or less.'); return }
    const data = new FormData()
    if (mode === 'apply' || datesChanged) { data.append('fromDate', fromDate); data.append('toDate', toDate) }
    if (reasonChanged && reason.trim()) data.append('reason', reason.trim())
    if (mode === 'reply' && comment.trim()) data.append('comment', comment.trim())
    files.forEach((file) => data.append('documents', file))
    if (mode === 'reply' && !datesChanged && !reasonChanged && !comment.trim() && files.length === 0) {
      setError('Add a comment, change the request details, or attach a document before sending.'); return
    }
    setBusy(true)
    try {
      const response = await fetch(mode === 'apply' ? ROOT : `${ROOT}/${request!.id}/information`, { method: mode === 'apply' ? 'POST' : 'PUT', body: data, credentials: 'include' })
      if (!response.ok) throw new Error(await responseError(response))
      onSaved(await response.json() as LeaveRequest)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The request could not be saved. Try again.') }
    finally { setBusy(false) }
  }
  return <div className="leave-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="leave-modal" role="dialog" aria-modal="true" aria-labelledby="leave-form-title"><header className="modal-header"><div><span className="modal-kicker">{mode === 'apply' ? 'A LITTLE TIME FOR YOU' : `REQUEST #${request!.id}`}</span><h2 id="leave-form-title">{mode === 'apply' ? 'Request time off' : 'Share an update'}</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={onClose}>×</button></header><p className="modal-description">{mode === 'apply' ? 'Tell us when you’ll be away. Your request will be sent to your manager.' : 'Your manager needs a little more information before they can continue.'}</p>
    <form className="leave-form" onSubmit={submit}><div className="date-fields"><div><label htmlFor="leave-from">First day</label><input id="leave-from" type="date" required={mode === 'apply'} value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></div><div><label htmlFor="leave-to">Last day</label><input id="leave-to" type="date" min={fromDate || undefined} required={mode === 'apply'} value={toDate} onChange={(event) => setToDate(event.target.value)} /></div></div>
      <div className="duration-note"><span>INCLUSIVE CALENDAR DAYS</span><strong>{days || '—'} {days === 1 ? 'day' : 'days'}</strong>{days > 3 && <em>Supporting document needed</em>}{days > 0 && days <= 3 && <em>Manager review</em>}</div>
      <div><label htmlFor="leave-reason">Reason for leave{mode === 'reply' && <span className="optional-label">OPTIONAL</span>}</label><textarea id="leave-reason" rows={3} maxLength={1000} required={mode === 'apply'} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="A short note to help your manager understand" /></div>
      {mode === 'reply' && <div><label htmlFor="leave-comment">Reply to your manager <span className="optional-label">OPTIONAL</span></label><textarea id="leave-comment" rows={2} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment to your response" /></div>}
      <div><div className="upload-heading"><label htmlFor={`leave-files-${mode}`}>Supporting documents <span className="optional-label">{days > 3 && !hasExistingDocument ? 'REQUIRED' : 'OPTIONAL'}</span></label>{hasExistingDocument && <span className="existing-doc-note">Already attached</span>}</div><FilePicker id={`leave-files-${mode}`} files={files} onChange={setFiles} /></div>
      {error && <p className="leave-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Go back</button><button type="submit" className="primary-button" disabled={busy}><span>{busy ? 'Saving…' : mode === 'apply' ? 'Send request' : 'Send update'}</span><span>↗</span></button></div>
    </form></section></div>
}

function DetailPanel({ request, onClose, onRefresh, onReply, onCancel, actionBusy, onDownload }: { request: LeaveRequest; onClose: () => void; onRefresh: () => void; onReply: () => void; onCancel: () => void; actionBusy: boolean; onDownload: (document: Document, request: LeaveRequest) => void }) {
  return <div className="detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title"><header className="detail-header"><div><span className="modal-kicker">LEAVE REQUEST · #{request.id}</span><h2 id="detail-title">Request details</h2></div><button className="icon-button" type="button" aria-label="Close details" onClick={onClose}>×</button></header><div className="detail-scroll"><div className="detail-status"><StatusBadge status={request.status} />{stageLabel(request.stage) && <span className="stage-tag">{stageLabel(request.stage)}</span>}</div><div className="detail-date-range"><span>{dateLabel(request.fromDate, true)} <i>→</i> {dateLabel(request.toDate, true)}</span><strong>{request.totalDays} <small>{request.totalDays === 1 ? 'day' : 'days'}</small></strong></div><p className="detail-reason">{request.reason}</p>{request.requiresHod && <p className="hod-note"><span>✳</span> This request includes department review because it is longer than 3 days.</p>}
      {request.documents.length > 0 && <section className="detail-section"><div className="detail-section-heading"><h3>Supporting documents</h3><span>{request.documents.length.toString().padStart(2, '0')}</span></div><ul className="document-list">{request.documents.map((document) => <li key={document.id}><span className="document-glyph">↳</span><span className="document-name">{document.fileName}<small>{formatSize(document.size)} · Added {dateLabel(document.uploadedAt.slice(0, 10), true)}</small></span><button type="button" onClick={() => onDownload(document, request)} aria-label={`Download ${document.fileName}`}>↓</button></li>)}</ul></section>}
      <section className="detail-section"><div className="detail-section-heading"><h3>Request timeline</h3><span>{request.timeline.length.toString().padStart(2, '0')}</span></div><ol className="timeline">{request.timeline.map((event, index) => <li className="timeline-item" key={event.id}><span className={`timeline-dot${index === 0 ? ' timeline-dot-first' : ''}`} /><div className="timeline-copy"><strong>{eventLabel(event.action)}</strong><span>{event.actorName} · {event.actorRole.toLowerCase()}{event.stage ? ` · ${event.stage.toLowerCase()} review` : ''}</span>{event.comment && <p>{event.comment}</p>}<time>{fullDate(event.createdAt)}</time></div></li>)}</ol></section>
      </div><footer className="detail-actions">{request.status === 'MORE_INFO_REQUIRED' && <button className="primary-button" type="button" onClick={onReply}><span>Reply to request</span><span>↗</span></button>}{request.status === 'PENDING' && <button className="secondary-button cancel-request" type="button" disabled={actionBusy} onClick={onCancel}>{actionBusy ? 'Cancelling…' : 'Cancel request'}</button>}{request.status !== 'PENDING' && request.status !== 'MORE_INFO_REQUIRED' && <button className="secondary-button" type="button" onClick={() => { onRefresh(); onClose() }}>Close details</button>}</footer>
    </aside></div>
}

export default function EmployeeLeaveWorkspace({ userName }: { userName: string }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [selected, setSelected] = useState<LeaveRequest | null>(null)
  const [modal, setModal] = useState<'apply' | 'reply' | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  const loadRequests = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const response = await fetch(ROOT, { credentials: 'include' })
      if (!response.ok) throw new Error(await responseError(response))
      setRequests(await response.json() as LeaveRequest[])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load leave requests.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRequests() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadRequests])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4500); return () => window.clearTimeout(timer) }, [toast])
  const counts = useMemo(() => ({ pending: requests.filter((request) => request.status === 'PENDING').length, attention: requests.filter((request) => request.status === 'MORE_INFO_REQUIRED').length, total: requests.length }), [requests])
  const filtered = useMemo(() => requests.filter((request) => (filter === 'ALL' || request.status === filter) && (!query || `${request.reason} ${request.id}`.toLowerCase().includes(query.toLowerCase()))), [filter, query, requests])
  const firstName = userName.trim().split(/\s+/)[0]
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  async function openDetails(item: LeaveRequest) {
    setSelected(item)
    try {
      const response = await fetch(`${ROOT}/${item.id}`, { credentials: 'include' })
      if (response.ok) setSelected(await response.json() as LeaveRequest)
      else setToast(await responseError(response))
    } catch { setToast('Could not load the complete request details.') }
  }
  function saved(item: LeaveRequest) {
    setRequests((current) => [item, ...current.filter((request) => request.id !== item.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    setSelected(item); setModal(null)
    setToast(item.status === 'PENDING' ? 'Your request is on its way.' : 'Your update has been sent.')
  }
  async function cancelRequest() {
    if (!selected) return
    setActionBusy(true)
    try {
      const response = await fetch(`${ROOT}/${selected.id}/cancel`, { method: 'POST', credentials: 'include' })
      if (!response.ok) throw new Error(await responseError(response))
      const item = await response.json() as LeaveRequest
      setRequests((current) => current.map((request) => request.id === item.id ? item : request)); setSelected(item); setToast('Your request has been cancelled.')
    } catch (reason) { setToast(reason instanceof Error ? reason.message : 'Could not cancel this request.') }
    finally { setActionBusy(false) }
  }
  async function downloadDocument(document: Document, request: LeaveRequest) {
    try {
      const response = await fetch(`${ROOT}/${request.id}/documents/${document.id}`, { credentials: 'include' })
      if (!response.ok) throw new Error(await responseError(response))
      const url = URL.createObjectURL(await response.blob()); const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = document.fileName; anchor.click(); URL.revokeObjectURL(url)
    } catch (reason) { setToast(reason instanceof Error ? reason.message : 'Could not download this file.') }
  }
  function modalContent(): ReactNode {
    if (!modal) return null
    return <LeaveForm mode={modal} request={modal === 'reply' ? selected ?? undefined : undefined} onClose={() => setModal(null)} onSaved={saved} />
  }
  return <div className="employee-home">
    <div className="employee-greeting"><div><div className="section-kicker"><span className="kicker-line" />LEAVE OVERVIEW</div><h1>{greeting}, {firstName}</h1><p>Here’s your leave activity and upcoming requests.</p></div><div className="employee-page-actions"><span className="today-label">{today}</span><button className="apply-tile" onClick={() => setModal('apply')}><span className="apply-plus">+</span><span><strong>New leave request</strong><small>Plan time away</small></span></button></div></div>
    <div className="employee-metrics"><article className="metric-card"><span className="metric-icon">◷</span><span className="metric-label">IN REVIEW</span><strong>{counts.pending.toString().padStart(2, '0')}</strong><span className="metric-foot">Waiting for a decision</span></article><article className={`metric-card${counts.attention ? ' metric-attention' : ''}`}><span className="metric-icon">!</span><span className="metric-label">NEEDS YOUR INPUT</span><strong>{counts.attention.toString().padStart(2, '0')}</strong><span className="metric-foot">{counts.attention ? 'A reply will keep things moving' : 'You’re all caught up'}</span></article><article className="metric-card"><span className="metric-icon">▤</span><span className="metric-label">TOTAL REQUESTS</span><strong>{counts.total.toString().padStart(2, '0')}</strong><span className="metric-foot">All time</span></article></div>
    <section className="request-section" id="requests"><header className="request-section-head"><div><span className="section-number">LEAVE</span><h2>My requests</h2></div><button type="button" className="refresh-button" onClick={() => void loadRequests(true)} aria-label="Refresh requests">↻ <span>Refresh</span></button></header>
      <div className="request-controls"><div className="request-tabs" role="tablist" aria-label="Filter leave requests">{filters.map((item) => <button type="button" role="tab" aria-selected={filter === item.id} className={filter === item.id ? 'active' : ''} key={item.id} onClick={() => setFilter(item.id)}>{item.label}{item.id === 'MORE_INFO_REQUIRED' && counts.attention > 0 && <i>{counts.attention}</i>}</button>)}</div><label className="request-search"><span>⌕</span><input aria-label="Search requests" placeholder="Find a request" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      {error && <div className="request-alert" role="alert"><span>{error}</span><button type="button" onClick={() => void loadRequests()}>Try again</button></div>}
      {loading ? <div className="request-loading"><span className="loader" />Finding your requests…</div> : filtered.length === 0 ? <div className="empty-requests"><span className="empty-flower">✳</span><h3>{requests.length === 0 ? 'Nothing on the calendar yet.' : 'No requests found.'}</h3><p>{requests.length === 0 ? 'When you need some time, you can start a request here.' : 'Try another filter or search phrase.'}</p>{requests.length === 0 && <button className="secondary-button" onClick={() => setModal('apply')}>Create your first request <span>↗</span></button>}</div> : <div className="request-table"><div className="request-table-head"><span>WHEN</span><span>REASON</span><span>DURATION</span><span>STATUS</span><span /></div>{filtered.map((request) => <button type="button" className="request-row" key={request.id} onClick={() => void openDetails(request)}><span className="request-when"><strong>{dateLabel(request.fromDate)}</strong><small>{dateLabel(request.toDate, true)}</small></span><span className="request-reason"><strong>{request.reason}</strong><small>Request #{request.id} · Sent {dateLabel(request.createdAt.slice(0, 10), true)}</small></span><span className="request-duration">{request.totalDays} {request.totalDays === 1 ? 'day' : 'days'}{request.requiresHod && <small>HOD review</small>}</span><span className="request-status-wrap"><StatusBadge status={request.status} /></span><span className="request-row-arrow">↗</span></button>)}</div>}
    </section>
    <p className="employee-note"><span>✳</span> All leave days are counted inclusively, including weekends.</p>
    {modalContent()}{selected && !modal && <DetailPanel request={selected} onClose={() => setSelected(null)} onRefresh={() => void loadRequests(true)} onReply={() => setModal('reply')} onCancel={() => void cancelRequest()} actionBusy={actionBusy} onDownload={downloadDocument} />}
    {toast && <div className="leave-toast" role="status"><span>✳</span>{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss notification">×</button></div>}
  </div>
}
