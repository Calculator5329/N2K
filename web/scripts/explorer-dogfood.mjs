import fs from 'node:fs/promises';
import path from 'node:path';
// Use an installed Explorer checkout; override only to verify a pending Explorer change.
const explorerRoot = process.env.APP_EXPLORER_ROOT ?? '/home/ethan/projects/ai/app-explorer';
const {PageHost} = await import(path.join(explorerRoot, 'src/host/index.mjs'));
const {DriveClient} = await import(path.join(explorerRoot, 'src/drive/index.mjs'));
const {loadConfig} = await import(path.join(explorerRoot, 'src/config/index.mjs'));
const {runStep} = await import(path.join(explorerRoot, 'src/engine/step.mjs'));
const config=await loadConfig(process.cwd());
const dir=path.join(config.explorerDir,'dogfood',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(dir,{recursive:true});
const report={startedAt:new Date().toISOString(),cases:[]};
const baseUrl=process.env.N2K_DOGFOOD_URL??'http://[::1]:8881';
async function scenario(name,fn){
 const host=new PageHost({baseUrl,ignoreUrlPatterns:config.ignoreUrlPatterns});await host.start(); const drive=new DriveClient(baseUrl);host.attachDrive(drive);await host.goto('/');
 let index=0;const result={name,steps:[],checks:[]};report.cases.push(result);
 const step=async(action,testId,extra={})=>{const s={action,...(testId?{testId}:{}),...extra};const r=await runStep({host,drive,config,step:s,dir:path.join(dir,name,String(++index).padStart(3,'0'))});result.steps.push({step:s,receipt:r.receipt,evidence:r.evidence});if(!r.receipt.ok)throw Error(r.receipt.detail);return r;};
 const check=(label,actual,expected)=>{result.checks.push({label,actual,expected,passed:JSON.stringify(actual)===JSON.stringify(expected)});};
 try{await step('click','welcome.actions.explore');await fn({host,step,check});result.passed=result.checks.every(x=>x.passed);}catch(e){result.error=String(e);result.passed=false;}finally{await host.stop();await fs.writeFile(path.join(dir,'receipt.json'),JSON.stringify(report,null,2));console.log(name,result.passed,result.error??result.checks);}
}
await scenario('phase-rename-cancel-persist',async({host,step,check})=>{
 await step('click','chrome.nav.item-compose');await step('click','compose.header.manage-phases');
 const id=await host.page.locator('[data-testid^="compose.phases.rename-"]').first().getAttribute('data-testid');const suffix=id.replace('compose.phases.rename-','');
 await step('expect','compose.phases.delete-'+suffix,{predicate:'disabled'});await step('click',id);await step('fill','compose.phases.name-'+suffix,{value:'Fictional finals'});await step('press','compose.phases.name-'+suffix,{key:'Enter'});
 check('rename applied',await host.page.getByTestId(id).innerText(),'Fictional finals');
 await step('click',id);await step('fill','compose.phases.name-'+suffix,{value:'Cancelled name'});await step('press','compose.phases.name-'+suffix,{key:'Escape'});
 check('Escape retains saved name',await host.page.getByTestId(id).innerText(),'Fictional finals');
 await step('click','compose.phases.add');await step('click','compose.phases.add');check('two additions yield three phases',await host.page.locator('[data-testid^="compose.phases.rename-"]').count(),3);
 await step('reload');await step('click','chrome.nav.item-compose');await step('click','compose.header.manage-phases');check('phase count survives reload',await host.page.locator('[data-testid^="compose.phases.rename-"]').count(),3);check('name survives reload',await host.page.locator('[data-testid^="compose.phases.rename-"]').first().innerText(),'Fictional finals');
});
await scenario('lookup-invalid-and-valid',async({host,step,check})=>{
 await step('fill','lookup.target.value',{value:'0'});await step('press','lookup.target.value',{key:'Tab'});check('invalid target clamped',await host.page.getByTestId('lookup.target.value').inputValue(),'1');
 await step('fill','lookup.target.value',{value:'24'});await step('expect','lookup.neighborhood.target-24',{predicate:'visible'});check('valid target retained',await host.page.getByTestId('lookup.target.value').inputValue(),'24');
});
await scenario('quick-race-complete-replay',async({host,step,check})=>{
 await step('click','chrome.nav.item-play');await step('click','play.difficulty.select-hard');await step('click','play.setup.begin');await step('click','play.board.player.cell-0');
 const first=await host.page.getByTestId('play.board.player.cell-0').getAttribute('class');await step('click','play.board.player.cell-0');check('second knock toggles claim off',await host.page.getByTestId('play.board.player.cell-0').getAttribute('class')!==first,true);
 await step('expect','play.results.new-race',{predicate:'visible',timing:{timeoutMs:60000,stableMs:100,pollMs:500}});await step('click','play.replay.enter');await step('click','play.replay.exit');await step('click','play.results.new-race');await step('expect','play.setup.begin',{predicate:'visible'});
});
await scenario('saved-match-pause-reload-resume',async({host,step,check})=>{
 await step('click','chrome.nav.item-compose');await step('click','compose.config.time-budget-30');await step('click','compose.toolbar.generate');
 await host.page.waitForFunction(()=>!document.querySelector('[data-testid="compose.toolbar.generate"]').disabled);
 await step('click','compose.header.save-as-new');await step('fill','library.save-as.name',{value:'Fictional dogfood match'});await step('click','library.save-as.confirm');
 await step('click','chrome.nav.item-library');const playId=await host.page.locator('[data-testid^="library.entry.play-"]').first().getAttribute('data-testid');await step('click',playId);await step('click','library.play-picker.begin');
 await step('expect','match.header.pause',{predicate:'visible'});await step('click','match.header.pause');await step('expect','match.pause.resume',{predicate:'visible'});
 const stored=await host.page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.includes('match:current')));check('match snapshot exists',stored.length,1);
 await step('reload');await step('click','app.resume.resume');await step('expect','match.pause.resume',{predicate:'visible'});await step('click','match.pause.resume');await step('expect','match.header.pause',{predicate:'visible'});
 await step('click','chrome.nav.item-lookup');await step('click','chrome.nav.item-play');await step('expect','match.pause.resume',{predicate:'visible'});
});
console.log('RECEIPT',path.join(dir,'receipt.json'));
process.exitCode=report.cases.every(x=>x.passed)?0:1;
