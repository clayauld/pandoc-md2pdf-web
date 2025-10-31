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
  const useCustomFilter = document.getElementById('useCustomFilter');
  const filterName = document.getElementById('filterName');
  const filterCode = document.getElementById('filterCode');
  const filterModeOverride = document.querySelector('input[name="filterMode"][value="override"]');
  const filterModeAdditional = document.querySelector('input[name="filterMode"][value="additional"]');
  const saveFilterBtn = document.getElementById('saveFilter');
  const filterStatus = document.getElementById('filterStatus');
  const savedFilterDisplay = document.getElementById('savedFilterDisplay');
  const savedFilterName = document.getElementById('savedFilterName');
  const savedFilterCode = document.getElementById('savedFilterCode');

  let selectedFiles = [];

  function setStatus(msg) { status.textContent = msg || ''; }
  function enableSubmit(enable) { submit.disabled = !enable; }
  function clearResults() { results.innerHTML = ''; }

  function getFileKey(file) {
    const rel = (file.webkitRelativePath || '').trim();
    if (rel) return rel;
    return `${file.name}__${file.size}__${file.lastModified}`;
  }

  function splitFilename(name) {
    const idx = name.lastIndexOf('.');
    return {
      base: idx > 0 ? name.slice(0, idx) : name,
      ext: idx > 0 ? name.slice(idx) : ''
    };
  }

  function renderFileList() {
    fileList.innerHTML = '';
    if (selectedFiles.length === 0) return;

    const title = document.createElement('h4');
    title.textContent = 'Selected files';
    fileList.appendChild(title);

    for (const file of selectedFiles) {
      const fileDiv = document.createElement('div');
      fileDiv.className = 'file-item';

      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;

      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = file.name;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'file-remove';
      removeBtn.textContent = '✖';
      removeBtn.dataset.filekey = getFileKey(file);

      fileDiv.appendChild(icon);
      fileDiv.appendChild(name);
      fileDiv.appendChild(removeBtn);
      fileList.appendChild(fileDiv);
    }
  }

  fileList.addEventListener('click', (e) => {
    if (e.target.classList.contains('file-remove')) {
      const filekey = e.target.dataset.filekey;
      selectedFiles = selectedFiles.filter(f => getFileKey(f) !== filekey);
      renderFileList();
      enableSubmit(selectedFiles.length > 0);
    }
  });

  function addFiles(files) {
    for (const file of files) {
      const key = getFileKey(file);
      if (!selectedFiles.some(f => getFileKey(f) === key)) {
        selectedFiles.push(file);
      }
    }
  }

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    enableSubmit(selectedFiles.length > 0);
    renderFileList();
    fileInput.value = ''; // Reset the input
  });

  ;['dragenter', 'dragover'].forEach((evt) => drop.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation(); drop.classList.add('dragover');
  }));
  ;['dragleave', 'drop'].forEach((evt) => drop.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation(); drop.classList.remove('dragover');
  }));
  drop.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
      enableSubmit(selectedFiles.length > 0);
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
    if (selectedFiles.length === 0) return;
    setStatus('Converting...');
    clearResults();
    enableSubmit(false);

    const data = new FormData();
    const nameCounts = Object.create(null);
    for (const file of selectedFiles) {
      nameCounts[file.name] = (nameCounts[file.name] || 0) + 1;
    }
    const nameSeen = Object.create(null);
    for (const file of selectedFiles) {
      const total = nameCounts[file.name] || 1;
      let uploadName = file.name;
      if (total > 1) {
        const count = (nameSeen[file.name] || 0) + 1;
        nameSeen[file.name] = count;
        const { base, ext } = splitFilename(file.name);
        const cleanBase = base.replace(/_+$/, '');
        uploadName = `${cleanBase} ${count}${ext}`;
      }
      data.append('files', file, uploadName);
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
          const a = document.createElement('a');
          a.href = `/download/${id}/${encodeURIComponent(result.name)}`;
          a.download = result.name;
          a.innerHTML = `📄 ${result.name}`;
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

      // Clear the file list on success
      selectedFiles = [];
      renderFileList();

    } catch (err) {
      setStatus('Error: ' + (err && err.message || err));
    } finally {
      // Re-enable submit button only if there are files left to submit
      enableSubmit(selectedFiles.length > 0);
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
                const a = document.createElement('a');
                a.href = `/download/${job.id}/${encodeURIComponent(result.name)}`;
                a.download = result.name;
                a.innerHTML = `📄 ${result.name}`;
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

  // Filter management functions
  function setFilterStatus(msg, isError = false) {
    filterStatus.textContent = msg || '';
    filterStatus.style.color = isError ? '#ef4444' : '#93c5fd';
  }

  function updateSavedFilterDisplay(name, code) {
    if (name && code) {
      savedFilterName.textContent = name;
      savedFilterCode.textContent = code;
      savedFilterDisplay.style.display = 'block';
    } else {
      savedFilterDisplay.style.display = 'none';
    }
  }

  async function loadDefaultFilter() {
    try {
      const res = await fetch('/api/filter/default');
      if (res.ok) {
        const code = await res.text();
        if (!filterCode.value || filterCode.value.trim() === '') {
          filterCode.value = code;
        }
      }
    } catch (err) {
      console.error('Failed to load default filter:', err);
    }
  }

  async function loadCustomFilter() {
    try {
      const res = await fetch('/api/filter/custom');
      if (res.ok) {
        const data = await res.json();
        if (data.name && data.code) {
          // Custom filter exists (enabled or disabled)
          filterName.value = data.name;
          filterCode.value = data.code;
          useCustomFilter.checked = data.enabled || false;
          if (data.mode === 'override') {
            filterModeOverride.checked = true;
          } else {
            filterModeAdditional.checked = true;
          }
          updateSavedFilterDisplay(data.name, data.code);
        }
      }
    } catch (err) {
      console.error('Failed to load custom filter:', err);
    }
  }

  async function handleSaveFilter() {
    const name = filterName.value.trim();
    const code = filterCode.value.trim();
    const mode = filterModeOverride.checked ? 'override' : 'additional';
    const enabled = useCustomFilter.checked;

    if (!name) {
      setFilterStatus('Filter name is required', true);
      return;
    }
    if (!code) {
      setFilterStatus('Filter code is required', true);
      return;
    }

    try {
      setFilterStatus('Saving filter...');
      const res = await fetch('/api/filter/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, code, mode, enabled }),
      });

      if (res.ok) {
        const result = await res.json();
        setFilterStatus(`Filter "${result.name}" saved successfully`);
        updateSavedFilterDisplay(result.name, code);
      } else {
        const error = await res.json();
        setFilterStatus(error.error || 'Failed to save filter', true);
      }
    } catch (err) {
      setFilterStatus('Error saving filter: ' + (err.message || err), true);
      console.error('Error saving filter:', err);
    }
  }

  async function updateFilterEnabled() {
    const enabled = useCustomFilter.checked;
    const name = filterName.value.trim();
    const code = filterCode.value.trim();

    if (enabled && (!name || !code)) {
      setFilterStatus('Please save the filter first before enabling it', true);
      useCustomFilter.checked = false;
      return;
    }

    // Fetch the saved config to preserve the last saved mode, not the current UI state
    // This prevents accidentally saving an unsaved mode change when toggling the checkbox
    let savedMode;
    try {
      const customRes = await fetch('/api/filter/custom');
      if (customRes.ok) {
        const customData = await customRes.json();
        if (customData.mode) {
          savedMode = customData.mode; // Use the saved mode from server
        } else {
          // If no saved mode exists, fall back to current UI state
          savedMode = filterModeOverride.checked ? 'override' : 'additional';
        }
      } else {
        // If fetch fails, abort the update to prevent saving inconsistent state
        console.error('Could not fetch saved filter mode:', customRes.status);
        setFilterStatus('Error: Could not read saved filter settings. Please try again.', true);
        useCustomFilter.checked = !enabled;
        return; // Abort
      }
    } catch (err) {
      // If fetching fails, abort the update to prevent saving inconsistent state
      console.error('Could not fetch saved filter mode:', err);
      setFilterStatus('Error: Could not read saved filter settings. Please try again.', true);
      useCustomFilter.checked = !enabled;
      return; // Abort
    }

    // Update only the enabled state, preserving the saved mode
    try {
      const res = await fetch('/api/filter/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, code, mode: savedMode, enabled }),
      });

      if (!res.ok) {
        const error = await res.json();
        setFilterStatus(error.error || 'Failed to update filter state', true);
        useCustomFilter.checked = !enabled;
      } else {
        setFilterStatus(enabled ? 'Custom filter enabled' : 'Custom filter disabled');
        // Keep the custom filter code visible even when disabled so users can see/edit it
      }
    } catch (err) {
      setFilterStatus('Error updating filter state: ' + (err.message || err), true);
      useCustomFilter.checked = !enabled;
      console.error('Error updating filter state:', err);
    }
  }

  // Event listeners for filter management
  saveFilterBtn.addEventListener('click', handleSaveFilter);
  useCustomFilter.addEventListener('change', updateFilterEnabled);

  // Load filters on page load
  (async () => {
    // Load default filter first
    await loadDefaultFilter();
    // Then load custom filter if it exists (it will override the default in the textarea)
    await loadCustomFilter();
  })();
})();


