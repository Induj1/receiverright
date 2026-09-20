/** Assemble only explicit, reviewed submission artifacts; never includes local credentials. */
import {readFile, writeFile, mkdir, copyFile, stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ZipArchive} from 'archiver';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'output','submission-final');
const videoStem='ReceiveRight-Live-Demo';
const render=JSON.parse(await readFile(path.join(root,'output/video',videoStem+'.render.json'),'utf8'));
if(render.durationSeconds>=180)throw new Error('The submission video must be shorter than three minutes.');
const videoBytes=await readFile(path.join(root,'output/video',videoStem+'.mp4'));
const videoHash=createHash('sha256').update(videoBytes).digest('hex');
if(videoHash.toUpperCase()!==render.outputSha256.toUpperCase())throw new Error('Video differs from its verified render report.');
const submission=await readFile(path.join(root,'docs/SUBMISSION.md'),'utf8');
const videoSection=submission.split('## YouTube video demo link')[1]?.split('\n## ')[0]||'';
const watchUrl=videoSection.match(/https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+)/)?.[0];
const transcript=await readFile(path.join(root,'output/video',videoStem+'.transcript.txt'),'utf8');
await writeFile(path.join(root,'docs/DEMO-SCRIPT.md'),'# Final recorded demo narration\n\n'+
  `Measured length: **${render.durationSeconds} seconds (2:46)**. The MP4 uses actual browser interactions with disclosed still-frame narration holds, synthetic data, and generated narration.\n\n`+
  transcript.split(/\r?\n/).map(line=>line.startsWith('SECTION ')?'## '+line:line).join('\n')+
  '\n\nPublication settings and current status: [Video publishing](VIDEO-PUBLISHING.md).\n');
const videoEvidence={verifiedAt:render.renderedAt,durationSeconds:render.durationSeconds,width:render.width,height:render.height,frameRate:render.frameRate,subtitleCues:render.subtitleCues,sha256:videoHash,format:render.format,syntheticData:true,generatedNarration:render.voice,interSectionPausesOmitted:true,captureFramesRemovedFor30fps:render.captureFramesRemovedFor30fps,capturedInteractionSeconds:render.sections.reduce((sum,section)=>sum+section.sourceSeconds,0),sections:render.sections.map(section=>({id:section.id,title:section.title,sourceSeconds:section.sourceSeconds,durationSeconds:section.durationSeconds,initialFrameHoldSeconds:section.initialFrameHoldSeconds,finalFrameHoldSeconds:section.finalFrameHoldSeconds,frameCount:section.frameCount,uiAreaPercent:section.uiAreaPercent}))};
await writeFile(path.join(root,'docs/evidence/video-verification.json'),JSON.stringify(videoEvidence,null,2)+'\n');

