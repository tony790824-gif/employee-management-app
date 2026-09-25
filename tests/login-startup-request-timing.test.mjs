import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const clientSource = await readFile('postgres-api-client.js', 'utf8');
const workerSource = await readFile('service-worker.js', 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const flush = async () => { for (let i=0; i<12; i++) await Promise.resolve(); };
function clientFixture() {
  let now=1000, timer;
  const records=[], calls=[], response=deferred(), body=deferred();
  const context=vm.createContext({ URL, TextEncoder, TextDecoder, AbortController,
    Date: class extends Date { static now(){return now;} },
    setTimeout(fn){timer=fn;return 1;}, clearTimeout(){timer=null;},
    document:{visibilityState:'visible'}, navigator:{onLine:true, serviceWorker:{controller:{}}},
    window:{matchMedia:()=>({matches:true}), shiftResumeDiagnostics:{mark:(event,fields)=>records.push({event,...fields}),authError:error=>({error_code:error.code})}}
  });
  vm.runInContext(clientSource,context);
  const client=context.BankePostgresApi.createClient({ baseUrl:'https://bankeban-production-api.onrender.com/v1',
    getAccessToken(){throw new Error('must not read token');},getWorkspaceId(){throw new Error('must not read workspace');},
    cryptoImpl:webcrypto, fetchImpl(url,options){calls.push({url,options});options.signal.addEventListener('abort',()=>response.reject(Object.assign(new Error('fixture'),{name:'AbortError'})));return response.promise;}
  });
  return {client,records,calls,response,body, advance(ms){now+=ms;},abort(){timer();},timer:()=>timer,
    headers(){response.resolve({status:200,ok:true,headers:{get:()=>null},text:()=>body.promise});},
    phases:()=>records.filter(r=>r.event==='READINESS_TIMING')};
}
const timed=clientFixture();
const pending=timed.client.readiness();
assert.deepEqual(timed.phases().map(r=>r.request_phase),['REQUEST_START','FETCH_DISPATCHED']);
assert.equal(timed.calls[0].options.credentials,'omit');
assert.equal(timed.calls[0].options.cache,'no-store');
assert.equal(timed.calls[0].options.headers.Authorization,undefined);
assert.equal(timed.phases()[0].network_request_id,timed.calls[0].options.headers['X-Request-Id']);
timed.advance(9000); timed.headers(); await flush();
assert.equal(timed.phases().at(-1).request_phase,'RESPONSE_HEADERS_RECEIVED');
assert.equal(timed.phases().at(-1).elapsed_ms,9000);
assert.equal(timed.timer(),null,'existing timeout still covers headers, not response body');
timed.advance(195);timed.body.resolve('{"ok":true}');await pending;
assert.equal(timed.phases().at(-2).request_phase,'RESPONSE_BODY_DONE');
assert.equal(timed.phases().at(-1).elapsed_ms,9195);
assert.equal(timed.phases().at(-1).success,true);
const timeout=clientFixture();const rejected=timeout.client.readiness();
timeout.advance(15000);timeout.abort();
await assert.rejects(rejected,e=>e.code==='POSTGRES_API_TIMEOUT');
assert.deepEqual(timeout.phases().map(r=>r.request_phase),['REQUEST_START','FETCH_DISPATCHED','ABORT_FIRED','REQUEST_END']);
assert.equal(timeout.calls.length,1,'no retry added');
const probe=clientFixture();const probes=probe.client.compareReadiness();
assert.equal(probe.calls.length,2);
assert.ok(probe.calls[0].options.headers['X-Request-Id']);
assert.equal(probe.calls[1].options.headers['X-Request-Id'],undefined);
probe.headers();probe.body.resolve('{"ok":true}');await probes;
assert.deepEqual(probe.phases().filter(r=>r.request_phase==='REQUEST_START').map(r=>r.request_mode),['CLIENT_PROBE','DIRECT_PROBE']);

async function workerFixture({cacheHit=false,lookupFail=false,networkFail=false,reportFail=false,navigate=false,path='/v1/readiness'}={}) {
  let now=1000, handler, result, fetched=0, lookups=0;
  const messages=[], waits=[], lookup=deferred(), network=deferred();
  const response={status:200,ok:true};
  const sandbox={importScripts(){},URL,Date:class extends Date{static now(){return now;}},
    self:{addEventListener(name,fn){if(name==='fetch')handler=fn;},clients:{get:async()=>({postMessage(value){if(reportFail)throw new Error('fixture');messages.push(value);}})}},
    caches:{open:async()=>({match(){lookups++;return lookup.promise;}})},
    fetch(){fetched++;return network.promise;}
  };
  vm.runInNewContext(workerSource,sandbox);
  handler({clientId:'local-fixture-client',request:{method:'GET',mode:navigate?'navigate':'cors',url:`https://bankeban-production-api.onrender.com${path}`,
    headers:{get:()=> '11111111-2222-4333-8444-555555555555'}},
    respondWith(value){result=value;},waitUntil(value){waits.push(value);}
  });
  await flush();
  if(navigate){network.resolve(response);assert.equal(await result,response);assert.equal(lookups,0);return;}
  now+=120;
  if(lookupFail)lookup.reject(new Error('lookup fixture'));else lookup.resolve(cacheHit?response:undefined);
  await flush();
  now+=230;
  if(networkFail)network.reject(new Error('network fixture'));else network.resolve(response);
  if(lookupFail||networkFail)await assert.rejects(result);else assert.equal(await result,response);
  await Promise.all(waits);
  assert.equal(fetched,cacheHit||lookupFail?0:1);
  if(reportFail||path!=='/v1/readiness')assert.equal(messages.length,0);
  else {
    assert.equal(messages[0].request_phase,'SW_INTERCEPT_START');
    assert.equal(messages[1].request_phase,'SW_CACHE_LOOKUP_START');
    assert.equal(messages[2].request_phase,'SW_CACHE_LOOKUP_END');
    assert.equal(messages[2].timestamp-messages[1].timestamp,120);
    assert.ok(messages.every(m=>m.fallback_used===false));
    if(!lookupFail)assert.equal(messages[2].cache_hit,cacheHit);
    if(!cacheHit&&!lookupFail){assert.equal(messages[3].request_phase,'NETWORK_FETCH_START');assert.equal(messages[4].request_phase,networkFail?'SW_NETWORK_FAIL':'SW_RESPONSE_HEADERS_RECEIVED');}
  }
  assert.doesNotMatch(JSON.stringify(messages),/Authorization|Cookie|https:|token|password/i);
}
for(const options of [{},{cacheHit:true},{lookupFail:true},{networkFail:true},{reportFail:true},{navigate:true},{path:'/v1/bootstrap'}])await workerFixture(options);
console.log('Readiness request/SW timing passed: header/body/abort separation, safe one-shot probes, unchanged cache/network/fallback behavior and no replay.');
