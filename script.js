/* =============================================
   script.js – Landing Page Interactivity
   ============================================= */

const appConfig = window.CAFE_CCP_CONFIG || {};
const fallbackData = window.CAFE_CCP_FALLBACK || { packages: [] };
let publicData = fallbackData;
let runtimeBookingApiUrl = appConfig.bookingApiUrl || '';

async function resolveContentApiUrl() {
  let contentApiUrl = String(appConfig.contentApiUrl || '').trim();
  try {
    const response = await fetch('/api/config', { credentials:'same-origin', cache:'no-store' });
    if (!response.ok) return contentApiUrl;
    const runtimeConfig = await response.json();
    runtimeBookingApiUrl = String(runtimeConfig.bookingApiUrl || runtimeBookingApiUrl).trim();
    contentApiUrl = String(runtimeConfig.contentApiUrl || contentApiUrl).trim();
    return contentApiUrl;
  } catch (_) { return contentApiUrl; }
}

function formatVnd(amount) {
  return new Intl.NumberFormat('vi-VN').format(Number(amount || 0)) + 'đ';
}

function getPackage(code) {
  return (publicData.packages || []).find(item => item.code === code);
}

function isSafePublicUrl(value) {
  const url = String(value || '').trim();
  return url.startsWith('#') || (url.startsWith('/') && !url.startsWith('//')) || /^https:\/\//i.test(url) || /^[a-z0-9][a-z0-9._\/-]*$/i.test(url);
}

function renderContent() {
  const allowedAttributes = new Set(['alt', 'aria-label', 'href', 'src', 'title']);
  (publicData.content || []).forEach(item => {
    if (!item?.selector) return;
    let target;
    try { target = document.querySelector(item.selector); } catch (_) { return; }
    if (!target) return;
    if (item.type === 'attribute' && allowedAttributes.has(item.attribute)) {
      if ((item.attribute === 'href' || item.attribute === 'src') && !isSafePublicUrl(item.value)) return;
      target.setAttribute(item.attribute, item.value);
      return;
    }
    target.textContent = item.value ?? '';
  });
}

