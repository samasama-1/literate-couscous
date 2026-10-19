// Standalone Apps Script. Credentials belong in Script Properties, never cells.
const EXPORT_SCHEMA_VERSION = 3;
const EXPORT_PROFILE = 'warehouse_v3';
const EXPORT_TABS = [
  {kind:'orders', title:'Orders', headers:[
    'Order code','Batch ID','Product','Customer name','Fulfilment method','Quantity','Payment status',
    'Deposit due (SGD cents)','Deposit verified at (UTC)','Final total (SGD cents)',
    'Balance due (SGD cents)','Balance requested at (UTC)','Balance paid at (UTC)',
    'Ready at (UTC)','Fulfilled at (UTC)','Created at (UTC)','Handover clearance','Customer email','Customer phone']},
  {kind:'activity', title:'Payment & Collection History', headers:[
    'Order code','Action','Created at (UTC)','Amount (SGD cents)',
    'Final total (SGD cents)','Balance due (SGD cents)','Fulfilment method']},
];
const STATUS_TITLE = 'Export Status';
const STAGING_PREFIX = '_export_v3_staging_';

// Run once to create a NEW private workbook; never opens sharing permissions.
function createBackupSpreadsheet() {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('SPREADSHEET_ID')) throw new Error('SPREADSHEET_ID already set; use the existing workbook.');
  const file=Sheets.Spreadsheets.create({properties:{title:'SamaSama Warehouse Backup v3',timeZone:'Asia/Singapore'},
    sheets:[{properties:{title:STATUS_TITLE}}]});
  props.setProperty('SPREADSHEET_ID',file.spreadsheetId);
  initialiseStatus_(file.spreadsheetId);
  console.log('Backup workbook: https://docs.google.com/spreadsheets/d/'+file.spreadsheetId);
}

