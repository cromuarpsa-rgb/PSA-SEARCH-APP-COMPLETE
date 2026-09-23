const searchInput = document.getElementById('searchInput');
const clearButton = document.getElementById('clearButton');
const table = document.getElementById('resultsTable');
const statusText = document.getElementById('statusText');
const fileName = document.getElementById('fileName');
const resultCount = document.getElementById('resultCount');
const totalCount = document.getElementById('totalCount');
const sheetNav = document.getElementById('sheetNav');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginScreen = document.getElementById('loginScreen');
const appShell = document.getElementById('appShell');
const adminSection = document.getElementById('adminSection');
const adminAddUser = document.getElementById('adminAddUser');
const userModal = document.getElementById('userModal');
const modalBackdrop = document.getElementById('modalBackdrop');
const closeUserModal = document.getElementById('closeUserModal');
const cancelUserModal = document.getElementById('cancelUserModal');
const userForm = document.getElementById('userForm');
const newUsername = document.getElementById('newUsername');
const newPassword = document.getElementById('newPassword');
const userError = document.getElementById('userError');
const userSuccess = document.getElementById('userSuccess');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarClose = document.getElementById('sidebarClose');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const themeToggle = document.getElementById('themeToggle');
const themeToggleIcon = document.getElementById('themeToggleIcon');
const themeToggleLabel = document.getElementById('themeToggleLabel');
const qrScanButton = document.getElementById('qrScanButton');
const bottomNavSearch = document.getElementById('bottomNavSearch');
const bottomNavScan = document.getElementById('bottomNavScan');
const bottomNavMenu = document.getElementById('bottomNavMenu');
const qrModal = document.getElementById('qrModal');
const qrModalBackdrop = document.getElementById('qrModalBackdrop');
const qrModalClose = document.getElementById('qrModalClose');
const qrCancelScan = document.getElementById('qrCancelScan');
const qrVideo = document.getElementById('qrVideo');
const qrCanvas = document.getElementById('qrCanvas');
const qrScanStatus = document.getElementById('qrScanStatus');
const zoomInButton = document.getElementById('zoomInButton');
const zoomOutButton = document.getElementById('zoomOutButton');
const zoomResetButton = document.getElementById('zoomResetButton');
const zoomLevelLabel = document.getElementById('zoomLevelLabel');

let workbook = null;
let activeSheet = 'all';
let loaded = false;
let currentUser = null;
let qrStream = null;
let qrAnimationFrame = null;
let qrBarcodeDetector = null;
let jsQRLoadPromise = null;

const AUTH_USERNAME = 'admin';
const AUTH_PASSWORD = 'admin123';
const LOCAL_USERS_KEY = 'psa_search_users';
const THEME_KEY = 'psa_search_theme';
const ZOOM_KEY = 'psa_search_zoom';
const ZOOM_MIN = 80;
const ZOOM_MAX = 160;
const ZOOM_STEP = 10;
const JSQR_SRC = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCellValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const num = Number(str);
    if (!Number.isNaN(num)) {
      return String(Math.round(num));
    }
  }
  return value;
}

function showApp() {
  loginScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
}

function showLogin(message = '') {
  loginScreen.classList.remove('hidden');
  appShell.classList.add('hidden');
  loginError.textContent = message;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  themeToggleIcon.textContent = isDark ? '☀️' : '🌙';
  themeToggleLabel.textContent = isDark ? 'Light mode' : 'Dark mode';
  themeToggle.setAttribute('aria-pressed', String(isDark));
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') {
    applyTheme(stored);
    return;
  }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
}

function applyZoom(level) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
  appShell.style.zoom = clamped / 100;
  zoomLevelLabel.textContent = `${clamped}%`;
  zoomOutButton.disabled = clamped <= ZOOM_MIN;
  zoomInButton.disabled = clamped >= ZOOM_MAX;
  localStorage.setItem(ZOOM_KEY, String(clamped));
  return clamped;
}

function initZoom() {
  const stored = parseInt(localStorage.getItem(ZOOM_KEY), 10);
  applyZoom(Number.isFinite(stored) ? stored : 100);
}

function currentZoom() {
  const stored = parseInt(localStorage.getItem(ZOOM_KEY), 10);
  return Number.isFinite(stored) ? stored : 100;
}

function zoomIn() {
  applyZoom(currentZoom() + ZOOM_STEP);
}

function zoomOut() {
  applyZoom(currentZoom() - ZOOM_STEP);
}

function resetZoom() {
  applyZoom(100);
}

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('visible');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('visible');
}

