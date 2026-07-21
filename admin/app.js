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
  if (!payload.ok) {
    const error = new Error(payload.error?.message || 'Có lỗi xảy ra.');
    error.requestId = payload.requestId;
    throw error;
  }
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

const sectionLabels = Object.freeze({
  hero:'Trang mở đầu', about:'Về dịch vụ', instructor:'Người hướng dẫn', packages:'Gói dịch vụ',
  process:'Quy trình', feedback:'Cảm nhận khách hàng', book:'Đặt lịch', footer:'Chân trang'
});

const recordViews = {
  navigation: {
    idKey:'Key', titleKey:'Label', action:'saveNavigation', kicker:'Mục menu',
    fields:[
      { key:'Label', label:'Tên hiển thị trên trang chủ', type:'text' },
      { key:'Href', label:'Liên kết', type:'text' },
      { key:'Type', label:'Kiểu hiển thị', type:'select', options:['link','cta'] }
    ], enabledKey:'Enabled', enabledLabel:'Hiển thị trên menu'
  },
  section: {
    idKey:'Section Key', titleKey:'Label', action:'saveSection', kicker:'Section trang chủ',
    fields:[
      { key:'Label', label:'Tên hiển thị trên trang chủ', type:'text' }
    ], enabledKey:'Visible', enabledLabel:'Hiển thị section'
  }
};

function renderPackages(records) {
  const root = $('package-list');
  root.replaceChildren();
  if (!records.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Chưa có gói dịch vụ.'; root.appendChild(empty); return;
  }
  records.forEach(record => root.appendChild(createPackageEditor(record)));
}

function createPackageEditor(original) {
  const record = { Unit:'phút', Enabled:true, Featured:false, Order:0, ...original };
  const isNew = !record.Code;
  const card = document.createElement('article'); card.className = 'package-editor';
  const heading = document.createElement('header'); heading.className = 'editor-heading';
  const headingText = document.createElement('div');
  const kicker = document.createElement('span'); kicker.className = 'editor-kicker'; kicker.textContent = isNew ? 'Gói mới' : `Gói #${record.Order || '—'}`;
  const title = document.createElement('h3'); title.textContent = record.Name || 'Chưa đặt tên';
  headingText.append(kicker, title);
  const status = document.createElement('span'); status.className = `editor-status${record.Enabled ? ' is-active' : ''}`; status.textContent = record.Enabled ? 'Đang hiển thị' : 'Đang ẩn';
  heading.append(headingText, status); card.append(heading);
  const basics = document.createElement('div'); basics.className = 'package-fields';
  basics.append(field('Code', record.Code, value => { record.Code = value.trim().toLowerCase(); }, 'text', !isNew));
  basics.append(field('Tên gói', record.Name, value => { record.Name = value; title.textContent = value || 'Chưa đặt tên'; }));
  basics.append(field('Giá (VND)', record.Price, value => { record.Price = value; }, 'number'));
  basics.append(field('Thời lượng', record.Duration, value => { record.Duration = value; }, 'number'));
  basics.append(selectField('Đơn vị', record.Unit, ['phút','giờ'], value => { record.Unit = value; }));
  basics.append(field('Thứ tự', record.Order, value => { record.Order = value; }, 'number'));
  basics.append(field('Icon', record.Icon, value => { record.Icon = value; }));
  basics.append(field('Tag', record.Tag, value => { record.Tag = value; }));
  card.append(basics);
  const toggles = document.createElement('div'); toggles.className = 'editor-toggles';
  toggles.append(field('Hiển thị trên landing', record.Enabled, value => { record.Enabled = value; status.classList.toggle('is-active', value); status.textContent = value ? 'Đang hiển thị' : 'Đang ẩn'; }, 'checkbox'));
  toggles.append(field('Gói nổi bật', record.Featured, value => { record.Featured = value; }, 'checkbox'));
  card.append(toggles);
  const details = document.createElement('div'); details.className = 'package-details';
  const features = field('Features (mỗi dòng một mục)', String(record.Features || '').split('|').join('\n'), value => { record.Features = value.split('\n').map(item => item.trim()).filter(Boolean).join('|'); }, 'textarea');
  features.className = 'package-wide'; details.append(features);
  const note = field('Booking note', record['Booking Note'], value => { record['Booking Note'] = value; }, 'textarea');
  note.className = 'package-wide'; details.append(note); card.append(details);
  const actions = document.createElement('footer'); actions.className = 'editor-actions';
  const save = document.createElement('button'); save.className = 'button button-primary'; save.textContent = isNew ? '✦ Tạo gói' : '✦ Lưu thay đổi';
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await api('savePackage', record); notify('✦ Đã lưu gói dịch vụ'); await loadAdmin();
    } catch (error) { notify(`${error.message}${error.requestId ? ` · Mã ${error.requestId}` : ''}`, true); }
    finally { save.disabled = false; }
  });
  actions.append(save); card.append(actions);
  return card;
}

