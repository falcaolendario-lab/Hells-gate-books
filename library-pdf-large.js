/* Hells Gate Books — importador de PDF grande.
   Intercepta apenas o envio do formulario PDF antigo; demais editores permanecem intactos.
   Converte uma pagina por vez e publica imagens no Supabase Storage autorizado. */
(() => {
  'use strict';
  const MAX_PDF_BYTES = 600 * 1024 * 1024;
  const MAX_PDF_PAGES = 1000;
  const $ = selector => document.querySelector(selector);
  let working = false;
  let cancel = false;

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function progress(fraction, message) {
    const bar = $('#hgb-progress-bar');
    const label = $('#hgb-progress-label');
    if(bar) bar.style.width = Math.round(Math.max(0, Math.min(1, fraction))*100)+'%';
    if(label) label.textContent = message;
  }
  function notify(message, isError=false) {
    const toast = $('#toast');
    if(!toast) return;
    toast.textContent = message;
    toast.style.background = isError ? '#9d344f' : '#ddcea4';
    toast.style.color = isError ? '#fff' : '#142b28';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 5500);
  }
  function updateModalHelp() {
    const modal = $('#hgb-modal');
    if(!modal || modal.dataset.mode !== 'pdf') return;
    // New PDF books use page one as their cover, with no extra upload required.
    // Existing custom-cover controls from an older dialog are removed.
    $('#hgb-cover-row')?.remove();
    const help = modal.querySelector('.hgb-help');
    if(help) help.textContent =
      'A primeira página do PDF será automaticamente a capa exibida na estante, e continuará como página 1 do livro. Até 600 MB e 1.000 páginas.';
    const security = modal.querySelector('.hgb-security');
    if(security) security.textContent =
      'As páginas serão enviadas ao acervo online. Mantenha esta aba aberta. Depois de importar, você pode alterar a capa no editor de livros.';
  }
  function newId() {
    return 'pdf-livro-' + Date.now() + '-' + Math.random().toString(36).slice(2,9);
  }
  async function loadPdfJs() {
    if(window.pdfjsLib) return window.pdfjsLib;
    if(!loadPdfJs.promise) {
      loadPdfJs.promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error('Leitor de PDF não carregado.'));
        script.onerror = () => reject(new Error('Falha ao carregar a biblioteca PDF. Confira sua conexão.'));
        document.head.appendChild(script);
      }).catch(error => { loadPdfJs.promise = null; throw error; });
    }
    return loadPdfJs.promise;
  }
  function pageToWebP(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if(!blob || blob.type !== 'image/webp')
          return reject(new Error('Seu navegador não conseguiu converter a página em WebP.'));
        resolve(blob);
      }, 'image/webp', 0.88);
    });
  }
  async function run() {
    if(working) return;
    working = true; cancel = false;
    const button = $('#hgb-submit');
    const modal = $('#hgb-modal');
    const file = $('#hgb-file')?.files?.[0];
    if(button) button.disabled = true;
    let importId = null;
    let success = false;
    let doc = null;
    let loadTask = null;
    let fileURL = null;
    try {
      if(!file || !/\.pdf$/i.test(file.name)) throw new Error('Selecione um arquivo PDF válido.');
      if(!file.size) throw new Error('O arquivo PDF está vazio.');
      if(file.size > MAX_PDF_BYTES)
        throw new Error('PDF acima de 600 MB. Para arquivos ainda maiores, divida em volumes.');
      if(!window.HGCloud?.uploadPdfPage || !window.HGCloud?.save)
        throw new Error('O sistema online não está pronto. Atualize a página com Ctrl + F5.');
      progress(0, 'Verificando acesso à biblioteca...');
      if(!(await window.HGCloud.verify()))
        throw new Error('Entre com sua conta confirmada do Arquivista para publicar este livro.');
      const state = await window.HGCloud.load();
      if(!state || !Array.isArray(state.books) || !Array.isArray(state.pages))
        throw new Error('Não foi possível carregar o acervo online. Nada foi substituído.');
      const collectionId = $('#hgb-project')?.value;
      if(!state.collections.some(c => c.id === collectionId))
        throw new Error('A ala escolhida não foi encontrada no acervo online.');

      const title = ($('#hgb-book-title')?.value || '').trim() ||
        file.name.replace(/\.pdf$/i,'').replace(/[_-]/g,' ');
      const pdfjs = await loadPdfJs();
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      progress(0, 'Abrindo o PDF no navegador...');
      // Use a Blob URL: don't copy a 350+ MB file into an additional ArrayBuffer.
      fileURL = URL.createObjectURL(file);
      loadTask = pdfjs.getDocument({url:fileURL,disableAutoFetch:true,rangeChunkSize:1048576});
      try { doc = await loadTask.promise; }
      catch(error) { throw new Error('Este PDF não abriu corretamente. Verifique se o download terminou e se o arquivo não está danificado. '+(error.message||'')); }
      if(doc.numPages > MAX_PDF_PAGES)
        throw new Error('Este PDF tem '+doc.numPages+' páginas; o limite é de 1.000. Divida em volumes.');
      if(!doc.numPages) throw new Error('O PDF não possui páginas.');
      const checkpointKey = 'hgb-pdf-checkpoint:'+file.name+':'+file.size+':'+file.lastModified+':'+collectionId;
      let checkpoint = null;
      try { checkpoint = JSON.parse(localStorage.getItem(checkpointKey) || 'null'); } catch {}
      if(checkpoint && (!/^pdf-livro-[0-9]+-[a-z0-9]+$/.test(checkpoint.id) ||
         !Array.isArray(checkpoint.pages) || checkpoint.pages.length > doc.numPages)) checkpoint = null;
      if(checkpoint && !confirm('Encontramos uma importação parcial deste PDF ('+checkpoint.pages.length+
        ' de '+doc.numPages+' páginas). Quer continuar de onde parou?')) checkpoint = null;
      importId = checkpoint?.id || newId();
      const pages = checkpoint?.pages || [];
      const alreadyDone = new Set(pages.map(p=>Number(p.order)+1));
      for(let n=1; n<=doc.numPages; n++) {
        if(alreadyDone.has(n)) {
          progress(n/doc.numPages, 'Página '+n+' de '+doc.numPages+' já enviada; continuando...');
          continue;
        }
        if(cancel) throw new Error('Importação cancelada.');
        progress((n-1)/doc.numPages, 'Convertendo página '+n+' de '+doc.numPages+'...');
        const page = await doc.getPage(n);
        const base = page.getViewport({scale:1});
        const scale = Math.min(1.8, 1300/base.width, 1800/base.height);
        const viewport = page.getViewport({scale});
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        try {
          const context = canvas.getContext('2d', {alpha:false});
          if(!context) throw new Error('Falha ao criar a imagem da página '+n+'.');
          context.fillStyle = '#ffffff';
          context.fillRect(0,0,canvas.width,canvas.height);
          await page.render({canvasContext:context,viewport}).promise;
          const blob = await pageToWebP(canvas);
          let text = '';
          try {
            const content = await page.getTextContent();
            text = content.items.map(item => item.str || '').join(' ').trim().slice(0,20000);
          } catch(error) { console.warn('Texto da página indisponível',n,error); }
          canvas.width = 0; canvas.height = 0;
          page.cleanup?.();
          if(cancel) throw new Error('Importação cancelada.');
          progress((n-.45)/doc.numPages, 'Enviando página '+n+' de '+doc.numPages+'...');
          const imageURL = await window.HGCloud.uploadPdfPage(blob,importId,n);
          pages.push({
            id: importId+'-page-'+n,
            bookId:importId,
            title:'Página '+String(n).padStart(3,'0'),
            section:'PDF importado',
            kind:text?'both':'image',
            image:imageURL,
            body:text?'<p>'+escapeHTML(text)+'</p>':'',
            order:n-1
          });
          // Lightweight checkpoint: URLs only; the 350MB PDF remains on disk.
          try { localStorage.setItem(checkpointKey,JSON.stringify({id:importId,pages})); } catch(error) {
            console.warn('Sem espaço para ponto de retomada no navegador',error);
          }
          progress(n/doc.numPages, 'Página '+n+' de '+doc.numPages+' salva na nuvem.');
          await new Promise(resolve => setTimeout(resolve,0));
        } finally {
          canvas.width = 0;canvas.height = 0;
          page.cleanup?.();
        }
      }
      if(cancel) throw new Error('Importação cancelada.');
      progress(1, 'Registrando o livro completo na biblioteca...');
      // Reload before committing to avoid overwriting other edits during a long import.
      const latest = await window.HGCloud.load();
      if(!latest?.collections?.some(c=>c.id===collectionId))
        throw new Error('Não foi possível conferir a coleção. O progresso foi mantido para retomar.');
      if(latest.books.some(b=>b.id===importId))
        throw new Error('Este livro já existe na biblioteca. Atualize a página antes de tentar de novo.');
      pages.sort((a,b)=>a.order-b.order);
      if(pages.length!==doc.numPages) throw new Error('Faltam páginas; o progresso foi mantido para retomar.');
      const firstPage = pages.find(p=>Number(p.order)===0);
      if(!firstPage?.image) throw new Error('A primeira página não foi enviada; não é possível definir a capa.');
      latest.books.push({
        id:importId, collectionId,
        title:title.slice(0,180),
        subtitle:'PDF importado · '+pages.length+' páginas',
        description:'Livro importado em PDF para a biblioteca online.',
        cover:firstPage.image, // Primeira pagina do PDF = capa da estante; continua no leitor.
        status:'Em desenvolvimento', volume:'01', featured:false
      });
      latest.pages.push(...pages);
      await window.HGCloud.save(latest);
      success = true;
      window.HGCloud.completePdfImport(importId);
      try { localStorage.removeItem(checkpointKey); } catch {}
      progress(1,'Livro publicado! '+pages.length+' páginas disponíveis.');
      notify('Livro '+title+' importado com '+pages.length+' páginas!');
      modal.hidden = true;
      window.setTimeout(() => location.reload(), 900);
    } catch(error) {
      console.error('Falha na importação do PDF',error);
      progress(0,error.message || 'Falha ao importar o PDF.');
      notify(error.message || 'Falha ao importar o PDF.',true);
    } finally {
      if(doc) try { await doc.destroy(); } catch(error) { console.warn(error); }
      else if(loadTask) try { await loadTask.destroy(); } catch(error) { console.warn(error); }
      if(fileURL) URL.revokeObjectURL(fileURL);
      // Keep checkpoints and uploaded pages when interrupted. Retrying the same PDF resumes.
      if(importId && !success) progress(0,'Interrompido. O progresso foi preservado para retomar com o mesmo PDF.');
      working = false;
      if(button) button.disabled = false;
    }
  }

  document.addEventListener('submit', event => {
    if(event.target?.id !== 'hgb-import-form') return;
    if($('#hgb-modal')?.dataset.mode !== 'pdf') return;
    // The legacy handler would reject PDFs larger than 28 MB. Prevent it.
    event.preventDefault();
    event.stopImmediatePropagation();
    if(!working) void run();
  },true);

  document.addEventListener('click',event => {
    if(!working || !event.target?.closest('#hgb-modal [data-hgb-close]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel = true;
    progress(0,'Cancelando após a página atual...');
  },true);

  document.addEventListener('keydown',event => {
    if(!working || event.key !== 'Escape' || $('#hgb-modal')?.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel = true;
    progress(0,'Cancelando após a página atual...');
  },true);

  document.addEventListener('change',event => {
    if(event.target?.id !== 'hgb-file' || $('#hgb-modal')?.dataset.mode !== 'pdf') return;
    const file = event.target.files?.[0];
    if(file) {
      setTimeout(() => progress(0, file.size > MAX_PDF_BYTES
        ? 'Arquivo de '+(file.size/1048576).toFixed(1)+' MB excede o limite de 600 MB.'
        : 'PDF selecionado: '+(file.size/1048576).toFixed(1)+' MB. Pronto para importar.'),0);
    }
  },true);

  // The legacy modal is created lazily after the page has loaded.
  document.addEventListener('click',()=>setTimeout(updateModalHelp,0),true);
  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',updateModalHelp,{once:true});
  else updateModalHelp();
})();