/* Hells Gate Books — Cloud Library (Supabase Auth + Storage + RLS)
   Public publishable key only. Never put a service/secret key in this file. */
(() => {
  'use strict';
  const URL = 'https://tcwtcyikqxtfnlucyqtf.supabase.co';
  const KEY = 'sb_publishable_zyDMvkYF_84v5Ywu6JoF1g_3aThL85N';
  const BUCKET = 'hells-books';
  let client, authorized = false;
  const seed = () => window.GARDENS_SEED || {collections:[],books:[],pages:[]};
  function api() {
    if (!client) {
      if (!window.supabase?.createClient) throw new Error('Não foi possível carregar a conexão com Supabase. Recarregue a página.');
      client = window.supabase.createClient(URL, KEY, {
        auth: {persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
      });
    }
    return client;
  }
  function notify(message) {
    const el = document.getElementById('cloudStatus');
    if(el) el.textContent = message;
  }
  async function verify() {
    authorized = false;
    const s = api();
    const {data: {user},error} = await s.auth.getUser();
    if(error || !user) return false;
    const r = await s.rpc('hells_can_edit');
    authorized = !r.error && r.data === true;
    return authorized;
  }
  function encodeSeedImage(group,item,field,value) {
    const orig=seed()[group]?.find(x => x.id === item.id);
    return orig && orig[field] === value ? '@seed' : null;
  }
  function restore(payload) {
    const copy=structuredClone(payload);
    for (const group of ['collections','books','pages']) {
      for (const item of copy[group] || []) {
        for (const field of group === 'pages' ? ['image'] : ['cover']) {
          if (item[field] === '@seed') {
            const original=seed()[group]?.find(x => x.id === item.id);
            item[field] = original?.[field] || '';
          }
        }
      }
    }
    return copy;
  }
  async function load() {
    try {
      const s=api();
      await verify().catch(()=>false);
      const {data,error}=await s.from('hells_library').select('content').eq('id',1).maybeSingle();
      if(error) throw error;
      notify(data?.content ? 'Acervo online sincronizado' : 'Biblioteca online pronta');
      return data?.content ? restore(data.content) : null;
    } catch(e) {
      console.warn('Hells Gate Books: leitura da nuvem indisponível',e);
      notify('Sem conexão: acervo local');
      return null;
    }
  }
  async function login() {
    const s=api();
    if(await verify()) return true;
    const email=prompt('E-mail do Arquivista no Supabase:');
    if(!email) return false;
    const password=prompt('Senha da CONTA de acesso à biblioteca (não é a senha do banco de dados):');
    if(!password) return false;
    const signin=await s.auth.signInWithPassword({email:email.trim(),password});
    if(signin.error) {
      if(!confirm('Não foi possível entrar. Quer cadastrar este e-mail como uma conta nova e receber a confirmação por e-mail?\n\n' + signin.error.message)) {
        alert('Login não realizado.');return false;
      }
      const signup=await s.auth.signUp({email:email.trim(),password});
      if(signup.error){alert('Cadastro não realizado: '+signup.error.message);return false;}
      alert('Confira o e-mail e confirme a conta antes de entrar. Apenas o proprietário autorizado poderá editar.');
      return false;
    }
    if(!(await verify())){
      await s.auth.signOut();
      alert('Esta conta não está autorizada a editar a biblioteca. Use o e-mail confirmado do proprietário do projeto Supabase.');
      return false;
    }
    notify('Sala do Arquivista · conectada');
    return true;
  }
  function isAuthorized(){return authorized;}
  async function save(state) {
    if(!(await verify())) throw new Error('Faça login com a conta autorizada do Supabase.');
    const s=api();
    const payload=structuredClone(state);
    const originals=[];
    for(const group of ['collections','books','pages']){
      for(const item of payload[group] || []){
        for(const field of group==='pages'?['image']:['cover']){
          const value=item[field];
          if(!value || !value.startsWith('data:image/'))continue;
          if(encodeSeedImage(group,item,field,value)){item[field]='@seed';continue;}
          const match=/^data:(image\/(?:png|jpeg|webp|gif));base64,/i.exec(value);
          if(!match)throw new Error('Imagem não suportada.');
          originals.push({group,id:item.id,field,data:value,type:match[1],item});
        }
      }
    }
    // Four parallel uploads maximum, to avoid saturating mobile connections.
    async function upload(entry) {
      const ext=entry.type.split('/')[1].replace('jpeg','jpg');
      const name='library/'+crypto.randomUUID()+'.'+ext;
      const bytes=await (await fetch(entry.data)).blob();
      if(bytes.size > 50*1024*1024)throw new Error('Imagem acima do limite de 50 MB.');
      const {error}=await s.storage.from(BUCKET).upload(name,bytes,{contentType:entry.type,upsert:false});
      if(error)throw error;
      entry.item[entry.field]=s.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
    }
    for(let i=0;i<originals.length;i+=4)await Promise.all(originals.slice(i,i+4).map(upload));
    const {error}=await s.from('hells_library').upsert({id:1,content:payload,updated_at:new Date().toISOString()},{onConflict:'id'});
    if(error)throw error;
    const resolved=restore(payload);
    notify('Acervo publicado para todos os visitantes');
    return resolved;
  }
  async function logout(){if(client)await client.auth.signOut(); authorized=false;notify('Modo de leitura');}
  window.HGCloud={load,login,save,logout,isAuthorized,verify};
})();