const welcome=`# ReceiveRight — final submission kit

Prepared for AWS × WeMakeDevs First Commit 2026, **Ship it**. Team **Bro code**; leader **Induj Gupta**, WeMakeDevs **indujgupta**.

- [Live application](https://ds687e8jj0.execute-api.ap-south-1.amazonaws.com)
- [Public source](https://github.com/Induj1/receiverright)
- [Form answers](SUBMISSION.md)
- [Two-page PDF](ReceiveRight-Submission-Brief.pdf)
- [Final 2:46 video](${videoStem}.mp4), [captions](${videoStem}.srt), [narration](${videoStem}.transcript.txt)
- [Verification](docs/VERIFICATION.md), [invoice evaluation](docs/INVOICE-EVALUATION.md), [cost assumptions](docs/OPERATING-COST.md)

## Submission status

${watchUrl?'YouTube: '+watchUrl:'The video is finished locally. An authorized unlisted YouTube upload is waiting for account sign-in; the required watch URL is not yet available.'}

Induj's GitHub, LinkedIn, confirmed username, and publicly accessible resume are entered. Harshita, Rayyan, and Laavanya's supplied usernames are entered. Their unsupplied optional profile/resume/contribution fields should remain blank until real information is provided. The event form has **not** been submitted. Do not copy explanatory placeholders into form fields.

## Verified state

103 automated tests passed, production builds passed, and the deployed receiver/supplier workflow, workspace recovery, retained history, private S3 evidence, and real Textract integration were exercised. The final browser walkthrough includes upload, uncertain-unit correction, physical counts, supplier acknowledgement, closure, earlier versions, and workspace restoration.

The five-invoice synthetic evaluation returned 12 of 13 printed rows. Failures are documented; it is not a representative accuracy benchmark. No completed real-shop pilot, savings, or recovered-money outcome is claimed. A [trial protocol](docs/USER-TRIAL.md) and [individual learning worksheet](docs/TEAM-LEARNING.md) are included for actual follow-up work.

The video contains rapid recorded app interactions with still-frame narration holds and generated narration. The [optional Builder Center article](docs/BUILDER-BLOG-DRAFT.md) remains unpublished. OpenAI Codex substantially assisted implementation, testing, deployment, documentation, and presentation.

AWS resources remain deployed. The [cost model](docs/OPERATING-COST.md) gives assumptions and exclusions, not an account spending cap. File hashes are listed in MANIFEST.json.
`;
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'START-HERE.md'),welcome);
const files=[
  ['docs/SUBMISSION.md','SUBMISSION.md'],
  ['output/pdf/ReceiveRight-Submission-Brief.pdf','ReceiveRight-Submission-Brief.pdf'],
  ...['mp4','srt','transcript.txt'].map(ext=>[`output/video/${videoStem}.${ext}`,`${videoStem}.${ext}`]),
  ...['SUBMISSION','VERIFICATION','INVOICE-EVALUATION','OPERATING-COST','USER-TRIAL','TEAM-LEARNING','VIDEO-PUBLISHING','BUILDER-BLOG-DRAFT','DEMO-SCRIPT','INTERACTION-VIDEO'].map(name=>[`docs/${name}.md`,`docs/${name}.md`]),
  ['docs/deployed-smoke.json','docs/deployed-smoke.json'],
  ...['aws-cost-model','aws-price-products','invoice-evaluation','video-verification'].map(name=>[`docs/evidence/${name}.json`,`docs/evidence/${name}.json`]),
  ...['overview','textract','supplier','mobile-recovery'].map(name=>[`docs/screenshots/${name}.png`,`docs/screenshots/${name}.png`]),
];
const corpus=JSON.parse(await readFile(path.join(root,'public/evaluation/expected.json'),'utf8'));
files.push(['public/evaluation/expected.json','public/evaluation/expected.json']);
for(const fixture of corpus.cases)files.push([`public/evaluation/${fixture.image}`,`public/evaluation/${fixture.image}`]);
for(const [source,destination] of files){
  const target=path.join(output,destination);
  await mkdir(path.dirname(target),{recursive:true});
  await copyFile(path.join(root,source),target);
}
const included=['START-HERE.md',...files.map(([,destination])=>destination)];
const hashes=[];
for(const name of included){const bytes=await readFile(path.join(output,name));hashes.push({file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(path.join(output,'MANIFEST.json'),JSON.stringify({createdAt:new Date().toISOString(),youtubeUrl:watchUrl||null,formSubmitted:false,files:hashes},null,2)+'\n');
const zipPath=path.join(root,'output/ReceiveRight-Submission-Kit.zip');
await new Promise((resolve,reject)=>{
  const stream=createWriteStream(zipPath);
  const archive=new ZipArchive({zlib:{level:9}});
  stream.on('close',resolve);stream.on('error',reject);archive.on('error',reject);archive.on('warning',reject);archive.pipe(stream);
  for(const name of [...included,'MANIFEST.json'])archive.file(path.join(output,name),{name});
  archive.finalize().catch(reject);
});
console.log(JSON.stringify({directory:output,zip:zipPath,bytes:(await stat(zipPath)).size,files:included.length+1,videoSeconds:render.durationSeconds,youtubeUrl:watchUrl||null},null,2));