function createNavigationLink(item) {
  if (!item?.label || !isSafePublicUrl(item.href)) return null;
  const link = document.createElement('a');
  link.href = item.href;
  link.textContent = item.label;
  if (item.type === 'cta') link.className = 'nav-cta';
  if (/^https:\/\//i.test(item.href)) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  return link;
}

function renderNavigation() {
  if (!Array.isArray(publicData.navigation)) return;
  const desktop = document.querySelector('.nav-links');
  const mobile = document.getElementById('mobile-menu');
  const links = publicData.navigation.map(createNavigationLink).filter(Boolean);
  if (desktop) desktop.replaceChildren(...links.map(link => { const item = document.createElement('li'); item.appendChild(link); return item; }));
  if (mobile) mobile.replaceChildren(...publicData.navigation.map(createNavigationLink).filter(Boolean));
}

function renderSections() {
  if (!Array.isArray(publicData.sections)) return;
  const footer = document.getElementById('footer');
  const visibleKeys = new Set(publicData.sections.map(item => item.key));
  document.querySelectorAll('section[id]').forEach(section => { section.hidden = !visibleKeys.has(section.id); });
  if (!footer?.parentNode) return;
  publicData.sections.forEach(item => {
    const section = document.getElementById(item.key);
    if (section?.tagName === 'SECTION') footer.parentNode.insertBefore(section, footer);
  });
}

function renderPublicData() {
  renderContent();
  renderNavigation();
  renderSections();
  renderPackageViews();
}

function getBookingIdempotencyKey() {
  let key = sessionStorage.getItem('cafeCcpBookingAttempt');
  if (!key) {
    key = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    sessionStorage.setItem('cafeCcpBookingAttempt', key);
  }
  return key;
}

function createPackageCard(pkg) {
  const article = document.createElement('article');
  article.className = `pkg-card${pkg.featured ? ' pkg-featured' : ''}`;
  article.id = `pkg-${pkg.code}`;
  const glow = document.createElement('div'); glow.className = 'pkg-glow'; article.appendChild(glow);
  if (pkg.featured) { const badge = document.createElement('div'); badge.className = 'pkg-badge-featured'; badge.textContent = '⭐ Lựa chọn phổ biến'; article.appendChild(badge); }
  const header = document.createElement('div'); header.className = 'pkg-header';
  const iconWrap = document.createElement('div'); iconWrap.className = 'pkg-icon';
  const icon = document.createElement('img'); icon.src = pkg.icon; icon.alt = ''; icon.className = 'pkg-icon-img'; iconWrap.appendChild(icon);
  const tag = document.createElement('span'); tag.className = 'pkg-tag'; tag.textContent = pkg.tag || '';
  header.append(iconWrap, tag); article.appendChild(header);
  const name = document.createElement('h3'); name.className = 'pkg-name'; name.textContent = pkg.name; article.appendChild(name);
  const price = document.createElement('div'); price.className = 'pkg-price';
  const priceNumber = document.createElement('span'); priceNumber.className = 'price-num'; priceNumber.textContent = formatVnd(pkg.price);
  const duration = document.createElement('span'); duration.className = 'price-dur'; duration.textContent = `/ ${pkg.duration} ${pkg.unit || 'phút'}`; price.append(priceNumber, duration); article.appendChild(price);
  const features = document.createElement('ul'); features.className = 'pkg-features';
  (pkg.features || []).forEach(feature => { const item = document.createElement('li'); const star = document.createElement('span'); star.textContent = '✦'; item.append(star, document.createTextNode(` ${feature}`)); features.appendChild(item); });
  article.appendChild(features);
  const button = document.createElement('a'); button.href = '#book'; button.className = 'pkg-btn'; button.dataset.packageCode = pkg.code; button.textContent = pkg.featured ? 'Đặt lịch ưu tiên' : 'Chọn gói này'; article.appendChild(button);
  return article;
}

function renderPackageViews() {
  const grid = document.getElementById('packages-grid');
  if (grid) grid.replaceChildren(...(publicData.packages || []).map(createPackageCard));
  const highlights = document.querySelector('.book-highlight-row');
  if (highlights) {
    highlights.replaceChildren(...(publicData.packages || []).map(pkg => {
      const item = document.createElement('div'); item.className = `book-hl${pkg.featured ? ' pkg-hl-featured' : ''}`;
      const iconWrap = document.createElement('span'); iconWrap.className = 'bhl-icon';
      const icon = document.createElement('img'); icon.src = pkg.icon; icon.alt = ''; icon.className = 'bhl-icon-img'; iconWrap.appendChild(icon);
      const text = document.createElement('span'); text.append(document.createTextNode(pkg.name), document.createElement('br'));
      const strong = document.createElement('strong'); strong.textContent = `${formatVnd(pkg.price)} / ${pkg.duration} ${pkg.unit || 'phút'}`; text.appendChild(strong);
      item.append(iconWrap, text); return item;
    }));
  }
  populatePackageSelect();
}

function populatePackageSelect() {
  const select = document.getElementById('f-pkg');
  if (!select) return;
  const selected = select.value;
  select.querySelectorAll('option:not([value=""])').forEach(option => option.remove());
  (publicData.packages || []).forEach(pkg => {
    const option = document.createElement('option');
    option.value = pkg.code;
    option.textContent = `${pkg.name} – ${formatVnd(pkg.price)} / ${pkg.duration} ${pkg.unit || 'phút'}`;
    select.appendChild(option);
  });
  if (getPackage(selected)) select.value = selected;
}

async function loadPublicData() {
  const contentApiUrl = await resolveContentApiUrl();
  if (!contentApiUrl) {
    renderPublicData();
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs || 15000);
  try {
    const url = new URL(contentApiUrl);
    url.searchParams.set('action', 'publicInit');
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !Array.isArray(payload.data?.packages)) throw new Error('INVALID_PUBLIC_DATA');
    publicData = payload.data;
    runtimeBookingApiUrl = payload.data.config?.bookingApiUrl || runtimeBookingApiUrl;
    if (runtimeBookingApiUrl) sessionStorage.setItem('cafeCcpBookingApiUrl', runtimeBookingApiUrl);
    sessionStorage.setItem('cafeCcpPublicCache', JSON.stringify(payload.data));
  } catch (_) {
    try {
      const cached = JSON.parse(sessionStorage.getItem('cafeCcpPublicCache'));
      if (Array.isArray(cached?.packages)) {
        publicData = cached;
        runtimeBookingApiUrl = cached.config?.bookingApiUrl || runtimeBookingApiUrl;
      }
    } catch (_) {
      publicData = fallbackData;
    }
  } finally {
    clearTimeout(timer);
    renderPublicData();
  }
}

