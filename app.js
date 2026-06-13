(function () {
  'use strict';

  const STORAGE_HISTORY = 'glueCalc.history.v1';
  const STORAGE_DRAFT = 'glueCalc.draft.v1';
  const MAX_HISTORY = 20;

  let currentResult = null;
  let deferredPrompt = null;

  /* ============ DOM refs ============ */
  const $ = (id) => document.getElementById(id);
  const form = $('calculatorForm');
  const areaInput = $('area');
  const thicknessInput = $('thickness');
  const densityInput = $('density');
  const packageVolInput = $('packageVol');
  const projectNameInput = $('projectName');
  const resultBox = $('result');
  const volumeResult = $('volumeResult');
  const massResult = $('massResult');
  const tubesResult = $('tubesResult');
  const resultTime = $('resultTime');
  const historyList = $('historyList');

  /* ============ Init ============ */
  function init() {
    const yearEl = $('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const calcBtn = $('calcBtn');
    if (calcBtn) calcBtn.addEventListener('click', handleCalculate);
    const resetBtn = $('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', handleReset);
    const exportWordBtn = $('exportWordBtn');
    if (exportWordBtn) exportWordBtn.addEventListener('click', exportWord);
    const exportPdfBtn = $('exportPdfBtn');
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportPdf);
    const clearHistoryBtn = $('clearHistoryBtn');
    if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory);

    if (form) {
      form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCalculate();
        }
      });
    }

    ['area', 'thickness', 'density', 'packageVol', 'projectName'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('input', saveDraft);
    });

    loadDraft();
    renderHistory();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('service-worker.js')
          .catch((err) => console.warn('SW 注册失败:', err));
      });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const bar = $('installBar');
      if (bar) bar.classList.add('show');
    });

    const installBtn = $('installBtn');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          const bar = $('installBar');
          if (bar) bar.classList.remove('show');
        }
        deferredPrompt = null;
      });
    }

    window.addEventListener('appinstalled', () => {
      const bar = $('installBar');
      if (bar) bar.classList.remove('show');
      showToast('应用已安装成功', 'success');
    });
  }

  /* ============ Draft / History ============ */
  function saveDraft() {
    const draft = {
      projectName: projectNameInput ? projectNameInput.value : '',
      area: areaInput ? areaInput.value : '',
      thickness: thicknessInput ? thicknessInput.value : '',
      density: densityInput ? densityInput.value : '',
      packageVol: packageVolInput ? packageVolInput.value : '',
    };
    try {
      localStorage.setItem(STORAGE_DRAFT, JSON.stringify(draft));
    } catch (_) {}
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_DRAFT);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (projectNameInput && d.projectName) projectNameInput.value = d.projectName;
      if (areaInput && d.area) areaInput.value = d.area;
      if (thicknessInput && d.thickness) thicknessInput.value = d.thickness;
      if (densityInput && d.density) densityInput.value = d.density;
      if (packageVolInput && d.packageVol) packageVolInput.value = d.packageVol;
    } catch (_) {}
  }

  function getHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function pushHistory(item) {
    const list = getHistory();
    list.unshift(item);
    if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
    try {
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list));
    } catch (_) {}
    renderHistory();
  }

  function clearHistory() {
    if (!confirm('确定要清空所有历史记录吗？')) return;
    try {
      localStorage.removeItem(STORAGE_HISTORY);
    } catch (_) {}
    renderHistory();
    showToast('历史记录已清空', 'success');
  }

  function renderHistory() {
    if (!historyList) return;
    const list = getHistory();
    historyList.innerHTML = '';
    if (list.length === 0) {
      historyList.classList.add('empty');
      const p = document.createElement('p');
      p.className = 'empty-text';
      p.innerHTML = '<i class="fa fa-inbox"></i> 暂无历史记录';
      historyList.appendChild(p);
      return;
    }
    historyList.classList.remove('empty');

    list.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'history-item-card';
      const dateStr = formatDate(item.time);
      div.innerHTML = `
        <div class="history-item-head">
          <p class="history-project">${escapeHtml(item.projectName || '未命名项目')}</p>
          <span class="history-time">${dateStr}</span>
        </div>
        <div class="history-inputs">
          <span><i class="fa fa-square-o" style="color:#60A5FA;font-size:10px;"></i> 面积：<strong>${item.area} m²</strong></span>
          <span><i class="fa fa-arrows-v" style="color:#34D399;font-size:10px;"></i> 厚度：<strong>${item.thickness} mm</strong></span>
          <span><i class="fa fa-balance-scale" style="color:#A78BFA;font-size:10px;"></i> 密度：<strong>${item.density} g/cm³</strong></span>
          <span><i class="fa fa-cube" style="color:#F59E0B;font-size:10px;"></i> 包装：<strong>${item.packageVol} ml</strong></span>
        </div>
        <div class="history-result">
          <span><i class="fa fa-tint" style="color:#2563EB;font-size:11px;"></i> ${item.volumeMl.toFixed(2)} ml</span>
          <span><i class="fa fa-balance-scale" style="color:#7C3AED;font-size:11px;"></i> ${item.massG.toFixed(2)} g</span>
          <span style="color:#059669;"><i class="fa fa-shopping-bag" style="color:#059669;font-size:11px;"></i> <strong>${item.tubes} 支</strong></span>
        </div>
      `;
      div.addEventListener('click', () => applyHistoryItem(item));
      historyList.appendChild(div);
    });
  }

  function applyHistoryItem(item) {
    if (projectNameInput) projectNameInput.value = item.projectName || '';
    if (areaInput) areaInput.value = item.area;
    if (thicknessInput) thicknessInput.value = item.thickness;
    if (densityInput) densityInput.value = item.density;
    if (packageVolInput) packageVolInput.value = item.packageVol;
    currentResult = item;
    showResult(item);
    saveDraft();
    showToast('已载入历史记录', 'success');
  }

  /* ============ Calculate ============ */
  function handleCalculate() {
    if (!areaInput || !thicknessInput || !densityInput || !packageVolInput) return;
    const projectName = projectNameInput ? projectNameInput.value.trim() : '';
    const area = parseFloat(areaInput.value);
    const thickness = parseFloat(thicknessInput.value);
    const density = parseFloat(densityInput.value);
    const packageVol = parseFloat(packageVolInput.value);

    if ([area, thickness, density, packageVol].some((v) => isNaN(v) || v <= 0)) {
      showToast('请填写完整且有效的正数数值', 'error');
      return;
    }

    const volumeMl = area * 1000 * thickness;
    const massG = volumeMl * density;
    const tubes = (volumeMl / packageVol).toFixed(1);

    currentResult = {
      time: Date.now(),
      projectName,
      area,
      thickness,
      density,
      packageVol,
      volumeMl,
      massG,
      tubes,
    };

    showResult(currentResult);
    pushHistory(currentResult);
    showToast('计算成功', 'success');
    saveDraft();
  }

  function showResult(r) {
    if (!resultBox) return;
    // 移除原有的内容（让动画重新触发）
    resultBox.classList.add('hidden');

    // 触发重排后再显示，确保动画播放
    void resultBox.offsetWidth;

    if (volumeResult) volumeResult.textContent = r.volumeMl.toFixed(2);
    if (massResult) massResult.textContent = r.massG.toFixed(2);
    if (tubesResult) tubesResult.textContent = r.tubes;
    if (resultTime) resultTime.textContent = formatDateTime(r.time);

    resultBox.classList.remove('hidden');
  }

  function handleReset() {
    if (form) form.reset();
    if (resultBox) resultBox.classList.add('hidden');
    currentResult = null;
    try {
      localStorage.removeItem(STORAGE_DRAFT);
    } catch (_) {}
    showToast('已重置');
  }

  /* ============ Export helpers: Document builder ============ */
  function buildExportDocHTML(r) {
    const doc = document.createElement('div');
    doc.className = 'export-document';
    const time = formatDateTime(r.time);
    const project = escapeHtml(r.projectName || '未命名项目');

    doc.innerHTML = `
      <div class="doc-header">
        <h1 class="doc-title">胶量计算报告</h1>
        <div class="doc-sub">${project} · ${time}</div>
      </div>

      <div class="doc-table">
        <div class="table-title">输入参数</div>
        <table>
          <tr><td class="label">项目名称</td><td class="value">${project}</td></tr>
          <tr><td class="label">粘接面积</td><td class="value">${r.area} m²</td></tr>
          <tr><td class="label">胶层厚度</td><td class="value">${r.thickness} mm</td></tr>
          <tr><td class="label">胶的密度</td><td class="value">${r.density} g/cm³</td></tr>
          <tr><td class="label">胶的包装量</td><td class="value">${r.packageVol} ml/支</td></tr>
        </table>
      </div>

      <div class="doc-table highlight">
        <div class="table-title">计算结果</div>
        <table>
          <tr><td class="label">总胶量（体积）</td><td class="value">${r.volumeMl.toFixed(2)} ml</td></tr>
          <tr><td class="label">总胶量（质量）</td><td class="value">${r.massG.toFixed(2)} g</td></tr>
          <tr><td class="label">所需胶支数</td><td class="value highlight-value">${r.tubes} 支</td></tr>
        </table>
      </div>

      <div class="doc-table">
        <div class="table-title">计算说明</div>
        <table>
          <tr><td class="label">体积公式</td><td class="value">体积(ml) = 面积(m²) × 1000 × 厚度(mm)</td></tr>
          <tr><td class="label">质量公式</td><td class="value">质量(g) = 体积(ml) × 密度(g/cm³)</td></tr>
          <tr><td class="label">支数公式</td><td class="value">支数 = 体积 ÷ 单支包装量</td></tr>
        </table>
      </div>

      <div class="doc-footer">— 胶量计算器 —</div>
    `;
    return doc;
  }

  function getSafeFileName(base) {
    const sanitized = (base || '胶量计算报告')
      .replace(/[\\/:*?"<>|\n\r\t]+/g, '_')
      .trim();
    return sanitized || '胶量计算报告';
  }

  /* ============ Word export: HTML blob + msword (零依赖) ============ */
  function exportWord() {
    if (!currentResult) {
      showToast('请先进行计算', 'error');
      return;
    }

    const r = currentResult;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const time = formatDateTime(r.time);
    const project = r.projectName || '未命名项目';

    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><title>胶量计算报告</title>
<meta name=ProgId content=Word.Document>
<style>
body{font-family:"Microsoft YaHei","SimSun",serif;font-size:13px;line-height:1.5}
.title{text-align:center;font-size:20px;font-weight:bold;color:#165DFF}
.subtitle{text-align:center;font-size:11px;color:#64748B;margin-bottom:16px}
h2{font-size:15px;border-bottom:2px solid #165DFF;padding-bottom:3px;margin-top:12px;margin-bottom:8px;color:#1e3a8a}
.param-row{display:grid;grid-template-columns:160px 1fr;padding:6px 10px;border-bottom:1px solid #e2e8f0}
.param-row:nth-child(odd){background:#f8fafc}
.result-row{background:#ecfdf5;font-weight:bold}
.result-label{color:#334155}
.result-value{color:#059669;font-size:14px}
.highlight-value{color:#059669;font-size:14px}
.note{font-size:11px;color:#666;margin-top:16px;padding-top:8px;border-top:1px solid #ccc;text-align:right}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
td{border:1px solid #cbd5e1;padding:8px 12px}
.label-col{width:40%;background:#f1f5f9;font-weight:600;color:#334155}
.value-col{width:60%;font-weight:600;color:#1e293b}
.highlight-section{background:#f0fdf4;border:1px solid #bbf7d0;padding:10px}
.highlight-section td{background:#ecfdf5;border-color:#bbf7d0}
.highlight-section .result-value{color:#059669}
.footer{text-align:right;font-size:10px;color:#94a3b8;margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0}
@page{size:A4;margin:1.5cm 1.5cm}
</style></head>
<body>
<div class="title">胶量计算报告</div>
<div class="subtitle">${project} · ${time}</div>

<h2>一、输入参数</h2>
<table>
  <tr><td class="label-col">项目名称</td><td class="value-col">${project}</td></tr>
  <tr><td class="label-col">粘接面积</td><td class="value-col">${r.area} m²</td></tr>
  <tr><td class="label-col">胶层厚度</td><td class="value-col">${r.thickness} mm</td></tr>
  <tr><td class="label-col">胶的密度</td><td class="value-col">${r.density} g/cm³</td></tr>
  <tr><td class="label-col">胶的包装量</td><td class="value-col">${r.packageVol} ml/支</td></tr>
</table>

<h2>二、计算结果</h2>
<table class="highlight-section">
  <tr><td class="label-col">总胶量（体积）</td><td class="value-col result-value">${r.volumeMl.toFixed(2)} ml</td></tr>
  <tr><td class="label-col">总胶量（质量）</td><td class="value-col result-value">${r.massG.toFixed(2)} g</td></tr>
  <tr><td class="label-col">所需胶支数</td><td class="value-col highlight-value">${r.tubes} 支</td></tr>
</table>

<h2>三、计算说明</h2>
<table>
  <tr><td class="label-col">体积公式</td><td class="value-col">体积(ml) = 面积(m²) × 1000 × 厚度(mm)</td></tr>
  <tr><td class="label-col">质量公式</td><td class="value-col">质量(g) = 体积(ml) × 密度(g/cm³)</td></tr>
  <tr><td class="label-col">支数公式</td><td class="value-col">支数 = 体积 ÷ 单支包装量</td></tr>
</table>

<div class="footer">— 胶量计算器 —</div>
</body></html>`;

    // 零依赖：HTML blob 下载
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getSafeFileName(r.projectName)}.doc`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);

    showToast('Word 报告已开始下载', 'success');
  }

  /* ============ PDF export: HTML页 + window.print() (零依赖) ============ */
  function exportPdf() {
    if (!currentResult) {
      showToast('请先进行计算', 'error');
      return;
    }

    const r = currentResult;
    const time = formatDateTime(r.time);
    const project = r.projectName || '未命名项目';

    // 生成PDF报告HTML（内嵌完整样式和工具栏）
    const pdfHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>胶量计算报告 - ${project}</title>
<style>
/* 基础重置 */
*{margin:0;padding:0;box-sizing:border-box}
html,body{font-family:"Microsoft YaHei","SimSun",serif;color:#1e293b;line-height:1.5;background:#fff}

/* 工具栏：打印时隐藏 */
.toolbar{position:sticky;top:0;display:flex;gap:10px;padding:10px 16px;
  background:#165DFF;color:#fff;box-shadow:0 2px 8px rgba(22,93,255,.3);z-index:100;justify-content:center}
.toolbar button{border:none;padding:8px 20px;border-radius:6px;font-size:14px;
  font-weight:bold;cursor:pointer;transition:opacity .2s}
.toolbar button:hover{opacity:.9}
.toolbar button.primary{background:#10b981;color:#fff}
.toolbar button.primary:hover{background:#059669}

/* 报告主体 */
.report{max-width:780px;margin:16px auto;padding:8px 24px}
.title{text-align:center;font-size:22px;font-weight:bold;color:#165DFF;margin-bottom:4px}
.subtitle{text-align:center;font-size:11px;color:#64748b;margin-bottom:16px}
h2{font-size:15px;border-bottom:2px solid #165DFF;padding-bottom:2px;
  margin-top:12px;margin-bottom:8px;color:#1e3a8a;font-weight:bold}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
td{border:1px solid #cbd5e1;padding:8px 12px}
.label-col{width:40%;background:#f1f5f9;font-weight:600;color:#334155}
.value-col{width:60%;font-weight:600;color:#1e293b}
.result-value{color:#059669;font-size:14px;font-weight:bold}
.highlight-value{color:#059669;font-size:14px;font-weight:bold}
.highlight-section{background:#f0fdf4;border:1px solid #bbf7d0}
.highlight-section td{background:#ecfdf5;border-color:#bbf7d0}
.footer{text-align:right;font-size:10px;color:#94a3b8;margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0}

/* 打印样式 */
@media print{
  .toolbar{display:none!important}
  .report{max-width:100%;margin:0;padding:20mm}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@page{size:A4;margin:15mm 15mm;
  @top-left{content:""} @top-center{content:""} @top-right{content:""}
  @bottom-left{content:""} @bottom-center{content:counter(page)" / "counter(pages)} @bottom-right{content:""}}
</style>
</head>
<body onkeydown="if(event.key==='Escape'){history.back();}">
<div class="toolbar">
  <button class="back" onclick="window.history.back()">← 返回</button>
  <button class="primary" onclick="window.print()">🖨️ 打印 / 导出PDF</button>
</div>

<div class="report">
  <div class="title">胶量计算报告</div>
  <div class="subtitle">${project} · ${time}</div>

  <h2>一、输入参数</h2>
  <table>
    <tr><td class="label-col">项目名称</td><td class="value-col">${project}</td></tr>
    <tr><td class="label-col">粘接面积</td><td class="value-col">${r.area} m²</td></tr>
    <tr><td class="label-col">胶层厚度</td><td class="value-col">${r.thickness} mm</td></tr>
    <tr><td class="label-col">胶的密度</td><td class="value-col">${r.density} g/cm³</td></tr>
    <tr><td class="label-col">胶的包装量</td><td class="value-col">${r.packageVol} ml/支</td></tr>
  </table>

  <h2>二、计算结果</h2>
  <table class="highlight-section">
    <tr><td class="label-col">总胶量（体积）</td><td class="value-col result-value">${r.volumeMl.toFixed(2)} ml</td></tr>
    <tr><td class="label-col">总胶量（质量）</td><td class="value-col result-value">${r.massG.toFixed(2)} g</td></tr>
    <tr><td class="label-col">所需胶支数</td><td class="value-col highlight-value">${r.tubes} 支</td></tr>
  </table>

  <h2>三、计算说明</h2>
  <table>
    <tr><td class="label-col">体积公式</td><td class="value-col">体积(ml) = 面积(m²) × 1000 × 厚度(mm)</td></tr>
    <tr><td class="label-col">质量公式</td><td class="value-col">质量(g) = 体积(ml) × 密度(g/cm³)</td></tr>
    <tr><td class="label-col">支数公式</td><td class="value-col">支数 = 体积 ÷ 单支包装量</td></tr>
  </table>

  <div class="footer">— 胶量计算器 —</div>
</div>
</body></html>`;

    // 打开PDF报告页（用href而非replace，保留返回）
    const blob = new Blob([pdfHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.location.href = url;
  }

  /* ============ (旧函数保留但不再使用) ============ */
  function showToast(message, type = 'info') {
    const el = $('toast');
    if (!el) return;
    const iconHtml = type === 'success'
      ? '<i class="fa fa-check" style="font-size:12px;"></i>'
      : type === 'error'
      ? '<i class="fa fa-exclamation" style="font-size:12px;"></i>'
      : '<i class="fa fa-info" style="font-size:12px;"></i>';
    el.innerHTML = `<span class="toast-icon">${iconHtml}</span><span>${message}</span>`;
    el.className = 'toast show';
    if (type === 'success') el.classList.add('success');
    if (type === 'error') el.classList.add('error');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.classList.remove('show');
    }, 2200);
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatDateTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
