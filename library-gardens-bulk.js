/* GARDENS — upload assistido, paginas ilustradas 045–054. */
(()=>{
'use strict';
const pages=[
[45,'Coração e Circulação','coracao'],
[46,'Pulmões e Respiração','pulmoes'],
[47,'Cérebro e Sistema Nervoso','cerebro'],
[48,'Músculos, Tendões e Ligamentos','musculos'],
[49,'Ossos, Articulações e Coluna','ossos'],
[50,'Fígado e Metabolismo','figado'],
[51,'Rins e Filtração','rins'],
[52,'Estômago e Digestão','estomago'],
[53,'Intestinos e Absorção','intestinos'],
[54,'Olhos e Visão','olhos']
];
const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=id=>document.getElementById(id);
const css='#garden-pages{position:fixed;inset:0;background:#000d;z-index:100005;display:grid;place-items:center;padding:12px;color:#f5ebd8;font:14px system-ui}#garden-pages[hidden]{display:none}#garden-pages .sheet{background:#102d2a;border:1px solid #c5b18d;border-radius:9px;padding:15px;width:min(850px,100%);max-height:93vh;overflow:auto}#garden-pages h2{font:normal 27px Georgia;margin:5px 0 9px}#garden-pages .top{display:flex;justify-content:space-between;gap:10px}#garden-pages button,#garden-pages select{padding:8px;background:#193f3a;color:#f5ebd8;border:1px solid #9fae9c;border-radius:4px;cursor:pointer}#garden-pages button:disabled{opacity:.45}#garden-pages .rows{margin:10px 0;display:grid;gap:4px}#garden-pages .line{display:grid;grid-template-columns:35px minmax(150px,1fr) minmax(0,2fr);align-items:center;gap:6px;padding:5px;border-bottom:1px solid #46645d}#garden-pages .line select{min-width:0;width:100%}#garden-pages .line span{font-size:11px;overflow-wrap:anywhere;color:#bccfc0}#garden-pages progress{width:100%}#garden-pages input{max-width:100%}#garden-pages .action{background:#d5c49d;color:#102c29;font-weight:700}#garden-pages-open{position:fixed;right:18px;bottom:76px;background:#102c29;color:#e8dec2;border:1px solid #aa9776;border-radius:8px;padding:11px;z-index:9996;cursor:pointer}@media(max-width:560px){#garden-pages .line{grid-template-columns:35px 1fr}#garden-pages .line span{grid-column:2}}';
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
const open=document.createElement('button');open.id='garden-pages-open';open.textContent='✦ Páginas GARDENS 045–054';open.type='button';document.body.appendChild(open);
const modal=document.createElement('div');modal.id='garden-pages';modal.hidden=true;
modal.innerHTML='<section class="sheet" role="dialog" aria-modal="true" aria-label="Publicar páginas de GARDENS"><div class="top"><div><small>SALA DO ARQUIVISTA · GARDENS</small><h2>Publicar 10 páginas ilustradas</h2></div><button id="gp-close">✕</button></div><p>Selecione juntas as dez imagens das páginas 045 a 054. Confira o número associado a cada arquivo antes de publicar.</p><input id="gp-files" type="file" accept="image/png,image/jpeg,image/webp" multiple /><div class="rows" id="gp-rows"></div><p id="gp-info" role="status">Selecione suas imagens.</p><progress id="gp-progress" max="10" value="0"></progress><p><button id="gp-save" class="action" disabled>Publicar as 10 páginas no Manual Básico</button></p><small>É necessário entrar com a conta de Arquivista. Nenhuma página anterior será substituída.</small></section>';
document.body.appendChild(modal);
let files=[],assigned=[],busy=false;
function guess(file){
 const n=norm(file.name);
 return pages.find(p=>n.includes(p[2])||new RegExp('(^|[^0-9])0?'+p[0]+'([^0-9]|$)').test(n))?.[0]||0;
}
function valid(){return files.length===10&&assigned.every(Number.isInteger)&&new Set(assigned).size===10&&assigned.every(n=>pages.some(p=>p[0]===n))&&files.every(f=>f.size>0&&f.size<=20*1048576&&['image/png','image/jpeg','image/webp'].includes(f.type));}
function render(){
 get('gp-rows').innerHTML=files.map((f,i)=>'<div class="line"><strong>'+(i+1)+'</strong><select data-index="'+i+'"><option value="">Página...</option>'+pages.map(p=>'<option value="'+p[0]+'" '+(assigned[i]===p[0]?'selected':'')+'>'+p[0]+' — '+escape(p[1])+'</option>').join('')+'</select><span>'+escape(f.name)+' · '+(f.size/1048576).toFixed(1)+' MB</span></div>').join('');
 get('gp-save').disabled=!valid()||busy;
 if(!busy)get('gp-info').textContent=valid()?'Dez imagens reconhecidas, prontas para publicar.':files.length?'Associe as dez imagens a páginas distintas.':'Selecione suas imagens.';
}
get('gp-files').addEventListener('change',e=>{files=Array.from(e.target.files||[]);assigned=files.map(guess);render();});
get('gp-rows').addEventListener('change',e=>{if(busy||e.target.tagName!=='SELECT')return;assigned[Number(e.target.dataset.index)]=Number(e.target.value)||0;render();});
get('gp-close').onclick=()=>{if(!busy)modal.hidden=true;};
open.onclick=()=>{modal.hidden=false;render();};
get('gp-save').onclick=async()=>{
 if(!valid()||busy)return;
 busy=true;render();get('gp-close').disabled=true;get('gp-files').disabled=true;
 const info=s=>get('gp-info').textContent=s;
 const cloud=window.HGCloud;
 try{
  if(!cloud?.client||!cloud?.save||!cloud?.load||!cloud?.verify)throw Error('A conexão com a nuvem não carregou.');
  if(!(await cloud.verify())&&!(await cloud.login()))throw Error('Entre como Arquivista para publicar.');
  let state=await cloud.load();
  if(!state?.books?.some(b=>b.id==='gardens-manual'))throw Error('Manual GARDENS não encontrado.');
  if(state.pages.some(p=>/^gardens-orgao-0(4[5-9]|5[0-4])$/.test(p.id)))throw Error('As páginas já foram publicadas. Atualize a biblioteca.');
  const base=Math.max(0,...state.pages.filter(p=>p.bookId==='gardens-manual').map(p=>Number(p.order)||0))+1;
  const entries=[];
  for(let i=0;i<pages.length;i++){
   const [number,title]=pages[i],file=files[assigned.indexOf(number)];
   const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
   info('Enviando '+number+' — '+title+' ('+(i+1)+'/10)...');
   const path='library/gardens/pages/'+number+'-'+crypto.randomUUID()+'.'+extension;
   const {error}=await cloud.client().storage.from('hells-books').upload(path,file,{contentType:file.type,upsert:false});
   if(error)throw Error('Falha na página '+number+': '+error.message);
   entries.push({id:'gardens-orgao-'+String(number).padStart(3,'0'),bookId:'gardens-manual',title:String(number).padStart(3,'0')+' — '+title,section:'2.2 — A Constituição do Corpo',kind:'image',body:'',image:cloud.client().storage.from('hells-books').getPublicUrl(path).data.publicUrl,order:base+i});
   get('gp-progress').value=i+1;
  }
  info('Salvando no livro...');
  state=await cloud.load();
  if(!state||state.pages.some(p=>entries.some(e=>e.id===p.id)))throw Error('O livro mudou durante o envio. Atualize a biblioteca.');
  state.pages.push(...entries);
  await cloud.save(state);
  info('Páginas 045–054 publicadas!');
  alert('Dez páginas publicadas no GARDENS!');
  location.reload();
 }catch(err){info('Erro: '+(err.message||err));alert('Não foi possível publicar: '+(err.message||err));}
 finally{busy=false;get('gp-close').disabled=false;get('gp-files').disabled=false;render();}
};
})();