renderPublicData();
loadPublicData();

// ── Custom Cursor ──────────────────────────────
const cursor      = document.getElementById('custom-cursor');
const cursorTrail = document.getElementById('cursor-trail');

let mouseX = 0, mouseY = 0;
let trailX  = 0, trailY  = 0;

document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursor.style.left = mouseX + 'px';
  cursor.style.top  = mouseY + 'px';
});

// Smooth trail follow
function animateTrail() {
  trailX += (mouseX - trailX) * 0.12;
  trailY += (mouseY - trailY) * 0.12;
  cursorTrail.style.left = trailX + 'px';
  cursorTrail.style.top  = trailY + 'px';
  requestAnimationFrame(animateTrail);
}
animateTrail();

// Scale cursor on hover over interactive elements
document.querySelectorAll('a, button, .pkg-card, .pill, .process-step').forEach(el => {
  el.addEventListener('mouseenter', () => {
    cursor.style.transform = 'translate(-50%, -50%) scale(2)';
    cursorTrail.style.transform = 'translate(-50%, -50%) scale(0.6)';
  });
  el.addEventListener('mouseleave', () => {
    cursor.style.transform = 'translate(-50%, -50%) scale(1)';
    cursorTrail.style.transform = 'translate(-50%, -50%) scale(1)';
  });
});

// ── Floating Particles ─────────────────────────
const particlesContainer = document.getElementById('particles-container');

