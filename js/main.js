// Nav scroll state + mobile menu
const nav = document.getElementById('nav');
const toggle = document.getElementById('navToggle');
const links = document.getElementById('navLinks');

if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

if (toggle && links) {
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
}

// Scroll reveal
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// Animated counters
const animateCount = el => {
  const target = parseFloat(el.dataset.count);
  const decimals = parseInt(el.dataset.decimals || 0, 10);
  const suffix = el.dataset.suffix || '';
  const useK = el.dataset.format === 'k';
  const dur = 1600;
  const start = performance.now();
  const fmt = v => {
    if (useK) return Math.round(v).toLocaleString('en-IN');
    return v.toFixed(decimals);
  };
  const tick = now => {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const counterIO = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { animateCount(e.target); counterIO.unobserve(e.target); }
  });
}, { threshold: 0.6 });
document.querySelectorAll('[data-count]').forEach(el => counterIO.observe(el));

// Footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Project filters
const filterBtns = document.querySelectorAll('.filter-btn');
const filterItems = document.querySelectorAll('[data-filter-item], [data-sector]');
if (filterBtns.length && filterItems.length) {
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      filterItems.forEach(item => {
        const match = filter === 'all' || item.dataset.sector === filter;
        item.classList.toggle('is-hidden', !match);
        if (!item.classList.contains('work-band')) {
          item.style.display = match ? '' : 'none';
        }
      });
    });
  });
}

// ===============================
// Contact / enquiry submission → Google Sheets (via Google Apps Script Web App)
// Paste your deployed Apps Script /exec URL below after completing the setup.
// Leave as null to keep the form working locally without a backend call.
const ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxjzXE4qQsFXlDWvj9IpbBWgke53hBmFk3ZDR6C54UyGmVhe2ljea5xl0CUqD-bHrhJxw/exec';
const normalizePhoneIN = (raw) => {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const digitsOnly = s.replace(/[^\d+]/g, '');
  const withPlus = digitsOnly.startsWith('+');
  const nums = digitsOnly.replace(/^\+/, '');
  if (withPlus) {
    const rest = nums.replace(/\D/g, '');
    return rest.length >= 9 ? `+${rest}` : '';
  }
  if (/^00/.test(nums)) {
    const rest = nums.slice(2).replace(/\D/g, '');
    return rest.length >= 9 ? `+${rest}` : '';
  }
  const d = nums.replace(/\D/g, '');
  if (d.startsWith('91') && d.length >= 12) return `+${d}`;
  if (d.startsWith('0') && d.length >= 11) return `+91${d.slice(1)}`;
  if (d.length === 10) return `+91${d}`;
  if (d.length >= 9 && d.length <= 12) return `+91${d}`;
  return '';
};

let __enquiryLastSentAt = 0;
let __enquiryCountThisSession = 0;
const SUBMIT_COOLDOWN_MS = 5000;
const SUBMIT_MAX_PER_SESSION = 3;