function renderContentRecords(records) {
  const root = $('content-list');
  root.replaceChildren();
  if (!records.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Chưa có nội dung. Hãy chạy setup Content Spreadsheet.'; root.appendChild(empty); return;
  }
  const groups = records.reduce((result, record) => {
    const section = String(record.Section || 'Khác');
    (result[section] ||= []).push(record);
    return result;
  }, {});
  const sectionOrder=Object.keys(sectionLabels);
  Object.entries(groups).sort(([left],[right])=>{
    const leftIndex=sectionOrder.indexOf(left),rightIndex=sectionOrder.indexOf(right);
    return (leftIndex<0?999:leftIndex)-(rightIndex<0?999:rightIndex)||(sectionLabels[left]||left).localeCompare(sectionLabels[right]||right,'vi');
  }).forEach(([section, sectionRecords],index) => {
    const group = document.createElement('details'); group.className = 'content-group'; group.open=index===0;
    const summary=document.createElement('summary');
    const heading = document.createElement('strong'); heading.textContent = sectionLabels[section] || section;
    const count=document.createElement('span'); count.textContent=`${sectionRecords.length} nội dung`;
    summary.append(heading,count);group.appendChild(summary);
    const content=document.createElement('div');content.className='content-group-body';
    sectionRecords.sort((left,right)=>String(left.Key||'').localeCompare(String(right.Key||''),'vi')).forEach(original => content.appendChild(createContentEditor(original)));
    group.appendChild(content);
    root.appendChild(group);
  });
}