function createParticle() {
  const p = document.createElement('div');
  p.className = 'particle';
  const size = Math.random() * 6 + 2;
  const x    = Math.random() * 100;
  const dur  = Math.random() * 15 + 10;
  const delay = Math.random() * 8;
  p.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    left: ${x}%;
    animation-duration: ${dur}s;
    animation-delay: ${delay}s;
  `;
  particlesContainer.appendChild(p);
  setTimeout(() => p.remove(), (dur + delay) * 1000);
}

// Initial batch
for (let i = 0; i < 30; i++) createParticle();
setInterval(createParticle, 600);

// ── Navbar Scroll ─────────────────────────────
const navbar = document.getElementById('navbar');
const floatingSocialBar = document.querySelector('.floating-social-bar');

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;

  // Navbar glass effect
  if (scrollY > 60) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }

  // Floating scroll-to-top visibility on mobile (when scrolled > 50% of page height)
  if (floatingSocialBar && window.innerWidth <= 768) {
    const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollY > totalHeight * 0.5) {
      floatingSocialBar.classList.add('visible-mobile');
    } else {
      floatingSocialBar.classList.remove('visible-mobile');
    }
  }
}, { passive: true });

// ── Mobile Menu ───────────────────────────────
const burger     = document.getElementById('burger');
const mobileMenu = document.getElementById('mobile-menu');
let menuOpen = false;

burger.addEventListener('click', () => {
  menuOpen = !menuOpen;
  burger.setAttribute('aria-expanded', menuOpen);
  mobileMenu.classList.toggle('open', menuOpen);

  // Animate burger
  const spans = burger.querySelectorAll('span');
  if (menuOpen) {
    spans[0].style.transform = 'translateY(7px) rotate(45deg)';
    spans[1].style.opacity   = '0';
    spans[2].style.transform = 'translateY(-7px) rotate(-45deg)';
  } else {
    spans[0].style.transform = '';
    spans[1].style.opacity   = '';
    spans[2].style.transform = '';
  }
});

// Close menu on link click, including links rendered later from the CMS.
mobileMenu.addEventListener('click', event => {
  if (!event.target.closest('a')) return;
  menuOpen = false;
  mobileMenu.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
  const spans = burger.querySelectorAll('span');
  spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
});

// ── Scroll Reveal ─────────────────────────────
const reveals = document.querySelectorAll(
  '.pkg-card, .process-step, .about-grid, .vibes-grid, ' +
  '.showcase-grid, .discount-card, .audience-pills, ' +
  '.section-header, .about-text, .about-visual, ' +
  '.vibes-text, .vibes-images, .showcase-visual, .showcase-text, ' +
  '.book-inner, .extra-time-note, .discounts-row'
);

const observerOptions = {
  threshold: 0.12,
  rootMargin: '0px 0px -40px 0px'
};

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      // Stagger children
      const el = entry.target;
      const delay = el.dataset.delay || 0;
      setTimeout(() => {
        el.classList.add('visible');
      }, delay);
      revealObserver.unobserve(el);
    }
  });
}, observerOptions);

reveals.forEach((el, i) => {
  el.classList.add('reveal');
  el.dataset.delay = (i % 4) * 80;
  revealObserver.observe(el);
});

// Directional reveals for two-column layouts
document.querySelectorAll('.about-text, .vibes-text, .showcase-text').forEach(el => {
  el.classList.add('reveal-left');
  revealObserver.observe(el);
});
document.querySelectorAll('.about-visual, .vibes-images, .showcase-visual').forEach(el => {
  el.classList.add('reveal-right');
  revealObserver.observe(el);
});

// Stagger cards
document.querySelectorAll('.pkg-card').forEach((card, i) => {
  card.dataset.delay = i * 100;
});
document.querySelectorAll('.process-step').forEach((step, i) => {
  step.dataset.delay = i * 120;
});

// ── Smooth Anchor Scrolling ───────────────────
document.addEventListener('click', e => {
  const anchor = e.target.closest('a[href^="#"]');
  if (!anchor) return;
  const target = document.querySelector(anchor.getAttribute('href'));
  if (target) {
    e.preventDefault();
    const navH = navbar.offsetHeight;
    const top = target.getBoundingClientRect().top + window.scrollY - navH - 8;
    window.scrollTo({ top, behavior: 'smooth' });
  }
});

const scrollTopBtn = document.getElementById('scroll-to-top');
if (scrollTopBtn) {
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ── Tilt Effect on Package Cards ─────────────
document.querySelectorAll('.pkg-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const cx   = rect.left + rect.width  / 2;
    const cy   = rect.top  + rect.height / 2;
    const dx   = (e.clientX - cx) / (rect.width  / 2);
    const dy   = (e.clientY - cy) / (rect.height / 2);
    card.style.transform = `perspective(800px) rotateY(${dx * 6}deg) rotateX(${-dy * 4}deg) translateY(-8px)`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
    // Restore featured scale
    if (card.classList.contains('pkg-featured')) {
      card.style.transform = 'scale(1.04)';
    }
  });
});

// ── Parallax on Hero ──────────────────────────
const heroBg = document.querySelector('.hero-bg-img');
const magicBg = document.querySelector('.magic-circle-bg');

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  if (heroBg) heroBg.style.transform = `translateY(${scrollY * 0.3}px)`;
}, { passive: true });

// ── Star Sparkle on Click ─────────────────────
document.addEventListener('click', e => {
  const sparks = ['✦', '✧', '⋆', '★', '✨'];
  const sparkEl = document.createElement('span');
  sparkEl.textContent = sparks[Math.floor(Math.random() * sparks.length)];
  sparkEl.style.cssText = `
    position: fixed;
    left: ${e.clientX}px;
    top:  ${e.clientY}px;
    pointer-events: none;
    z-index: 9999;
    font-size: ${Math.random() * 14 + 10}px;
    color: hsl(${Math.random() * 60 + 40}, 80%, 75%);
    transform: translate(-50%, -50%);
    animation: sparkBurst 0.7s ease-out forwards;
  `;
  document.body.appendChild(sparkEl);
  setTimeout(() => sparkEl.remove(), 700);
});

// Inject sparkBurst keyframe once
const style = document.createElement('style');
style.textContent = `
  @keyframes sparkBurst {
    0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    100% { opacity: 0; transform: translate(calc(-50% + ${Math.random()*40-20}px), -80px) scale(0.3); }
  }
`;
document.head.appendChild(style);

// ── Feedback marquee pause on hover ──────────
// (handled via CSS)

// ── Active nav highlighting ────────────────────
const sections = document.querySelectorAll('section[id]');
function updateActiveNav() {
  let current = '';
  sections.forEach(section => {
    const rect = section.getBoundingClientRect();
    if (rect.top <= 120 && rect.bottom >= 120) {
      current = section.getAttribute('id');
    }
  });
  document.querySelectorAll('.nav-links a, #mobile-menu a').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
  });
}

window.addEventListener('scroll', updateActiveNav, { passive: true });

// ── Feedback Lightbox ──────────────────────────
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');
const feedbackImages = document.querySelectorAll('.fb-img');

if (lightbox && lightboxImg && lightboxClose) {
  feedbackImages.forEach(img => {
    img.addEventListener('click', () => {
      // Pause marquee and prevent scrolling
      document.body.classList.add('lightbox-open');
      
      // Set image source and show lightbox
      lightboxImg.src = img.src;
      lightbox.classList.add('active');
      lightbox.setAttribute('aria-hidden', 'false');
    });
  });

  const closeLightbox = () => {
    lightbox.classList.remove('active');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');
    setTimeout(() => {
      lightboxImg.src = '';
    }, 300); // Clear image after transition
  };

  lightboxClose.addEventListener('click', closeLightbox);
  
  // Close when clicking outside the image
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('lightbox-overlay')) {
      closeLightbox();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('active')) {
      closeLightbox();
    }
  });
}

// ── Packages Mobile Carousel ─────────────────────────
const pkgCarousel = document.getElementById('packages-grid');
const pkgPrevBtn = document.querySelector('.pkg-prev');
const pkgNextBtn = document.querySelector('.pkg-next');

if (pkgCarousel && pkgPrevBtn && pkgNextBtn) {
  pkgPrevBtn.addEventListener('click', () => {
    pkgCarousel.scrollBy({ left: -window.innerWidth * 0.8, behavior: 'smooth' });
  });
  pkgNextBtn.addEventListener('click', () => {
    pkgCarousel.scrollBy({ left: window.innerWidth * 0.8, behavior: 'smooth' });
  });
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-package-code]');
  if (!button) return;
  event.preventDefault();
  const select = document.getElementById('f-pkg');
  if (select) {
    select.value = button.dataset.packageCode;
    select.dispatchEvent(new Event('change'));
  }
  const bookingSection = document.getElementById('book');
  if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ── Booking Form ──────────────────────────────────────
const bookingForm = document.getElementById('booking-form');
const pkgSelect = document.getElementById('f-pkg');
const astroNote = document.getElementById('astro-note');
const bookingStatus = document.getElementById('booking-status');
const bookingFieldIds = ['f-name','f-phone','f-email','f-pkg','f-date'];
const bookingSuccessModal = document.getElementById('booking-success-modal');
let bookingRedirectTimer;

function showBookingSuccess({ orderId, email, name, packageName, amount, paymentUrl }) {
  const target = paymentUrl || `payment.html?${new URLSearchParams({ orderId })}`;
  sessionStorage.setItem('cafeCcpBookingSummary', JSON.stringify({ orderId, name, packageName, amount, email }));
  document.getElementById('booking-success-email').textContent = email;
  document.getElementById('booking-success-order').textContent = orderId;
  document.getElementById('booking-success-payment').href = target;
  bookingSuccessModal.hidden = false;
  document.body.classList.add('modal-open');
  document.getElementById('booking-success-payment').focus();
  let seconds = 8;
  const countdown = document.getElementById('booking-success-countdown');
  const tick = () => {
    countdown.textContent = `Tự động chuyển sang trang thanh toán sau ${seconds} giây.`;
    if (seconds-- <= 0) window.location.assign(target);
    else bookingRedirectTimer = setTimeout(tick, 1000);
  };
  tick();
}

function todayLocalIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,10);
}

function normalizeVietnamPhone(value) {
  const compact = String(value || '').replace(/[\s().-]/g,'');
  if (/^0[35789][0-9]{8}$/.test(compact)) return `+84${compact.slice(1)}`;
  if (/^84[35789][0-9]{8}$/.test(compact)) return `+${compact}`;
  if (/^\+84[35789][0-9]{8}$/.test(compact)) return compact;
  return '';
}

function setBookingFieldError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}-error`);
  input?.closest('.form-group')?.classList.toggle('has-error', Boolean(message));
  if (input) input.setAttribute('aria-invalid', String(Boolean(message)));
  if (error) error.textContent = message;
}

