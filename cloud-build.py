#!/usr/bin/env python3
"""Build-time patches only. Leaves the original 2.8MB HTML and images intact."""
from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf8')

def once(old,new):
    global s
    n=s.count(old)
    if n != 1: raise RuntimeError(f"Expected one patch location; got {n}: {old[:80]}")
    s=s.replace(old,new,1)

once("<script>(() => {",
'''<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.75.0/dist/umd/supabase.min.js"></script>
<script src="library-cloud.js"></script>
<script src="library-export.js"></script>
<script>(() => {''')

start=s.index("const validImage = s =>")
assert start>=0
end=s.index("\n",start)
line=s[start:end]
assert line.endswith("));"),line[-50:]
s=s[:start]+line[:-2]+" || s.startsWith('https://tcwtcyikqxtfnlucyqtf.supabase.co/storage/v1/object/public/hells-books/'));" + s[end:]

once("async function readStored() {\n  db=await getDatabase();",
     "async function readStored() {\n  const online=await window.HGCloud.load(); if(online) return online;\n  db=await getDatabase();")

once("async function persist(){\n  if(db)",
     """async function persist(){
  try { state = await window.HGCloud.save(state); } catch(e) {
    console.error('Falha no salvamento online',e);
    toast('Não foi possível publicar: '+(e.message || 'falha de rede')+'. Faça um backup.');
    return false;
  }
  if(db)""")

once("function showLogin(){if(sessionStorage.getItem('luci_admin_unlocked')==='1'){openAdmin();return;}",
     "function showLogin(){if(sessionStorage.getItem('luci_admin_unlocked')==='1' && window.HGCloud.isAuthorized()){openAdmin();return;}")

once("function openAdmin(){overlay('loginOverlay',false);",
     "function openAdmin(){if(!window.HGCloud.isAuthorized()){toast('Entre com a conta do Arquivista no Supabase.');return;}overlay('loginOverlay',false);")

once("function loginSubmit(e){e.preventDefault();if($('#adminPassword').value==='666'){sessionStorage.setItem('luci_admin_unlocked','1');openAdmin();toast('Bem-vindo à Sala do Arquivista.');}else{$('#loginError').textContent='Senha incorreta. Tente novamente.';}}",
     """async function loginSubmit(e){e.preventDefault();
       if($('#adminPassword').value!=='666'){$('#loginError').textContent='PIN incorreto.';return;}
       $('#loginError').textContent='Conectando à sua conta segura…';
       try {
         if(await window.HGCloud.login()){sessionStorage.setItem('luci_admin_unlocked','1');openAdmin();toast('Sala do Arquivista autenticada na nuvem.');}
         else $('#loginError').textContent='Confirme o e-mail ou tente novamente.';
       }catch(err){$('#loginError').textContent=err.message||'Falha na autenticação.';}
     }""")

once("$('#adminLogout').onclick=()=>{sessionStorage.removeItem('luci_admin_unlocked');closeAdmin();toast('Edição bloqueada neste navegador.');};",
     "$('#adminLogout').onclick=()=>{sessionStorage.removeItem('luci_admin_unlocked');window.HGCloud.logout();closeAdmin();toast('Sessão encerrada.');};")

once("toast(success?'Alterações salvas neste dispositivo.':'Falha ao salvar. Faça um backup.');",
     "toast(success?'Alterações publicadas para todos os leitores.':'Falha ao publicar. Faça um backup.');")

once("● Salvo neste dispositivo","● Sincronização com Supabase")

# Hells Gate Books: reliable JSON export and print-to-PDF for individual volumes.
once(
  '<button class="admin-action primary" id="exportBackup">↓ Baixar backup JSON</button></div><div class="backup-card"><h3>◈ Importar biblioteca</h3>',
  '''<button class="admin-action primary" id="exportBackup">↓ Baixar backup JSON</button></div><div class="backup-card"><h3>✦ Exportar livro em PDF</h3><p>Selecione um volume. A impressão permite escolher <strong>Salvar como PDF</strong> e preserva a ordem e as imagens das páginas.</p><div class="field"><label for="pdfBookSelect">Livro para exportar</label><select id="pdfBookSelect">${state.books.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.title)+'</option>').join('')}</select></div><button class="admin-action primary" id="exportBookPdf">↧ Preparar PDF do livro</button></div><div class="backup-card"><h3>◈ Importar biblioteca</h3>'''
)
once(
  "const id=e.target.closest('#exportBackup,#importBackup,#resetArchive');",
  "const id=e.target.closest('#exportBackup,#exportBookPdf,#importBackup,#resetArchive');"
)
once(
  "if(id.id==='exportBackup')exportBackup();",
  "if(id.id==='exportBackup')exportBackup();if(id.id==='exportBookPdf')exportBookPdf();"
)
start=s.index('function exportBackup(){')
end=s.index('\nasync function importBackup()',start)
s=s[:start]+"""function exportBookPdf(){
  const bookId=$('#pdfBookSelect')?.value;
  if(!bookId){toast('Selecione um livro para exportar.');return;}
  window.HGExport.exportBookPDF(state,bookId,sanitizeRich)
    .then(()=>toast('Impressão aberta: escolha Salvar como PDF.'))
    .catch(e=>toast('Falha ao preparar PDF: '+(e.message||'Erro desconhecido.')));
}
function exportBackup(){
  try { window.HGExport.downloadBackup(state); toast('Backup JSON enviado para Downloads.'); }
  catch(e) { toast('Falha ao exportar backup: '+(e.message||'Erro desconhecido.')); }
}""" + s[end:]
once(
  'Tudo que você criar no painel fica guardado neste navegador. Faça cópias para usar em outro computador e para não perder seu trabalho.',
  'O acervo é sincronizado online ao salvar. Aqui você pode guardar uma cópia de segurança ou preparar o PDF de um livro.'
)
once(
  '<strong>Publicação online:</strong> para que outras pessoas vejam suas alterações, será necessário sincronizar o backup com um servidor ou atualizar a versão hospedada. A senha 666 não é uma proteção adequada para um painel público.',
  '<strong>Exportação:</strong> o backup JSON preserva o acervo para restauração; a opção PDF abre a impressão do navegador. Escolha Salvar como PDF na janela de impressão.'
)

p.write_text(s,encoding='utf8')
print('Hells Gate Books cloud build applied')