function config_() {
  const p=PropertiesService.getScriptProperties().getProperties();
  if(!/^[A-Za-z0-9_-]+$/.test(p.SPREADSHEET_ID || '') ||
    !/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/operations-export$/.test(p.EXPORT_URL || '') ||
    !/^[a-f0-9]{64}$/.test(p.EXPORT_SECRET || '')) throw new Error('Check the three Script Properties in the setup guide.');
  return p;
}
function sheets_(id) {
  return Sheets.Spreadsheets.get(id,{fields:'sheets.properties'}).sheets.map(s=>s.properties);
}
function assertRestricted_(id) {
  // Inspect only this workbook's sharing metadata; do not alter sharing silently.
  let token;
  for(let page=0;page<10;page++) {
    const options={fields:'nextPageToken,permissions(type)',pageSize:100};
    if(token) options.pageToken=token;
    const result=Drive.Permissions.list(id,options);
    if(!Array.isArray(result.permissions)) throw new Error('Cannot verify workbook sharing.');
    if(result.permissions.some(p=>!['user','group'].includes(p.type))) {
      throw new Error('Workbook must not allow public or domain-wide access.');
    }
    token=result.nextPageToken;
    if(!token) return;
  }
  throw new Error('Cannot verify all workbook permissions.');
}
function cleanupStaging_(id) {
  const abandoned=sheets_(id).filter(s=>s.title.startsWith(STAGING_PREFIX));
  if(abandoned.length) Sheets.Spreadsheets.batchUpdate({requests:abandoned.map(s=>({deleteSheet:{sheetId:s.sheetId}}))},id);
}
function assertWarehouseWorkbook_(id) {
  // Marker is written only during NEW workbook creation, never to upgrade old copies.
  const marker=Sheets.Spreadsheets.Values.get(id,"'Export Status'!B12").values;
  if(marker?.[0]?.[0]!==EXPORT_PROFILE) throw new Error('Create a new warehouse v3 workbook; do not reuse the legacy backup.');
  for(const sheet of sheets_(id)) {
    if(sheet.title===STATUS_TITLE || sheet.title.startsWith(STAGING_PREFIX)) continue;
    const tab=EXPORT_TABS.find(t=>sheet.title===t.title || sheet.title===t.title+' (previous)');
    if(!tab) throw new Error('Unexpected tab in dedicated warehouse workbook.');
    const rows=Sheets.Spreadsheets.Values.get(id,"'"+sheet.title+"'!A1:AZ1").values;
    if(JSON.stringify(rows?.[0])!==JSON.stringify(tab.headers)) throw new Error('Legacy or unexpected export headers.');
  }
}
function write_(id,title,row,values) {
  // RAW prevents customer names beginning '=' from becoming executable formulas.
  Sheets.Spreadsheets.Values.batchUpdate({valueInputOption:'RAW',data:[{
    range:"'"+title.replace(/'/g,"''")+"'!A"+row,values:values,
  }]},id);
}
function initialiseStatus_(id) {
  if(!sheets_(id).some(s=>s.title===STATUS_TITLE)) {
    Sheets.Spreadsheets.batchUpdate({requests:[{addSheet:{properties:{title:STATUS_TITLE}}}]},id);
  }
  const existing=Sheets.Spreadsheets.Values.get(id,"'Export Status'!A1:B1");
  if(!existing.values || !existing.values.length) write_(id,STATUS_TITLE,1,[
    ['Field','Value'],['Last successful export (UTC)',''],['Snapshot captured at (UTC)',''],
    ['Orders',''],['History rows',''],['Latest attempt (UTC)',''],['Latest result','Not configured — no export has run'],
    ['Snapshot ID',''],['Usage','Read-only fallback. Use the website for all payment and collection changes.'],
    ['Money','All monetary amounts are integer SGD cents. Blank means unknown, not zero.'],
    ['Freshness','Daily copy only; transactions after the snapshot are absent. Check last success before use.'],
    ['Export profile',EXPORT_PROFILE],
  ]);
}
// Only errors created here may contribute a detail code to logs/status.
// Raw Google/Supabase errors and response bodies are never included.
class ExportFailure extends Error {
  constructor(code) { super('Export step failed'); this.code=code; }
}
function failureCode_(error) {
  return error instanceof ExportFailure && /^(HTTP_[1-5][0-9]{2}|INVALID_JSON|SCHEMA_MISMATCH)$/.test(error.code)
    ? error.code : 'CHECK_REQUIRED';
}
function fetchExport_(c,p,deadline) {
  let lastStatus;
  for(let attempt=0;attempt<3;attempt++) {
    checkTime_(deadline);
    const response=UrlFetchApp.fetch(c.EXPORT_URL,{
      method:'post',contentType:'application/json',payload:JSON.stringify(p),
      headers:{'X-Export-Secret':c.EXPORT_SECRET},muteHttpExceptions:true,followRedirects:false,
    });
    const status=response.getResponseCode();
    if(status===200) {
      try { return JSON.parse(response.getContentText()); }
      catch { throw new ExportFailure('INVALID_JSON'); }
    }
    lastStatus=Number.isInteger(status) && status>=100 && status<=599 ? status : 500;
    if(status!==429 && status<500) throw new ExportFailure('HTTP_'+lastStatus);
    if(attempt<2) Utilities.sleep(1000*(attempt+1));
  }
  throw new ExportFailure('HTTP_'+lastStatus);
}
function checkTime_(deadline) {
  if(Date.now()>deadline) throw new Error('Export exceeded its safe runtime; previous snapshot retained.');
}
function cell_(value) {
  if(value===null || value===undefined) return '';
  if(typeof value!=='string' && typeof value!=='number' && typeof value!=='boolean') throw new Error('Unexpected export value.');
  if(typeof value==='string' && value.length>20000) throw new Error('Export cell too long.');
  return value;
}
function rename_(sheetId,title,hidden) {
  return {updateSheetProperties:{properties:{sheetId:sheetId,title:title,hidden:hidden},fields:'title,hidden'}};
}
function statusCells_(sheetId,startRow,values) {
  return {updateCells:{range:{sheetId:sheetId,startRowIndex:startRow,endRowIndex:startRow+values.length,startColumnIndex:1,endColumnIndex:2},
    rows:values.map(value=>({values:[{userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value)}}]})),
    fields:'userEnteredValue'}};
}