function validateBookingForm() {
  const name = document.getElementById('f-name').value.trim();
  const phoneInput = document.getElementById('f-phone').value.trim();
  const email = document.getElementById('f-email').value.trim().toLowerCase();
  const pkg = document.getElementById('f-pkg').value;
  const preferredDate = document.getElementById('f-date').value;
  const phone = normalizeVietnamPhone(phoneInput);
  const errors = {
    'f-name': name.length < 2 ? 'Vui lòng nhập họ tên có ít nhất 2 ký tự.' : '',
    'f-phone': phone ? '' : 'Số điện thoại Việt Nam không hợp lệ, ví dụ 0901 234 567.',
    'f-email': /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? '' : 'Email không đúng định dạng, ví dụ ten@example.com.',
    'f-pkg': getPackage(pkg) ? '' : 'Vui lòng chọn một gói dịch vụ.',
    'f-date': !preferredDate ? 'Vui lòng chọn ngày mong muốn.' : (preferredDate < todayLocalIso() ? 'Ngày đặt lịch không được ở trong quá khứ.' : '')
  };
  bookingFieldIds.forEach(id => setBookingFieldError(id, errors[id]));
  const firstInvalid = bookingFieldIds.find(id => errors[id]);
  if (firstInvalid) document.getElementById(firstInvalid)?.focus();
  return firstInvalid ? null : { name, phone, email, pkg, preferredDate };
}

