import { useCallback, useEffect, useMemo, useState } from 'react'

type Page = 'dashboard' | 'importar' | 'resultados' | 'simulacao' | 'validadores'
type Validator = { id?: string; codigo: string; nome?: string; descricao?: string; ativo: boolean; parametros: Record<string, any> }
type Note = { id: string; numero_nota?: string; sacado?: string; cnpj_sacado?: string; cedente?: string; tipo_recebivel?: string; valor_nominal: number; data_vencimento?: string; prazo_dias?: number; status: 'aprovada' | 'recusada' | 'pendente'; regras?: { validador_id: string; nome: string; aprovada: boolean; motivo?: string | null }[] }
type Analysis = { lote_id: string; ficheiro: string; criado_em: string; resumo: { total_notas: number; aprovadas: number; recusadas: number; pendentes: number; valor_nominal_total: number; valor_nominal_aprovado: number; valor_liquido_estimado: number | null }; notas: Note[] }
type Simulation = { lote_id: string; valor_nominal: number; desconto: number; valor_liquido: number; taxa_mensal?: number | null; prazo_medio_dias?: number | null }

const API_BASE = (import.meta.env.VITE_ANTECIPE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const defaultConfig = { validadores: [
  { codigo: 'CNPJ_SACADO_VALIDO', ativo: true, parametros: {} },
  { codigo: 'SITUACAO_CADASTRAL_SACADO', ativo: true, parametros: { situacoes_aceitas: ['ATIVA'] } },
  { codigo: 'TIPO_RECEBIVEL', ativo: true, parametros: { tipos_aceitos: ['Duplicata', 'Duplicata de Serviço'] } },
  { codigo: 'VALOR_MINIMO', ativo: true, parametros: { valor_minimo: 100 } },
  { codigo: 'NAO_VENCIDA', ativo: true, parametros: {} },
  { codigo: 'PRAZO_MAXIMO', ativo: true, parametros: { prazo_maximo_dias: 180 } },
  { codigo: 'CONCENTRACAO_MAXIMA_SACADO', ativo: true, parametros: { percentual_maximo: 10 } },
  { codigo: 'PRAZO_MINIMO', ativo: false, parametros: { prazo_minimo_dias: 30 } },
  { codigo: 'CONCENTRACAO_MAXIMA_CEDENTE', ativo: false, parametros: { percentual_maximo: 8 } },
] }
const ruleInfo: Record<string, [string, string]> = {
  CNPJ_SACADO_VALIDO: ['CNPJ válido', 'Verifica o formato do documento do sacado.'],
  SITUACAO_CADASTRAL_SACADO: ['Situação cadastral', 'Define as situações cadastrais aceitas.'],
  TIPO_RECEBIVEL: ['Tipos de recebível', 'Tipos de documentos aceitos pelo fundo.'],
  VALOR_MINIMO: ['Valor mínimo', 'Menor valor nominal aceito por nota.'],
  NAO_VENCIDA: ['Nota não vencida', 'Recusa títulos vencidos.'],
  PRAZO_MAXIMO: ['Prazo máximo', 'Limite de dias até o vencimento.'],
  CONCENTRACAO_MAXIMA_SACADO: ['Concentração por sacado', 'Limita exposição ao mesmo pagador.'],
  PRAZO_MINIMO: ['Prazo mínimo', 'Prazo mínimo até o vencimento.'],
  CONCENTRACAO_MAXIMA_CEDENTE: ['Concentração por cedente', 'Limita exposição à mesma empresa cedente.'],
}
const nav: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Visão geral', icon: 'grid' }, { id: 'importar', label: 'Importar CSV', icon: 'upload' },
  { id: 'resultados', label: 'Resultados', icon: 'list' }, { id: 'simulacao', label: 'Simulação', icon: 'sparkles' }, { id: 'validadores', label: 'Validadores', icon: 'shield' },
]
const money = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dateLabel = (value?: string) => { if (!value) return '—'; const d = new Date(`${value.slice(0, 10)}T12:00:00`); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('pt-BR') }
const statusLabel = (s: Note['status']) => s === 'aprovada' ? 'Elegível' : s === 'recusada' ? 'Recusada' : 'Em análise'

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
    sparkles: <path d="m12 3-1.2 3.1a7 7 0 0 1-4 4L4 11l2.8 1a7 7 0 0 1 4 4L12 19l1.2-3a7 7 0 0 1 4-4L20 11l-2.8-.9a7 7 0 0 1-4-4L12 3Z"/>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>, arrow: <path d="m9 18 6-6-6-6"/>, plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
    check: <path d="m5 12 4 4L19 6"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>, moon: <path d="M21 15.2A9 9 0 1 1 8.8 3 7 7 0 0 0 21 15.2Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.info}</svg>
}
function DemoBadge() { return <span className="demo-badge">Backend</span> }
function ErrorNotice({ children }: { children: React.ReactNode }) { return <div className="upload-error"><Icon name="info"/><span>{children}</span></div> }

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [menu, setMenu] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('antecipe-theme') === 'dark')
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [activeId, setActiveId] = useState('')
  const [validators, setValidators] = useState<Validator[]>(() => {
    try { const saved = localStorage.getItem('antecipe-validator-config'); if (saved) return JSON.parse(saved).validadores }
    catch { /* configuração local inválida: usa padrão */ }
    return defaultConfig.validadores
  })
  const [apiError, setApiError] = useState('')
  const [apiOnline, setApiOnline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [simulationError, setSimulationError] = useState('')

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${API_BASE}${path}`, init)
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let message = text || `Erro HTTP ${response.status}`
      try { message = JSON.parse(text).detail || message } catch { /* mantém mensagem original */ }
      throw new Error(message)
    }
    return response.json()
  }, [])
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [health, summaries] = await Promise.all([request('/saude'), request('/analises')])
      setApiOnline(health.status === 'ok')
      // GET /analises devolve resumos; buscamos cada lote para obter as notas detalhadas.
      const list = await Promise.all((summaries as { lote_id: string }[]).map(item => request(`/analises/${encodeURIComponent(item.lote_id)}`))) as Analysis[]
      setAnalyses(list)
      setApiError('')
      setActiveId(current => list.some((a: Analysis) => a.lote_id === current) ? current : list[0]?.lote_id || '')
    } catch (e) {
      setApiOnline(false)
      setApiError(e instanceof Error ? e.message : 'Não foi possível contactar a API.')
    } finally { setLoading(false) }
  }, [request])
  useEffect(() => { void refresh() }, [refresh])
  const active = useMemo(() => analyses.find(a => a.lote_id === activeId) || analyses[0], [analyses, activeId])
  const allNotes = useMemo(() => analyses.flatMap(a => a.notas || []), [analyses])
  const total = analyses.reduce((n, a) => n + (a.resumo?.total_notas || 0), 0)
  const approved = analyses.reduce((n, a) => n + (a.resumo?.aprovadas || 0), 0)
  const refused = analyses.reduce((n, a) => n + (a.resumo?.recusadas || 0), 0)
  const eligibleValue = analyses.reduce((n, a) => n + (a.resumo?.valor_nominal_aprovado || 0), 0)
  const toggleTheme = () => setDark(v => { localStorage.setItem('antecipe-theme', v ? 'light' : 'dark'); return !v })

  const analyzeFile = async (file: File) => {
    const configFile = new File([JSON.stringify({ validadores: validators.map(v => ({ codigo: v.codigo, ativo: v.ativo, parametros: v.parametros || {} })) })], 'validadores.json', { type: 'application/json' })
    const body = new FormData(); body.append('file', file); body.append('validadores', configFile)
    const analysis = await request('/analises', { method: 'POST', body }) as Analysis
    setAnalyses(prev => [analysis, ...prev.filter(a => a.lote_id !== analysis.lote_id)])
    setActiveId(analysis.lote_id); setApiError(''); setPage('resultados')
  }
  const runSimulation = async (id: string) => {
    setSimulation(null); setSimulationError('')
    try { setSimulation(await request('/simulacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lote_id: id }) })) }
    catch (e) { setSimulationError(e instanceof Error ? e.message : 'Não foi possível simular.') }
  }
  const updateRule = (index: number, patch: Partial<Validator>) => setValidators(current => current.map((v, i) => i === index ? { ...v, ...patch } : v))
  const updateParam = (index: number, key: string, value: any) => setValidators(current => current.map((v, i) => i === index ? { ...v, parametros: { ...v.parametros, [key]: value } } : v))
  const saveValidators = () => { localStorage.setItem('antecipe-validator-config', JSON.stringify({ validadores: validators })); setApiError(''); window.alert('Configuração salva neste navegador. Ela será enviada ao backend na próxima análise.') }
  const exportValidators = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ validadores: validators }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'validadores_antecipe.json'; a.click(); URL.revokeObjectURL(url) }
  const current = nav.find(n => n.id === page)!

  return <div className={`app-shell ${dark ? 'dark' : ''}`}>
    <aside className={`sidebar ${menu ? 'open' : ''}`}><div className="brand"><span className="brand-mark">A</span><strong>antecipe</strong><button className="mobile-close" onClick={() => setMenu(false)}><Icon name="close"/></button></div>
      <nav>{nav.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => { setPage(item.id); setMenu(false) }}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-bottom"><button className="theme-toggle" onClick={toggleTheme}><span><Icon name={dark ? 'sun' : 'moon'} size={18}/>{dark ? 'Modo claro' : 'Modo escuro'}</span><i className={dark ? 'on' : ''}><b/></i></button><div className="demo-card"><DemoBadge/><strong>{apiOnline ? 'API conectada' : 'API desconectada'}</strong><p>{apiOnline ? 'Dados carregados do backend.' : 'Verifique se o servidor Python está ativo.'}</p></div><div className="profile"><span>AN</span><div><strong>Portal Antecipe</strong><small>Gestão de recebíveis</small></div><Icon name="arrow" size={16}/></div></div>
    </aside>
    {menu && <button className="overlay" onClick={() => setMenu(false)} aria-label="Fechar menu"/>}
    <main><div className="mobile-header"><button onClick={() => setMenu(true)} aria-label="Abrir menu"><Icon name="menu"/></button><div className="brand"><span className="brand-mark">A</span><strong>antecipe</strong></div><button className="mobile-theme" onClick={toggleTheme} aria-label="Alternar tema"><Icon name={dark ? 'sun' : 'moon'} size={19}/></button></div>
      <div className="demo-strip"><Icon name="info" size={16}/><span>{apiOnline ? `Conectado à API Python · ${API_BASE}` : 'Aguardando conexão com a API Python.'}</span><button className="text-btn" onClick={() => void refresh()}>Atualizar</button></div>
      {apiError && <div className="global-error"><ErrorNotice>Não foi possível conectar à API ({API_BASE}). {apiError}. Confirme se o backend está rodando.</ErrorNotice></div>}
      <div className="page">
        {page === 'dashboard' && <>
          <header className="page-header"><div><span className="eyebrow">Visão geral</span><h1>Seu portal Antecipe.</h1><p>Acompanhe as análises de recebíveis processadas pela API.</p></div><button className="primary-btn" onClick={() => setPage('importar')}><Icon name="plus" size={18}/>Nova análise</button></header>
          <section className="metrics-grid"><article className="metric featured"><span>Valor elegível</span><strong>{money(eligibleValue)}</strong><div className="metric-foot"><span>Dados reais</span><span>da API</span></div></article><article className="metric"><span>Notas analisadas</span><strong>{total}</strong><div className="metric-foot"><span>{approved} elegíveis</span><span className="dot">·</span><span>{total ? Math.round(approved / total * 100) : 0}% aprovação</span></div></article><article className="metric"><span>Em análise</span><strong>{analyses.reduce((n,a)=>n+(a.resumo?.pendentes||0),0)}</strong><div className="metric-foot"><span>Todos os lotes</span></div></article><article className="metric"><span>Recusadas</span><strong>{refused}</strong><div className="metric-foot"><span>Todos os lotes</span></div></article></section>
          <section className="content-grid"><div className="panel activity"><div className="panel-title"><div><h2>Atividade recente</h2><p>Últimos lotes processados</p></div><button className="text-btn" onClick={() => setPage('resultados')}>Ver resultados <Icon name="arrow" size={15}/></button></div>
            {loading ? <p className="empty-state">Carregando análises…</p> : analyses.length ? <div className="note-list">{analyses.slice(0,5).map(a => <button className="note-row" key={a.lote_id} onClick={() => { setActiveId(a.lote_id); setPage('resultados') }}><span className="file-icon"><Icon name="file" size={18}/></span><span className="note-main"><strong>{a.ficheiro || a.lote_id}</strong><small>{a.lote_id}</small></span><span className="note-value">{money(a.resumo?.valor_nominal_aprovado)}</span><span className="status success">{a.resumo?.aprovadas || 0} aprovadas</span><Icon name="arrow" size={17}/></button>)}</div> : <div className="empty-state"><Icon name="file" size={24}/><strong>Nenhuma análise ainda</strong><span>Importe um CSV para ver os resultados aqui.</span><button className="primary-btn" onClick={() => setPage('importar')}>Importar CSV</button></div>}</div>
            <aside className="panel summary"><div className="panel-title"><div><h2>Resumo geral</h2><p>Todos os lotes disponíveis</p></div><DemoBadge/></div><div className="donut-wrap"><div className="donut"><span><strong>{total}</strong><small>notas</small></span></div></div><div className="legend"><div><span><i className="green"/>Elegíveis</span><strong>{approved}</strong></div><div><span><i className="amber"/>Pendentes</span><strong>{analyses.reduce((n,a)=>n+(a.resumo?.pendentes||0),0)}</strong></div><div><span><i className="red"/>Recusadas</span><strong>{refused}</strong></div></div></aside></section>
        </>}
        {page === 'importar' && <ImportPage validators={validators} onAnalyze={analyzeFile} onError={setApiError} onBack={() => setPage('dashboard')}/>}
        {page === 'resultados' && <ResultsPage analyses={analyses} activeId={active?.lote_id || ''} setActiveId={setActiveId} setPage={setPage} onDownload={async id => { try { const res = await fetch(`${API_BASE}/analises/${encodeURIComponent(id)}/resultado.json`); if (!res.ok) throw new Error('Falha ao baixar resultado.'); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`resultado_${id}.json`; a.click(); URL.revokeObjectURL(url) } catch(e) { setApiError(e instanceof Error ? e.message : 'Falha ao baixar resultado.') } }}/>} 
        {page === 'simulacao' && <SimulationPage analyses={analyses} active={active} simulation={simulation} error={simulationError} onSelect={setActiveId} onSimulate={runSimulation}/>}
        {page === 'validadores' && <ValidatorsPage validators={validators} updateRule={updateRule} updateParam={updateParam} onSave={saveValidators} onExport={exportValidators}/>}
      </div>
      <div className="mobile-nav">{nav.slice(0,4).map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><Icon name={item.icon}/><span>{item.label.split(' ')[0]}</span></button>)}</div>
    </main>
  </div>
}

function ImportPage({ validators, onAnalyze, onError, onBack }: { validators: Validator[]; onAnalyze: (file: File) => Promise<void>; onError: (s: string) => void; onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null); const [error, setError] = useState(''); const [processing, setProcessing] = useState(false)
  const required = ['NU_DOCUMENTO','NOME_SACADO','DOC_SACADO','TIPO_RECEBIVEL','VALOR_NOMINAL','DATA_VENCIMENTO_ORIGINAL']
  const selectFile = async (selected?: File) => { if (!selected) return; setError(''); if (!selected.name.toLowerCase().endsWith('.csv')) return setError('Selecione um arquivo no formato CSV.'); const line=(await selected.text()).split(/\r?\n/)[0].replace(/^\uFEFF/,''); const delimiter = line.includes(';') ? ';' : ','; const headers=line.split(delimiter).map(v=>v.trim().replace(/^"|"$/g,'').toUpperCase()); const missing=required.filter(x=>!headers.includes(x)); if(missing.length) return setError(`Colunas obrigatórias ausentes: ${missing.join(', ')}.`); setFile(selected) }
  const analyze = async () => { if (!file) return; setProcessing(true); setError(''); onError(''); try { await onAnalyze(file) } catch(e) { setError(e instanceof Error ? e.message : 'Erro ao processar o arquivo.') } finally { setProcessing(false) } }
  return <><header className="page-header"><div><span className="eyebrow">Nova análise</span><h1>Importar notas fiscais</h1><p>Envie um CSV para processar recebíveis no motor de validação Python.</p></div></header><section className={`import-card ${file?'has-file':''}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void selectFile(e.dataTransfer.files[0])}}><div className="upload-icon"><Icon name={file?'check':'upload'} size={28}/></div><h2>{file?'Arquivo pronto para análise':'Arraste seu arquivo CSV aqui'}</h2><p>{file?file.name:'ou selecione um arquivo no seu dispositivo'}</p>{file?<div className="file-actions"><button className="primary-btn" onClick={()=>void analyze()} disabled={processing}>{processing?<><span className="spinner"/>Processando…</>:'Analisar recebíveis'}</button><button className="text-btn" onClick={()=>setFile(null)}>Remover</button></div>:<label className="primary-btn file-button">Selecionar arquivo<input type="file" accept=".csv,text/csv" onChange={e=>void selectFile(e.target.files?.[0])}/></label>}<span className="file-hint">CSV · UTF-8 · Até 10 MB · {validators.filter(v=>v.ativo).length} validadores ativos</span></section>{error&&<ErrorNotice>{error}</ErrorNotice>}<section className="format-panel"><div className="format-icon"><Icon name="info"/></div><div><h3>Formato esperado</h3><p>O backend aceita separadores ; ou , e exige as colunas abaixo. As regras configuradas serão enviadas junto com o arquivo.</p><div className="code-fields">{required.map(x=><code key={x}>{x}</code>)}</div></div></section><button className="ghost-btn" onClick={onBack}>Voltar à visão geral</button></>
}

