import fs from 'node:fs/promises';
import path from 'node:path';
const explorerRoot=process.env.APP_EXPLORER_ROOT??'/home/ethan/projects/ai/app-explorer';
const {evidenceHtml,evidenceCss,escapeHtml:esc}=await import(path.join(explorerRoot,'src/report/evidence.mjs'));
const root=path.resolve('.explorer');
const receipt=path.resolve(process.argv[2]);
const data=JSON.parse(await fs.readFile(receipt,'utf8'));
let sections='';
for(const item of data.cases){
 sections+=`<section><h2>${esc(item.name)} · ${item.passed?'Passed':'Needs investigation'}</h2><ul>${item.checks.map(c=>`<li>${esc(c.label)}: ${esc(JSON.stringify(c.actual))} · ${c.passed?'passed':'failed'}</li>`).join('')}</ul>`;
 for(const s of item.steps)sections+=`<details><summary>${esc(s.step.action)} ${esc(s.step.testId??s.step.path??'page')} · ${s.receipt.ok?'passed':'failed'}</summary>${await evidenceHtml(s.evidence,root)}<a href="${esc(path.relative(root,s.evidence.step))}">Raw step, temporal samples and behavior</a></details>`;
 sections+='</section>';
}
await fs.writeFile(path.join(root,'review.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>N2K · Explorer dogfood</title><style>${evidenceCss}body{margin:auto;max-width:1120px;padding:32px 20px;background:#101713;color:#e4eee7;font:16px/1.6 system-ui}h1{font-size:36px;line-height:1.2}h2{font-size:23px}section{margin:48px 0}p{max-width:78ch}summary{padding:12px 4px}li{margin:8px 0}@media print{body{background:white;color:black}details{display:block}}</style><main><p>App Explorer × N2K · fictional browser state</p><h1>Saved drafts survive reload. New matches start running.</h1><p>Outcome exploration found two lifecycle defects: autosave replaced the saved draft before hydration, and development effect replay paused a newly started match. Both now have browser regression checks.</p><p>${data.cases.filter(c=>c.passed).length}/${data.cases.length} recorded goal scenarios passed in this run. These are bounded workflows, not a claim of exhaustive application coverage.</p><p>Each step includes contextual frames and app behavior. Capture is capped at 2.5 seconds and 12 frames; long races retain temporal condition samples rather than continuous video. Files contain generated game data only.</p><p><a href="${esc(path.relative(root,receipt))}">Machine receipt</a> · <a href="dogfood/2026-09-06T20-54-56.726Z/receipt.json">Original draft-loss evidence</a></p>${sections}</main></html>`);
console.log(path.join(root,'review.html'));