const preferredDateInput = document.getElementById('f-date');
if (preferredDateInput) {
  const today = todayLocalIso();
  preferredDateInput.min = today;
  if (!preferredDateInput.value) preferredDateInput.value = today;
}
bookingFieldIds.forEach(id => {
  const input = document.getElementById(id);
  ['input','change'].forEach(eventName => input?.addEventListener(eventName, () => setBookingFieldError(id,'')));
});

if (pkgSelect && astroNote) {
  pkgSelect.addEventListener('change', () => {
    const selectedPackage = getPackage(pkgSelect.value);
    astroNote.style.display = selectedPackage?.bookingNote ? 'block' : 'none';
    const note = astroNote.querySelector('p');
    if (note && selectedPackage?.bookingNote) note.textContent = `✦ ${selectedPackage.bookingNote}`;
  });
}

if (bookingForm) {
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const validated = validateBookingForm();
    if (!validated) {
      bookingStatus.textContent = 'Vui lòng kiểm tra lại các trường được đánh dấu.';
      return;
    }
    const { name, phone, email, pkg, preferredDate } = validated;
    const topic   = document.getElementById('f-topic').value.trim();
    const partySize = Number(document.getElementById('f-party-size').value || 1);
    const submitButton = document.getElementById('btn-submit-booking');

    const selectedPackage = getPackage(pkg);
    if (!selectedPackage) {
      bookingStatus.textContent = 'Gói dịch vụ không còn khả dụng. Vui lòng chọn lại.';
      return;
    }

    const requestData = {
      name, phone, email, packageCode: pkg, topic, preferredDate, partySize,
      source: 'landing',
      idempotencyKey: getBookingIdempotencyKey()
    };

    submitButton.disabled = true;
    bookingStatus.textContent = 'Đang gửi đăng ký…';

    if (runtimeBookingApiUrl) {
      try {
        const response = await fetch(runtimeBookingApiUrl, {
          method: 'POST', credentials: 'omit',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'register', data: requestData })
        });
        const payload = await response.json();
        if (!payload.ok || !payload.data?.orderId) throw new Error(payload.error?.message || 'Chưa thể ghi nhận đăng ký.');
        sessionStorage.removeItem('cafeCcpBookingAttempt');
        showBookingSuccess({
          orderId:payload.data.orderId, email, name, packageName:selectedPackage.name,
          amount:payload.data.amount, paymentUrl:payload.data.paymentUrl
        });
        return;
      } catch (error) {
        bookingStatus.textContent = error.message || 'Chưa thể ghi nhận đăng ký. Vui lòng thử lại.';
        submitButton.disabled = false;
        return;
      }
    }

    bookingStatus.textContent = 'Hệ thống đặt lịch chưa được cấu hình. Vui lòng thử lại sau hoặc liên hệ quản trị viên.';
    submitButton.disabled = false;
  });
}

console.log('%c✦ Clow Cat Patronus × The Comma ✦', 'color: #F0D080; font-size: 14px; font-style: italic;');
console.log('%cKhai phá bản thân – Bật phá tiềm năng', 'color: #B8B8FF; font-size: 11px;');