function ResultsPage({ analyses, activeId, setActiveId, setPage, onDownload }: { analyses: Analysis[]; activeId: string; setActiveId: (id:string)=>void; setPage:(p:Page)=>void; onDownload:(id:string)=>void }) {
  const [query,setQuery]=useState(''); const [filter,setFilter]=useState('Todos'); const [selected,setSelected]=useState<Note|null>(null)
  const active=analyses.find(a=>a.lote_id===activeId)||analyses[0]; const notes=active?.notas||[]
  const filtered=notes.filter(n=>`${n.numero_nota||n.id} ${n.sacado||''} ${n.cnpj_sacado||''}`.toLowerCase().includes(query.toLowerCase())&&(filter==='Todos'||statusLabel(n.status)===filter))
  return <><header className="page-header"><div><span className="eyebrow">Análise real</span><h1>Resultados</h1><p>{active?`${active.ficheiro} · ${dateLabel(active.criado_em)}`:'Nenhuma análise foi processada ainda.'}</p></div><div className="header-actions"><button className="ghost-btn" disabled={!active} onClick={()=>active&&onDownload(active.lote_id)}><Icon name="file" size={17}/>Baixar JSON</button><button className="primary-btn" onClick={()=>setPage('importar')}><Icon name="upload" size={18}/>Importar CSV</button></div></header>
    {analyses.length>1&&<div className="filterbar"><label>Selecionar lote <select value={active?.lote_id||''} onChange={e=>setActiveId(e.target.value)}>{analyses.map(a=><option key={a.lote_id} value={a.lote_id}>{a.ficheiro} · {a.lote_id}</option>)}</select></label></div>}
    {active&&<section className="metrics-grid"><article className="metric"><span>Total de notas</span><strong>{active.resumo.total_notas}</strong></article><article className="metric"><span>Aprovadas</span><strong>{active.resumo.aprovadas}</strong></article><article className="metric"><span>Recusadas</span><strong>{active.resumo.recusadas}</strong></article><article className="metric"><span>Valor elegível</span><strong>{money(active.resumo.valor_nominal_aprovado)}</strong></article></section>}
    <div className="filterbar"><label className="search"><Icon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar nota, sacado ou CNPJ"/></label>{['Todos','Elegível','Recusada','Em análise'].map(label=><button key={label} className={`filter ${filter===label?'active':''}`} onClick={()=>setFilter(label)}>{label}</button>)}</div>
    <section className="table-panel"><div className="table-head"><span>Nota fiscal</span><span>Sacado</span><span>Vencimento</span><span>Valor nominal</span><span>Estado</span><span/></div>{filtered.map(note=><button className="table-row" key={note.id} onClick={()=>setSelected(note)}><span><strong>{note.numero_nota||note.id}</strong><small>{note.cnpj_sacado||'—'}</small></span><span>{note.sacado||'—'}</span><span>{dateLabel(note.data_vencimento)}</span><span><strong>{money(note.valor_nominal)}</strong></span><span><i className={`status ${note.status==='aprovada'?'success':note.status==='recusada'?'danger':'pending'}`}>{statusLabel(note.status)}</i></span><Icon name="arrow" size={17}/></button>)}{!filtered.length&&<div className="empty-state"><Icon name="search" size={24}/><strong>{notes.length?'Nenhuma nota encontrada':'Nenhuma análise disponível'}</strong><span>{notes.length?'Ajuste a pesquisa ou os filtros.':'Importe um CSV para ver os resultados.'}</span></div>}</section>
    {selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><section className="detail-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelected(null)} aria-label="Fechar"><Icon name="close"/></button><span className="eyebrow">Detalhe da nota</span><h2>{selected.numero_nota||selected.id}</h2><span className={`status ${selected.status==='aprovada'?'success':selected.status==='recusada'?'danger':'pending'}`}>{statusLabel(selected.status)}</span><div className="detail-grid"><div><small>Sacado</small><strong>{selected.sacado||'—'}</strong></div><div><small>CNPJ</small><strong>{selected.cnpj_sacado||'—'}</strong></div><div><small>Valor nominal</small><strong>{money(selected.valor_nominal)}</strong></div><div><small>Vencimento</small><strong>{dateLabel(selected.data_vencimento)}</strong></div></div>{selected.regras?.length?<div className="rule-results"><strong>Validações aplicadas</strong>{selected.regras.map(r=><div key={r.validador_id} className="calc-row"><span>{r.nome}</span><b>{r.aprovada?'Aprovada':r.motivo||'Reprovada'}</b></div>)}</div>:null}{selected.status==='aprovada'?<div className="approval-box"><Icon name="check"/><div><strong>Nota aprovada</strong><p>Esta nota passou pelas regras ativas no motor de validação.</p></div></div>:<div className="refusal-box"><Icon name="info"/><div><strong>Motivos da recusa</strong><p>{selected.regras?.filter(r=>!r.aprovada).map(r=>r.motivo||r.nome).join(' ')||'Consulte o arquivo de resultado para mais detalhes.'}</p></div></div>}<button className="primary-btn wide" disabled={selected.status!=='aprovada'} onClick={()=>{setSelected(null);setPage('simulacao')}}>Simular antecipação</button></section></div>}
  </>
}

function SimulationPage({ analyses, active, simulation, error, onSelect, onSimulate }: { analyses:Analysis[]; active?:Analysis; simulation:Simulation|null; error:string; onSelect:(id:string)=>void; onSimulate:(id:string)=>void }) {
  return <><header className="page-header"><div><span className="eyebrow">Planejamento financeiro</span><h1>Simulação</h1><p>Calcule o valor líquido das notas aprovadas usando a taxa configurada no backend.</p></div><DemoBadge/></header><section className="simulation-grid"><div className="panel form-panel"><h2>Dados da operação</h2><label>Lote da análise<select value={active?.lote_id||''} onChange={e=>onSelect(e.target.value)}>{analyses.map(a=><option key={a.lote_id} value={a.lote_id}>{a.ficheiro} · {a.lote_id}</option>)}</select></label><label>Valor nominal aprovado<div className="money-input"><span>R$</span><input readOnly value={active?active.resumo.valor_nominal_aprovado.toLocaleString('pt-BR',{minimumFractionDigits:2}):'0,00'}/></div></label><div className="notice"><Icon name="info"/><p>A taxa mensal é definida no servidor pela variável ANTECIPE_TAXA_MENSAL. A simulação usa somente notas aprovadas.</p></div><button className="primary-btn wide" disabled={!active||!active.resumo.aprovadas} onClick={()=>active&&onSimulate(active.lote_id)}>Calcular simulação</button>{error&&<ErrorNotice>{error}{error.toLowerCase().includes('taxa')?' Configure ANTECIPE_TAXA_MENSAL no backend e reinicie a API.':''}</ErrorNotice>}</div><div className="panel result-card"><span className="eyebrow">Valor líquido estimado</span><strong>{money(simulation?.valor_liquido)}</strong><div className="calc-row"><span>Valor nominal elegível</span><b>{money(simulation?.valor_nominal??active?.resumo.valor_nominal_aprovado)}</b></div><div className="calc-row"><span>Desconto</span><b>{money(simulation?.desconto)}</b></div><div className="calc-row"><span>Taxa mensal</span><b>{simulation?.taxa_mensal==null?'—':`${(simulation.taxa_mensal*100).toLocaleString('pt-BR')}%`}</b></div><div className="calc-row"><span>Prazo médio</span><b>{simulation?.prazo_medio_dias==null?'—':`${simulation.prazo_medio_dias} dias`}</b></div><div className="result-line"/><div className="calc-row total"><span>Total líquido</span><b>{money(simulation?.valor_liquido)}</b></div>{!simulation&&<p className="file-hint">Execute a simulação para obter valores calculados pelo backend.</p>}</div></section></>
}

function ValidatorsPage({ validators, updateRule, updateParam, onSave, onExport }: { validators:Validator[]; updateRule:(i:number,p:Partial<Validator>)=>void; updateParam:(i:number,k:string,v:any)=>void; onSave:()=>void; onExport:()=>void }) {
  const field=(rule:Validator,index:number)=>{
    if(rule.codigo==='SITUACAO_CADASTRAL_SACADO'||rule.codigo==='TIPO_RECEBIVEL'){const key=rule.codigo==='TIPO_RECEBIVEL'?'tipos_aceitos':'situacoes_aceitas';return <label>{rule.codigo==='TIPO_RECEBIVEL'?'Tipos aceitos':'Situações aceitas'}<input value={(rule.parametros[key]||[]).join(', ')} onChange={e=>updateParam(index,key,e.target.value.split(',').map((v:string)=>v.trim()).filter(Boolean))}/><small>Separe os valores por vírgula.</small></label>}
    const numeric:Record<string,[string,string]>={VALOR_MINIMO:['Valor mínimo (R$)','valor_minimo'],PRAZO_MAXIMO:['Prazo máximo (dias)','prazo_maximo_dias'],PRAZO_MINIMO:['Prazo mínimo (dias)','prazo_minimo_dias'],CONCENTRACAO_MAXIMA_SACADO:['Concentração máxima (%)','percentual_maximo'],CONCENTRACAO_MAXIMA_CEDENTE:['Concentração máxima (%)','percentual_maximo']};const item=numeric[rule.codigo];if(item){const [label,key]=item;return <label>{label}<input type="number" min="0" step="0.01" value={rule.parametros[key]??0} onChange={e=>updateParam(index,key,Number(e.target.value))}/></label>}return <p className="file-hint">Esta regra não possui parâmetros adicionais.</p>
  }
  return <><header className="page-header"><div><span className="eyebrow">Motor de regras</span><h1>Validadores</h1><p>Configure as regras enviadas ao backend na próxima análise.</p></div><div className="header-actions"><button className="ghost-btn" onClick={onExport}><Icon name="file" size={17}/>Exportar JSON</button><button className="primary-btn" onClick={onSave}><Icon name="check" size={17}/>Salvar alterações</button></div></header><div className="settings-heading rules-title"><div><h2>Regras de elegibilidade</h2><p>{validators.filter(r=>r.ativo).length} de {validators.length} regras ativas</p></div><span className="config-hint"><Icon name="info" size={15}/>Salvas neste navegador</span></div><section className="rules-grid">{validators.map((rule,index)=><article className={`rule-card ${rule.ativo?'enabled':''}`} key={rule.codigo}><div className="rule-top"><div className="rule-icon"><Icon name={rule.ativo?'check':'clock'} size={18}/></div><div><h3>{ruleInfo[rule.codigo]?.[0]||rule.nome||rule.codigo}</h3><p>{ruleInfo[rule.codigo]?.[1]||rule.descricao||'Regra de validação do backend.'}</p></div><button className={`switch ${rule.ativo?'on':''}`} onClick={()=>updateRule(index,{ativo:!rule.ativo})} aria-label="Ativar ou desativar regra"><i/></button></div><div className="rule-code">{rule.codigo}</div><div className={`rule-params ${!rule.ativo?'disabled':''}`}>{field(rule,index)}</div></article>)}</section><section className="settings-section pricing-section"><div className="settings-heading"><div><h2>Taxa de desconto</h2><p>A taxa usada na simulação é configurada no servidor, não nesta tela.</p></div></div><div className="notice"><Icon name="info"/><p>Configure ANTECIPE_TAXA_MENSAL no ambiente do backend (por exemplo, 0.02 para 2% ao mês). As alterações nesta tela serão aplicadas às próximas análises e não alteram as regras globais do servidor.</p></div></section></>
}
