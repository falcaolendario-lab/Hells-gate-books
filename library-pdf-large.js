/* Hells Gate Books — importador de PDF grande.
   Intercepta apenas o envio do formulario PDF antigo; demais editores permanecem intactos.
   Converte uma pagina por vez e publica imagens no Supabase Storage autorizado. */
(() => {
  'use strict';
  const MAX_PDF_BYTES = 250 * 1024 * 1024;
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
    if(!modal) return;
    const help = modal.querySelector('.hgb-help');
    if(help) help.textContent =
      'Aceita PDFs de até 250 MB e 1.000 páginas. Cada folha é convertida e enviada separadamente ao acervo online. Mantenha esta aba aberta até concluir.';
    const security = modal.querySelector('.hgb-security');
    if(security) security.textContent =
      'A importação usa sua conta autorizada do Arquivista. O novo livro só aparece para todos depois que todas as páginas forem salvas.';
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
      }, 'image/webp', 0.78);
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
    try {
      if(!file || !/\.pdf$/i.test(file.name)) throw new Error('Selecione um arquivo PDF válido.');
      if(!file.size) throw new Error('O arquivo PDF está vazio.');
      if(file.size > MAX_PDF_BYTES)
        throw new Error('PDF acima de 250 MB. Para arquivos ainda maiores, divida em volumes.');
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
      const loadTask = pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});
      doc = await loadTask.promise;
      if(doc.numPages > MAX_PDF_PAGES)
        throw new Error('Este PDF tem '+doc.numPages+' páginas; o limite é de 1.000. Divida em volumes.');
      if(!doc.numPages) throw new Error('O PDF não possui páginas.');
      importId = newId();
      const pages = [];
      for(let n=1; n<=doc.numPages; n++) {
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
          progress(n/doc.numPages, 'Página '+n+' de '+doc.numPages+' salva na nuvem.');
          await new Promise(resolve => setTimeout(resolve,0));
        } finally {
          canvas.width = 0;canvas.height = 0;
          page.cleanup?.();
        }
      }
      if(cancel) throw new Error('Importação cancelada.');
      progress(1, 'Registrando o livro completo na biblioteca...');
      state.books.push({
        id:importId, collectionId,
        title:title.slice(0,180),
        subtitle:'PDF importado · '+pages.length+' páginas',
        description:'Livro importado em PDF para a biblioteca online.',
        cover:pages[0]?.image || '',
        status:'Em desenvolvimento', volume:'01', featured:false
      });
      state.pages.push(...pages);
      await window.HGCloud.save(state);
      success = true;
      window.HGCloud.completePdfImport(importId);
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
      if(importId && !success) {
        try {
          progress(0,'Limpando páginas incompletas da nuvem...');
          await window.HGCloud.cleanupPdfImport(importId);
          progress(0,cancel?'Importação cancelada, sem alterar o acervo.':'Importação falhou. O acervo anterior foi preservado.');
        } catch(error) { console.warn('Não foi possível limpar páginas temporárias',error); }
      }
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
      progress(0, file.size > MAX_PDF_BYTES
        ? 'Arquivo de '+(file.size/1048576).toFixed(1)+' MB excede o limite de 250 MB.'
        : 'PDF selecionado: '+(file.size/1048576).toFixed(1)+' MB. Pronto para importar.');
    }
  },true);

  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',updateModalHelp,{once:true});
  else updateModalHelp();
})();