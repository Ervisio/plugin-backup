import { getSdk, type JobInstance } from '@ervisio/plugin-sdk';
import { cleanInput, planJobs, scheduleFor, token, type Connection, type Plan, type Receipt, type Snapshot, type Status } from './model.ts';

let account='';
function mine(jobs:JobInstance[]):JobInstance[]{if(!account)throw new Error('Refresh account metadata before managing backup schedules.');return jobs.filter(job=>job.owner===account);}

export async function helper<T>(method: string, id?: string): Promise<T> {
  const result = await getSdk().api.exec(`backup-${method}`, id ? [id] : []);
  if (result.truncated) throw new Error('The backup helper response exceeded its size limit.');
  let data: { ok: boolean; result?: T; error?: { message?: string } };
  try { data = JSON.parse(result.stdout); } catch { throw new Error('The backup helper is unavailable. Upgrade the core to Ervisio 7.0.3 or later.'); }
  if (!data.ok || result.exitCode !== 0) throw new Error(data.error?.message || 'The backup operation could not complete.');
  return data.result as T;
}

async function request<T>(method: string, payload: unknown): Promise<T> {
  const id = token();
  const path = `~/.config/ervisio/plugins/backup/inbox/${id}.json`;
  const json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).length > 256 * 1024) throw new Error('The backup request is too large.');
  await getSdk().files.write(path, json);
  try { return await helper<T>(method, id); }
  finally { await getSdk().files.remove(path).catch(() => {}); }
}

function jobsApi() {
  const jobs = getSdk().api.jobs;
  if (!jobs) throw new Error('This core does not provide persistent plugin jobs.');
  return jobs;
}

export async function load(): Promise<Snapshot> {
  if(getSdk().platform==='windows')return {status:{supported:false,platform:'windows',reason:'The Backup worker currently supports Linux.'},plans:[],connections:[],jobs:[]};
  const status = await helper<Status>('status');
  if (!status.supported) return { status, plans: [], connections: [], jobs: [] };
  if (!status.account) throw new Error('The backup helper did not identify this account. Upgrade the core before scheduling backups.');
  account=status.account;
  const [plans, connections, jobs] = await Promise.all([
    helper<{ plans: Plan[] }>('list'), helper<{ connections: Connection[] }>('remotes'), jobsApi().list(),
  ]);
  return { status, plans: plans.plans, connections: connections.connections, jobs: jobs.filter(job => job.owner === status.account) };
}

export async function save(plan: Plan, jobs: JobInstance[]): Promise<{ plan: Plan; scheduleError?: string }> {
  const persisted = await request<Plan>('save', cleanInput(plan));
  const scheduled = planJobs(mine(jobs), persisted.id, 'backup')[0];
  try {
    if (scheduled) await jobsApi().update(scheduled.id, { name: persisted.name, schedule: scheduleFor(persisted) });
    else await jobsApi().create({ job: 'backup', name: persisted.name, params: { backup: persisted.id }, schedule: scheduleFor(persisted), enabled: true });
  } catch (error) {
    return { plan: persisted, scheduleError: error instanceof Error ? error.message : 'The plan was saved, but its schedule could not be created.' };
  }
  return { plan: persisted };
}

export async function runNow(plan: Plan, jobs: JobInstance[]): Promise<{ instance: string; run: string }> {
  let manual = planJobs(mine(jobs), plan.id, 'backup-once')[0];
  if (!manual) manual = await jobsApi().create({ job: 'backup-once', name: plan.name, params: { backup: plan.id }, enabled: true });
  if (!manual.enabled) manual = await jobsApi().update(manual.id, { enabled: true });
  const { run } = await jobsApi().runNow(manual.id);
  return { instance: manual.id, run };
}

export async function toggle(plan: Plan, jobs: JobInstance[]): Promise<void> {
  const scheduled = planJobs(mine(jobs), plan.id, 'backup')[0];
  if (!scheduled) {
    await jobsApi().create({ job: 'backup', name: plan.name, params: { backup: plan.id }, schedule: scheduleFor(plan), enabled: true });
  } else await jobsApi().update(scheduled.id, { enabled: !scheduled.enabled });
}

export async function remove(plan: Plan, jobs: JobInstance[]): Promise<void> {
  const instances = planJobs(mine(jobs), plan.id);
  if (instances.some(job => job.running)) throw new Error('Wait for this plan’s active backup to finish before removing it.');
  for (const instance of instances) await jobsApi().delete(instance.id);
  await helper('delete', plan.id);
}

export async function history(id: string): Promise<Receipt[]> {
  return (await helper<{ runs: Receipt[] }>('history', id)).runs;
}

export async function browse(connection: string, path: string): Promise<{ path: string; directories: { name: string; path: string }[] }> {
  return request('browse', { connection, path });
}

export { getSdk };