function createContentEditor(original) {
  const record = { ...original };
  const card = document.createElement('article'); card.className = 'content-editor';
  const header = document.createElement('div'); header.className = 'content-editor-header';
  const title = document.createElement('strong'); title.textContent = record.Key;
  const description = document.createElement('span'); description.textContent = record.Description || 'Không có mô tả';
  header.append(title, description);
  const metadata = document.createElement('p'); metadata.className = 'content-metadata';
  [record.Selector, record.Type || 'text', record.Attribute].filter(Boolean).forEach(value => { const chip=document.createElement('code'); chip.textContent=value; metadata.appendChild(chip); });
  header.appendChild(metadata); card.appendChild(header);
  const body = document.createElement('div'); body.className = 'content-editor-body';
  const editor = field('Giá trị', record.Value, value => { record.Value = value; preview.textContent = value; }, 'textarea');
  editor.className = 'content-value'; body.appendChild(editor);
  const previewWrap = document.createElement('div'); previewWrap.className = 'content-preview';
  const previewLabel = document.createElement('small'); previewLabel.textContent = 'Preview an toàn';
  const preview = document.createElement('p'); preview.textContent = record.Value || '—';
  previewWrap.append(previewLabel, preview); body.appendChild(previewWrap); card.appendChild(body);
  const actions = document.createElement('footer'); actions.className = 'editor-actions';
  actions.appendChild(field('Hiển thị trên landing', record.Enabled, value => { record.Enabled = value; }, 'checkbox'));
  const save = document.createElement('button'); save.className = 'button button-primary'; save.textContent = '✦ Lưu nội dung';
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      if (String(record.Value || '').length > 5000) throw new Error('Nội dung vượt quá 5.000 ký tự.');
      await api('saveContent', record); notify('✦ Đã lưu nội dung'); await loadAdmin();
    } catch (error) { notify(`${error.message}${error.requestId ? ` · Mã ${error.requestId}` : ''}`, true); }
    finally { save.disabled = false; }
  });
  actions.appendChild(save); card.appendChild(actions);
  return card;
}

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
  const orderedRecords = [...records].sort((a,b) => Number(a.Order) - Number(b.Order));
  orderedRecords.forEach((original,index) => {
    const record = { ...original };
    if (kind === 'section' && !record.Label) record.Label = sectionLabels[record[view.idKey]] || record[view.idKey];
    const row = document.createElement('article'); row.className = 'managed-row';
    const heading = document.createElement('header'); heading.className = 'managed-row-heading';
    const handle = document.createElement('span'); handle.className = 'managed-handle'; handle.textContent = '⠿'; handle.setAttribute('aria-hidden','true');
    const headingText = document.createElement('div');
    const kicker = document.createElement('span'); kicker.className = 'editor-kicker'; kicker.textContent = view.kicker;
    const title = document.createElement('h3'); title.textContent = record[view.titleKey] || record[view.idKey];
    const code = document.createElement('code'); code.textContent = record[view.idKey];
    headingText.append(kicker,title,code); heading.append(handle,headingText);
    const controls = document.createElement('div'); controls.className = 'managed-controls';
    const enabled = record[view.enabledKey] === true || String(record[view.enabledKey]).toLowerCase() === 'true' || String(record[view.enabledKey]) === '1';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = `switch-button${enabled ? ' is-on' : ''}`; toggle.setAttribute('role','switch'); toggle.setAttribute('aria-checked',String(enabled)); toggle.setAttribute('aria-label',view.enabledLabel); toggle.innerHTML = '<span></span>';
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      record[view.enabledKey] = !enabled;
      try { await api(view.action, record); notify(record[view.enabledKey] ? '✦ Đã bật hiển thị' : '✦ Đã tắt hiển thị'); await loadAdmin(); }
      catch (error) { notify(`${error.message}${error.requestId ? ` · Mã ${error.requestId}` : ''}`, true); toggle.disabled = false; }
    });
    const up = document.createElement('button'); up.type = 'button'; up.className = 'order-button'; up.textContent = '↑'; up.setAttribute('aria-label',`Đưa ${title.textContent} lên`); up.disabled = index === 0;
    const down = document.createElement('button'); down.type = 'button'; down.className = 'order-button'; down.textContent = '↓'; down.setAttribute('aria-label',`Đưa ${title.textContent} xuống`); down.disabled = index === orderedRecords.length - 1;
    const move = async direction => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= orderedRecords.length) return;
      up.disabled = true; down.disabled = true;
      const reordered = orderedRecords.map(item => ({ ...item }));
      if (kind === 'section') reordered.forEach(item => { if (!item.Label) item.Label = sectionLabels[item[view.idKey]] || item[view.idKey]; });
      [reordered[index],reordered[targetIndex]] = [reordered[targetIndex],reordered[index]];
      try {
        for (let position=0; position<reordered.length; position++) {
          reordered[position].Order = position + 1;
          await api(view.action, reordered[position]);
        }
        notify('✦ Đã cập nhật thứ tự hiển thị'); await loadAdmin();
      } catch (error) { notify(`${error.message}${error.requestId ? ` · Mã ${error.requestId}` : ''}`, true); up.disabled = index === 0; down.disabled = index === orderedRecords.length - 1; }
    };
    up.addEventListener('click', () => move(-1)); down.addEventListener('click', () => move(1));
    controls.append(toggle,up,down); heading.append(controls); row.append(heading);
    const fields = document.createElement('div'); fields.className = 'managed-fields';
    view.fields.forEach(config => {
      const update = value => { record[config.key] = value; if (config.key === view.titleKey) title.textContent = value || record[view.idKey]; };
      fields.append(config.type === 'select' ? selectField(config.label, record[config.key] || config.options[0], config.options, update) : field(config.label, record[config.key], update, config.type));
    });
    row.append(fields);
    const actions = document.createElement('footer'); actions.className = 'editor-actions managed-actions';
    const save = document.createElement('button');
    save.className = 'button button-primary'; save.textContent = '✦ Lưu thay đổi';
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await api(view.action, record);
        notify('✦ Đã lưu thành công');
        await loadAdmin();
      } catch (error) {
        notify(`${error.message}${error.requestId ? ` · Mã ${error.requestId}` : ''}`, true);
      } finally {
        save.disabled = false;
      }
    });
    actions.append(save); row.append(actions);
    root.append(row);
  });
}

