(function () {
  const form = document.getElementById('form');
  const fileInput = document.getElementById('file');
  const submit = document.getElementById('submit');
  const drop = document.getElementById('drop');
  const status = document.getElementById('status');
  const watermark = document.getElementById('watermark');
  const watermarkText = document.getElementById('watermarkText');

  function setStatus(msg) { status.textContent = msg || ''; }
  function enableSubmit(enable) { submit.disabled = !enable; }

  fileInput.addEventListener('change', () => enableSubmit(fileInput.files.length > 0));

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
    }
  });

  // Enable/disable watermark text based on checkbox
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
    enableSubmit(false);

    const data = new FormData();
    data.append('file', fileInput.files[0]);
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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const name = (fileInput.files[0].name || 'document.md').replace(/\.md$/i, '') + '.pdf';
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Done. Your download should start automatically.');
    } catch (err) {
      setStatus('Error: ' + (err && err.message || err));
    } finally {
      enableSubmit(true);
    }
  });
})();