function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  if (jsQRLoadPromise) return jsQRLoadPromise;
  jsQRLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = JSQR_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the QR decoder. Check your internet connection and try again.'));
    document.head.appendChild(script);
  });
  return jsQRLoadPromise;
}

function handleQrResult(text) {
  stopQrScan();
  searchInput.value = text;
  renderResults();
  statusText.textContent = 'Search updated from scanned QR code.';
}

function detectWithNativeDetector() {
  if (!qrStream) return;
  qrBarcodeDetector.detect(qrVideo)
    .then((codes) => {
      if (codes && codes.length > 0 && codes[0].rawValue) {
        handleQrResult(codes[0].rawValue);
        return;
      }
      qrAnimationFrame = requestAnimationFrame(detectWithNativeDetector);
    })
    .catch(() => {
      qrAnimationFrame = requestAnimationFrame(detectWithNativeDetector);
    });
}

function detectWithJsQR() {
  if (!qrStream) return;
  const context = qrCanvas.getContext('2d');
  if (qrVideo.readyState === qrVideo.HAVE_ENOUGH_DATA && qrVideo.videoWidth) {
    qrCanvas.width = qrVideo.videoWidth;
    qrCanvas.height = qrVideo.videoHeight;
    context.drawImage(qrVideo, 0, 0, qrCanvas.width, qrCanvas.height);
    const imageData = context.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
    const code = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) {
      handleQrResult(code.data);
      return;
    }
  }
  qrAnimationFrame = requestAnimationFrame(detectWithJsQR);
}

async function startQrDetection() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (supported.includes('qr_code')) {
        qrBarcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
        qrScanStatus.textContent = 'Point your camera at a QR code.';
        detectWithNativeDetector();
        return;
      }
    } catch {
      // Fall through to the jsQR fallback below.
    }
  }

  try {
    qrScanStatus.textContent = 'Loading QR decoder…';
    await loadJsQR();
    qrScanStatus.textContent = 'Point your camera at a QR code.';
    detectWithJsQR();
  } catch (error) {
    qrScanStatus.textContent = error.message;
  }
}

async function openQrScan() {
  closeSidebar();
  qrModal.classList.remove('hidden');
  qrScanStatus.textContent = 'Requesting camera access…';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    qrScanStatus.textContent = 'Camera access is not supported in this browser.';
    return;
  }

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    qrVideo.srcObject = qrStream;
    await qrVideo.play();
    startQrDetection();
  } catch (error) {
    qrScanStatus.textContent = 'Camera unavailable: ' + error.message;
  }
}

function stopQrScan() {
  if (qrAnimationFrame) {
    cancelAnimationFrame(qrAnimationFrame);
    qrAnimationFrame = null;
  }
  if (qrStream) {
    qrStream.getTracks().forEach((track) => track.stop());
    qrStream = null;
  }
  qrVideo.pause();
  qrVideo.srcObject = null;
  qrBarcodeDetector = null;
  qrModal.classList.add('hidden');
}

function openUserModal() {
  userModal.classList.remove('hidden');
  userError.textContent = '';
  userSuccess.textContent = '';
  newUsername.value = '';
  newPassword.value = '';
}

function closeUserModalDialog() {
  userModal.classList.add('hidden');
}

function renderSheets() {
  const sheets = workbook?.sheets || [];

  if (sheets.length === 0) {
    sheetNav.innerHTML = '<div class="sheet-empty">No workbook sheets available.</div>';
    return;
  }

  sheetNav.innerHTML = ['<button type="button" data-sheet="all" class="' + (activeSheet === 'all' ? 'active' : '') + '"><span>All sheets</span></button>']
    .concat(sheets.map((sheet) => `<button type="button" data-sheet="${escapeHtml(sheet.name)}" class="${activeSheet === sheet.name ? 'active' : ''}"><span>${escapeHtml(sheet.name)}</span><em>${sheet.count}</em></button>`))
    .join('');
  sheetNav.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      activeSheet = button.dataset.sheet;
      renderSheets();
      renderResults();
      closeSidebar();
    });
  });
}

function filterRows() {
  const term = searchInput.value.trim().toLowerCase();
  const sheets = workbook?.sheets || [];
  const selectedSheets = activeSheet === 'all' ? sheets : sheets.filter((sheet) => sheet.name === activeSheet);

  let columns = [];
  let rows = [];
  let totalMatches = 0;

  for (const sheet of selectedSheets) {
    const sheetColumns = sheet.columns || [];
    sheetColumns.forEach((column) => {
      if (!columns.includes(column)) columns.push(column);
    });
    const matchedRows = (sheet.rows || []).filter((row) => {
      if (!term) return true;
      const haystack = Object.values(row).join(' ').toLowerCase();
      return haystack.includes(term);
    });
    totalMatches += matchedRows.length;
    rows.push(...matchedRows.map((row) => ({ sheet: sheet.name, ...row })));
  }

  return { columns, rows, totalMatches };
}

