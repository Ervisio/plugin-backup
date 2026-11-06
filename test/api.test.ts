import test from 'node:test';
import assert from 'node:assert/strict';
import { setSdk,type JobInstance,type PluginSDK } from '@ervisio/plugin-sdk';
import * as api from '../src/api.ts';
import { emptyPlan,type Plan } from '../src/model.ts';

function fixture(){
  const plan:Plan={...emptyPlan(),id:'a'.repeat(32),name:'Application',folders:['/srv/app'],created:'2027-01-31T14:30:45Z'};
  const jobs:JobInstance[]=[];const files=new Map<string,string>();const calls:{name:string;args:string[]}[]=[];let created=0;let updated=0;
  const jobsApi={
    list:async()=>structuredClone(jobs),
    create:async(input:Record<string,unknown>)=>{created++;const job={...input,id:`job-${created}`,owner:'alice',enabled:true,running:false} as unknown as JobInstance;jobs.push(job);return structuredClone(job);},
    update:async(id:string,patch:Partial<JobInstance>)=>{updated++;const job=jobs.find(item=>item.id===id)!;Object.assign(job,patch);return structuredClone(job);},
    delete:async(id:string)=>{const index=jobs.findIndex(job=>job.id===id);if(index>=0)jobs.splice(index,1);},
    runNow:async(id:string)=>({run:`run-${id}`}),
  };
  setSdk({api:{jobs:jobsApi,exec:async(name:string,args:string[]=[])=>{
    calls.push({name,args});let result:unknown;
    if(name==='backup-status')result={supported:true,platform:'linux',account:'alice'};
    else if(name==='backup-list')result={plans:[plan]};
    else if(name==='backup-remotes')result={connections:[]};
    else if(name==='backup-save'){const input=JSON.parse(files.get(`~/.config/ervisio/plugins/backup/inbox/${args[0]}.json`)!);result={...input,id:input.id||plan.id,created:plan.created,databases:input.databases.map((db:Record<string,unknown>)=>({...db,password:undefined,hasPassword:!!db.password}))};}
    else if(name==='backup-delete')result={deleted:true};
    return {stdout:JSON.stringify({ok:true,result}),stderr:'',exitCode:0};
  }},files:{write:async(path:string,data:string)=>{files.set(path,data);},remove:async(path:string)=>{files.delete(path);}}} as unknown as PluginSDK);
  return {plan,jobs,files,calls,counts:()=>({created,updated})};
}

test('load uses OS helper account, saves update own schedule and secret travels only through restricted inbox',async()=>{
  const f=fixture();f.jobs.push({id:'own',job:'backup',params:{backup:f.plan.id},owner:'alice',enabled:true} as JobInstance,{id:'foreign',job:'backup',params:{backup:f.plan.id},owner:'bob',enabled:true} as JobInstance);
  const snapshot=await api.load();assert.deepEqual(snapshot.jobs.map(job=>job.id),['own']);
  const password='private-not-an-argv';f.plan.mode='databases';f.plan.databases=[{id:'b'.repeat(32),kind:'postgres',name:'app',password}];
  await api.save(f.plan,f.jobs);assert.deepEqual(f.counts(),{created:0,updated:1});assert.equal(f.files.size,0);
  const saveCall=f.calls.find(call=>call.name==='backup-save')!;assert.match(saveCall.args[0],/^[a-f0-9]{32}$/);assert.ok(!JSON.stringify(f.calls).includes(password));
});

test('manual background runs reuse one persistent instance and ignore another owner',async()=>{
  const f=fixture();await api.load();
  f.jobs.push({id:'foreign',job:'backup-once',params:{backup:f.plan.id},owner:'bob',enabled:true} as JobInstance);
  const first=await api.runNow(f.plan,f.jobs);const second=await api.runNow(f.plan,f.jobs);
  assert.equal(first.instance,second.instance);assert.notEqual(first.instance,'foreign');assert.equal(f.counts().created,1);
});

test('removing plan only deletes its own scheduled/manual instances',async()=>{
  const f=fixture();await api.load();f.jobs.push({id:'own',job:'backup',params:{backup:f.plan.id},owner:'alice',enabled:true} as JobInstance,{id:'foreign',job:'backup',params:{backup:f.plan.id},owner:'bob',enabled:true} as JobInstance);
  await api.remove(f.plan,f.jobs);assert.deepEqual(f.jobs.map(job=>job.id),['foreign']);assert.ok(f.calls.some(call=>call.name==='backup-delete'));
});

test('Windows shows honest unsupported UI without invoking Linux-only commands',async()=>{
  let called=false;setSdk({platform:'windows',api:{exec:async()=>{called=true;throw new Error('must not run');}}} as unknown as PluginSDK);
  const snapshot=await api.load();assert.equal(snapshot.status.supported,false);assert.equal(called,false);assert.deepEqual(snapshot.jobs,[]);
});
