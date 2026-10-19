// OPTIONAL: add as a separate file in the SAME Apps Script project as Code.gs.
// Read-only preflight: no Sheets writes, export snapshots, SQL mutations or timers.
// Log only fixed labels/status codes, never properties, customer data or raw errors.
function checkExportSetup() {
  function check(label, action) {
    try { action(); console.log('PASS: '+label); return true; }
    catch { console.log('FAIL: '+label); return false; }
  }
  let c;
  if(!check('Current Code.gs: EXPORT_PROFILE must be warehouse_v3',()=>{
    if(typeof EXPORT_PROFILE==='undefined' || EXPORT_PROFILE!=='warehouse_v3') throw new Error();
  })) return;
  if(!check('Script Properties: SPREADSHEET_ID, EXPORT_URL and 64-character EXPORT_SECRET',()=>{ c=config_(); })) return;
  if(!check('Google Sheets API v4 service is enabled',()=>{
    if(typeof Sheets==='undefined' || !Sheets.Spreadsheets) throw new Error();
  })) return;
  if(!check('Google Drive API v3 service is enabled',()=>{
    if(typeof Drive==='undefined' || !Drive.Permissions) throw new Error();
  })) return;
  if(!check('Google can read the backup workbook; check its ID, owner and per-file authorization',()=>{ sheets_(c.SPREADSHEET_ID); })) return;
  if(!check('Workbook sharing is Restricted: no anyone/domain access',()=>{ assertRestricted_(c.SPREADSHEET_ID); })) return;
  if(!check('Workbook is fresh warehouse_v3, with the correct profile marker and headers',()=>{ assertWarehouseWorkbook_(c.SPREADSHEET_ID); })) return;
  let response;
  if(!check('Google can reach the deployed function; redirects are disabled',()=>{
    // Intentionally unsupported action: after authentication the existing handler
    // returns Invalid request before ANY RPC call. Do not change this to start/page.
    response=UrlFetchApp.fetch(c.EXPORT_URL,{
      method:'post',contentType:'application/json',
      payload:JSON.stringify({action:'setup_check',id:Utilities.getUuid()}),
      headers:{'X-Export-Secret':c.EXPORT_SECRET},muteHttpExceptions:true,followRedirects:false,
    });
  })) return;
  const status=response.getResponseCode();
  let body;
  try { body=JSON.parse(response.getContentText()); } catch { body=null; }
  if(status===400 && body?.error==='Invalid request') {
    console.log('PASS: Function reached and export secret accepted; intentional HTTP 400 is expected.');
    console.log('PREFLIGHT ONLY: SQL RPCs, snapshot creation, page data, Google writes and schedules were NOT tested.');
    console.log('If export still fails, confirm the latest operations_export.sql was applied in the SAME Supabase project; deployment alone does not apply SQL.');
  } else if(status===401 || status===403) {
    console.log('FAIL: HTTP '+status+' — check matching export secrets, Google authorization and the function-specific JWT setting.');
  } else if(status===404) {
    console.log('FAIL: HTTP 404 — check EXPORT_URL, deployment name and Supabase project.');
  } else if(status>=300 && status<400) {
    console.log('FAIL: Function URL redirected. Use the direct Supabase function URL, not the dashboard/website URL.');
  } else if(status===503) {
    console.log('FAIL: HTTP 503 — the function may lack OPERATIONS_EXPORT_SECRET or Supabase may be unavailable. This probe does not call SQL.');
  } else {
    console.log('FAIL: Unexpected function response (HTTP '+status+'). No response body was logged.');
  }
}
