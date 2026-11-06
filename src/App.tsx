import { useCallback, useEffect, useState } from 'react';
import { getSdk } from '@ervisio/plugin-sdk';
import * as api from './api';
import { t,local } from './i18n';
import { bytes, emptyPlan, planJobs, type Plan, type Receipt, type Snapshot } from './model';
import { PlanForm } from './PlanForm';

function date(value?: string): string { return value ? new Date(value).toLocaleString(getSdk().lang()) : '—'; }

export function DesktopApp() { return <App desktop />; }
export function App({ desktop = false }: { desktop?: boolean } = {}) {
  const sdk = getSdk();
  const { Dialog, Icon } = sdk.ui;
  const [data, setData] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState('');
  const [runs, setRuns] = useState<Receipt[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [watch, setWatch] = useState<{ instance: string; run: string } | null>(null);
  const refresh = useCallback(async () => {
    const next = await api.load(); setData(next);
    setSelected(previous => next.plans.some(plan => plan.id === previous) ? previous : next.plans[0]?.id || '');
    return next;
  }, []);
  useEffect(() => { let active = true; void refresh().catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [refresh]);
  useEffect(() => { let active = true; setRuns([]); if (selected) void api.history(selected).then(items => { if (active) setRuns(items); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [selected]);
  const running = !!data?.jobs.some(job => job.running);
  useEffect(() => {
    if (!running && !watch) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      try {
        const next = await refresh();
        if (!active) return;
        if (watch) { const instance = next.jobs.find(job => job.id === watch.instance); if (!instance || instance.last?.id === watch.run && !['running', 'queued'].includes(instance.last.status)) setWatch(null); }
        if (selected) { const receipts = await api.history(selected); if (active) setRuns(receipts); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : t('failedAction')); }
    };
    const visibility = (hidden: boolean) => { if (timer) clearInterval(timer); timer = undefined; if (!hidden) { void poll(); timer = setInterval(() => void poll(), 5000); } };
    visibility(!!sdk.visibility?.hidden);
    const unsub = sdk.visibility?.onChange(visibility);
    return () => { active = false; if (timer) clearInterval(timer); unsub?.(); };
  }, [refresh, running, watch, selected, sdk]);
  const plan = data?.plans.find(item => item.id === selected);
  const scheduled = plan ? planJobs(data?.jobs || [], plan.id, 'backup')[0] : undefined;
  const planRunning = !!plan && planJobs(data?.jobs || [], plan.id).some(job => job.running);
  const connection = data?.connections.find(item => item.id === plan?.destination.connection);
  const action = async (name: string, work: () => Promise<void>) => {
    setBusy(name); setError(''); setNote('');
    try { await work(); await refresh(); if (selected) setRuns(await api.history(selected)); }
    catch (e) { setError(e instanceof Error ? e.message : t('failedAction')); }
    finally { setBusy(''); }
  };
  if (!data) return <div className="bk-root"><div className="bk-empty"><Icon name="archive" /><h2>{error || t('loading')}</h2>{error && <button className="bk-button" onClick={() => void action('refresh', async () => { await refresh(); })}>{t('retry')}</button>}</div></div>;
  if (!data.status.supported) return <div className="bk-root"><div className="bk-empty"><Icon name="archive" /><h2>{t('requiresLinux')}</h2><p>{data.status.reason}</p></div></div>;
  return <div className={`bk-root${desktop ? ' bk-desktop' : ''}`}>
    <header className="bk-header"><span className="bk-app-icon"><Icon name="archive" /></span><div><h1>{t('title')}</h1><p>{t('subtitle')}</p></div><div className="bk-spacer" /><button className="bk-button" disabled={!!busy} onClick={() => void action('refresh', async () => { await refresh(); })}>{t('refresh')}</button><button className="bk-button bk-primary" disabled={!!busy || data.plans.length >= (data.status.maxPlans || 20)} onClick={() => setEditing(emptyPlan())}>+ {t('newPlan')}</button></header>
    {error && <div role="alert" className="bk-error">{error}</div>}{note && <div role="status" className="bk-notice">{note}</div>}
    <div className="bk-stats"><div><span>{t('plans')}</span><b>{data.plans.length}<small> / {data.status.maxPlans || 20}</small></b></div><div><span>{t('scheduled')}</span><b>{data.jobs.filter(job => job.job === 'backup' && job.enabled).length}</b></div><div><span>{t('freeSpool')}</span><b>{bytes(Math.max(0, (data.status.spoolFree || 0) - (data.status.spoolReserve || 0)))}</b></div></div>
    {!data.plans.length ? <section className="bk-empty"><Icon name="archive" /><h2>{t('noPlans')}</h2><p>{t('noPlansText')}</p><button className="bk-button bk-primary" onClick={() => setEditing(emptyPlan())}>{t('newPlan')}</button></section> : <div className="bk-workspace">
      <nav className="bk-plan-list" aria-label={t('plans')}>{data.plans.map(item => { const job = planJobs(data.jobs, item.id, 'backup')[0]; const active = planJobs(data.jobs, item.id).some(instance => instance.running); return <button key={item.id} className={`bk-plan${selected === item.id ? ' is-selected' : ''}`} onClick={() => { setSelected(item.id); setNote(''); }}><span className="bk-plan-icon"><Icon name={item.mode === 'databases' ? 'disk' : 'files'} /></span><span><b>{item.name}</b><small>{item.mode === 'both' ? t('both') : t(item.mode)}</small><small>{item.frequency.value} {t(item.frequency.unit)}</small></span><i className={`bk-dot${active ? ' is-running' : job?.enabled ? ' is-ok' : ''}`} aria-label={active ? t('running') : job?.enabled ? t('scheduled') : t('disabled')} /></button>; })}</nav>
      {plan && <main className="bk-detail"><div className="bk-section-head"><div><h2>{plan.name}</h2><p className="bk-muted">{planRunning ? t('running') : !scheduled ? t('noSchedule') : scheduled.enabled ? `${t('next')}: ${date(plan.nextDue)}` : t('disabled')}</p></div><button className="bk-button" disabled={!!busy} onClick={() => setEditing(plan)}>{t('edit')}</button></div>
        <div className="bk-actions"><button className="bk-button bk-primary" disabled={!!busy || planRunning} onClick={() => void action('run', async () => setWatch(await api.runNow(plan, data.jobs)))}>{t('runNow')}</button><button className="bk-button" disabled={!!busy} onClick={() => void action('toggle', () => api.toggle(plan, data.jobs))}>{t(scheduled?.enabled ? 'pause' : 'resume')}</button><button className="bk-button" disabled={!!busy} onClick={() => void action('test', async () => { await api.helper('test', plan.id); setNote(t('connectionOK')); })}>{t('test')}</button><button className="bk-button bk-danger" disabled={!!busy || planRunning} onClick={() => setDeleting(true)}>{t('delete')}</button></div>
        <section className="bk-summary"><div><span>{t('destination')}</span><strong>{connection?.name || plan.destination.connection} <small>{connection?.kind.toUpperCase()}</small></strong><code>{plan.destination.path.replace(/\/$/,'')}/ervisio-backup-{plan.id}</code></div><div><span>{t('sources')}</span>{plan.folders.map(folder => <code key={folder}>{folder}</code>)}{plan.databases.map(db => <code key={db.id}>{db.name} · {db.kind === 'sqlite' ? db.path : `${db.host}:${db.port}`}</code>)}</div><div><span>{t('retention')}</span><strong>{plan.keepLast} {local('copies','copie')}</strong>{plan.maxAge && <small>{plan.maxAge.value} {t(plan.maxAge.unit)}</small>}<small>{t('retentionHint')}</small></div></section>
        <section className="bk-history"><h3>{t('history')}</h3>{!runs.length ? <p className="bk-muted">{t('noHistory')}</p> : runs.map(run => <article key={run.id} className="bk-run"><span className={`bk-run-state is-${run.status}`}>{t(run.status === 'ok' ? 'resultOk' : run.status === 'running' ? 'resultRunning' : 'resultFailed')}</span><div><strong>{date(run.started)}</strong><small>{run.bytes ? bytes(run.bytes) : ''} {run.files !== undefined ? `· ${run.files} ${t('filesCount')}` : ''} {run.databases ? `· ${run.databases} ${t('dbCount')}` : ''}</small>{run.archive && <code>{run.archive}</code>}{run.error && <p className="bk-error">{run.error}</p>}{run.warnings?.map((warning, i) => <p className="bk-notice" key={i}>{warning}</p>)}</div></article>)}</section>
      </main>}
    </div>}
    <section className="bk-footnote"><details><summary>{t('clients')}</summary><div className="bk-clients">{Object.entries(data.status.clients || {}).map(([client, available]) => <span key={client}><code>{client}</code><b className={available ? 'is-ok' : 'bk-muted'}>{t(available ? 'available' : 'missing')}</b></span>)}</div><p>{t('clientsHint')}</p></details><p>{t('permissions')}</p><p>{t('restoreHint')}</p></section>
    {editing && <PlanForm initial={editing} connections={data.connections} onClose={() => setEditing(null)} onSave={async next => { const result = await api.save(next, data.jobs); setEditing(null); setSelected(result.plan.id); await refresh(); if (result.scheduleError) setError(`${t('scheduleSavedError')} ${result.scheduleError}`); }} />}
    {deleting && plan && <Dialog open role="alertdialog" title={t('deleteTitle')} description={t('deleteText')} onClose={() => setDeleting(false)} footer={<><button className="bk-button" disabled={!!busy} onClick={() => setDeleting(false)}>{t('cancel')}</button><button className="bk-button bk-danger" disabled={!!busy} onClick={() => void action('delete', async () => { await api.remove(plan, data.jobs); setDeleting(false); })}>{t('deleteConfirm')}</button></>} />}
  </div>;
}