function runDailyExport() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) return;
  let c;
  let stage='CONFIGURATION';
  const attemptAt=new Date().toISOString();
  try {
    c=config_();
    const deadline=Date.now()+240000;
    stage='WORKBOOK_CHECK';
    assertRestricted_(c.SPREADSHEET_ID);
    assertWarehouseWorkbook_(c.SPREADSHEET_ID);
    stage='STATUS_WRITE';
    const statusAtStart=sheets_(c.SPREADSHEET_ID).find(s=>s.title===STATUS_TITLE);
    Sheets.Spreadsheets.batchUpdate({requests:[statusCells_(statusAtStart.sheetId,5,
      [attemptAt,'Running — previous successful snapshot remains available.'])]},c.SPREADSHEET_ID);
    // Only this script's abandoned staging tabs are disposable.
    stage='STAGING_CLEANUP';
    cleanupStaging_(c.SPREADSHEET_ID);
    stage='START_SNAPSHOT';
    const snapshot=fetchExport_(c,{action:'start',id:Utilities.getUuid()},deadline);
    stage='SNAPSHOT_VALIDATION';
    if(!snapshot || !/^[a-f0-9-]{36}$/i.test(snapshot.id || '') || !Number.isFinite(Date.parse(snapshot.captured_at))) throw new Error('Invalid snapshot.');
    if(snapshot.schema_version!==EXPORT_SCHEMA_VERSION || snapshot.profile!==EXPORT_PROFILE) throw new ExportFailure('SCHEMA_MISMATCH');
    const staging=[];
    for(const tab of EXPORT_TABS) {
      stage=tab.kind==='orders'?'ORDERS_WRITE':'HISTORY_WRITE';
      const count=snapshot[tab.kind];
      if(!Number.isSafeInteger(count) || count<0 || count>50000) throw new Error('Snapshot exceeds supported export size.');
      checkTime_(deadline);
      const title=STAGING_PREFIX+tab.kind+'_'+snapshot.id;
      const added=Sheets.Spreadsheets.batchUpdate({requests:[{addSheet:{properties:{title:title,hidden:true,
        gridProperties:{rowCount:Math.max(count+1,2),columnCount:tab.headers.length,frozenRowCount:1}}}}]},c.SPREADSHEET_ID);
      const sheetId=added.replies[0].addSheet.properties.sheetId;
      staging.push({sheetId:sheetId,title:tab.title});
      write_(c.SPREADSHEET_ID,title,1,[tab.headers]);
      let cursor=0;
      while(cursor<count) {
        stage=tab.kind==='orders'?'ORDERS_FETCH':'HISTORY_FETCH';
        const page=fetchExport_(c,{action:'page',id:snapshot.id,kind:tab.kind,after:cursor},deadline);
        stage=tab.kind==='orders'?'ORDERS_VALIDATION':'HISTORY_VALIDATION';
        if(!Array.isArray(page.rows) || page.rows.length===0 || page.rows.length>250 ||
          page.next!==cursor+page.rows.length || page.next>count) throw new Error('Incomplete export page.');
        const values=page.rows.map(row=>{
          if(!Array.isArray(row) || row.length!==tab.headers.length) throw new Error('Export columns changed.');
          return row.map(cell_);
        });
        checkTime_(deadline);
        stage=tab.kind==='orders'?'ORDERS_WRITE':'HISTORY_WRITE';
        write_(c.SPREADSHEET_ID,title,cursor+2,values);
        cursor=page.next;
      }
      stage=tab.kind==='orders'?'ORDERS_WRITE':'HISTORY_WRITE';
      Sheets.Spreadsheets.batchUpdate({requests:[
        {repeatCell:{range:{sheetId:sheetId,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{backgroundColor:{red:0.28,green:0.32,blue:0.23},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}}}},fields:'userEnteredFormat'}},
        {setBasicFilter:{filter:{range:{sheetId:sheetId,startRowIndex:0,endRowIndex:count+1,startColumnIndex:0,endColumnIndex:tab.headers.length}}}},
      ]},c.SPREADSHEET_ID);
    }
    checkTime_(deadline);
    stage='PUBLISH_SHARING_CHECK';
    // Recheck immediately before publishing in case sharing changed mid-export.
    assertRestricted_(c.SPREADSHEET_ID);
    stage='PUBLISH';
    const existing=sheets_(c.SPREADSHEET_ID);
    const statusId=existing.find(s=>s.title===STATUS_TITLE).sheetId;
    const publish=[];
    for(const tab of staging) {
      const previous=existing.find(s=>s.title===tab.title+' (previous)');
      if(previous) publish.push({deleteSheet:{sheetId:previous.sheetId}});
      const current=existing.find(s=>s.title===tab.title);
      if(current) publish.push(rename_(current.sheetId,tab.title+' (previous)',true));
      publish.push(rename_(tab.sheetId,tab.title,false));
    }
    publish.push(statusCells_(statusId,1,[new Date().toISOString(),snapshot.captured_at,snapshot.orders,snapshot.activity,attemptAt,'Success',snapshot.id]));
    // One atomic request publishes BOTH tabs and their success marker together.
    Sheets.Spreadsheets.batchUpdate({requests:publish},c.SPREADSHEET_ID);
  } catch(error) {
    const diagnostic=stage+' / '+failureCode_(error);
    // Names are reread: an ambiguous publish response must never delete live tabs.
    if(c) try { cleanupStaging_(c.SPREADSHEET_ID); } catch { /* Retry cleanup next run. */ }
    if(c) try {
      const status=sheets_(c.SPREADSHEET_ID).find(s=>s.title===STATUS_TITLE);
      if(status) Sheets.Spreadsheets.batchUpdate({requests:[statusCells_(status.sheetId,5,[attemptAt,'Failed ('+diagnostic+') — previous successful snapshot retained.'])]},c.SPREADSHEET_ID);
    } catch { /* Leave the prior status untouched if Google itself is unavailable. */ }
    // No customer details, secret headers or raw provider errors in trigger emails/logs.
    throw new Error('Operations export failed ('+diagnostic+'). Check Export Status and the setup guide; existing successful snapshot retained.');
  } finally { lock.releaseLock(); }
}

// Run AFTER a manual export succeeds. Google chooses an approximate time.
function installDailyTrigger() {
  config_();
  removeDailyTrigger();
  ScriptApp.newTrigger('runDailyExport').timeBased().atHour(0).nearMinute(30)
    .everyDays(1).inTimezone('Asia/Singapore').create();
}
function removeDailyTrigger() {
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='runDailyExport')
    .forEach(t=>ScriptApp.deleteTrigger(t));
}
