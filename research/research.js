document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;

    // === Theme (same storage key + classes as the home page's app.js) ===
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    if (savedTheme === 'light' || (!savedTheme && systemPrefersLight)) {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
    } else {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
    }
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const toLight = body.classList.contains('dark-theme');
            body.classList.toggle('dark-theme', !toLight);
            body.classList.toggle('light-theme', toLight);
            localStorage.setItem('theme', toLight ? 'light' : 'dark');
        });
    }

    // === Mobile menu ===
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    if (mobileMenuToggle && mobileNav) {
        const toggle = () => {
            mobileMenuToggle.classList.toggle('active');
            mobileNav.classList.toggle('open');
            body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : 'auto';
        };
        mobileMenuToggle.addEventListener('click', toggle);
        mobileNav.querySelectorAll('.mobile-nav-link').forEach(l => l.addEventListener('click', toggle));
    }

    // === Scroll progress ===
    const scrollIndicator = document.getElementById('scroll-indicator');
    if (scrollIndicator) {
        window.addEventListener('scroll', () => {
            const st = document.documentElement.scrollTop || body.scrollTop;
            const h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            scrollIndicator.style.width = (h > 0 ? (st / h) * 100 : 0) + '%';
        });
    }

    // === Safe rendering helpers (all research data is escaped first) ===
    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeUrl(value) {
        if (!value) return '';
        try {
            const url = new URL(String(value));
            return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
        } catch (err) {
            return '';
        }
    }

    function formatDate(value) {
        const parts = String(value || '').split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value || '');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[parts[1] - 1] + ' ' + parts[2] + ', ' + parts[0];
    }

    function paragraphs(value) {
        return '<p>' + escapeHtml(value).replace(/\n+/g, '<br>') + '</p>';
    }

    // === Render the library and article detail ===
    const gridEl = document.getElementById('research-grid');
    const filtersEl = document.getElementById('research-filters');
    const updatedEl = document.getElementById('research-updated');
    const detailEl = document.getElementById('article-detail');
    const detailContentEl = document.getElementById('detail-content');
    const detailBackBtn = document.getElementById('detail-back');
    let articles = [];
    let lastFocusedCard = null;

    function cardHtml(article) {
        const image = article.image
            ? '<img class="research-card-img" src="' + escapeHtml(article.image) +
              '" alt="' + escapeHtml(article.title) + '" loading="lazy" onerror="this.remove()">'
            : '';
        return '<button class="research-card" type="button" data-slug="' +
            escapeHtml(article.slug) + '" data-category="' + escapeHtml(article.category) +
            '" aria-label="Read: ' + escapeHtml(article.title) + '">'
            + image
            + '<span class="research-card-body">'
            + '<span class="research-card-meta"><span class="research-kicker">' +
            escapeHtml(article.kicker) + '</span><span class="research-category">' +
            escapeHtml(article.category) + '</span></span>'
            + '<span class="research-card-title">' + escapeHtml(article.title) + '</span>'
            + '<span class="research-card-summary">' + escapeHtml(article.summary) + '</span>'
            + '<span class="research-card-footer"><time datetime="' + escapeHtml(article.date) +
            '">' + escapeHtml(formatDate(article.date)) + '</time>' +
            '<span class="research-read-link">Read explainer →</span></span>'
            + '</span></button>';
    }

    function applyFilter(category) {
        document.querySelectorAll('.research-filter-btn').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.filter === category));
        document.querySelectorAll('.research-card').forEach(card => {
            const show = category === 'all' || card.dataset.category === category;
            card.style.display = show ? '' : 'none';
        });
    }

    function sourceHtml(article) {
        const sourceName = escapeHtml(article.source_name || 'Source');
        const sourceUrl = safeUrl(article.source_url);
        if (!sourceUrl) {
            return '<p class="detail-source">Source: ' + sourceName + '</p>';
        }
        return '<p class="detail-source">Source: <a href="' + escapeHtml(sourceUrl) +
            '" target="_blank" rel="noopener noreferrer">' + sourceName + '</a></p>';
    }

    function detailHtml(article) {
        const image = article.image
            ? '<img class="detail-hero-img" src="' + escapeHtml(article.image) +
              '" alt="' + escapeHtml(article.title) + '" onerror="this.remove()">'
            : '';
        const sections = [
            ['Problem', article.problem],
            ['Solution', article.solution],
            ['Benefit', article.benefit],
            ['How to apply', article.apply]
        ];
        return image
            + '<div class="detail-meta"><span class="research-kicker">' +
            escapeHtml(article.kicker) + '</span><span class="research-category">' +
            escapeHtml(article.category) + '</span><time datetime="' + escapeHtml(article.date) +
            '">' + escapeHtml(formatDate(article.date)) + '</time></div>'
            + '<h1 id="detail-title" class="detail-title">' + escapeHtml(article.title) + '</h1>'
            + '<p class="detail-summary">' + escapeHtml(article.summary) + '</p>'
            + '<div class="detail-sections">' + sections.map(section =>
                '<section class="detail-section"><h2>' + escapeHtml(section[0]) + '</h2>' +
                paragraphs(section[1]) + '</section>').join('') + '</div>'
            + sourceHtml(article);
    }

    function openDetail(slug, card) {
        const article = articles.find(item => item.slug === slug);
        if (!article || !detailEl || !detailContentEl) return;
        lastFocusedCard = card || null;
        detailContentEl.innerHTML = detailHtml(article);
        detailEl.hidden = false;
        body.classList.add('detail-open');
        const panel = detailEl.querySelector('.article-detail-panel');
        if (panel) panel.scrollTop = 0;
        if (detailBackBtn) detailBackBtn.focus();
    }

    function closeDetail() {
        if (!detailEl) return;
        detailEl.hidden = true;
        body.classList.remove('detail-open');
        if (lastFocusedCard) lastFocusedCard.focus();
    }

    if (detailBackBtn) detailBackBtn.addEventListener('click', closeDetail);
    if (detailEl) {
        detailEl.querySelectorAll('[data-close-detail]').forEach(el =>
            el.addEventListener('click', closeDetail));
    }
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && detailEl && !detailEl.hidden) closeDetail();
    });

    fetch('research-data.json')
        .then(r => { if (!r.ok) throw new Error('research-data.json ' + r.status); return r.json(); })
        .then(data => {
            if (updatedEl && data.generated_at) updatedEl.textContent = data.generated_at;
            articles = Array.isArray(data.articles) ? data.articles : [];

            const preferredCategories = ['Tools', 'Models', 'Opportunities'];
            const presentCategories = preferredCategories.filter(category =>
                articles.some(article => article.category === category));
            articles.forEach(article => {
                if (!presentCategories.includes(article.category)) {
                    presentCategories.push(article.category);
                }
            });
            const filters = presentCategories.concat('all');
            filtersEl.innerHTML = filters.map(category =>
                '<button class="research-filter-btn' + (category === 'all' ? ' active' : '') +
                '" type="button" data-filter="' + escapeHtml(category) + '">' +
                (category === 'all' ? 'All' : escapeHtml(category)) + '</button>').join('');
            filtersEl.querySelectorAll('.research-filter-btn').forEach(btn =>
                btn.addEventListener('click', () => applyFilter(btn.dataset.filter)));

            gridEl.innerHTML = articles.map(cardHtml).join('');
            gridEl.querySelectorAll('.research-card').forEach(card =>
                card.addEventListener('click', () => openDetail(card.dataset.slug, card)));
        })
        .catch(err => {
            gridEl.innerHTML = '<p class="research-loading">The research library could not be loaded (' +
                escapeHtml(String(err.message || err)) + '). Please try again later.</p>';
        });
});