const submitEnquiry = async (formEl, { source }) => {
  const data = {};
  new FormData(formEl).forEach((v, k) => { data[k] = typeof v === 'string' ? v.trim() : v; });
  const honeypot = data.website;
  if (honeypot && String(honeypot).trim() !== '') {
    console.warn('[enquiry] honeypot filled — treating as bot, not sending.');
    return { ok: true, silent: true };
  }
  const name = (data.name || '').trim();
  const email = (data.email || '').trim();
  const phoneRaw = (data.phone || '').trim();
  const sector = (data.sector || '').trim();
  const message = (data.message || '').trim();
  if (!name || !email || !phoneRaw) {
    return { ok: false, error: 'Please fill in your name, email, and mobile number.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  const phoneDigits = phoneRaw.replace(/\D/g, '');
  if (phoneDigits.length < 9) {
    return { ok: false, error: 'Please enter a valid mobile number (at least 9 digits).' };
  }
  const now = Date.now();
  if (now - __enquiryLastSentAt < SUBMIT_COOLDOWN_MS) {
    return { ok: false, error: 'Please wait a moment before sending another message.' };
  }
  if (__enquiryCountThisSession >= SUBMIT_MAX_PER_SESSION) {
    return { ok: false, error: 'Too many recent submissions. Please try again later or email us directly.' };
  }

  const payload = {
    name, email,
    phoneRaw,
    phoneE164: normalizePhoneIN(phoneRaw),
    sector, message,
    source,
    pageUrl: location.href,
    token: Math.random().toString(36).slice(2) + now.toString(36),
  };

  if (!ENQUIRY_ENDPOINT) {
    console.info('[enquiry] ENQUIRY_ENDPOINT not configured — skipping remote submit. Payload:', payload);
    __enquiryLastSentAt = now;
    __enquiryCountThisSession += 1;
    return { ok: true, offline: true };
  }

  try {
    const res = await fetch(ENQUIRY_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    let dataOut = null;
    try { dataOut = await res.json(); } catch (_) { /* ignore */ }
    if (!res.ok) {
      return { ok: false, error: dataOut?.error || dataOut?.message || 'Server returned an error. Please try again in a moment.' };
    }
    if (dataOut && dataOut.ok === false) {
      return { ok: false, error: dataOut.error || 'Unable to save your message right now.' };
    }
    __enquiryLastSentAt = now;
    __enquiryCountThisSession += 1;
    return { ok: true };
  } catch (err) {
    console.error('[enquiry] submission error:', err);
    return { ok: false, error: 'We couldn\u2019t send your message right now. Please email enquiry@intercube.in or call +91 98441 00700.' };
  }
};

const setSubmitting = (form, isSubmitting) => {
  const btn = form?.querySelector('button[type="submit"]');
  if (!btn) return;
  if (isSubmitting) {
    btn.dataset.originalLabel = btn.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Sending…';
  } else {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.originalLabel) btn.textContent = btn.dataset.originalLabel;
  }
};

const showFormError = (formEl, msg) => {
  const err = formEl?.querySelector('.form-error, [role="alert"][data-form-error]');
  if (!err) return;
  if (!msg) { err.hidden = true; err.textContent = ''; return; }
  err.textContent = msg;
  err.hidden = false;
  err.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
};

let __enquirySuccessDialog = null;
let __enquirySuccessTimer = null;
const SUCCESS_POPUP_MS = 4200;

const ensureSuccessDialog = () => {
  if (__enquirySuccessDialog && document.body.contains(__enquirySuccessDialog)) return __enquirySuccessDialog;
  const d = document.createElement('dialog');
  d.className = 'enquiry-success-dialog';
  d.setAttribute('aria-labelledby', 'enquirySuccessTitle');
  d.innerHTML = `
    <div class="enquiry-success-dialog__surface">
      <p class="eyebrow enquiry-success-dialog__eyebrow">Received</p>
      <h2 id="enquirySuccessTitle">You have successfully submitted your enquiry.</h2>
      <p>Thank you for reaching out. We will contact you soon.</p>
      <p class="enquiry-success-dialog__footer">Need an immediate response? Call <a href="tel:+919844100700">+91 98441 00700</a>.</p>
    </div>`;
  document.body.appendChild(d);
  d.addEventListener('click', e => { if (e.target === d) try { d.close(); } catch (_) {} });
  __enquirySuccessDialog = d;
  return d;
};

const showEnquirySuccessPopup = () => {
  const d = ensureSuccessDialog();
  try { d.showModal(); } catch (_) { d.setAttribute('open', ''); }
  document.body.style.overflow = '';
  if (__enquirySuccessTimer) clearTimeout(__enquirySuccessTimer);
  __enquirySuccessTimer = setTimeout(() => {
    try { d.close(); } catch (_) { d.removeAttribute('open'); }
    __enquirySuccessTimer = null;
  }, SUCCESS_POPUP_MS);
};

// Contact page form
const contactForm = document.getElementById('contactForm');
const formSuccess = document.getElementById('formSuccess');
if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFormError(contactForm, null);
    if (formSuccess) { formSuccess.classList.remove('is-visible'); }
    setSubmitting(contactForm, true);
    const result = await submitEnquiry(contactForm, { source: 'contact-page' });
    setSubmitting(contactForm, false);
    if (result.ok) {
      contactForm.reset();
      if (formSuccess) formSuccess.classList.remove('is-visible');
      contactForm.classList.remove('is-hidden');
      showEnquirySuccessPopup();
    } else {
      showFormError(contactForm, result.error || 'Something went wrong. Please try again.');
    }
  });
}

// Process timeline interactive activation
const processSteps = document.querySelectorAll('.process-step');
if (processSteps.length > 0) {
  processSteps.forEach(step => {
    step.addEventListener('mouseenter', () => {
      processSteps.forEach(s => s.classList.remove('is-active'));
      step.classList.add('is-active');
    });
  });
}