function renderUsers(records) {
  const root = $('user-list');
  root.replaceChildren();
  records.forEach(original => {
    const record = { ...original, Password:'' };
    const isNew = !record.Username;
    const row = document.createElement('div');
    row.className = 'record';
    row.append(field('Username', record.Username, value => { record.Username = value; }, 'text', !isNew));
    row.append(field('Tên hiển thị', record['Display Name'], value => { record['Display Name'] = value; }));
    row.append(selectField('Role', record.Role || 'editor', ['admin','editor'], value => { record.Role = value; }));
    row.append(selectField('Trạng thái', record.Status || 'active', ['active','disabled'], value => { record.Status = value; }));
    row.append(field(isNew ? 'Mật khẩu' : 'Mật khẩu mới (không bắt buộc)', '', value => { record.Password = value; }, 'password'));
    const save = document.createElement('button');
    save.textContent = isNew ? 'Tạo người dùng' : 'Lưu thay đổi';
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await api('saveUser', record);
        notify('✦ Đã lưu người dùng');
        await loadAdmin();
      } catch (error) {
        notify(`${error.message}${error.requestId ? ` · Mã ${error.requestId}` : ''}`, true);
      } finally { save.disabled = false; }
    });
    row.append(save);
    root.append(row);
  });
}

function selectField(label, value, options, onChange) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const select = document.createElement('select');
  options.forEach(optionValue => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    select.appendChild(option);
  });
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  wrapper.appendChild(select);
  return wrapper;
}

function render() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  $('logout').hidden = false;
  $('identity').textContent = `${state.data.session.displayName || state.data.session.username} · ${state.data.session.role}`;
  renderHealthOverview();
  renderContentRecords(state.data.content || []);
  renderPackages(state.data.packages || []);
  renderRecords('navigation-list', state.data.navigation || [], 'navigation');
  renderRecords('section-list', state.data.sections || [], 'section');
  renderPricingConfig(state.data.pricing || {});
  const isAdmin = state.data.session.role === 'admin';
  $('users-tab').hidden = !isAdmin;
  $('payment-tab').hidden = !isAdmin;
  $('booking-config-card').hidden = !isAdmin;
  if (isAdmin) {
    $('booking-web-app-url').value = state.data.configuration?.bookingWebAppUrl || '';
    renderPaymentConfig(state.data.configuration?.payment || {});
    renderUsers(state.data.users || []);
  }
}

function renderPaymentConfig(config) {
  $('payment-bank-code').value=config.bankCode||'';
  $('payment-bank-name').value=config.bankName||'';
  $('payment-account-name').value=config.accountName||'';
  $('payment-account-no').value=config.accountNo||'';
  $('payment-public-site-url').value=config.publicSiteUrl||'';
  $('payment-config-warning').textContent='ⓘ Thông tin ngân hàng được lưu tại Content Admin và dùng trực tiếp để tạo VietQR. Đối soát SePay đang tạm gác lại.';
}

function pricingPreview(text,percent) {
  const base=400000,discount=Math.round(base*Number(percent||0)/100),format=value=>new Intl.NumberFormat('vi-VN').format(value)+'đ';
  return String(text||'').replaceAll('{percent}',String(percent||0)).replaceAll('{base}',format(base)).replaceAll('{discount}',format(discount)).replaceAll('{final}',format(base-discount));
}

function renderPricingConfig(config) {
  $('pricing-2-percent').value=config.twoPeoplePercent??10;
  $('pricing-3-percent').value=config.threePeoplePercent??15;
  $('pricing-2-text').value=config.twoPeopleText||'Đi 2 người được giảm {percent}% — bạn tiết kiệm {discount}, còn {final}.';
  $('pricing-3-text').value=config.threePeopleText||'Đi 3 người được giảm {percent}% — bạn tiết kiệm {discount}, còn {final}.';
  updatePricingPreviews();
}

function updatePricingPreviews() {
  $('pricing-2-preview').textContent='Xem trước: '+pricingPreview($('pricing-2-text').value,$('pricing-2-percent').value);
  $('pricing-3-preview').textContent='Xem trước: '+pricingPreview($('pricing-3-text').value,$('pricing-3-percent').value);
}

