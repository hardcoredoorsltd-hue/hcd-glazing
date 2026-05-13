import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

// ─── Supabase ────────────────────────────────────────────────────────────────

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const STORE_ID  = 'main'
const DEVICE_ID = Math.random().toString(36).slice(2) // unique per browser tab

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_RATES = {
  glass: 812.85, putty: 9.00, bead: 16.17, silicone: 10.12,
  scaffolding: 32.37, inspection: 107.10, craftsperson: 36.43,
  scaffolder: 65.63, extraScaff: 34.81,
}

const BEAD_CYCLE  = ['none', 'internal', 'external', 'both']
const BEAD_LABEL  = { none: 'OFF', internal: 'INT', external: 'EXT', both: 'BOTH' }
const BEAD_MULT   = { none: 0, internal: 1, external: 1, both: 2 }
const BEAD_COLOR  = { none: '#4a5568', internal: '#e8a020', external: '#e8a020', both: '#4ade80' }
const BEAD_BG     = { none: '#1c1f2b', internal: '#e8a02010', external: '#e8a02010', both: '#0d2b1e' }
const BEAD_BORDER = { none: '#2e3347', internal: '#e8a02044', external: '#e8a02044', both: '#1e5c3a' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genId()   { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}` }
function fmt(n)    { return n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 }) }
function csvDate(d){ return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` }

const newUnit = () => ({ id: genId(), width: '', height: '', qty: 1, putty: false, bead: 'none', silicone: false })
const newJob  = () => ({
  id: genId(),
  customer: 'The City of London',
  address: '',
  jobNum: '',
  units: [newUnit()],
  extras: { scaffoldSM: '', inspections: '', craftspersons: '', scaffolders: '', extraScaffDays: '' },
  createdAt: Date.now(),
})

function calcUnit(unit, rates) {
  const w = parseFloat(unit.width)  || 0
  const h = parseFloat(unit.height) || 0
  const qty = parseInt(unit.qty)    || 1
  const sm  = (w / 1000) * (h / 1000)
  const lm  = 2 * ((w / 1000) + (h / 1000))
  return {
    sm, lm, qty,
    glassTotal:    sm * rates.glass * qty,
    puttyTotal:    unit.putty    ? lm * rates.putty    * qty : 0,
    beadTotal:     lm * rates.bead * (BEAD_MULT[unit.bead] || 0) * qty,
    siliconeTotal: unit.silicone ? lm * rates.silicone * qty : 0,
  }
}

function calcJobTotal(job, rates) {
  const uCalcs  = job.units.map(u => calcUnit(u, rates))
  const glass    = uCalcs.reduce((s, c) => s + c.glassTotal,    0)
  const putty    = uCalcs.reduce((s, c) => s + c.puttyTotal,    0)
  const bead     = uCalcs.reduce((s, c) => s + c.beadTotal,     0)
  const silicone = uCalcs.reduce((s, c) => s + c.siliconeTotal, 0)
  const ex = job.extras
  const scaff     = (parseFloat(ex.scaffoldSM)    || 0) * rates.scaffolding
  const insp      = (parseFloat(ex.inspections)   || 0) * rates.inspection
  const craft     = (parseFloat(ex.craftspersons) || 0) * rates.craftsperson
  const scafflder = (parseFloat(ex.scaffolders)   || 0) * rates.scaffolder
  const extraS    = (parseFloat(ex.extraScaffDays)|| 0) * rates.extraScaff
  return { glass, putty, bead, silicone, scaff, insp, craft, scafflder, extraS,
    total: glass + putty + bead + silicone + scaff + insp + craft + scafflder + extraS, uCalcs }
}

