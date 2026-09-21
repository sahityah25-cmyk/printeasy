/**
 * PrintEasy production-friendly Google Apps Script backend.
 * Replace FOLDER_ID and SHOP_TOKEN, then deploy as Web App:
 * Execute as: Me
 * Who has access: Anyone
 */
const FOLDER_ID = '1-g2PbtMB6oTzOmUwkzJk9eqatkn-gbSuHERE';
const SHOP_TOKEN = 'CHANGE_THIS_SHOP_TOKEN';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;
const RETENTION_HOURS = 12;

function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
function folder_(){return DriveApp.getFolderById(FOLDER_ID);}
function nowIso_(){return new Date().toISOString();}
function requireShop_(e){
  const token=(e&&e.parameter&&e.parameter.token)||'';
  if(token!==SHOP_TOKEN) throw new Error('Unauthorized shop request');
}
function safeName_(s){return String(s||'file').replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').slice(0,120);}
function metadataFileName_(orderId){return String(orderId)+'_order.json';}
function findMetadata_(orderId){
  const files=folder_().getFilesByName(metadataFileName_(orderId));
  return files.hasNext()?files.next():null;
}
function readOrder_(orderId){
  const f=findMetadata_(orderId); if(!f)return null;
  try{return JSON.parse(f.getBlob().getDataAsString())}catch(e){throw new Error('Order metadata is corrupted')}
}
function writeOrder_(order){
  const f=findMetadata_(order.orderId);
  const body=JSON.stringify(order,null,2);
  if(f)f.setContent(body); else folder_().createFile(metadataFileName_(order.orderId),body,MimeType.JSON);
}
function normalizeFiles_(arr){return (Array.isArray(arr)?arr:[]).slice(0,MAX_FILES).map(f=>({name:safeName_(f.name),type:String(f.type||'application/octet-stream'),size:Number(f.size||0),dataUrl:f.dataUrl||''}));}
function validateCreate_(data){
  if(!data.orderId||!data.code)throw new Error('Missing orderId/code');
  const fs=normalizeFiles_(data.files); if(!fs.length)throw new Error('No files');
  fs.forEach(f=>{if(!f.dataUrl)throw new Error('Missing file data: '+f.name); if(f.size>MAX_FILE_BYTES)throw new Error('File too large: '+f.name)});
  return fs;
}
function doPost(e){
  try{
    const data=JSON.parse((e.postData&&e.postData.contents)||'{}');
    const action=String(data.action||'CREATE_ORDER').toUpperCase();
    if(action==='CREATE_ORDER')return createOrder_(data);
    if(action==='UPDATE_ORDER'){if(data.token!==SHOP_TOKEN && data.reason!=='Cancelled by customer')throw new Error('Unauthorized'); return updateOrder_(data);}
    return json_({success:false,error:'Unknown action'});
  }catch(err){return json_({success:false,error:String(err.message||err)})}
}
function createOrder_(data){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    if(findMetadata_(data.orderId))return json_({success:true,duplicate:true,order:readOrder_(data.orderId)});
    const fs=validateCreate_(data), folder=folder_(), saved=[];
    fs.forEach(f=>{
      const base64=String(f.dataUrl).split(',')[1]; if(!base64)throw new Error('Invalid data URL: '+f.name);
      const blob=Utilities.newBlob(Utilities.base64Decode(base64),f.type,safeName_(f.name));
      const file=folder.createFile(blob); saved.push({name:file.getName(),type:f.type,size:file.getSize(),fileId:file.getId(),url:file.getUrl(),status:'waiting'});
    });
    const ts=nowIso_();
    const order={orderId:String(data.orderId),code:String(data.code),files:saved,color:!!data.color,duplex:!!data.duplex,copies:Math.max(1,Number(data.copies||1)),printStatus:'waiting',paymentStatus:'pending',timestamp:ts,updatedAt:ts,price:0,priceFinal:null,notes:''};
    writeOrder_(order); return json_({success:true,order});
  }finally{lock.releaseLock()}
}
function updateOrder_(data){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const order=readOrder_(data.orderId); if(!order)throw new Error('Order not found');
    const current=order.printStatus||'waiting', next=data.status||current;
    const allowed={waiting:['printing','failed'],printing:['printed','failed'],printed:['collected','waiting','failed'],collected:['waiting'],failed:['waiting']};
    if(next!==current && !(allowed[current]||[]).includes(next))throw new Error('Invalid status change '+current+' → '+next);
    if(data.code && String(data.code)!==String(order.code))throw new Error('Invalid order code');
    if(data.copies!=null)order.copies=Math.max(1,Math.min(200,Number(data.copies)||1));
    if(data.color!=null)order.color=!!data.color;
    if(data.duplex!=null)order.duplex=!!data.duplex;
    if(data.price!=null)order.price=Math.max(0,Number(data.price)||0);
    if(data.priceFinal!==undefined)order.priceFinal=data.priceFinal===null?null:Math.max(0,Number(data.priceFinal)||0);
    if(data.notes!=null)order.notes=String(data.notes).slice(0,500);
    if(data.printer!=null)order.printer=String(data.printer).slice(0,120);
    if(data.printerId!=null)order.printerId=String(data.printerId).slice(0,120);
    if(data.paymentStatus!=null)order.paymentStatus=String(data.paymentStatus);
    if(data.reason)order.cancelReason=String(data.reason).slice(0,300);
    if(next!==current)order.printStatus=next;
    if(next==='collected')order.collectedAt=nowIso_();
    order.updatedAt=nowIso_();
    if(Array.isArray(order.files))order.files=order.files.map(f=>({...f,status:next==='printing'?'printing':next==='printed'||next==='collected'?'printed':next==='failed'?'waiting':'waiting'}));
    if(Number(data.reprintCount)!=null)order.reprintCount=Number(data.reprintCount)||0;
    writeOrder_(order);return json_({success:true,order});
  }finally{lock.releaseLock()}
}
function doGet(e){
  try{
    const action=String((e.parameter&&e.parameter.action)||'ORDERS').toUpperCase();
    if(action==='ORDER'){
      const order=readOrder_(e.parameter.orderId); if(!order)throw new Error('Order not found');
      if(String(e.parameter.code||'')!==String(order.code||''))throw new Error('Invalid order code');
      return json_({success:true,order});
    }
    if(action==='ORDERS'){
      requireShop_(e); const it=folder_().getFiles(),orders=[];
      while(it.hasNext()){const f=it.next();if(f.getName().endsWith('_order.json')){try{orders.push(JSON.parse(f.getBlob().getDataAsString()))}catch(_) {}}}
      orders.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));return json_({success:true,orders});
    }
    return json_({success:false,error:'Unknown action'});
  }catch(err){return json_({success:false,error:String(err.message||err)})}
}
function cleanupOldFiles(){
  const cutoff=Date.now()-RETENTION_HOURS*60*60*1000,folder=folder_(),it=folder.getFiles();let n=0;
  while(it.hasNext()){const f=it.next();if(f.getDateCreated().getTime()<cutoff){f.setTrashed(true);n++}}
  return n;
}
