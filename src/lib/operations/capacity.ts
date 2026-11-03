// Planning arithmetic, not live billing or a promise of provider throughput.
export type Workload={days:number;updateEveryDays:number;lifecycleEmails:number;otpEmails:number;authorisationNotices:number;reminders:number;crmJobs:number;customerAndStaffInvocations:number;foregroundDbCalls:number};
export const planningWorkload:Workload={days:30,updateEveryDays:7,lifecycleEmails:5,otpEmails:2,authorisationNotices:1,reminders:5,crmJobs:6,customerAndStaffInvocations:25,foregroundDbCalls:48};
export function capacityModel(orders:number,w:Workload=planningWorkload){
 if(!Number.isInteger(orders)||orders<1||orders>1000000||!Number.isInteger(w.days)||w.days<1||w.days>365||!Number.isInteger(w.updateEveryDays)||w.updateEveryDays<1)throw Error('INVALID_WORKLOAD');
 for(const v of [w.lifecycleEmails,w.otpEmails,w.authorisationNotices,w.reminders,w.crmJobs,w.customerAndStaffInvocations,w.foregroundDbCalls])if(!Number.isInteger(v)||v<0||v>1000)throw Error('INVALID_WORKLOAD');
 const routine=Math.floor(w.days/w.updateEveryDays),urgent=w.lifecycleEmails+w.otpEmails+w.authorisationNotices+w.reminders,emails=urgent+routine,jobs=emails+w.crmJobs;
 const invocations=2*24*60*w.days; // Two separately authenticated once-per-minute workers.
 const snapshots=w.days*(1+Math.ceil(orders/250)+Math.ceil(orders*5/250));
 const vCalls=invocations+orders*w.customerAndStaffInvocations;
 return {orders,days:w.days,emailsPerOrder:emails,routinePerOrder:routine,crmJobsPerOrder:w.crmJobs,totalEmails:orders*emails,totalCrmJobs:orders*w.crmJobs,averageEmailsPerHour:orders*emails/(w.days*24),
 old36h:orders*emails/36,mail40h:orders*(w.otpEmails+w.authorisationNotices)/40+orders*w.lifecycleEmails/35+orders*(routine+w.reminders)/30,transactional500h:orders*(w.otpEmails+w.authorisationNotices)/500+orders*w.lifecycleEmails/450+orders*(routine+w.reminders)/375,
 confirmationWave40h:orders/35,confirmationWave500h:orders/450,otpWaveTenMinuteRequiredHourly:orders*6,
 scheduledInvocations:invocations,vercelInvocations:vCalls,edgeExportInvocations:snapshots,
 // With full batches: per-job final read + guarded marker + finish, plus one batch context and fixed claim/metric calls.
 dbHttpCallsFullBatch:orders*w.foregroundDbCalls+orders*jobs*3+Math.ceil(orders*jobs/10)+2*invocations,
 // Current mailbox pacing claims one email per invocation, CRM may still batch ten.
 dbHttpCallsMailboxPaced:orders*w.foregroundDbCalls+orders*jobs*3+orders*emails+Math.ceil(orders*w.crmJobs/10)+2*invocations,
 // Each job: enqueue+counter, claim+2 counters, marker+budget row+minute bucket, finish+2 counters.
 queueRowWrites:orders*jobs*11,coreRowWrites:orders*20,metricsRowWrites:invocations,
 // Illustrative Singapore fluid rates. Credit, seats, network, image/log/build costs handled outside this subtotal.
 vercelMeteredLowUsd:vCalls*(.0000006+.05/3600*.160+2*.5/3600*.0133),
 vercelMeteredHighUsd:vCalls*(.0000006+.20/3600*.160+2*3/3600*.0133)};
}
