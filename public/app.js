(function () {
  const form = document.getElementById('form');
  const fileInput = document.getElementById('file');
  const submit = document.getElementById('submit');
  const drop = document.getElementById('drop');
  const fileList = document.getElementById('file-list');
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  const history = document.getElementById('history');
  const orientation = document.getElementById('orientation');
  const paperSize = document.getElementById('paperSize');
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

    data.append('orientation', orientation.value);
    data.append('paperSize', paperSize.value);
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

  // Shared helper function for saving filters
  async function saveFilterToServer(name, code, mode, enabled, options = {}) {
    const { loadingMessage, successMessage, onSuccess, onError } = options;
    
    try {
      if (loadingMessage) {
        setFilterStatus(loadingMessage);
      }
      
      const res = await fetch('/api/filter/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, code, mode, enabled }),
      });

      if (res.ok) {
        const result = await res.json();
        if (successMessage) {
          const msg = typeof successMessage === 'function' ? successMessage(result) : successMessage;
          setFilterStatus(msg);
        }
        if (onSuccess) {
          onSuccess(result);
        }
        return { success: true, result };
      } else {
        const error = await res.json();
        const errorMsg = error.error || 'Failed to save filter';
        setFilterStatus(errorMsg, true);
        if (onError) {
          onError(error);
        }
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = 'Error saving filter: ' + (err.message || err);
      setFilterStatus(errorMsg, true);
      console.error('Error saving filter:', err);
      if (onError) {
        onError(err);
      }
      return { success: false, error: errorMsg };
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
    if (enabled && !code) {
      setFilterStatus('Filter code is required when the filter is enabled', true);
      return;
    }

    await saveFilterToServer(name, code, mode, enabled, {
      loadingMessage: 'Saving filter...',
      successMessage: (result) => `Filter "${result.name}" saved successfully`,
      onSuccess: (result) => {
        updateSavedFilterDisplay(result.name, code);
      }
    });
  }

  async function updateFilterEnabled() {
    const enabled = useCustomFilter.checked;
    const name = filterName.value.trim();
    const code = filterCode.value.trim();
    const mode = filterModeOverride.checked ? 'override' : 'additional';

    if (enabled && (!name || !code)) {
      setFilterStatus('Please save the filter first before enabling it', true);
      useCustomFilter.checked = false;
      return;
    }

    const result = await saveFilterToServer(name, code, mode, enabled, {
      loadingMessage: enabled ? 'Enabling filter...' : 'Disabling filter...',
      successMessage: enabled ? 'Custom filter enabled' : 'Custom filter disabled',
      onError: () => {
        useCustomFilter.checked = !enabled; // Revert on failure
      }
    });
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

  /* =========================================
     Meeting Notes Feature
     ========================================= */

  const meetingNotesTabBtn = document.getElementById('meetingNotesTabBtn');
  const converterTabBtn = document.querySelector('[data-tab="converter"]');
  const converterContent = document.getElementById('converter');
  const meetingNotesContent = document.getElementById('meeting-notes');
  const notesForm = document.getElementById('notes-form');
  const generateNotesBtn = document.getElementById('generateNotesBtn');
  const notesStatus = document.getElementById('notesStatus');
  const editorContainer = document.getElementById('editor-container');
  const markdownEditor = document.getElementById('markdown-editor');
  const markdownPreview = document.getElementById('markdown-preview');
  const notesActions = document.getElementById('notes-actions');
  const downloadMarkdownBtn = document.getElementById('downloadMarkdownBtn');
  const convertNotesBtn = document.getElementById('convertNotesBtn');

  const contextFileInput = document.getElementById('context-file-input');
  const contextLibraryInput = document.getElementById('context-library-input');
  const templateFileInput = document.getElementById('template-file-input');
  const templateLibraryInput = document.getElementById('template-library-input');
  const contextLibrarySelect = document.getElementById('contextLibrarySelect');
  const templateLibrarySelect = document.getElementById('templateLibrarySelect');
  const agendaFileInput = document.getElementById('agenda-file-input');
  const agendaTextInput = document.getElementById('agenda-text-input');
  const agendaText = document.getElementById('agendaText');

  // Check feature flag
  fetch('/api/config')
    .then(res => res.json())
    .then(config => {
      if (config.meetingNotesEnabled) {
        meetingNotesTabBtn.style.display = 'block';
      }
    })
    .catch(err => console.error('Error loading config:', err));

  // Tab Switching Logic
  function switchTab(tabName) {
    if (tabName === 'meeting-notes') {
      converterContent.style.display = 'none';
      meetingNotesContent.style.display = 'block';
      meetingNotesTabBtn.classList.add('active');
      converterTabBtn.classList.remove('active');
    } else {
      converterContent.style.display = 'block';
      meetingNotesContent.style.display = 'none';
      meetingNotesTabBtn.classList.remove('active');
      converterTabBtn.classList.add('active');
    }
  }

  meetingNotesTabBtn.addEventListener('click', () => {
    switchTab('meeting-notes');
    loadLibraryFiles();
  });
  converterTabBtn.addEventListener('click', () => switchTab('converter'));

  // Input Mode Switching
  document.querySelectorAll('input[name="contextMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'file') {
        contextFileInput.style.display = 'block';
        contextLibraryInput.style.display = 'none';
        contextLibrarySelect.value = ''; // Reset select
      } else {
        contextFileInput.style.display = 'none';
        contextLibraryInput.style.display = 'block';
        document.getElementById('context').value = ''; // Reset file input
      }
    });
  });

  document.querySelectorAll('input[name="agendaMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'file') {
        agendaFileInput.style.display = 'block';
        agendaTextInput.style.display = 'none';
        agendaText.value = ''; // Reset text input
      } else {
        agendaFileInput.style.display = 'none';
        agendaTextInput.style.display = 'block';
        document.getElementById('agenda').value = ''; // Reset file input
      }
    });
  });

  document.querySelectorAll('input[name="templateMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'file') {
        templateFileInput.style.display = 'block';
        templateLibraryInput.style.display = 'none';
        templateLibrarySelect.value = '';
      } else {
        templateFileInput.style.display = 'none';
        templateLibraryInput.style.display = 'block';
        document.getElementById('template').value = '';
      }
    });
  });

  // Library Management
  async function loadLibraryFiles() {
    try {
      const res = await fetch('/api/library');
      if (!res.ok) return;
      const files = await res.json();

      const populate = (select) => {
        const current = select.value;
        select.innerHTML = '<option value="">-- Select from Library --</option>';
        files.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f;
          opt.textContent = f;
          select.appendChild(opt);
        });
        select.value = current;
      };

      populate(contextLibrarySelect);
      populate(templateLibrarySelect);
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  }

  async function uploadToLibrary(fileInputId) {
    const input = document.getElementById(fileInputId);
    if (!input.files || input.files.length === 0) {
      alert('Please select a file to save.');
      return;
    }
    const file = input.files[0];
    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch('/api/library/upload', { method: 'POST', body: fd });
      if (res.ok) {
        alert('File saved to library!');
        loadLibraryFiles();
        // Switch to library mode automatically? Maybe not, user might want to continue
      } else {
        alert('Failed to save file.');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving file.');
    }
  }

  document.getElementById('saveContextToLibBtn').addEventListener('click', () => uploadToLibrary('context'));
  document.getElementById('saveTemplateToLibBtn').addEventListener('click', () => uploadToLibrary('template'));

  // Live Markdown Preview
  markdownEditor.addEventListener('input', () => {
    const markdownText = markdownEditor.value;
    markdownPreview.innerHTML = marked.parse(markdownText);
  });

  // Handle Note Generation
  notesForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(notesForm);

    // Determine which inputs to use based on radio selection
    const contextMode = document.querySelector('input[name="contextMode"]:checked').value;
    const templateMode = document.querySelector('input[name="templateMode"]:checked').value;
    const agendaMode = document.querySelector('input[name="agendaMode"]:checked').value;

    // If using file mode, clear library selection to avoid sending confusing data
    if (contextMode === 'file') {
        formData.delete('contextFile');
    }
    
    // Clear the unused agenda input so the server knows exactly which one to parse
    if (agendaMode === 'file') {
        formData.delete('agendaText');
    } else {
        formData.delete('agenda');
    }

    generateNotesBtn.disabled = true;
    generateNotesBtn.textContent = 'Generating...';
    notesStatus.textContent = 'Processing transcript and generating minutes (this may take a minute)...';
    notesStatus.classList.remove('error');

    try {
      const res = await fetch('/api/generate-minutes', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Generation failed');
      }

      const data = await res.json();

      // Populate Editor
      markdownEditor.value = data.markdown;
      markdownPreview.innerHTML = marked.parse(data.markdown);

      // Show Editor & Actions
      editorContainer.style.display = 'flex';
      notesActions.style.display = 'flex';
      notesStatus.textContent = 'Meeting minutes generated successfully!';

    } catch (err) {
      console.error(err);
      notesStatus.textContent = 'Error: ' + err.message;
      notesStatus.classList.add('error');
    } finally {
      generateNotesBtn.disabled = false;
      generateNotesBtn.textContent = 'Generate Meeting Notes';
    }
  });

  // Download Markdown
  downloadMarkdownBtn.addEventListener('click', () => {
    const markdown = markdownEditor.value;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meeting_minutes.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Convert Generated Notes to PDF
  convertNotesBtn.addEventListener('click', async () => {
    const markdown = markdownEditor.value;
    if (!markdown.trim()) {
      alert('No content to convert!');
      return;
    }

    // Create a File object from the current markdown content
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const file = new File([blob], 'meeting_minutes.md', { type: 'text/markdown' });

    // Switch back to converter tab
    switchTab('converter');

    // Simulate file selection in the main converter
    // We can't directly set fileInput.files due to security, so we'll use our internal state
    addFiles([file]);
    renderFileList();
    enableSubmit(true);

    // Optional: Auto-submit?
    // Let's just populate it so the user can review options (watermark, etc) before clicking "Convert"
    setStatus('Meeting minutes loaded. Click "Convert to PDF" to finish.');
  });

})();