// Project Showcase Gallery & Lightbox
const projectCards = document.querySelectorAll('.project-card');
const modal = document.getElementById('projectModal');
const modalImg = document.getElementById('modalImg');
const modalSector = document.getElementById('modalSector');
const modalHeading = document.getElementById('modalHeading');
const modalClose = document.getElementById('modalClose');
const modalBackdrop = document.getElementById('modalBackdrop');

document.querySelectorAll('.project-card__thumb').forEach(thumb => {
  thumb.addEventListener('click', e => {
    e.stopPropagation();
    const targetId = thumb.dataset.target;
    const fullSrc = thumb.dataset.full;
    const mainImg = document.getElementById(targetId);
    if (!mainImg || !fullSrc) return;

    const parentGallery = thumb.closest('.project-card__gallery');
    if (parentGallery) {
      parentGallery.querySelectorAll('.project-card__thumb').forEach(t => t.classList.remove('is-active'));
      thumb.classList.add('is-active');
    }

    mainImg.style.opacity = '0.35';
    setTimeout(() => {
      mainImg.src = fullSrc;
      mainImg.style.opacity = '1';
    }, 140);
  });
});

const openProjectModal = (src, sector, title) => {
  if (!modal || !modalImg) return;
  modalImg.src = src;
  modalImg.alt = title;
  if (modalSector) modalSector.textContent = sector;
  if (modalHeading) modalHeading.textContent = title;
  modal.showModal();
  document.body.style.overflow = 'hidden';
};

const closeProjectModal = () => {
  if (!modal) return;
  modal.close();
  document.body.style.overflow = '';
};

projectCards.forEach(card => {
  const media = card.querySelector('.project-card__media');
  const mainImg = card.querySelector('.project-card__img');
  const sector = card.querySelector('.project-card__sector')?.textContent || '';
  const title = card.querySelector('.project-card__heading')?.textContent || '';

  if (media && mainImg) {
    media.addEventListener('click', () => {
      openProjectModal(mainImg.src, sector, title);
    });
  }
});

if (modalClose) modalClose.addEventListener('click', closeProjectModal);
if (modalBackdrop) modalBackdrop.addEventListener('click', closeProjectModal);
if (modal) {
  modal.addEventListener('click', e => {
    if (e.target === modal) closeProjectModal();
  });
  modal.addEventListener('close', () => {
    document.body.style.overflow = '';
  });
}

document.querySelectorAll('.work-tile').forEach(tile => {
  tile.addEventListener('click', () => {
    openProjectModal(
      tile.dataset.src || tile.querySelector('img')?.src,
      tile.dataset.label || '',
      tile.dataset.title || ''
    );
  });
});

// Ensure hero video autoplays
const heroVideo = document.querySelector('.hero__video');
if (heroVideo) {
  heroVideo.muted = true;
  heroVideo.playsInline = true;
  const playPromise = heroVideo.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      // If blocked by browser policy, try again on first user interaction
      const playOnInteract = () => {
        heroVideo.play();
        window.removeEventListener('click', playOnInteract);
        window.removeEventListener('scroll', playOnInteract);
      };
      window.addEventListener('click', playOnInteract, { once: true });
      window.addEventListener('scroll', playOnInteract, { once: true });
    });
  }
}

// Project enquiry modal — the navigation CTA keeps its contact-page URL as a
// no-JavaScript fallback, while opening the same enquiry fields in place.
const projectModalTriggers = document.querySelectorAll('[data-project-modal]');

