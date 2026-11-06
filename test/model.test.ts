import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanInput, emptyPlan, scheduleFor } from '../src/model.ts';

test('frequency keeps real minutes/hours/days and server-local monthly wall clock',()=>{
  const plan=emptyPlan();plan.frequency={value:3,unit:'hours'};assert.deepEqual(scheduleFor(plan),{every:10800});
  plan.frequency={value:2,unit:'months'};plan.created='2027-01-31T14:30:45+05:30';assert.deepEqual(scheduleFor(plan),{at:['14:30']});
  plan.created=undefined;assert.throws(()=>scheduleFor(plan));
});
test('blank password is omitted while explicit clear survives',()=>{
  const plan=emptyPlan();plan.databases=[{id:'a'.repeat(32),kind:'postgres',name:'app',password:'',clearPassword:true}];
  const encoded=JSON.stringify(cleanInput(plan));assert.ok(!encoded.includes('"password"'));assert.ok(encoded.includes('"clearPassword":true'));
});
