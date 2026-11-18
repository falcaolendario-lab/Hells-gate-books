/* Hells Gate Books — Biblioteca de Recursos
   A second, independent Supabase-backed library for nested folders, tokens, maps and images.
   Reuses HGCloud's authenticated user; public reading and archivist-only editing. */
(() => {
  'use strict';
  const FOLDERS = 'hells_asset_folders';
  const ASSETS = 'hells_assets';
  const BUCKET = 'hells-books';
  const TYPES = {token:'Token', mapa:'Mapa', imagem:'Imagem'};
  const MIME = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
  const MAX_FILE = 45 * 1024 * 1024;
  const $ = s => document.querySelector(s);
  let root, db, folders = [], assets = [], locationId = null, typeFilter = 'todos', textSearch = '';
  let canEdit = false, busy = false, selectedPreview = null, opened = false;

  const esc = input => String(input == null ? '' : input).replace(/[&<>"']/g,c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byName = (a,b) => a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'});
  const alertUser = message => { const el = root?.querySelector('#hgr-status'); if(el) el.textContent=message; };
  const fmtBytes = n => n >= 1024*1024 ? (n/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB';
  const safePath = p => typeof p==='string' &&
    /^library\/assets\/[a-z0-9/_-]+\.(png|jpe?g|webp|gif)$/i.test(p) && !p.includes('..');
  const itemURL = item => safePath(item?.storage_path) ?
    db.storage.from(BUCKET).getPublicUrl(item.storage_path).data.publicUrl : '';
  const current = () => folders.find(f => f.id===locationId);
  const directCount = id => assets.filter(a => a.folder_id===id).length;

  function folderTrail(id) {
    const trail=[],used=new Set();
    while(id && !used.has(id)) {
      used.add(id);const folder=folders.find(f=>f.id===id);
      if(!folder)break;
      trail.unshift(folder);id=folder.parent_id;
    }
    return trail;
  }
  const pathLabel = id => id===null?'Raiz':folderTrail(id).map(f=>f.name).join(' / ') || 'Raiz';
  function children(id) { return folders.filter(f => f.parent_id === id).sort(byName); }
  function descendants(id) {
    const found=new Set(),queue=[id];
    while(queue.length){
      const parent=queue.shift();
      for(const child of folders.filter(f=>f.parent_id===parent)){
        if(!found.has(child.id)){found.add(child.id);queue.push(child.id);}
      }
    }
    return found;
  }

  async function getPages(table) {
    const all=[];let start=0;
    while(true){
      const {data,error} = await db.from(table).select('*').order('created_at',{ascending:true}).range(start,start+999);
      if(error)throw new Error('Não foi possível consultar '+table+': '+error.message);
      all.push(...(data||[]));
      if(!data || data.length<1000)break;
      start+=1000;
      if(start>100000)throw new Error('Acervo muito grande. É necessário paginar a consulta.');
    }
    return all;
  }

  async function reload() {
    if(!db)db=window.HGCloud?.client();
    if(!db)throw new Error('Conexão com Supabase indisponível. Atualize a página.');
    const results = await Promise.all([getPages(FOLDERS),getPages(ASSETS)]);
    folders=results[0];assets=results[1];
    if(locationId && !folders.find(f=>f.id===locationId))locationId=null;
    render();
  }

  function treeHTML(parent,depth=0,visited=new Set()) {
    if(depth>12)return '';
    return children(parent).filter(f=>!visited.has(f.id)).map(f=>{
      const next=new Set(visited);next.add(f.id);
      return '<button type="button" class="hgr-tree-btn '+(locationId===f.id?'active':'')+
        '" style="padding-left:'+(12+depth*11)+'px" data-hgr="folder" data-id="'+esc(f.id)+'" title="'+esc(pathLabel(f.id))+'">'+
        '<span aria-hidden="true">▸</span><span class="hgr-tree-name">'+esc(f.name)+'</span>'+
        '<span class="hgr-folder-count">'+directCount(f.id)+'</span></button>'+
        treeHTML(f.id,depth+1,next);
    }).join('');
  }

  function folderCard(f) {
    return '<article class="hgr-card">'+
      '<button class="hgr-card-main" type="button" data-hgr="folder" data-id="'+esc(f.id)+'" aria-label="Abrir pasta '+esc(f.name)+'">'+
      '<div class="hgr-thumb"><span class="hgr-folder-thumb" aria-hidden="true">▰</span></div>'+
      '<div class="hgr-label"><strong class="hgr-name" title="'+esc(f.name)+'">'+esc(f.name)+'</strong>'+
      '<small>'+directCount(f.id)+' arquivos · Pasta</small></div></button>'+
      (canEdit?'<div class="hgr-card-actions">'+
        '<button class="hgr-small-action" data-hgr="rename-folder" data-id="'+esc(f.id)+'" title="Renomear pasta">Renomear</button>'+
        '<button class="hgr-small-action" data-hgr="move-folder" data-id="'+esc(f.id)+'" title="Mover pasta">Mover</button>'+
        '<button class="hgr-small-action" data-hgr="delete-folder" data-id="'+esc(f.id)+'" title="Excluir pasta">Excluir</button>'+
      '</div>':'')+'</article>';
  }

  function assetCard(a) {
    const src=itemURL(a),type=TYPES[a.kind]||'Imagem';
    return '<article class="hgr-card">'+
      '<button class="hgr-card-main" type="button" data-hgr="preview" data-id="'+esc(a.id)+'" aria-label="Ver '+esc(a.name)+'">'+
        '<div class="hgr-thumb">'+(src?'<img src="'+esc(src)+'" loading="lazy" decoding="async" alt="'+esc(a.name)+'" />':
           '<span aria-hidden="true">✧</span>')+'</div>'+
        '<span class="hgr-chip">'+esc(type)+'</span>'+
        '<div class="hgr-label"><strong class="hgr-name" title="'+esc(a.name)+'">'+esc(a.name)+'</strong>'+
        '<small>'+fmtBytes(a.size_bytes)+(textSearch?' · '+esc(pathLabel(a.folder_id)):'')+'</small></div></button>'+
      (canEdit?'<div class="hgr-card-actions">'+
        '<button class="hgr-small-action" data-hgr="edit-asset" data-id="'+esc(a.id)+'" title="Renomear e escolher tipo">Editar</button>'+
        '<button class="hgr-small-action" data-hgr="move-asset" data-id="'+esc(a.id)+'" title="Mover para pasta">Mover</button>'+
        '<button class="hgr-small-action" data-hgr="delete-asset" data-id="'+esc(a.id)+'" title="Excluir arquivo">Excluir</button>'+
      '</div>':'')+'</article>';
  }

  function render() {
    if(!root || root.hidden)return;
    root.querySelector('#hgr-tree').innerHTML =
      '<button class="hgr-tree-btn '+(locationId===null?'active':'')+
      '" data-hgr="folder" data-id="" type="button"><span aria-hidden="true">⌂</span> Toda a biblioteca</button>'+
      treeHTML(null);
    const trail=folderTrail(locationId);
    const breadcrumbs=[{id:null,name:'Recursos'}, ...trail.map(f=>({id:f.id,name:f.name}))];
    root.querySelector('#hgr-crumbs').innerHTML=breadcrumbs.map((f,i)=>
      (i?'<span aria-hidden="true">›</span>':'')+
      '<button type="button" data-hgr="folder" data-id="'+esc(f.id||'')+'" '+(i===breadcrumbs.length-1?'aria-current="page"':'')+'>'+esc(f.name)+'</button>'
    ).join('');
    root.querySelector('#hgr-current-name').textContent=trail.length?trail[trail.length-1].name:'Toda a biblioteca';
    root.querySelector('#hgr-count').textContent=folders.length+' pastas · '+assets.length+' arquivos';
    root.querySelectorAll('[data-hgr-kind]').forEach(btn=>{
      const active=btn.dataset.hgrKind===typeFilter;
      btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));
    });
    root.querySelectorAll('.hgr-edit-only').forEach(el=>{el.hidden=!canEdit;});
    root.querySelectorAll('.hgr-login-only').forEach(el=>{el.hidden=canEdit;});
    root.querySelector('#hgr-role').textContent=canEdit?'Arquivista · edição habilitada':'Leitura pública';
    const query=textSearch.trim().toLocaleLowerCase('pt-BR');
    const listedFolders=query?folders.filter(f=>f.name.toLocaleLowerCase('pt-BR').includes(query)).sort(byName):children(locationId);
    const listedAssets=assets.filter(a=>(query||a.folder_id===locationId) &&
      (typeFilter==='todos'||a.kind===typeFilter) &&
      (!query||(a.name+' '+pathLabel(a.folder_id)).toLocaleLowerCase('pt-BR').includes(query))).sort(byName);
    const el=root.querySelector('#hgr-results');
    const fhtml=listedFolders.length ? '<h3 class="hgr-section-head">Pastas <small>'+listedFolders.length+'</small></h3>'+
      '<div class="hgr-grid">'+listedFolders.map(folderCard).join('')+'</div>':'';
    const ahtml=listedAssets.length ? '<h3 class="hgr-section-head">Arquivos <small>'+listedAssets.length+'</small></h3>'+
      '<div class="hgr-grid">'+listedAssets.map(assetCard).join('')+'</div>':'';
    el.innerHTML=fhtml+ahtml||'<div class="hgr-empty"><span aria-hidden="true" style="font-size:30px">✧</span>'+
      '<strong>'+(query?'Nenhum resultado':'Sua coleção começa aqui')+'</strong>'+
      '<p>'+(query?'Experimente outro nome ou escolha uma categoria.':
        canEdit?'Crie pastas para personagens, mapas, cenários e aventuras. Depois envie seus arquivos para organizá-los.':
        'Ainda não há arquivos nesta pasta.')+'</p></div>';
  }

  function createUI() {
    if(root)return;
    root=document.createElement('div');root.id='hgr-root';root.hidden=true;
    root.innerHTML='<section class="hgr-shell" role="dialog" aria-modal="true" aria-label="Biblioteca de recursos, mapas e tokens">'+
      '<header class="hgr-head"><div><div class="hgr-eyebrow">HELLS GATE BOOKS · ATELIÊ</div><div class="hgr-brand">Biblioteca de <em>Recursos</em></div></div>'+
      '<div class="hgr-header-actions"><span class="hgr-pill" id="hgr-role">Leitura pública</span>'+
      '<button class="hgr-icon" type="button" data-hgr="refresh" aria-label="Atualizar acervo" title="Atualizar">↻</button>'+
      '<button class="hgr-icon" type="button" data-hgr="close" aria-label="Fechar biblioteca">×</button></div></header>'+
      '<div class="hgr-layout"><aside class="hgr-side" aria-label="Pastas da biblioteca">'+
      '<div class="hgr-side-label">ESTANTES E PASTAS</div><nav id="hgr-tree" class="hgr-side-tree"></nav>'+
      '<button class="hgr-tree-btn hgr-edit-only" data-hgr="new-folder" type="button"><span aria-hidden="true">＋</span> Nova pasta</button>'+
      '</aside><main class="hgr-main"><div class="hgr-crumbs" id="hgr-crumbs"></div>'+
      '<div class="hgr-toolbar"><span class="hgr-section-head" id="hgr-current-name" style="margin:0">Toda a biblioteca</span>'+
      '<span class="hgr-spacer"></span>'+
      '<button class="hgr-btn subtle hgr-edit-only" type="button" data-hgr="new-folder">＋ Nova pasta</button>'+
      '<select class="hgr-btn hgr-edit-only" id="hgr-upload-kind" title="Classificar novo arquivo" aria-label="Classificar novo arquivo">'+
      '<option value="token">Token</option><option value="mapa">Mapa</option><option value="imagem">Imagem</option></select>'+
      '<button class="hgr-btn primary hgr-edit-only" type="button" data-hgr="upload">↥ Enviar imagens</button>'+
      '<button class="hgr-btn subtle hgr-login-only" type="button" data-hgr="login">Entrar para editar</button>'+
      '<input class="hgr-search" type="search" id="hgr-search" placeholder="Pesquisar em todas as pastas..." autocomplete="off" aria-label="Buscar recursos" />'+
      '<input id="hgr-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden /></div>'+
      '<div class="hgr-tabs" aria-label="Filtrar recursos">'+
      '<button class="hgr-tab active" data-hgr-kind="todos" type="button">Todos</button>'+
      '<button class="hgr-tab" data-hgr-kind="token" type="button">Tokens</button>'+
      '<button class="hgr-tab" data-hgr-kind="mapa" type="button">Mapas</button>'+
      '<button class="hgr-tab" data-hgr-kind="imagem" type="button">Imagens</button></div>'+
      '<div id="hgr-results"></div></main></div>'+
      '<footer class="hgr-footer"><div><div class="hgr-progress"><span id="hgr-progress-fill"></span></div><span id="hgr-count">0 arquivos</span></div>'+
      '<div class="hgr-status" id="hgr-status" role="status" aria-live="polite">Os recursos são independentes dos livros.</div></footer>'+
      '<div class="hgr-preview" id="hgr-preview" hidden><div class="hgr-preview-row"><div><div class="hgr-eyebrow" id="hgr-preview-kind"></div>'+
      '<strong class="hgr-preview-title" id="hgr-preview-title"></strong></div><button class="hgr-icon" data-hgr="close-preview" type="button" aria-label="Fechar visualização">×</button></div>'+
      '<img id="hgr-preview-image" alt="" /><div class="hgr-preview-row"><span id="hgr-preview-info" style="font-size:12px;color:#a6bdb2"></span>'+
      '<div class="hgr-preview-actions"><button class="hgr-btn primary" data-hgr="download" type="button">↓ Baixar imagem</button>'+
      '<button class="hgr-btn subtle" data-hgr="close-preview" type="button">Voltar</button></div></div></div>'+
      '<div class="hgr-dialog" id="hgr-dialog" hidden><div class="hgr-dialog-panel" id="hgr-dialog-panel" role="dialog" aria-modal="true" aria-label="Editar recurso"></div></div>'+
      '</section>';
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.querySelector('#hgr-search').addEventListener('input',e=>{textSearch=e.target.value;render();});
    root.querySelector('#hgr-file').addEventListener('change',e=>{void uploadFiles(e.target.files);e.target.value='';});
    root.addEventListener('click',e=>{if(e.target===root)close();});
  }

  async function requireEdit(){
    if(!canEdit)canEdit=await window.HGCloud.verify().catch(()=>false);
    if(!canEdit) {alertUser('Apenas a conta do Arquivista pode alterar recursos. Entre na Sala do Arquivista.');return false;}
    return true;
  }
  async function act(operation) {
    if(busy)return;
    if(!(await requireEdit()))return;
    busy=true;
    try {await operation();await reload();}
    catch(error){console.error('Biblioteca de Recursos',error);alertUser(error.message||'Não foi possível concluir esta alteração.');}
    finally{busy=false;}
  }

  function inputDialog(title,fields,detail='') {
    const wrap=root.querySelector('#hgr-dialog');
    const panel=root.querySelector('#hgr-dialog-panel');
    const fieldsHTML=fields.map(f=>{
      const label='<label>'+esc(f.label);
      if(f.options)return label+'<select name="'+esc(f.name)+'">'+f.options.map(opt=>
        '<option value="'+esc(opt.value)+'" '+(String(f.value??'')===String(opt.value)?'selected':'')+'>'+
        esc(opt.label)+'</option>').join('')+'</select></label>';
      return label+'<input name="'+esc(f.name)+'" type="text" maxlength="'+(f.max||140)+'" value="'+esc(f.value||'')+'" required /></label>';
    }).join('');
    panel.innerHTML='<form id="hgr-dialog-form"><h3>'+esc(title)+'</h3>'+
      (detail?'<p style="font:12px/1.6 sans-serif;color:#abbeb7">'+esc(detail)+'</p>':'')+
      fieldsHTML+'<div class="hgr-dialog-actions"><button class="hgr-btn subtle" type="button" id="hgr-cancel">Cancelar</button>'+
      '<button class="hgr-btn primary" type="submit">Salvar</button></div></form>';
    wrap.hidden=false;
    panel.querySelector('input,select')?.focus();
    return new Promise(resolve=>{
      const finish=value=>{wrap.hidden=true;panel.innerHTML='';resolve(value);};
      panel.querySelector('#hgr-cancel').onclick=()=>finish(null);
      const form=panel.querySelector('form');
      form.onsubmit=e=>{
        e.preventDefault();
        const result=Object.fromEntries(new FormData(form).entries());
        if(fields.filter(f=>!f.options).some(f=>!String(result[f.name]||'').trim()))return;
        finish(result);
      };
    });
  }
  function folderOptions(excludeID=null){
    const blocked=excludeID?descendants(excludeID):new Set();
    if(excludeID)blocked.add(excludeID);
    return [{value:'',label:'⌂ Raiz da biblioteca'},...folders.filter(f=>!blocked.has(f.id))
      .sort((a,b)=>pathLabel(a.id).localeCompare(pathLabel(b.id),'pt-BR'))
      .map(f=>({value:f.id,label:'▸ '+pathLabel(f.id)}))];
  }
  async function createFolder(){
    if(!(await requireEdit()))return;
    const result=await inputDialog('Criar nova pasta',[{name:'name',label:'Nome da pasta',max:120}],
      'Sua nova pasta será criada dentro de '+pathLabel(locationId)+'.');
    if(!result)return;
    await act(async()=>{
      const {error}=await db.from(FOLDERS).insert({name:result.name.trim(),parent_id:locationId});
      if(error)throw error;
      alertUser('Pasta criada: '+result.name.trim());
    });
  }
  async function renameFolder(id) {
    const f=folders.find(x=>x.id===id);if(!f||!(await requireEdit()))return;
    const result=await inputDialog('Renomear pasta',[{name:'name',label:'Novo nome',value:f.name,max:120}]);
    if(!result)return;
    await act(async()=>{
      const {error}=await db.from(FOLDERS).update({name:result.name.trim(),updated_at:new Date().toISOString()}).eq('id',id);
      if(error)throw error; alertUser('Pasta renomeada.');
    });
  }
  async function moveFolder(id) {
    const f=folders.find(x=>x.id===id);if(!f||!(await requireEdit()))return;
    const result=await inputDialog('Mover pasta',[
      {name:'parent',label:'Nova pasta de destino',options:folderOptions(id),value:f.parent_id||''}
    ],'Não é possível mover uma pasta para dentro dela mesma.');
    if(!result)return;
    await act(async()=>{
      const dest=result.parent||null;
      const {error}=await db.from(FOLDERS).update({parent_id:dest,updated_at:new Date().toISOString()}).eq('id',id);
      if(error)throw error;alertUser('Pasta movida para '+pathLabel(dest)+'.');
    });
  }
  async function deleteFolder(id){
    const f=folders.find(x=>x.id===id);if(!f||!(await requireEdit()))return;
    if(folders.some(x=>x.parent_id===id)||assets.some(x=>x.folder_id===id))
      return alertUser('A pasta contém arquivos ou subpastas. Mova ou exclua o conteúdo antes de removê-la.');
    if(!confirm('Excluir a pasta "'+f.name+'"?'))return;
    await act(async()=>{
      const {error}=await db.from(FOLDERS).delete().eq('id',id);
      if(error)throw error;
      if(locationId===id)locationId=null;alertUser('Pasta excluída.');
    });
  }
  async function editAsset(id){
    const a=assets.find(x=>x.id===id);if(!a||!(await requireEdit()))return;
    const r=await inputDialog('Editar recurso',[
      {name:'name',label:'Nome do arquivo',value:a.name,max:180},
      {name:'kind',label:'Tipo',value:a.kind,options:Object.entries(TYPES).map(([value,label])=>({value,label}))}
    ],'A imagem e a pasta de origem serão preservadas.');
    if(!r)return;
    await act(async()=>{
      const {error}=await db.from(ASSETS).update({name:r.name.trim(),kind:r.kind,updated_at:new Date().toISOString()}).eq('id',id);
      if(error)throw error; alertUser('Recurso atualizado.');
    });
  }
  async function moveAsset(id){
    const a=assets.find(x=>x.id===id);if(!a||!(await requireEdit()))return;
    const r=await inputDialog('Mover imagem',[
      {name:'folder',label:'Pasta de destino',options:folderOptions(),value:a.folder_id||''}
    ],'O recurso será reorganizado sem baixar ou reenviar sua imagem.');
    if(!r)return;
    await act(async()=>{
      const {error}=await db.from(ASSETS).update({folder_id:r.folder||null,updated_at:new Date().toISOString()}).eq('id',id);
      if(error)throw error;alertUser('Imagem movida para '+pathLabel(r.folder||null)+'.');
    });
  }
  async function deleteAsset(id){
    const a=assets.find(x=>x.id===id);if(!a||!(await requireEdit()))return;
    if(!confirm('Excluir definitivamente "'+a.name+'" da biblioteca e do armazenamento?'))return;
    await act(async()=>{
      // Metadata first: a deletion error must never leave a broken image reference.
      const {error}=await db.from(ASSETS).delete().eq('id',id);
      if(error)throw error;
      const cleanup=await db.storage.from(BUCKET).remove([a.storage_path]);
      alertUser(cleanup.error?'Registro removido; arquivo residual não pôde ser apagado: '+cleanup.error.message:'Imagem excluída.');
      if(selectedPreview===id)closePreview();
    });
  }
  async function uploadFiles(fileList){
    const list=Array.from(fileList||[]);if(!list.length)return;
    if(!(await requireEdit()))return;
    if(busy)return alertUser('Já existe uma operação em andamento.');
    busy=true;
    let done=0;const errors=[];
    const kind=root.querySelector('#hgr-upload-kind').value;
    const target=locationId;
    try{
      for(let i=0;i<list.length;i++){
        const file=list[i];
        root.querySelector('#hgr-progress-fill').style.width=(i/list.length*100).toFixed(1)+'%';
        alertUser('Enviando '+(i+1)+' de '+list.length+': '+file.name);
        if(!MIME[file.type]){errors.push(file.name+': formato não suportado');continue;}
        if(!file.size || file.size>MAX_FILE){errors.push(file.name+': tamanho permitido de até 45 MB');continue;}
        const path='library/assets/'+crypto.randomUUID()+'.'+MIME[file.type];
        const up=await db.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
        if(up.error){errors.push(file.name+': '+up.error.message);continue;}
        const name=file.name.replace(/\.[^.]+$/,'').trim().slice(0,180)||'Recurso sem nome';
        const result=await db.from(ASSETS).insert({
          folder_id:target,name,kind,storage_path:path,mime_type:file.type,size_bytes:file.size
        });
        if(result.error){
          errors.push(file.name+': '+result.error.message);
          await db.storage.from(BUCKET).remove([path]).catch(console.warn);
        }else done++;
      }
    }catch(error){
      console.error('Falha inesperada no envio',error);
      errors.push('Falha na conexão: '+(error.message||'erro desconhecido'));
    }finally{
      busy=false;
      root.querySelector('#hgr-progress-fill').style.width='100%';
      await reload().catch(error=>alertUser(error.message));
      alertUser(done+' arquivo(s) enviado(s). '+(errors.length?errors.length+' falha(s): '+errors.slice(0,2).join(' · '):'Tudo salvo no acervo online.'));
      setTimeout(()=>{if(root)root.querySelector('#hgr-progress-fill').style.width='0';},1000);
    }
  }

  function preview(id) {
    const a=assets.find(x=>x.id===id);if(!a)return;
    selectedPreview=id;
    const p=root.querySelector('#hgr-preview');
    p.querySelector('#hgr-preview-kind').textContent=(TYPES[a.kind]||'Imagem')+' · '+pathLabel(a.folder_id);
    p.querySelector('#hgr-preview-title').textContent=a.name;
    p.querySelector('#hgr-preview-info').textContent=fmtBytes(a.size_bytes)+' · '+a.mime_type;
    const image=p.querySelector('#hgr-preview-image');
    image.src=itemURL(a);
    image.alt=a.name;
    p.hidden=false;
  }
  function closePreview(){
    selectedPreview=null;
    const p=root.querySelector('#hgr-preview');
    if(p){p.hidden=true;p.querySelector('#hgr-preview-image').removeAttribute('src');}
  }
  async function downloadPreview(){
    const a=assets.find(x=>x.id===selectedPreview);if(!a)return;
    const url=itemURL(a);if(!url)return;
    try{
      alertUser('Preparando imagem para download...');
      const response=await fetch(url);if(!response.ok)throw new Error('Erro '+response.status);
      const blob=await response.blob(),local=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      anchor.href=local;
      anchor.download=a.name.replace(/[\\/:*?"<>|]/g,'_')+'.'+(MIME[a.mime_type]||'png');
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(local),30000);
      alertUser('Download solicitado: '+a.name);
    }catch(error){alertUser('O download direto falhou; abrindo imagem original.');window.open(url,'_blank','noopener,noreferrer');}
  }
  async function onClick(event) {
    const tab=event.target.closest('[data-hgr-kind]');
    if(tab){typeFilter=tab.dataset.hgrKind;render();return;}
    const button=event.target.closest('[data-hgr]');if(!button)return;
    const id=button.dataset.id||null;
    const command=button.dataset.hgr;
    switch(command){
      case 'close':close();break;
      case 'folder':locationId=id;textSearch='';root.querySelector('#hgr-search').value='';render();break;
      case 'refresh':alertUser('Atualizando pastas e imagens...');await reload().then(()=>alertUser('Biblioteca atualizada.')).catch(e=>alertUser(e.message));break;
      case 'new-folder':await createFolder();break;
      case 'rename-folder':await renameFolder(id);break;
      case 'move-folder':await moveFolder(id);break;
      case 'delete-folder':await deleteFolder(id);break;
      case 'edit-asset':await editAsset(id);break;
      case 'move-asset':await moveAsset(id);break;
      case 'delete-asset':await deleteAsset(id);break;
      case 'upload':root.querySelector('#hgr-file').click();break;
      case 'preview':preview(id);break;
      case 'close-preview':closePreview();break;
      case 'download':await downloadPreview();break;
      case 'login':close();$('#openLogin')?.click();break;
    }
  }

  async function open(){
    createUI();
    if(opened)return;
    const oldOverlay=$('#collectionOverlay');
    if(oldOverlay&&!oldOverlay.hidden){
      const dismiss=oldOverlay.querySelector('[data-close="collection"]');
      dismiss?.click();
    }
    opened=true;root.hidden=false;document.body.classList.add('hgr-locked');
    root.querySelector('#hgr-results').innerHTML='<div class="hgr-empty"><strong>Abrindo o ateliê...</strong><p>Carregando pastas e miniaturas.</p></div>';
    alertUser('Conectando à biblioteca de recursos...');
    try {
      db=window.HGCloud?.client();
      canEdit=await window.HGCloud.verify().catch(()=>false);
      await reload();
      alertUser('Acervo sincronizado. '+assets.length+' recursos disponíveis.');
    }catch(error){
      console.error('Falha na biblioteca de recursos',error);
      alertUser('Não foi possível abrir a biblioteca: '+(error.message||'Erro de conexão.'));
      root.querySelector('#hgr-results').innerHTML=
        '<div class="hgr-empty"><strong>Acervo indisponível</strong><p>'+esc(error.message||'Erro de conexão')+'</p>'+
        '<button class="hgr-btn" type="button" data-hgr="refresh">Tentar novamente</button></div>';
    }
    root.querySelector('[data-hgr="close"]').focus();
  }
  function close(){
    if(!root||busy)return;
    closePreview();
    root.hidden=true;opened=false;document.body.classList.remove('hgr-locked');
    // Original site manages its own lock for other overlays; don't interfere with it.
  }

  function injectNavigation(){
    const nav=$('.top-nav');
    if(nav&&!$('#hgr-top-entry')){
      const btn=document.createElement('button');btn.id='hgr-top-entry';btn.className='hgr-nav-link';
      btn.textContent='Tokens & Mapas';btn.type='button';
      btn.addEventListener('click',open);
      nav.appendChild(btn);
    }
    const mobile=$('#mobileNav');
    if(mobile&&!$('#hgr-mobile-entry')){
      const b=document.createElement('button');b.id='hgr-mobile-entry';b.className='hgr-open-btn';
      b.type='button';b.textContent='✧ Biblioteca de Tokens & Mapas';
      b.addEventListener('click',()=>{mobile.hidden=true;void open();});
      mobile.appendChild(b);
    }
    const sidebar=$('#collectionDetail');
    if(sidebar){
      const enhance=()=>{
        const name=sidebar.querySelector('.shelf-detail-head h2')?.textContent?.trim();
        if(name!=='Mapas & Tokens')return;
        const list=sidebar.querySelector('.shelf-books');
        if(!list||list.querySelector('.hgr-shelf-open'))return;
        const b=document.createElement('button');b.type='button';b.className='hgr-shelf-open';
        b.innerHTML='<span><strong>✧ Abrir Biblioteca de Recursos</strong>'+
          '<small>Pastas, tokens, mapas, imagens e arquivos de mesa</small></span><span aria-hidden="true">↗</span>';
        b.addEventListener('click',()=>void open());
        list.insertBefore(b,list.children[1]||null);
      };
      new MutationObserver(enhance).observe(sidebar,{childList:true,subtree:false});
      enhance();
    }
  }

  document.addEventListener('keydown',e=>{
    if(!opened)return;
    if(e.key==='Escape'){
      e.preventDefault();e.stopImmediatePropagation();
      if(root.querySelector('#hgr-dialog')&&!root.querySelector('#hgr-dialog').hidden){root.querySelector('#hgr-cancel')?.click();return;}
      if(selectedPreview)closePreview();
      else close();
    }
  },true);
  function init(){injectNavigation();createUI();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
  window.HGResourceLibrary={open,close};
})();