function renderHealthOverview() {
  const contentHealth = state.data.health?.content || state.data.health || {};
  const bookingHealth = state.data.health?.booking || {};
  const allHealthy = contentHealth.ok === true && bookingHealth.ok === true;
  $('health').textContent = allHealthy ? '● Hệ thống hoạt động' : '● Cần kiểm tra hệ thống';
  $('health').classList.toggle('health-error', !allHealthy);
  $('content-health').textContent = contentHealth.ok ? 'Hoạt động' : 'Cần kiểm tra';
  $('content-health-detail').textContent = `${(contentHealth.checks || []).filter(check => check.ok).length}/${(contentHealth.checks || []).length} sheet sẵn sàng`;
  $('booking-health').textContent = bookingHealth.ok ? 'Hoạt động' : (bookingHealth.configured === false ? 'Chưa cấu hình' : 'Không khả dụng');
  $('booking-health-detail').textContent = bookingHealth.ok ? `Email ${bookingHealth.emailConfigured ? '✓' : '—'} · Thanh toán ${bookingHealth.paymentConfigured ? '✓' : '—'} · ${bookingHealth.paymentMode === 'sepay' ? 'SePay' : 'Thủ công'}` : (bookingHealth.code || 'UNKNOWN');
  const backup = state.data.operations?.lastBackup;
  $('backup-status').textContent = backup ? (backup.status || 'Không rõ') : 'Chưa có backup';
  $('backup-detail').textContent = backup ? [backup.type, formatTimestamp(backup.timestamp), backup.fileName].filter(Boolean).join(' · ') : 'Sẽ cập nhật sau lần backup đầu tiên';
  const errorsRoot = $('recent-errors');
  errorsRoot.replaceChildren();
  const errors = state.data.operations?.recentErrors || [];
  if (!errors.length) {
    const empty = document.createElement('p'); empty.textContent = 'Không có lỗi audit gần đây.'; errorsRoot.appendChild(empty); return;
  }
  errors.forEach(error => {
    const item = document.createElement('p');
    const label = document.createElement('strong'); label.textContent = `${error.action || 'unknown'} · ${error.targetType || 'system'}`;
    const detail = document.createElement('span'); detail.textContent = `${error.message || 'Không có mô tả'} · ${formatTimestamp(error.timestamp)}`;
    item.append(label, detail); errorsRoot.appendChild(item);
  });
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});
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
    ['content','packages','navigation','sections','pricing','payment','users'].forEach(name => { $(`${name}-panel`).hidden = selected !== name; });
  });
});

$('add-user').addEventListener('click', () => {
  if (state.data?.session?.role !== 'admin') return;
  renderUsers([{ Username:'', Role:'editor', Status:'active', 'Display Name':'', Password:'' }, ...(state.data.users || [])]);
});

$('add-package').addEventListener('click', () => {
  renderPackages([{ Code:'', Name:'', Price:1000, Duration:30, Unit:'phút', Icon:'icons/icon-star.svg', Featured:false, Tag:'', Features:'', 'Booking Note':'', Order:(state.data?.packages || []).length + 1, Enabled:true }, ...(state.data?.packages || [])]);
});

$('save-booking-config').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const bookingWebAppUrl = $('booking-web-app-url').value.trim();
    await api('saveBookingConfig', { bookingWebAppUrl });
    notify('✦ Đã kết nối Booking Script');
    await loadAdmin();
  } catch (error) {
    notify(`${error.message}${error.requestId ? ` · Mã ${error.requestId}` : ''}`, true);
  } finally { button.disabled = false; }
});

$('payment-config-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button=$('save-payment-config'), mode='manual';
  button.disabled=true;
  try {
    const data={mode,bankCode:$('payment-bank-code').value.trim(),bankName:$('payment-bank-name').value.trim(),accountName:$('payment-account-name').value.trim(),accountNo:$('payment-account-no').value.replace(/\s/g,''),publicSiteUrl:$('payment-public-site-url').value.trim()};
    await api('savePaymentConfig',data);
    notify('✦ Đã lưu thanh toán thủ công');
    await loadAdmin();
  } catch(error) { notify(`${error.message}${error.requestId?` · Mã ${error.requestId}`:''}`,true); }
  finally { button.disabled=false; }
});

['pricing-2-percent','pricing-3-percent','pricing-2-text','pricing-3-text'].forEach(id=>$(id).addEventListener('input',updatePricingPreviews));
$('pricing-config-form').addEventListener('submit',async event=>{
  event.preventDefault(); const button=$('save-pricing-config'); button.disabled=true;
  try { await api('savePricingConfig',{twoPeoplePercent:Number($('pricing-2-percent').value),threePeoplePercent:Number($('pricing-3-percent').value),twoPeopleText:$('pricing-2-text').value.trim(),threePeopleText:$('pricing-3-text').value.trim()}); notify('✦ Đã lưu ưu đãi nhóm'); await loadAdmin(); }
  catch(error){notify(`${error.message}${error.requestId?` · Mã ${error.requestId}`:''}`,true);} finally{button.disabled=false;}
});

if (state.token) {
  loadAdmin().catch(() => {
    sessionStorage.removeItem('cafeCcpAdminToken');
    state.token = '';
  });
}
