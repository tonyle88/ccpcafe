/* =============================================
   script.js – Landing Page Interactivity
   ============================================= */

const appConfig = window.CAFE_CCP_CONFIG || {};
const fallbackData = window.CAFE_CCP_FALLBACK || { packages: [] };
let publicData = fallbackData;

function formatVnd(amount) {
  return new Intl.NumberFormat('vi-VN').format(Number(amount || 0)) + 'đ';
}

function getPackage(code) {
  return (publicData.packages || []).find(item => item.code === code);
}

function populatePackageSelect() {
  const select = document.getElementById('f-pkg');
  if (!select) return;
  const selected = select.value;
  select.querySelectorAll('option:not([value=""])').forEach(option => option.remove());
  (publicData.packages || []).forEach(pkg => {
    const option = document.createElement('option');
    option.value = pkg.code;
    option.textContent = `${pkg.name} – ${formatVnd(pkg.price)} / ${pkg.duration} phút`;
    select.appendChild(option);
  });
  if (getPackage(selected)) select.value = selected;
}

async function loadPublicData() {
  if (!appConfig.contentApiUrl) {
    populatePackageSelect();
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs || 15000);
  try {
    const url = new URL(appConfig.contentApiUrl);
    url.searchParams.set('action', 'publicInit');
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !Array.isArray(payload.data?.packages)) throw new Error('INVALID_PUBLIC_DATA');
    publicData = payload.data;
    sessionStorage.setItem('cafeCcpPublicCache', JSON.stringify(payload.data));
  } catch (_) {
    try {
      const cached = JSON.parse(sessionStorage.getItem('cafeCcpPublicCache'));
      if (Array.isArray(cached?.packages)) publicData = cached;
    } catch (_) {
      publicData = fallbackData;
    }
  } finally {
    clearTimeout(timer);
    populatePackageSelect();
  }
}

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

// Close menu on link click
mobileMenu.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    menuOpen = false;
    mobileMenu.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    const spans = burger.querySelectorAll('span');
    spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
  });
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
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const navH = navbar.offsetHeight;
      const top  = target.getBoundingClientRect().top + window.scrollY - navH - 8;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
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
const navLinks  = document.querySelectorAll('.nav-links a, #mobile-menu a');

function updateActiveNav() {
  let current = '';
  sections.forEach(section => {
    const rect = section.getBoundingClientRect();
    if (rect.top <= 120 && rect.bottom >= 120) {
      current = section.getAttribute('id');
    }
  });
  navLinks.forEach(link => {
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

// ── Booking Form ──────────────────────────────────────
const bookingForm = document.getElementById('booking-form');
const pkgSelect = document.getElementById('f-pkg');
const astroNote = document.getElementById('astro-note');
const bookingStatus = document.getElementById('booking-status');

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
    const name    = document.getElementById('f-name').value.trim();
    const phone   = document.getElementById('f-phone').value.trim();
    const email   = document.getElementById('f-email').value.trim();
    const pkg     = document.getElementById('f-pkg').value;
    const topic   = document.getElementById('f-topic').value.trim();
    const preferredDate = document.getElementById('f-date').value;
    const partySize = Number(document.getElementById('f-party-size').value || 1);
    const submitButton = document.getElementById('btn-submit-booking');

    if (!name || !phone || !email || !pkg || !/^\S+@\S+\.\S+$/.test(email)) {
      bookingStatus.textContent = 'Vui lòng kiểm tra các trường bắt buộc và địa chỉ email.';
      return;
    }

    const selectedPackage = getPackage(pkg);
    if (!selectedPackage) {
      bookingStatus.textContent = 'Gói dịch vụ không còn khả dụng. Vui lòng chọn lại.';
      return;
    }

    const requestData = {
      name, phone, email, packageCode: pkg, topic, preferredDate, partySize,
      source: 'landing',
      idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    };

    submitButton.disabled = true;
    bookingStatus.textContent = 'Đang gửi đăng ký…';

    if (appConfig.bookingApiUrl) {
      try {
        const response = await fetch(appConfig.bookingApiUrl, {
          method: 'POST', credentials: 'omit',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'register', data: requestData })
        });
        const payload = await response.json();
        if (!payload.ok || !payload.data?.orderId) throw new Error('BOOKING_FAILED');
        window.location.assign(`payment.html?${new URLSearchParams({ orderId: payload.data.orderId })}`);
        return;
      } catch (_) {
        bookingStatus.textContent = 'Chưa thể ghi nhận đăng ký. Vui lòng thử lại hoặc liên hệ qua Messenger.';
        submitButton.disabled = false;
        return;
      }
    }

    const msgLines = [
      `Xin chào! Mình muốn đặt lịch tư vấn Clow Card tại The Comma.`,
      `Họ tên: ${name}`,
      `SĐT: ${phone}`,
      `Email: ${email}`,
      `Gói: ${selectedPackage.name} – ${formatVnd(selectedPackage.price)}/${selectedPackage.duration} phút`,
      preferredDate ? `Ngày mong muốn: ${preferredDate}` : '',
      `Số người: ${partySize}`,
      topic ? `Chủ đề: ${topic}` : '',
    ].filter(Boolean).join('\n');

    const encodedMsg = encodeURIComponent(msgLines);
    window.open(`${appConfig.messengerUrl || 'https://www.facebook.com/messages/t/'}?text=${encodedMsg}`, '_blank', 'noopener');

    const btn = bookingForm.querySelector('.form-submit-btn span');
    if (btn) btn.textContent = '✦ Đã gửi! Chúng mình sẽ liên hệ sớm nhé 🎉';
    bookingForm.classList.add('submitted');
    bookingStatus.textContent = 'Đã mở Messenger để bạn xác nhận đăng ký.';
  });
}

console.log('%c✦ Clow Cat Patronus × The Comma ✦', 'color: #F0D080; font-size: 14px; font-style: italic;');
console.log('%cKhai phá bản thân – Bật phá tiềm năng', 'color: #B8B8FF; font-size: 11px;');