function renderResults() {
  const { columns, rows, totalMatches } = filterRows();
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  thead.innerHTML = columns.length ? `<tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>` : '';

  if (!rows.length) {
    tbody.innerHTML = `<tr><td class="empty" colspan="${Math.max(columns.length, 1)}">No matching records found.</td></tr>`;
  } else {
    tbody.innerHTML = rows.slice(0, 250).map((row) => {
      const values = columns.map((column) => formatCellValue(row[column] || ''));
      return `<tr>${values.map((value, index) => `<td data-label="${escapeHtml(columns[index])}">${escapeHtml(value)}</td>`).join('')}</tr>`;
    }).join('');
  }

  resultCount.textContent = String(Math.min(rows.length, 250));
  totalCount.textContent = String(totalMatches);
}

function loadStoredUsers() {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredUsers(users) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

async function loadWorkbook() {
  statusText.textContent = 'Loading workbook…';
  try {
    const response = await fetch('data/psa-data.json');
    if (!response.ok) throw new Error('Unable to load workbook data.');
    workbook = await response.json();
    fileName.textContent = workbook.file || 'Unknown workbook';
    if (!workbook.sheets || workbook.sheets.length === 0) {
      statusText.textContent = 'Workbook loaded, but no sheets were found. Run the export script to refresh data.';
      table.querySelector('tbody').innerHTML = `<tr><td class="empty">No sheets available in workbook data.</td></tr>`;
      renderSheets();
      resultCount.textContent = '0';
      totalCount.textContent = '0';
      loaded = true;
      return;
    }
    statusText.textContent = `Loaded ${workbook.sheets.length} sheet(s)`;
    renderSheets();
    renderResults();
    loaded = true;
  } catch (error) {
    statusText.textContent = error.message;
    fileName.textContent = 'Workbook unavailable';
    resultCount.textContent = '0';
    totalCount.textContent = '0';
    table.querySelector('tbody').innerHTML = `<tr><td class="empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const users = loadStoredUsers();

  const isAdmin = username === AUTH_USERNAME && password === AUTH_PASSWORD;
  const isRegularUser = users[username] && users[username] === password;

  if (isAdmin || isRegularUser) {
    currentUser = username;
    loginError.textContent = '';
    showApp();
    adminSection.classList.toggle('hidden', !isAdmin);
    if (!loaded) loadWorkbook();
    return;
  }

  showLogin('Invalid username or password.');
});

searchInput.addEventListener('input', renderResults);
clearButton.addEventListener('click', () => {
  searchInput.value = '';
  activeSheet = 'all';
  renderSheets();
  renderResults();
});

sidebarToggle.addEventListener('click', openSidebar);
bottomNavMenu.addEventListener('click', openSidebar);
bottomNavSearch.addEventListener('click', () => {
  openSidebar();
  setTimeout(() => searchInput.focus(), 250);
});
bottomNavScan.addEventListener('click', openQrScan);
sidebarClose.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

themeToggle.addEventListener('click', toggleTheme);
zoomInButton.addEventListener('click', zoomIn);
zoomOutButton.addEventListener('click', zoomOut);
zoomResetButton.addEventListener('click', resetZoom);

qrScanButton.addEventListener('click', openQrScan);
qrModalClose.addEventListener('click', stopQrScan);
qrCancelScan.addEventListener('click', stopQrScan);
qrModalBackdrop.addEventListener('click', stopQrScan);

adminAddUser.addEventListener('click', () => {
  closeSidebar();
  openUserModal();
});

closeUserModal.addEventListener('click', closeUserModalDialog);
cancelUserModal.addEventListener('click', closeUserModalDialog);
modalBackdrop.addEventListener('click', closeUserModalDialog);

userForm.addEventListener('submit', (event) => {
  event.preventDefault();
  userError.textContent = '';
  userSuccess.textContent = '';

  const username = newUsername.value.trim();
  const password = newPassword.value;

  if (!username || !password) {
    userError.textContent = 'Both username and password are required.';
    return;
  }
  if (username === AUTH_USERNAME) {
    userError.textContent = 'Cannot create another admin user.';
    return;
  }

  const users = loadStoredUsers();
  if (users[username]) {
    userError.textContent = 'This username already exists.';
    return;
  }

  users[username] = password;
  saveStoredUsers(users);
  userSuccess.textContent = `User "${username}" created successfully.`;
  newUsername.value = '';
  newPassword.value = '';
});

initTheme();
initZoom();
showLogin();