function buildCSV(jobs, rates) {
  const today = new Date()
  const due   = new Date(today); due.setDate(due.getDate() + 30)
  const inv   = csvDate(today)
  const dueD  = csvDate(due)
  const headers = ['ContactName','InvoiceNumber','Reference','InvoiceDate','DueDate',
                   'Description','Quantity','UnitAmount','AccountCode','TaxType','Currency']
  const rows = [headers]
  const r = (job, desc, qty, amt) =>
    [job.customer || 'Customer', job.jobNum || job.id.slice(0,8), job.address,
     inv, dueD, desc, qty, amt.toFixed(2), '200', '20% (VAT on Income)', 'GBP']

  jobs.forEach(job => {
    const { uCalcs } = calcJobTotal(job, rates)
    job.units.forEach((unit, i) => {
      const c = uCalcs[i]
      if (!c || c.sm === 0) return
      const w = parseFloat(unit.width) || 0, h = parseFloat(unit.height) || 0
      rows.push(r(job, `DGU 28mm Safety Low-E Glass - ${w}x${h}mm (${c.sm.toFixed(3)}m2)`, c.qty, c.sm * rates.glass))
      if (unit.putty) rows.push(r(job, `Putty - Renew Defective (${c.lm.toFixed(2)}lm)`, c.qty, c.lm * rates.putty))
      if (unit.bead && unit.bead !== 'none') {
        const bd = unit.bead === 'both' ? 'Internal + External' : unit.bead === 'internal' ? 'Internal' : 'External'
        rows.push(r(job, `Bead - Renew Defective Glazing Bead ${bd} (${c.lm.toFixed(2)}lm${unit.bead === 'both' ? ' x2' : ''})`, c.qty, c.lm * BEAD_MULT[unit.bead] * rates.bead))
      }
      if (unit.silicone) rows.push(r(job, `Silicone Seal to Glazing Bead (${c.lm.toFixed(2)}lm)`, c.qty, c.lm * rates.silicone))
    })
    const ex = job.extras
    const sm = parseFloat(ex.scaffoldSM) || 0
    const iq = parseFloat(ex.inspections) || 0
    const cq = parseFloat(ex.craftspersons) || 0
    const sq = parseFloat(ex.scaffolders) || 0
    const ed = parseFloat(ex.extraScaffDays) || 0
    if (sm > 0) rows.push(r(job, `General Scaffolding (${sm}m2)`, 1, sm * rates.scaffolding))
    if (iq > 0) rows.push(r(job, 'Technical Inspection', iq, rates.inspection))
    if (cq > 0) rows.push(r(job, 'General Building Craftsperson', cq, rates.craftsperson))
    if (sq > 0) rows.push(r(job, 'Scaffolder', sq, rates.scaffolder))
    if (ed > 0) rows.push(r(job, 'Scaffolding - Additional Contractor Charge', ed, rates.extraScaff))
  })
  return rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
}

// ─── Unit Card ───────────────────────────────────────────────────────────────

