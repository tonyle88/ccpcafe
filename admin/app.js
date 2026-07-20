const staticConfig = window.CAFE_CCP_CONFIG || {};
const state = {
  token: sessionStorage.getItem('cafeCcpAdminToken') || '',
  contentApiUrl: staticConfig.contentApiUrl || '',
  data: null
};
const $ = id => document.getElementById(id);
const loginPanel = $('login-panel');
const dashboard = $('dashboard');
const toast = $('toast');
let toastTimer;

async function resolveContentApiUrl() {
  if (state.contentApiUrl) return state.contentApiUrl;
  try {
    const response = await fetch('/api/config', { credentials: 'same-origin', cache: 'no-store' });
    if (response.ok) {
      const runtimeConfig = await response.json();
      state.contentApiUrl = String(runtimeConfig.contentApiUrl || '').trim();
    }
  } catch (_) {
    // Local static preview may not run the Vercel function.
  }
  if (!state.contentApiUrl) throw new Error('Thiếu CONTENT_API_URL trong Environment Variables của Vercel.');
  return state.contentApiUrl;
}

async function api(action, data) {
  const contentApiUrl = await resolveContentApiUrl();
  const response = await fetch(contentApiUrl, {
    method: 'POST', credentials: 'omit',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, data, token: state.token })
  });
  if (!response.ok) throw new Error(`Content API phản hồi HTTP ${response.status}.`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.message || 'Có lỗi xảy ra.');
  return payload.data;
}

function notify(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error-toast', isError);
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function field(label, value, onChange, type = 'text', readOnly = false) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  input.type = type === 'textarea' ? undefined : type;
  if (type === 'checkbox') input.checked = value === true || String(value).toLowerCase() === 'true' || String(value) === '1';
  else input.value = value ?? '';
  input.readOnly = readOnly;
  input.addEventListener('input', () => onChange(type === 'checkbox' ? input.checked : (type === 'number' ? Number(input.value) : input.value)));
  wrapper.appendChild(input);
  return wrapper;
}

const recordViews = {
  content: { idKey:'Key', action:'saveContent', fields:[['Value','textarea']] },
  package: { idKey:'Code', action:'savePackage', fields:[['Name','text'],['Price','number'],['Duration','number'],['Enabled','checkbox']] },
  navigation: { idKey:'Key', action:'saveNavigation', fields:[['Label','text'],['Href','text'],['Order','number'],['Enabled','checkbox']] },
  section: { idKey:'Section Key', action:'saveSection', fields:[['Order','number'],['Visible','checkbox']] }
};

function renderRecords(targetId, records, kind) {
  const root = $(targetId);
  const view = recordViews[kind];
  root.replaceChildren();
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Chưa có dữ liệu. Hãy chạy hàm setup trong Apps Script trước.';
    root.appendChild(empty);
    return;
  }
  records.forEach(original => {
    const record = { ...original };
    const row = document.createElement('div');
    row.className = 'record';
    row.append(field(view.idKey, record[view.idKey], () => {}, 'text', true));
    view.fields.forEach(([key, type]) => row.append(field(key, record[key], value => { record[key] = value; }, type)));
    const save = document.createElement('button');
    save.textContent = 'Lưu thay đổi';
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await api(view.action, record);
        notify('✦ Đã lưu thành công');
        await loadAdmin();
      } catch (error) {
        notify(error.message, true);
      } finally {
        save.disabled = false;
      }
    });
    row.append(save);
    root.append(row);
  });
}

function render() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  $('logout').hidden = false;
  $('identity').textContent = `${state.data.session.displayName || state.data.session.username} · ${state.data.session.role}`;
  $('health').textContent = state.data.health.ok ? '● Hệ thống hoạt động' : '● Cần kiểm tra hệ thống';
  $('health').classList.toggle('health-error', !state.data.health.ok);
  renderRecords('content-list', state.data.content || [], 'content');
  renderRecords('package-list', state.data.packages || [], 'package');
  renderRecords('navigation-list', state.data.navigation || [], 'navigation');
  renderRecords('section-list', state.data.sections || [], 'section');
}

async function loadAdmin() {
  state.data = await api('adminInit');
  render();
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
  const buttonText = submit.querySelector('span');
  $('login-error').textContent = '';
  submit.disabled = true;
  buttonText.textContent = '✦ Đang kết nối…';
  try {
    const result = await api('login', { username: $('username').value, password: $('password').value });
    state.token = result.token;
    sessionStorage.setItem('cafeCcpAdminToken', state.token);
    $('password').value = '';
    await loadAdmin();
  } catch (error) {
    $('login-error').textContent = error.message;
    $('password').value = '';
    $('password').focus();
  } finally {
    submit.disabled = false;
    buttonText.textContent = '✦ Đăng nhập';
  }
});

$('logout').addEventListener('click', async () => {
  try { await api('logout'); } catch (_) {}
  sessionStorage.removeItem('cafeCcpAdminToken');
  location.reload();
});

document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => {
    const selected = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
    ['content','packages','navigation','sections'].forEach(name => { $(`${name}-panel`).hidden = selected !== name; });
  });
});

if (state.token) {
  loadAdmin().catch(() => {
    sessionStorage.removeItem('cafeCcpAdminToken');
    state.token = '';
  });
}
