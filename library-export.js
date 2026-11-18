/* Hells Gate Books — exportacao de backup JSON e livro em PDF */
(() => {
  'use strict';

  function html(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[c]);
  }

  function safeImage(src) {
    if (typeof src !== 'string') return '';
    if (/^assets\/[a-z0-9._/-]+$/i.test(src) && !src.includes('..')) return src;
    if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(src)) return src;
    if (/^https:\/\/tcwtcyikqxtfnlucyqtf\.supabase\.co\/storage\/v1\/object\/public\/hells-books\/[^\s<>"']+$/i.test(src)) return src;
    return '';
  }

  function downloadBackup(state) {
    if (!state || !Array.isArray(state.books) || !Array.isArray(state.pages)) {
      throw new Error('O acervo nao esta pronto para exportar.');
    }
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hells-gate-books-backup-' + new Date().toISOString().slice(0,10) + '.json';
    a.style.display = 'none';
    document.body.appendChild(a);
    try { a.click(); }
    finally { setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000); }
  }

  async function exportBookPDF(state, bookId, sanitizeRich) {
    const book = (state.books || []).find(b => b.id === bookId);
    if (!book) throw new Error('Escolha um livro valido.');
    const pages = (state.pages || []).filter(p => p.bookId === bookId)
      .sort((a,b) => (Number(a.order)||0) - (Number(b.order)||0));
    if (!pages.length) throw new Error('O livro ainda nao possui paginas.');
    if (typeof sanitizeRich !== 'function') throw new Error('Editor de texto indisponivel.');

    const old = document.getElementById('hg-book-print-frame');
    if (old) old.remove();

    const frame = document.createElement('iframe');
    frame.id = 'hg-book-print-frame';
    frame.title = 'Impressao do livro ' + book.title;
    frame.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(frame);

    const css = [
      '@page{size:A4;margin:0}',
      'html,body{margin:0;padding:0;background:#111}',
      'body{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      '.pg{box-sizing:border-box;width:210mm;height:297mm;break-after:page;page-break-after:always;overflow:hidden;display:flex;align-items:center;justify-content:center}',
      '.pg:last-child{break-after:auto;page-break-after:auto}',
      '.image{background:#151519}',
      '.image img{display:block;width:100%;height:100%;object-fit:contain}',
      '.text{background:#f8f5ed;color:#1a1a1a;display:block;padding:20mm 18mm;font:12pt/1.55 Georgia,serif}',
      '.text header{border-bottom:2px solid #a52034;padding-bottom:8mm;margin-bottom:12mm}',
      '.text header small{font:9pt sans-serif;letter-spacing:2px;color:#a52034}',
      '.text h1{font:700 24pt/1.1 Georgia,serif;margin:4mm 0 0}',
      '.text h2{font-size:16pt;color:#842132;margin:8mm 0 3mm}',
      '.text p{margin:0 0 5mm}.text img{max-width:100%;height:auto}',
      '@media screen{.pg{margin:0}}'
    ].join('');

    const markup = pages.map(p => {
      const src = safeImage(p.image);
      if (src && p.kind !== 'text') {
        return '<section class="pg image"><img loading="eager" src="' + html(src) +
          '" alt="' + html(p.title || 'Pagina') + '"></section>';
      }
      const body = sanitizeRich(p.body || '') || '<p>Pagina sem texto.</p>';
      return '<section class="pg text"><header><small>GARDENS · ' +
        html(p.section || 'MANUAL BASICO') + '</small><h1>' +
        html(p.title || 'Pagina') + '</h1></header><article>' + body + '</article></section>';
    }).join('');

    const doc = frame.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' +
      html(book.title) + '</title><style>' + css + '</style></head><body>' +
      markup + '</body></html>');
    doc.close();

    try {
      const images = Array.from(doc.images);
      await Promise.race([
        Promise.all(images.map(img => new Promise((resolve,reject) => {
          if (img.complete) return img.naturalWidth ? resolve() : reject(new Error('Imagem indisponivel: verifique sua conexao.'));
          img.addEventListener('load', resolve, {once:true});
          img.addEventListener('error', () => reject(new Error('Uma imagem do livro nao carregou.')), {once:true});
        }))),
        new Promise((_,reject) => setTimeout(() => reject(new Error('Tempo limite ao carregar imagens.')), 30000))
      ]);
      if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
      frame.contentWindow.focus();
      frame.contentWindow.print();
      frame.contentWindow.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 1000), {once:true});
      setTimeout(() => { if (frame.isConnected) frame.remove(); }, 120000);
      return true;
    } catch(e) {
      frame.remove();
      throw e;
    }
  }

  window.HGExport = {downloadBackup, exportBookPDF};
})();
