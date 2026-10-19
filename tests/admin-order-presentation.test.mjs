import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentCleared, readyForHandover, orderStatus} from '../src/components/admin/order-presentation.ts';
const paid = {payment_status:'VERIFIED',deposit_due_cents:5000,final_total_cents:10900,balance_due_cents:5900,balance_paid_at:'2026-10-19T02:00:00Z',ready_at:'2026-10-19T03:00:00Z',fulfilled_at:null};
test('collection presentation never clears missing, inconsistent, unpaid or refunded payments',()=>{
 assert.equal(readyForHandover(paid),true);
 for(const change of [{deposit_due_cents:null},{final_total_cents:null},{balance_due_cents:null},{final_total_cents:9999},{balance_paid_at:null},{payment_status:'PENDING_PAYNOW'},{payment_status:'REFUNDED'},{balance_due_cents:-1,final_total_cents:4999}]) {
  assert.equal(paymentCleared({...paid,...change}),false);
  assert.equal(readyForHandover({...paid,...change}),false);
 }
 assert.equal(paymentCleared({...paid,final_total_cents:5000,balance_due_cents:0,balance_paid_at:null}),true);
});
test('presentation distinguishes paid-but-not-ready, completed and refunded orders',()=>{
 assert.equal(readyForHandover({...paid,ready_at:null}),false);
 assert.equal(orderStatus({...paid,ready_at:null}).label,'Paid · awaiting readiness');
 assert.equal(readyForHandover({...paid,fulfilled_at:'2026-10-19T04:00:00Z'}),false);
 assert.equal(orderStatus({...paid,fulfilled_at:'2026-10-19T04:00:00Z'}).label,'Completed');
 assert.equal(orderStatus({...paid,payment_status:'REFUNDED'}).label,'Refunded');
});