if (projectModalTriggers.length) {
  const enquiryModal = document.createElement('dialog');
  enquiryModal.className = 'project-enquiry-modal';
  enquiryModal.setAttribute('aria-labelledby', 'projectEnquiryTitle');
  enquiryModal.innerHTML = `
    <div class="project-enquiry-modal__surface">
      <button type="button" class="project-enquiry-modal__close" aria-label="Close enquiry form">&times;</button>
      <form class="contact-form project-enquiry-modal__form">
        <header class="contact-form__head">
          <p class="eyebrow">Start a conversation</p>
          <h2 id="projectEnquiryTitle">Send us a message</h2>
          <p>Tell us a little about your project and we’ll come back with a clear next step.</p>
        </header>
        <div class="form-row">
          <div class="form-group"><label for="modal-name">Full name</label><input id="modal-name" name="name" type="text" autocomplete="name" placeholder="Your name" required></div>
          <div class="form-group"><label for="modal-email">Email</label><input id="modal-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
        </div>
        <div class="form-group"><label for="modal-phone">Mobile number</label><input id="modal-phone" name="phone" type="tel" autocomplete="tel" placeholder="+91 98441 00700" required></div>
        <div class="form-group"><label for="modal-sector">I’m enquiring about</label><select id="modal-sector" name="sector" required><option value="" selected disabled>Select a project type</option><option>Retail</option><option>Offices</option><option>Hospitality</option><option>Healthcare</option><option>Residential</option><option>Experience Centre</option><option>Other</option></select></div>
        <div class="form-group"><label for="modal-message">Message</label><textarea id="modal-message" name="message" placeholder="Tell us how we can help…"></textarea></div>
        <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0;pointer-events:none">
        <div class="form-submit"><button type="submit" class="btn btn--primary">Send message</button></div>
        <div class="form-error" role="alert" data-form-error hidden></div>
        <p class="form-note">Prefer email? <a href="mailto:enquiry@intercube.in">enquiry@intercube.in</a></p>
      </form>
      <div class="project-enquiry-modal__success" hidden role="status">
        <p class="eyebrow">Received</p>
        <h3>Thank you. We’ll be in touch.</h3>
        <p>Your enquiry is noted. For an urgent discussion, call <a href="tel:+919844100700">+91 98441 00700</a>.</p>
      </div>
    </div>`;
  document.body.appendChild(enquiryModal);

  const enquiryForm = enquiryModal.querySelector('form');
  const enquiryClose = enquiryModal.querySelector('.project-enquiry-modal__close');
  const enquirySuccess = enquiryModal.querySelector('.project-enquiry-modal__success');
  let enquiryTrigger = null;

  const resetEnquiryModal = () => {
    enquiryForm.hidden = false;
    enquirySuccess.hidden = true;
    enquiryForm.reset();
    showFormError(enquiryForm, null);
  };

  const closeEnquiryModal = () => {
    if (enquiryModal.open) enquiryModal.close();
  };

  projectModalTriggers.forEach(trigger => {
    trigger.addEventListener('click', event => {
      event.preventDefault();
      enquiryTrigger = trigger;
      resetEnquiryModal();
      enquiryModal.showModal();
      document.body.style.overflow = 'hidden';
      enquiryClose.focus();
    });
  });

  enquiryClose.addEventListener('click', closeEnquiryModal);
  enquiryModal.addEventListener('click', event => {
    if (event.target === enquiryModal) closeEnquiryModal();
  });
  enquiryModal.addEventListener('close', () => {
    document.body.style.overflow = '';
    enquiryTrigger?.focus();
  });
  enquiryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError(enquiryForm, null);
    enquirySuccess.hidden = true;
    setSubmitting(enquiryForm, true);
    const result = await submitEnquiry(enquiryForm, { source: 'project-enquiry-modal' });
    setSubmitting(enquiryForm, false);
    if (result.ok) {
      enquiryForm.reset();
      enquiryForm.hidden = false;
      enquirySuccess.hidden = true;
      showFormError(enquiryForm, null);
      try { enquiryModal.close(); } catch (_) {}
      showEnquirySuccessPopup();
    } else {
      showFormError(enquiryForm, result.error || 'Something went wrong. Please try again.');
    }
  });
}

// Why InterCube cards — mouse-tracking radial shine
const whyCards = document.querySelectorAll('.why-card');
if (whyCards.length) {
  whyCards.forEach(card => {
    card.addEventListener('pointermove', e => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', `${x}%`);
      card.style.setProperty('--my', `${y}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--mx', '50%');
      card.style.setProperty('--my', '50%');
    });
  });
}

// Manufacturing Divisions cards — mouse-tracking radial shine
const divisionCards = document.querySelectorAll('.division');
if (divisionCards.length) {
  divisionCards.forEach(card => {
    card.addEventListener('pointermove', e => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', `${x}%`);
      card.style.setProperty('--my', `${y}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--mx', '50%');
      card.style.setProperty('--my', '50%');
    });
  });
}

// Sectors Immersive cards — mouse-tracking radial shine
const sectorCards = document.querySelectorAll('.sector-card');
if (sectorCards.length) {
  sectorCards.forEach(card => {
    card.addEventListener('pointermove', e => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', `${x}%`);
      card.style.setProperty('--my', `${y}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--mx', '50%');
      card.style.setProperty('--my', '50%');
    });
  });
}
