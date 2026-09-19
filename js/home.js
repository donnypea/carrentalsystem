/* =========================
   HOME PAGE SCRIPTS
   (keep your existing js/main.js as well)
========================= */

(() => {
    'use strict';

    const root = document.documentElement;
    root.classList.add('js');

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');


    /* ---------- Navbar: shadow on scroll + mobile menu ---------- */

    const navbar = document.querySelector('.navbar');

    if (navbar) {
        const onScroll = () => navbar.classList.toggle('is-scrolled', window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });

        const toggle = navbar.querySelector('.nav-toggle');
        const links = navbar.querySelector('.nav-links');

        if (toggle && links) {
            const setOpen = (open) => {
                toggle.setAttribute('aria-expanded', String(open));
                toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
                links.classList.toggle('is-open', open);
            };

            toggle.addEventListener('click', () => {
                setOpen(toggle.getAttribute('aria-expanded') !== 'true');
            });

            links.addEventListener('click', (e) => {
                if (e.target.closest('a')) setOpen(false);
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') setOpen(false);
            });
        }
    }


    /* ---------- Hero carousel ---------- */

    const hero = document.querySelector('[data-hero]');

    if (hero) {
        const slides = [...hero.querySelectorAll('.hero-slide')];
        const dots = [...hero.querySelectorAll('.hero-dot')];
        const caption = hero.querySelector('[data-hero-caption]');
        const counter = hero.querySelector('[data-hero-count]');
        const prevBtn = hero.querySelector('[data-hero-prev]');
        const nextBtn = hero.querySelector('[data-hero-next]');
        const toggleBtn = hero.querySelector('[data-hero-toggle]');

        let index = 0;

        const show = (i) => {
            index = (i + slides.length) % slides.length;

            slides.forEach((slide, n) => {
                const active = n === index;
                slide.classList.toggle('is-active', active);
                slide.setAttribute('aria-hidden', String(!active));
            });

            dots.forEach((dot, n) => {
                const active = n === index;
                dot.classList.toggle('is-active', active);
                if (active) {
                    dot.setAttribute('aria-current', 'true');
                } else {
                    dot.removeAttribute('aria-current');
                }
            });

            if (caption) caption.textContent = slides[index].dataset.caption || '';
            if (counter) counter.textContent = `${index + 1} / ${slides.length}`;
        };

        // Autoplay: the progress bar animation in CSS is the timer.
        // When it finishes, move to the next slide. Pausing the animation pauses autoplay.
        hero.addEventListener('animationend', (e) => {
            if (reduceMotion.matches) return;
            if (e.animationName === 'heroFill' && e.target.classList.contains('fill')) {
                show(index + 1);
            }
        });

        prevBtn && prevBtn.addEventListener('click', () => show(index - 1));
        nextBtn && nextBtn.addEventListener('click', () => show(index + 1));
        dots.forEach((dot, n) => dot.addEventListener('click', () => show(n)));

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const paused = hero.classList.toggle('is-paused');
                toggleBtn.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
            });
        }

        // Keyboard arrows while focus is inside the hero
        hero.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') show(index - 1);
            if (e.key === 'ArrowRight') show(index + 1);
        });

        // Swipe on touch screens
        let touchX = 0;
        let touchY = 0;

        hero.addEventListener('touchstart', (e) => {
            touchX = e.changedTouches[0].clientX;
            touchY = e.changedTouches[0].clientY;
        }, { passive: true });

        hero.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].clientX - touchX;
            const dy = e.changedTouches[0].clientY - touchY;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
                show(dx < 0 ? index + 1 : index - 1);
            }
        }, { passive: true });
    }


    /* ---------- Destinations carousel ---------- */

    const rail = document.querySelector('[data-rail]');

    if (rail) {
        const track = rail.querySelector('[data-rail-track]');
        const prev = rail.querySelector('[data-rail-prev]');
        const next = rail.querySelector('[data-rail-next]');

        const step = () => {
            const card = track.querySelector('.dest-card');
            return card ? card.getBoundingClientRect().width + 20 : 300;
        };

        const scrollByCard = (dir) => {
            track.scrollBy({
                left: dir * step(),
                behavior: reduceMotion.matches ? 'auto' : 'smooth'
            });
        };

        const updateButtons = () => {
            const max = track.scrollWidth - track.clientWidth;
            if (prev) prev.disabled = track.scrollLeft <= 4;
            if (next) next.disabled = track.scrollLeft >= max - 4;
        };

        prev && prev.addEventListener('click', () => scrollByCard(-1));
        next && next.addEventListener('click', () => scrollByCard(1));

        track.addEventListener('scroll', updateButtons, { passive: true });
        window.addEventListener('resize', updateButtons);
        updateButtons();

        // Keyboard: arrows scroll when the track is focused
        track.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); scrollByCard(-1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); scrollByCard(1); }
        });

        // Click and drag with a mouse
        let down = false;
        let startX = 0;
        let startLeft = 0;

        track.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'mouse' || e.button !== 0) return;
            down = true;
            startX = e.clientX;
            startLeft = track.scrollLeft;
        });

        window.addEventListener('pointermove', (e) => {
            if (!down) return;
            const dx = e.clientX - startX;
            if (Math.abs(dx) > 4) track.classList.add('is-dragging');
            track.scrollLeft = startLeft - dx;
        });

        window.addEventListener('pointerup', () => {
            if (!down) return;
            down = false;
            track.classList.remove('is-dragging');
        });
    }


    /* ---------- Scroll reveal ---------- */

    const revealItems = document.querySelectorAll('.reveal');

    if ('IntersectionObserver' in window && !reduceMotion.matches) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                const el = entry.target;
                el.classList.add('is-visible');
                observer.unobserve(el);

                // Once revealed, hand control back to the element's normal hover transitions
                el.addEventListener('transitionend', function done(e) {
                    if (e.target !== el || e.propertyName !== 'opacity') return;
                    el.classList.remove('reveal', 'is-visible');
                    el.removeEventListener('transitionend', done);
                });
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        revealItems.forEach((el) => observer.observe(el));
    } else {
        revealItems.forEach((el) => el.classList.add('is-visible'));
    }

})();