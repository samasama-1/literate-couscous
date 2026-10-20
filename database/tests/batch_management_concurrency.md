# Synthetic two-session batch management check

Run only against an approved staging/disposable database with existing order_fulfilment.sql and batch_management.sql. Do not use a real customer's batch/order, and do not alter production orders to simulate this.

1. Create a synthetic batch through admin_save_batch; record its UUID and revision. Prepare two independent PostgreSQL sessions as the trusted test owner.
2. Session A: BEGIN; SELECT id FROM public.batches WHERE id='<synthetic UUID>' FOR SHARE; This represents the existing registration lock. Leave transaction open.
3. Session B: BEGIN; SET LOCAL lock_timeout='1s'; invoke admin_save_batch with that UUID/revision and different pricing, or admin_delete_empty_batch with confirmation DELETE. It must time out rather than mutate past A's lock. ROLLBACK B after timeout.
4. Session A: insert a synthetic pending order through the normal registration RPC with the required address and contact data, using an owner-controlled synthetic identity. COMMIT. Repeating a manager price change must now return BATCH_PRICES_LOCKED; deletion must return BATCH_HAS_ORDERS.
5. Reverse the race in a fresh empty batch: A locks it FOR UPDATE and performs the management change; B's FOR SHARE registration lock must wait/fail under a short test lock_timeout. Once A commits, B must read the updated/closed/deleted state and must not register using the old pricing.
6. In two admin sessions load the same revision. Save in A; B's old revision must return BATCH_CHANGED. Reload B before attempting another mutation.
7. Roll back disposable transactions and remove only approved synthetic fixtures through the documented test recovery procedure. Never clear real orders to make deletion possible.

Local PGlite tests verify transactional and permission behavior in one embedded backend; they do not prove real multi-session lock timing. Record outcomes before approving production activation. The manager RPC and registration must continue to take the conflicting batch locks before checking/mutating pricing or inserting orders.
