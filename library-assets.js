(() => {
'use strict';
const css='#hg-assets{position:fixed;inset:0;z-index:99999;background:#031012ee;color:#efe8d8;display:flex;justify-content:center;align-items:center;font:14px system-ui;padding:12px}#hg-assets[hidden]{display:none}#hg-assets *{box-sizing:border-box}#hg-assets .panel{background:#102c2a;border:1px solid #a9a082;border-radius:10px;width:min(1150px,100%);height:92vh;display:flex;flex-direction:column;overflow:hidden}#hg-assets header,#hg-assets .toolbar,#hg-assets footer{padding:12px 16px;border-bottom:1px solid #456259;display:flex;align-items:center;gap:8px;flex-wrap:wrap}#hg-assets header{justify-content:space-between}#hg-assets h2{font:normal 26px Georgia;margin:0}#hg-assets button,#hg-assets input,#hg-assets select{padding:8px;background:#193a35;color:#f0e7d4;border:1px solid #728d7f;border-radius:5px;font:inherit}#hg-assets button{cursor:pointer}#hg-assets button:disabled{opacity:.4}#hg-assets .body{display:grid;grid-template-columns:210px 1fr;flex:1;min-height:0}#hg-assets aside,#hg-assets main{overflow:auto;padding:12px}#hg-assets aside{border-right:1px solid #456259}#hg-assets aside button{width:100%;display:block;text-align:left;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis}#hg-assets .active{background:#d9c9a4;color:#102c2a}#hg-assets .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(135px,1fr));gap:10px}#hg-assets .card{border:1px solid #526e62;border-radius:7px;overflow:hidden;background:#0a2220}#hg-assets .card img{width:100%;height:140px;object-fit:contain;background:#061614;cursor:pointer}#hg-assets .info{padding:8px;overflow-wrap:anywhere}#hg-assets .info button{padding:4px;margin:3px 3px 0 0;font-size:11px}#hg-assets .path{color:#b5c6bc;margin-bottom:12px}#hg-assets footer{border-top:1px solid #456259;border-bottom:0;font-size:12px;color:#b9cbbd}#hg-assets-open{position:fixed;right:18px;bottom:18px;z-index:9998;padding:13px 16px;border:1px solid #a99a79;border-radius:8px;background:#d9c9a4;color:#102522;font-weight:bold;cursor:pointer}#hg-assets .drop{outline:2px dashed #d9c9a4;outline-offset:-6px}@media(max-width:650px){#hg-assets .body{grid-template-columns:120px 1fr}#hg-assets aside,#hg-assets main{padding:6px}#hg-assets .grid{grid-template-columns:repeat(auto-fill,minmax(105px,1fr))}}';
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
const launch=document.createElement('button');launch.id='hg-assets-open';launch.textContent='◈ Tokens & Mapas';document.body.appendChild(launch);
const root=document.createElement('div');root.id='hg-assets';root.hidden=true;
root.innerHTML='<div class="panel"><header><div><small>ACERVO DE RECURSOS</small><h2>Tokens & Mapas</h2></div><button id="hga-close">✕ Fechar</button></header><div class="toolbar"><button id="hga-new">＋ Pasta</button><button id="hga-renamefolder">Renomear pasta</button><button id="hga-deletefolder">Excluir pasta</button><button id="hga-upload">↑ Enviar imagens</button><input id="hga-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden><input id="hga-search" type="search" placeholder="Buscar..." aria-label="Buscar arquivos"><select id="hga-filter"><option value="all">Todos</option><option value="token">Tokens</option><option value="mapa">Mapas</option><option value="imagem">Imagens</option></select></div><div class="body"><aside id="hga-folders"></aside><main id="hga-main"><div class="path" id="hga-path">Biblioteca de recursos</div><div class="grid" id="hga-grid"></div></main></div><footer id="hga-status">As imagens ficam na nuvem; somente o Arquivista pode editar.</footer></div>';
document.body.appendChild(root);
const $=id=>document.getElementById(id);
let folders=[],assets=[],folder=null,editor=false,busy=false;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=()=>window.HGCloud?.client?.();
const publicURL=path=>api().storage.from('hells-books').getPublicUrl(path).data.publicUrl;
const status=s=>$('hga-status').textContent=s;
const current=()=>folders.find(f=>f.id===folder);
function tree(parent,depth=0,visited=new Set()){
 if(depth>15)return '';
 return folders.filter(f=>f.parent_id===parent&&!visited.has(f.id)).map(f=>{
  const seen=new Set(visited);seen.add(f.id);
  return '<button data-folder="'+safe(f.id)+'" class="'+(folder===f.id?'active':'')+'" style="padding-left:'+(8+depth*10)+'px">📁 '+safe(f.name)+'</button>'+tree(f.id,depth+1,seen);
 }).join('');
}
function render(){
 $('hga-folders').innerHTML='<button data-folder="" class="'+(folder===null?'active':'')+'">▤ Todos</button>'+tree(null);
 let parts=[],p=folder,seen=new Set();
 while(p&&!seen.has(p)){seen.add(p);const f=folders.find(x=>x.id===p);if(!f)break;parts.unshift(f.name);p=f.parent_id;}
 $('hga-path').textContent=['Biblioteca de recursos',...parts].join(' / ');
 const q=$('hga-search').value.toLowerCase().trim(),type=$('hga-filter').value;
 const filtered=assets.filter(a=>(folder===null||a.folder_id===folder)&&(type==='all'||a.kind===type)&&a.name.toLowerCase().includes(q));
 $('hga-grid').innerHTML=filtered.map(a=>'<div class="card"><img data-view="'+safe(a.id)+'" src="'+safe(publicURL(a.storage_path))+'" alt="'+safe(a.name)+'" loading="lazy"><div class="info"><strong>'+safe(a.name)+'</strong><div style="font-size:11px;color:#abc0b5">'+safe(a.kind)+' · '+(a.size_bytes/1048576).toFixed(1)+' MB</div><button data-view="'+safe(a.id)+'">Ver</button><button data-download="'+safe(a.id)+'">Baixar</button>'+(editor?'<button data-edit="'+safe(a.id)+'">Editar</button><button data-move="'+safe(a.id)+'">Mover</button><button data-delete="'+safe(a.id)+'">Excluir</button>':'')+'</div></div>').join('')||'<p>Nenhum arquivo aqui. Crie uma pasta ou envie imagens.</p>';
 for(const id of ['hga-new','hga-renamefolder','hga-deletefolder','hga-upload'])$(id).disabled=!editor||busy;
 status(editor?'Modo Arquivista · '+assets.length+' arquivos na biblioteca.':'Modo leitura · '+assets.length+' arquivos. Faça login como Arquivista para editar.');
}
async function refresh(){
 const s=api();if(!s)throw Error('Conexão com a biblioteca indisponível.');
 const [f,a]=await Promise.all([s.from('hells_asset_folders').select('*').order('name'),s.from('hells_assets').select('*').order('created_at',{ascending:false})]);
 if(f.error)throw f.error;if(a.error)throw a.error;
 folders=f.data||[];assets=a.data||[];
 editor=Boolean(await window.HGCloud.verify().catch(()=>false));
 render();
}
async function edit(fn){
 if(!editor)return alert('Entre na conta autorizada do Arquivista.');
 busy=true;render();
 try{await fn();await refresh();}catch(e){alert('Erro: '+(e.message||e));}
 finally{busy=false;render();}
}
$('hga-new').onclick=()=>{
 const name=prompt('Nome da nova pasta:')?.trim();if(!name)return;
 if(name.length>120)return alert('Máximo de 120 caracteres.');
 edit(async()=>{const r=await api().from('hells_asset_folders').insert({name,parent_id:folder});if(r.error)throw r.error;});
};
$('hga-renamefolder').onclick=()=>{
 if(!folder)return alert('Selecione uma pasta.');
 const name=prompt('Novo nome:',current()?.name)?.trim();if(!name)return;
 edit(async()=>{const r=await api().from('hells_asset_folders').update({name:name.slice(0,120)}).eq('id',folder);if(r.error)throw r.error;});
};
$('hga-deletefolder').onclick=()=>{
 if(!folder)return alert('Selecione uma pasta.');
 if(folders.some(f=>f.parent_id===folder)||assets.some(a=>a.folder_id===folder))return alert('Esvazie a pasta e suas subpastas antes de excluir.');
 if(!confirm('Excluir a pasta vazia?'))return;
 edit(async()=>{const r=await api().from('hells_asset_folders').delete().eq('id',folder);if(r.error)throw r.error;folder=null;});
};
$('hga-upload').onclick=()=>$('hga-file').click();
$('hga-file').onchange=e=>{
 const files=Array.from(e.target.files);if(!files.length)return;
 const kind=prompt('Tipo: token, mapa ou imagem','token')?.toLowerCase().trim();
 if(!['token','mapa','imagem'].includes(kind))return alert('Tipo inválido.');
 edit(async()=>{
  for(let i=0;i<files.length;i++){
   const file=files[i],ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[file.type];
   if(!ext||file.size>50*1048576)throw Error('Arquivo não suportado ou acima de 50 MB: '+file.name);
   const path='library/assets/'+crypto.randomUUID()+'.'+ext;
   status('Enviando '+(i+1)+' de '+files.length+': '+file.name);
   const up=await api().storage.from('hells-books').upload(path,file,{contentType:file.type,upsert:false});if(up.error)throw up.error;
   const r=await api().from('hells_assets').insert({name:file.name.slice(0,180),kind,folder_id:folder,storage_path:path,mime_type:file.type,size_bytes:file.size});
   if(r.error){await api().storage.from('hells-books').remove([path]);throw r.error;}
  }
 });
 e.target.value='';
};
$('hga-search').oninput=render;$('hga-filter').onchange=render;
$('hga-folders').onclick=e=>{const b=e.target.closest('[data-folder]');if(!b)return;folder=b.dataset.folder||null;render();};
$('hga-grid').onclick=e=>{
 const b=e.target.closest('[data-view],[data-download],[data-edit],[data-move],[data-delete]');if(!b)return;
 const action=['view','download','edit','move','delete'].find(k=>b.hasAttribute('data-'+k));
 const a=assets.find(x=>x.id===b.dataset[action]);if(!a)return;
 if(action==='view')return window.open(publicURL(a.storage_path),'_blank','noopener,noreferrer');
 if(action==='download'){const l=document.createElement('a');l.href=publicURL(a.storage_path);l.target='_blank';l.rel='noopener';l.download=a.name;l.click();return;}
 if(!editor)return;
 if(action==='edit'){
  const name=prompt('Nome do arquivo:',a.name)?.trim();if(!name)return;
  const kind=prompt('Tipo: token, mapa ou imagem',a.kind)?.trim().toLowerCase();if(!['token','mapa','imagem'].includes(kind))return;
  return edit(async()=>{const r=await api().from('hells_assets').update({name:name.slice(0,180),kind}).eq('id',a.id);if(r.error)throw r.error;});
 }
 if(action==='move'){
  const choice=prompt('Digite o nome da pasta de destino (ou "raiz"):\n'+folders.map(f=>f.name).join('\n'),'raiz')?.trim();if(!choice)return;
  const dest=choice.toLowerCase()==='raiz'?null:folders.find(f=>f.name===choice)?.id;
  if(choice.toLowerCase()!=='raiz'&&!dest)return alert('Pasta não encontrada.');
  return edit(async()=>{const r=await api().from('hells_assets').update({folder_id:dest}).eq('id',a.id);if(r.error)throw r.error;});
 }
 if(action==='delete'&&confirm('Excluir definitivamente '+a.name+'?'))return edit(async()=>{
  const r=await api().from('hells_assets').delete().eq('id',a.id);if(r.error)throw r.error;
  const up=await api().storage.from('hells-books').remove([a.storage_path]);if(up.error)throw up.error;
 });
};
const main=$('hga-main');
main.ondragover=e=>{if(!editor)return;e.preventDefault();main.classList.add('drop');};
main.ondragleave=()=>main.classList.remove('drop');
main.ondrop=e=>{main.classList.remove('drop');if(!editor)return;e.preventDefault();const dt=new DataTransfer();for(const f of e.dataTransfer.files)dt.items.add(f);$('hga-file').files=dt.files;$('hga-file').dispatchEvent(new Event('change'));};
$('hga-close').onclick=()=>root.hidden=true;
launch.onclick=async()=>{root.hidden=false;status('Carregando...');try{await refresh();}catch(e){status('Erro ao carregar: '+(e.message||e));}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)root.hidden=true;});
})();