function UnitCard({ unit, idx, onUpdate, onRemove, canRemove, rates }) {
  const c = calcUnit(unit, rates)
  const unitTotal = c.glassTotal + c.puttyTotal + c.beadTotal + c.siliconeTotal
  const bead = unit.bead || 'none'
  const cycleNext = () => onUpdate(unit.id, 'bead', BEAD_CYCLE[(BEAD_CYCLE.indexOf(bead) + 1) % BEAD_CYCLE.length])

  return (
    <div className="card uc">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="micro-label">UNIT {idx + 1}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {c.sm > 0 && <span style={{ fontSize: 11, color: '#8892a4' }}>{c.sm.toFixed(3)}m² · {c.lm.toFixed(2)}lm</span>}
          {canRemove && <button className="btn btn-danger" onClick={() => onRemove(unit.id)}>×</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 72px', gap: 8, marginBottom: 12 }}>
        <div><div className="micro-label">WIDTH mm</div><input type="number" placeholder="1200" value={unit.width} onChange={e => onUpdate(unit.id, 'width', e.target.value)} /></div>
        <div><div className="micro-label">HEIGHT mm</div><input type="number" placeholder="900" value={unit.height} onChange={e => onUpdate(unit.id, 'height', e.target.value)} /></div>
        <div><div className="micro-label">QTY</div><input type="number" placeholder="1" min="1" value={unit.qty} onChange={e => onUpdate(unit.id, 'qty', e.target.value)} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, background: unit.putty ? '#e8a02010' : '#1c1f2b', border: `1px solid ${unit.putty ? '#e8a02044' : '#2e3347'}`, borderRadius: 6, padding: 10, cursor: 'pointer', transition: 'all .15s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, letterSpacing: 1, color: unit.putty ? '#e8a020' : '#4a5568', fontWeight: 600 }}>PUTTY</span>
            <input type="checkbox" checked={unit.putty} onChange={e => onUpdate(unit.id, 'putty', e.target.checked)} />
          </div>
          <span style={{ fontSize: 10, color: '#4a5568' }}>{fmt(rates.putty)}/lm</span>
        </label>

        <div onClick={cycleNext} style={{ display: 'flex', flexDirection: 'column', gap: 5, background: BEAD_BG[bead], border: `1px solid ${BEAD_BORDER[bead]}`, borderRadius: 6, padding: 10, cursor: 'pointer', transition: 'all .15s', userSelect: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, letterSpacing: 1, color: BEAD_COLOR[bead], fontWeight: 600 }}>BEAD</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: BEAD_COLOR[bead], border: `1px solid ${BEAD_BORDER[bead]}`, borderRadius: 3, padding: '1px 5px' }}>{BEAD_LABEL[bead]}</span>
          </div>
          <span style={{ fontSize: 10, color: '#4a5568' }}>{bead === 'both' ? fmt(rates.bead * 2) : fmt(rates.bead)}/lm</span>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, background: unit.silicone ? '#e8a02010' : '#1c1f2b', border: `1px solid ${unit.silicone ? '#e8a02044' : '#2e3347'}`, borderRadius: 6, padding: 10, cursor: 'pointer', transition: 'all .15s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, letterSpacing: 1, color: unit.silicone ? '#e8a020' : '#4a5568', fontWeight: 600 }}>SILICONE</span>
            <input type="checkbox" checked={unit.silicone} onChange={e => onUpdate(unit.id, 'silicone', e.target.checked)} />
          </div>
          <span style={{ fontSize: 10, color: '#4a5568' }}>{fmt(rates.silicone)}/lm</span>
        </label>
      </div>

      {unitTotal > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #2e3347', display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 13, color: '#e8a020', fontWeight: 500 }}>
            {unit.qty > 1 && <span style={{ color: '#4a5568', marginRight: 8, fontSize: 11 }}>{unit.qty}× </span>}
            {fmt(unitTotal)}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [jobs, setJobs]                 = useState([])
  const [activeId, setActiveId]         = useState(null)
  const [rates, setRates]               = useState(DEFAULT_RATES)
  const [showSettings, setShowSettings] = useState(false)
  const [draftRates, setDraftRates]     = useState(DEFAULT_RATES)
  const [loaded, setLoaded]             = useState(false)
  const [syncStatus, setSyncStatus]     = useState('connecting') // connecting | synced | saving | error
  const saveTimer    = useRef(null)
  const jobListRef   = useRef(null)
  const ignoreSave   = useRef(false) // prevent re-saving remote updates

  // ── Load initial data from Supabase ──
  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase
          .from('glazing_store')
          .select('data')
          .eq('id', STORE_ID)
          .single()

        if (error && error.code !== 'PGRST116') throw error

        const stored = data?.data
        if (stored && stored.jobs && stored.jobs.length > 0) {
          setJobs(stored.jobs)
          setActiveId(stored.activeId || stored.jobs[0].id)
          if (stored.rates) setRates(stored.rates)
        } else {
          const j = newJob()
          setJobs([j])
          setActiveId(j.id)
        }
        setSyncStatus('synced')
      } catch (err) {
        console.error('Load error:', err)
        const j = newJob()
        setJobs([j])
        setActiveId(j.id)
        setSyncStatus('error')
      }
      setLoaded(true)
    }
    init()
  }, [])

  // ── Real-time subscription ──
  useEffect(() => {
    const channel = supabase
      .channel('glazing-sync')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'glazing_store',
        filter: `id=eq.${STORE_ID}`,
      }, (payload) => {
        const incoming = payload.new?.data
        if (!incoming || incoming._deviceId === DEVICE_ID) return // ignore our own saves
        ignoreSave.current = true
        if (incoming.jobs)  setJobs(incoming.jobs)
        if (incoming.rates) setRates(incoming.rates)
        setSyncStatus('synced')
        setTimeout(() => { ignoreSave.current = false }, 200)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Save to Supabase whenever state changes ──
  const persist = useCallback((nextJobs, nextActiveId, nextRates) => {
    if (!loaded || ignoreSave.current) return
    setSyncStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await supabase.from('glazing_store').upsert({
          id: STORE_ID,
          data: { jobs: nextJobs, activeId: nextActiveId, rates: nextRates, _deviceId: DEVICE_ID },
          updated_at: new Date().toISOString(),
        })
        setSyncStatus('synced')
      } catch (err) {
        console.error('Save error:', err)
        setSyncStatus('error')
      }
    }, 800)
  }, [loaded])

  useEffect(() => {
    if (!loaded) return
    persist(jobs, activeId, rates)
  }, [jobs, activeId, rates, loaded, persist])

  // ── Job mutations ──
  const addJob = () => {
    const j = newJob()
    setJobs(prev => [...prev, j])
    setActiveId(j.id)
    setTimeout(() => jobListRef.current?.scrollTo({ left: 99999, behavior: 'smooth' }), 50)
  }

  const updateJob = useCallback((jobId, field, value) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, [field]: value } : j))
  }, [])

  const updateExtras = useCallback((jobId, field, value) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, extras: { ...j.extras, [field]: value } } : j))
  }, [])

  const addUnit = useCallback((jobId) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, units: [...j.units, newUnit()] } : j))
  }, [])

  const removeUnit = useCallback((jobId, unitId) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, units: j.units.filter(u => u.id !== unitId) } : j))
  }, [])

  const updateUnit = useCallback((jobId, unitId, field, value) => {
    setJobs(prev => prev.map(j => j.id === jobId
      ? { ...j, units: j.units.map(u => u.id === unitId ? { ...u, [field]: value } : u) }
      : j))
  }, [])

  const deleteJob = (id) => {
    if (!window.confirm('Delete this job?')) return
    setJobs(prev => {
      const next = prev.filter(j => j.id !== id)
      const fallback = next.length ? next : [newJob()]
      setActiveId(fallback[fallback.length - 1].id)
      return fallback
    })
  }

  // ── Active job ──
  const activeJob = jobs.find(j => j.id === activeId) || jobs[0]
  const calc      = activeJob ? calcJobTotal(activeJob, rates) : null

  // ── CSV exports ──
  const today        = new Date()
  const singleCSVHref = useMemo(() => {
    if (!activeJob) return '#'
    return `data:text/csv;base64,${btoa(unescape(encodeURIComponent(buildCSV([activeJob], rates))))}`
  }, [activeJob, rates])
  const bulkCSVHref = useMemo(() => {
    if (!jobs.length) return '#'
    return `data:text/csv;base64,${btoa(unescape(encodeURIComponent(buildCSV(jobs, rates))))}`
  }, [jobs, rates])
  const singleFilename = `Invoice_${activeJob?.jobNum || 'draft'}_${today.toISOString().slice(0,10)}.csv`
  const bulkFilename   = `HDL_Invoices_${today.toISOString().slice(0,10)}.csv`

  const syncLabel = { connecting: '● CONNECTING', saving: '● SAVING…', synced: '● SYNCED', error: '⚠ SYNC ERROR' }
  const syncColor = { connecting: '#4a5568', saving: '#e8a02088', synced: '#1e5c3a', error: '#c0392b' }

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontFamily: "'DM Mono',monospace", color: '#e8a020', fontSize: 14, letterSpacing: 2 }}>GLAZING CALC</div>
        <div style={{ fontFamily: "'DM Mono',monospace", color: '#4a5568', fontSize: 11, letterSpacing: 2 }}>LOADING…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: '#e8e0d0', fontFamily: "'DM Mono','Courier New',monospace", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        input[type=number],input[type=text]{background:#1c1f2b;border:1px solid #2e3347;color:#e8e0d0;font-family:'DM Mono',monospace;border-radius:4px;padding:8px 10px;font-size:13px;width:100%;outline:none;transition:border-color .15s;}
        input:focus{border-color:#e8a020;}
        input[type=checkbox]{accent-color:#e8a020;width:16px;height:16px;cursor:pointer;}
        .btn{background:transparent;border:1px solid #2e3347;color:#e8e0d0;font-family:'DM Mono',monospace;font-size:12px;padding:8px 14px;border-radius:4px;cursor:pointer;transition:all .15s;letter-spacing:.5px;}
        .btn:hover{border-color:#e8a020;color:#e8a020;}
        .btn-primary{background:#e8a020;border-color:#e8a020;color:#0f1117;font-weight:500;}
        .btn-primary:hover{background:#f0b030;border-color:#f0b030;color:#0f1117;}
        .btn-danger{border-color:#c0392b33;color:#c0392b66;font-size:16px;padding:4px 9px;}
        .btn-danger:hover{border-color:#c0392b;color:#c0392b;}
        .card{background:#161921;border:1px solid #2e3347;border-radius:8px;padding:18px;margin-bottom:10px;}
        .divider{border:none;border-top:1px solid #2e3347;margin:14px 0;}
        .sum-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;}
        .lbl{color:#8892a4;} .val{color:#e8e0d0;font-weight:500;}
        .micro-label{font-size:10px;color:#4a5568;letter-spacing:1.5px;margin-bottom:4px;display:block;}
        .sh{font-family:'Bebas Neue';font-size:17px;letter-spacing:1.5px;}
        .grand{font-family:'Bebas Neue',sans-serif;font-size:44px;color:#e8a020;line-height:1;}
        .overlay{position:fixed;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;}
        .modal{background:#161921;border:1px solid #2e3347;border-radius:12px;padding:24px;width:100%;max-width:460px;max-height:88vh;overflow-y:auto;}
        .rr{display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;margin-bottom:12px;}
        .rl{font-size:12px;color:#8892a4;} .ri{width:100px;}
        .export-link{display:block;padding:13px;font-family:'DM Mono',monospace;font-size:12px;font-weight:500;letter-spacing:1.5px;border-radius:4px;text-align:center;text-decoration:none;transition:all .15s;}
        .export-single{background:#0d2b1e;border:1px solid #1e5c3a;color:#4ade80;}
        .export-single:hover{background:#1e5c3a;}
        .export-bulk{background:#1a1a2e;border:1px solid #3a3a6e;color:#818cf8;}
        .export-bulk:hover{background:#2a2a4e;}
        @keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .uc{animation:fi .18s ease;}
        .job-strip{display:flex;gap:8px;overflow-x:auto;padding:12px 16px;border-bottom:1px solid #1e2130;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
        .job-strip::-webkit-scrollbar{display:none;}
        .job-pill{flex-shrink:0;background:#161921;border:1px solid #2e3347;border-radius:6px;padding:10px 12px;cursor:pointer;transition:all .15s;min-width:110px;max-width:150px;}
        .job-pill.active{border-color:#e8a020;background:#e8a02008;}
        .job-pill-ref{font-size:11px;font-weight:500;color:#e8e0d0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .job-pill-total{font-size:10px;color:#4a5568;margin-top:3px;}
        .job-pill.active .job-pill-ref{color:#e8a020;}
        .job-pill.active .job-pill-total{color:#8892a4;}
        .add-job-btn{flex-shrink:0;background:transparent;border:1px dashed #2e3347;border-radius:6px;padding:10px 16px;cursor:pointer;color:#4a5568;font-family:'DM Mono',monospace;font-size:20px;transition:all .15s;display:flex;align-items:center;justify-content:center;}
        .add-job-btn:hover{border-color:#e8a020;color:#e8a020;}
      `}</style>

      {/* Header */}
      <div style={{ background: '#161921', borderBottom: '1px solid #1e2130', padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2, color: '#e8a020', lineHeight: 1 }}>GLAZING CALC</div>
            <div style={{ fontSize: 10, color: '#2e3347', letterSpacing: 2, marginTop: 2 }}>HARDCORE DOORS LTD</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: syncColor[syncStatus], letterSpacing: 1 }}>{syncLabel[syncStatus]}</span>
            <button className="btn" onClick={() => { setDraftRates({ ...rates }); setShowSettings(true) }} style={{ fontSize: 11 }}>⚙ RATES</button>
          </div>
        </div>
      </div>

      {/* Job strip */}
      <div ref={jobListRef} className="job-strip">
        {jobs.map(job => {
          const tot = calcJobTotal(job, rates).total
          return (
            <div key={job.id} className={`job-pill ${job.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(job.id)}>
              <div className="job-pill-ref">{job.address || job.jobNum || <span style={{ color: '#4a5568', fontStyle: 'italic' }}>No address</span>}</div>
              <div className="job-pill-total">{tot > 0 ? fmt(tot) : '—'}</div>
            </div>
          )
        })}
        <button className="add-job-btn" onClick={addJob}>+</button>
      </div>

      {/* Active job */}
      {activeJob && calc && (
        <div style={{ padding: '14px 16px' }}>

          {/* Job details */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="sh">JOB DETAILS</span>
              {jobs.length > 1 && (
                <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={() => deleteJob(activeJob.id)}>DELETE JOB</button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <span className="micro-label">CUSTOMER</span>
                <input type="text" value={activeJob.customer} onChange={e => updateJob(activeJob.id, 'customer', e.target.value)} />
              </div>
              <div>
                <span className="micro-label">JOB NO. / REF</span>
                <input type="text" placeholder="HDL-042" value={activeJob.jobNum} onChange={e => updateJob(activeJob.id, 'jobNum', e.target.value)} />
              </div>
            </div>
            <div>
              <span className="micro-label">ADDRESS</span>
              <input type="text" value={activeJob.address} onChange={e => updateJob(activeJob.id, 'address', e.target.value)} />
            </div>
          </div>

          {/* Glass units */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 10px' }}>
            <span className="sh">GLASS UNITS <span style={{ fontSize: 11, color: '#4a5568', fontFamily: "'DM Mono'" }}>mm</span></span>
            <button className="btn btn-primary" onClick={() => addUnit(activeJob.id)} style={{ fontSize: 11, padding: '6px 14px' }}>+ ADD UNIT</button>
          </div>

          {activeJob.units.map((unit, idx) => (
            <UnitCard
              key={unit.id}
              unit={unit}
              idx={idx}
              canRemove={activeJob.units.length > 1}
              rates={rates}
              onUpdate={(uid, field, val) => updateUnit(activeJob.id, uid, field, val)}
              onRemove={(uid) => removeUnit(activeJob.id, uid)}
            />
          ))}

          {/* Extras */}
          <div className="sh" style={{ margin: '16px 0 10px' }}>EXTRAS</div>

          <div className="card">
            <div style={{ fontSize: 11, color: '#e8a020', letterSpacing: 1, marginBottom: 12 }}>SCAFFOLDING</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <span className="micro-label">AREA (m²)</span>
                <input type="number" placeholder="0" value={activeJob.extras.scaffoldSM} onChange={e => updateExtras(activeJob.id, 'scaffoldSM', e.target.value)} />
                <div style={{ fontSize: 10, color: '#4a5568', marginTop: 4 }}>{fmt(rates.scaffolding)}/m²</div>
              </div>
              <div>
                <span className="micro-label">EXTRA CONTR. DAYS</span>
                <input type="number" placeholder="0" value={activeJob.extras.extraScaffDays} onChange={e => updateExtras(activeJob.id, 'extraScaffDays', e.target.value)} />
                <div style={{ fontSize: 10, color: '#4a5568', marginTop: 4 }}>{fmt(rates.extraScaff)}/day</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: 11, color: '#e8a020', letterSpacing: 1, marginBottom: 12 }}>LABOUR</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[{ k: 'inspections', l: 'INSPECTIONS', r: rates.inspection }, { k: 'craftspersons', l: 'CRAFTSPERSON', r: rates.craftsperson }, { k: 'scaffolders', l: 'SCAFFOLDER', r: rates.scaffolder }].map(({ k, l, r }) => (
                <div key={k}>
                  <span className="micro-label">{l}</span>
                  <input type="number" placeholder="0" min="0" value={activeJob.extras[k]} onChange={e => updateExtras(activeJob.id, k, e.target.value)} />
                  <div style={{ fontSize: 10, color: '#4a5568', marginTop: 4 }}>{fmt(r)}/no.</div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="sh" style={{ margin: '16px 0 10px' }}>SUMMARY</div>

          <div className="card">
            {calc.glass    > 0 && <div className="sum-row"><span className="lbl">Glass (DGU 28mm Safety Low-E)</span><span className="val">{fmt(calc.glass)}</span></div>}
            {calc.putty    > 0 && <div className="sum-row"><span className="lbl">Putty — Renew Defective</span><span className="val">{fmt(calc.putty)}</span></div>}
            {calc.bead     > 0 && <div className="sum-row"><span className="lbl">Bead — Renew Defective</span><span className="val">{fmt(calc.bead)}</span></div>}
            {calc.silicone > 0 && <div className="sum-row"><span className="lbl">Silicone Seal to Bead</span><span className="val">{fmt(calc.silicone)}</span></div>}
            {calc.scaff    > 0 && <div className="sum-row"><span className="lbl">General Scaffolding</span><span className="val">{fmt(calc.scaff)}</span></div>}
            {calc.insp     > 0 && <div className="sum-row"><span className="lbl">Technical Inspections</span><span className="val">{fmt(calc.insp)}</span></div>}
            {calc.craft    > 0 && <div className="sum-row"><span className="lbl">General Building Craftsperson</span><span className="val">{fmt(calc.craft)}</span></div>}
            {calc.scafflder> 0 && <div className="sum-row"><span className="lbl">Scaffolder</span><span className="val">{fmt(calc.scafflder)}</span></div>}
            {calc.extraS   > 0 && <div className="sum-row"><span className="lbl">Additional Scaffolding Contractor</span><span className="val">{fmt(calc.extraS)}</span></div>}
            <hr className="divider" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: 2, marginBottom: 4 }}>THIS JOB</div>
                <div className="grand">{fmt(calc.total)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#e8e0d0' }}>{activeJob.customer}</div>
                {activeJob.address && <div style={{ fontSize: 10, color: '#4a5568' }}>{activeJob.address}</div>}
                {activeJob.jobNum  && <div style={{ fontSize: 10, color: '#4a5568', marginTop: 2 }}>Ref: {activeJob.jobNum}</div>}
              </div>
            </div>
            <a className="export-link export-single" href={singleCSVHref} download={singleFilename}>↓ EXPORT THIS JOB → XERO</a>
          </div>

          {jobs.length > 1 && (
            <div className="card" style={{ marginTop: 10, border: '1px solid #3a3a6e' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#4a5568', letterSpacing: 2, marginBottom: 4 }}>ALL {jobs.length} JOBS</div>
                  <div style={{ fontFamily: "'Bebas Neue'", fontSize: 36, color: '#818cf8', lineHeight: 1 }}>
                    {fmt(jobs.reduce((s, j) => s + calcJobTotal(j, rates).total, 0))}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {jobs.map(j => (
                    <div key={j.id} style={{ marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: '#4a5568' }}>{j.jobNum || '—'}</span>
                      <span style={{ fontSize: 10, color: '#3a3a6e', marginLeft: 8 }}>{fmt(calcJobTotal(j, rates).total)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <a className="export-link export-bulk" href={bulkCSVHref} download={bulkFilename}>↓ BULK EXPORT ALL JOBS → XERO</a>
              <div style={{ fontSize: 10, color: '#3a3a6e', marginTop: 8, textAlign: 'center' }}>
                {jobs.length} invoices · Xero → Accounting → Invoices → Import
              </div>
            </div>
          )}
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 22, letterSpacing: 1.5 }}>RATE SETTINGS</div>
              <button className="btn btn-danger" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div style={{ fontSize: 11, color: '#e8a020', letterSpacing: 1, marginBottom: 10 }}>GLAZING</div>
            <div className="rr">
              <div><div className="rl">DGU 28mm Safety Low-E Glass</div><div style={{ fontSize: 10, color: '#2e3347' }}>per m²</div></div>
              <input className="ri" type="number" step="0.01" value={draftRates.glass} onChange={e => setDraftRates(r => ({ ...r, glass: parseFloat(e.target.value) || 0 }))} />
            </div>
            <hr className="divider" />
            <div style={{ fontSize: 11, color: '#e8a020', letterSpacing: 1, marginBottom: 10 }}>SUNDRIES (per lm)</div>
            {[{ k: 'putty', l: 'Putty — Renew Defective' }, { k: 'bead', l: 'Bead — Renew Defective' }, { k: 'silicone', l: 'Silicone Seal to Glazing Bead' }].map(({ k, l }) => (
              <div key={k} className="rr">
                <div className="rl">{l}</div>
                <input className="ri" type="number" step="0.01" value={draftRates[k]} onChange={e => setDraftRates(r => ({ ...r, [k]: parseFloat(e.target.value) || 0 }))} />
              </div>
            ))}
            <hr className="divider" />
            <div style={{ fontSize: 11, color: '#e8a020', letterSpacing: 1, marginBottom: 10 }}>SCAFFOLDING</div>
            {[{ k: 'scaffolding', l: 'General Scaffolding', s: 'per m²' }, { k: 'extraScaff', l: 'Additional Scaffolding Contractor', s: 'per day' }].map(({ k, l, s }) => (
              <div key={k} className="rr">
                <div><div className="rl">{l}</div><div style={{ fontSize: 10, color: '#2e3347' }}>{s}</div></div>
                <input className="ri" type="number" step="0.01" value={draftRates[k]} onChange={e => setDraftRates(r => ({ ...r, [k]: parseFloat(e.target.value) || 0 }))} />
              </div>
            ))}
            <hr className="divider" />
            <div style={{ fontSize: 11, color: '#e8a020', letterSpacing: 1, marginBottom: 10 }}>LABOUR (per no.)</div>
            {[{ k: 'inspection', l: 'Technical Inspection' }, { k: 'craftsperson', l: 'General Building Craftsperson' }, { k: 'scaffolder', l: 'Scaffolder' }].map(({ k, l }) => (
              <div key={k} className="rr">
                <div className="rl">{l}</div>
                <input className="ri" type="number" step="0.01" value={draftRates[k]} onChange={e => setDraftRates(r => ({ ...r, [k]: parseFloat(e.target.value) || 0 }))} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn" onClick={() => setDraftRates(DEFAULT_RATES)} style={{ flex: 1 }}>RESET</button>
              <button className="btn btn-primary" onClick={() => { setRates(draftRates); setShowSettings(false) }} style={{ flex: 2 }}>SAVE RATES</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
