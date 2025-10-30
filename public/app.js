(function () {
  const form = document.getElementById('form');
  const fileInput = document.getElementById('file');
  const submit = document.getElementById('submit');
  const drop = document.getElementById('drop');
  const fileList = document.getElementById('file-list');
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  const history = document.getElementById('history');
  const watermark = document.getElementById('watermark');
  const watermarkText = document.getElementById('watermarkText');

  function setStatus(msg) { status.textContent = msg || ''; }
  function enableSubmit(enable) { submit.disabled = !enable; }
  function clearResults() { results.innerHTML = ''; }

  function renderFileList() {
    fileList.innerHTML = '';
    const files = fileInput.files;
    if (files.length === 0) return;

    const title = document.createElement('h4');
    title.textContent = 'Selected files';
    fileList.appendChild(title);

    for (const file of files) {
      const fileDiv = document.createElement('div');
      fileDiv.className = 'file-item';

      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.textContent = '📄'; // Basic file icon

      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = file.name;

      fileDiv.appendChild(icon);
      fileDiv.appendChild(name);
      fileList.appendChild(fileDiv);
    }
  }

  fileInput.addEventListener('change', () => {
    enableSubmit(fileInput.files.length > 0);
    renderFileList();
  });

  ;['dragenter', 'dragover'].forEach((evt) => drop.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation(); drop.classList.add('dragover');
  }));
  ;['dragleave', 'drop'].forEach((evt) => drop.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation(); drop.classList.remove('dragover');
  }));
  drop.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      enableSubmit(true);
      renderFileList();
    }
  });

  function updateWatermarkInputState() {
    const enabled = !!watermark.checked;
    watermarkText.disabled = !enabled;
  }
  updateWatermarkInputState();
  watermark.addEventListener('change', updateWatermarkInputState);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileInput.files.length) return;
    setStatus('Converting...');
    clearResults();
    enableSubmit(false);

    const data = new FormData();
    for (const file of fileInput.files) {
      data.append('files', file);
    }
    data.append('watermark', watermark.checked ? 'true' : 'false');
    if (watermark.checked) {
      const text = (watermarkText.value || '').trim() || 'DRAFT';
      data.append('watermarkText', text);
    }

    try {
      const res = await fetch('/convert', { method: 'POST', body: data });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || 'Conversion failed');
      }
      const { id, results: resultFiles } = await res.json();
      setStatus('Conversion complete.');

      const successful = resultFiles.filter(r => r.success);
      if (successful.length > 0) {
        const header = document.createElement('h4');
        header.textContent = 'Downloads';
        results.appendChild(header);
      }

      for (const result of resultFiles) {
        const p = document.createElement('p');
        if (result.success) {
          const b = document.createElement('b');
          b.textContent = result.originalName;
          p.appendChild(b);
          p.append(' -> ');
          const a = document.createElement('a');
          a.href = `/download/${id}/${encodeURIComponent(result.name)}`;
          a.textContent = result.name;
          a.download = result.name;
          p.appendChild(a);
        } else {
          p.textContent = `${result.originalName} -> Failed: ${result.error || 'Unknown error'}`;
          p.classList.add('error');
        }
        results.appendChild(p);
      }

      if (successful.length > 1) {
        const downloadAll = document.createElement('a');
        downloadAll.href = `/download-zip/${id}`;
        downloadAll.textContent = 'Download all as .zip';
        downloadAll.classList.add('button');
        results.appendChild(downloadAll);
      }

      loadHistory();
    } catch (err) {
      setStatus('Error: ' + (err && err.message || err));
    } finally {
      enableSubmit(true);
    }
  });

  async function loadHistory() {
    try {
      const res = await fetch('/history');
      if (!res.ok) return;
      const jobs = await res.json();
      history.innerHTML = '';
      if (jobs.length === 0) return;

      const header = document.createElement('h4');
      header.textContent = 'Recent History';
      history.appendChild(header);

      for (const job of jobs) {
        const jobDiv = document.createElement('div');
        jobDiv.classList.add('history-item');

        const Succeeded = job.results.filter(r => r.success).length
        const total = job.results.length;
        const p = document.createElement('p');
        p.textContent = `(${Succeeded}/${total}) files converted`
        jobDiv.appendChild(p);

        for (const result of job.results) {
            const p = document.createElement('p');
            if (result.success) {
                const b = document.createElement('b');
                b.textContent = result.originalName;
                p.appendChild(b);
                p.append(' -> ');
                const a = document.createElement('a');
                a.href = `/download/${job.id}/${encodeURIComponent(result.name)}`;
                a.textContent = result.name;
                a.download = result.name;
                p.appendChild(a);
            } else {
                p.textContent = `${result.originalName} -> Failed: ${result.error || 'Unknown error'}`;
                p.classList.add('error');
            }
            jobDiv.appendChild(p);
        }
        history.appendChild(jobDiv);
      }
    } catch (err) {
      console.error('Failed to load history', err);
    }
  }

  loadHistory();
})();


