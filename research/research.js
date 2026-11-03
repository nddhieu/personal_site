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

    // === Read time: ~200 words per minute over the article's text ===
    function readTimeMinutes(article) {
        let text = [article.summary, article.problem, article.solution,
                    article.benefit, article.apply, article.caveats].join(' ');
        (Array.isArray(article.details) ? article.details : []).forEach(detail => {
            text += ' ' + (detail.body || '');
        });
        (Array.isArray(article.takeaways) ? article.takeaways : []).forEach(takeaway => {
            text += ' ' + takeaway;
        });
        const words = text.split(/\s+/).filter(Boolean).length;
        return Math.max(1, Math.ceil(words / 200));
    }

    // === Render the library and article detail ===
    const gridEl = document.getElementById('research-grid');
    const featuredEl = document.getElementById('research-featured');
    const filtersEl = document.getElementById('research-filters');
    const updatedEl = document.getElementById('research-updated');
    const detailEl = document.getElementById('article-detail');
    const detailContentEl = document.getElementById('detail-content');
    const detailBackBtn = document.getElementById('detail-back');
    let articles = [];
    let lastFocusedCard = null;

    function statsHtml(article, className) {
        const stats = Array.isArray(article.stats) ? article.stats.slice(0, 4) : [];
        if (!stats.length) return '';
        return '<div class="' + className + '">' + stats.map(stat =>
            '<div class="stat"><span class="stat-value">' + escapeHtml(stat.value) +
            '</span><span class="stat-label">' + escapeHtml(stat.label) + '</span></div>'
        ).join('') + '</div>';
    }

    function cardHtml(article, featured) {
        const image = article.image
            ? '<img class="' + (featured ? 'research-featured-img' : 'research-card-img') +
              '" src="' + escapeHtml(article.image) +
              '" alt="' + escapeHtml(article.title) + '" loading="lazy" onerror="this.remove()">'
            : '';
        const firstStat = Array.isArray(article.stats) && article.stats.length
            ? '<span class="research-card-stat"><strong>' + escapeHtml(article.stats[0].value) +
              '</strong> ' + escapeHtml(article.stats[0].label) + '</span>'
            : '';
        const cardClass = featured ? 'research-card research-featured-card' : 'research-card';
        const bodyClass = featured ? 'research-card-body research-featured-body' : 'research-card-body';
        return '<button class="' + cardClass + '" type="button" data-slug="' +
            escapeHtml(article.slug) + '" data-category="' + escapeHtml(article.category) +
            '" aria-label="Read: ' + escapeHtml(article.title) + '">'
            + image
            + '<span class="' + bodyClass + '">'
            + '<span class="research-card-meta"><span class="research-kicker">' +
            escapeHtml(article.kicker) + '</span><span class="research-category">' +
            escapeHtml(article.category) + '</span></span>'
            + '<span class="research-card-title">' + escapeHtml(article.title) + '</span>'
            + (article.hook
                ? '<span class="research-card-hook">' + escapeHtml(article.hook) + '</span>'
                : '<span class="research-card-summary">' + escapeHtml(article.summary) + '</span>')
            + firstStat
            + '<span class="research-card-footer"><span><time datetime="' + escapeHtml(article.date) +
            '">' + escapeHtml(formatDate(article.date)) + '</time> · ' +
            readTimeMinutes(article) + ' min read</span>' +
            '<span class="research-read-link">Read explainer →</span></span>'
            + '</span></button>';
    }

    // Featured behaviour (see DESIGN-NOTES.md): the featured card is shown
    // only under the "All" filter. Under a category filter it hides, and the
    // grid shows that category's cards — including the featured article when
    // it matches the category — so nothing is ever hidden from a filter.
    let featuredSlug = '';
    function applyFilter(category) {
        document.querySelectorAll('.research-filter-btn').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.filter === category));
        if (featuredEl) featuredEl.style.display = category === 'all' ? '' : 'none';
        // Only the grid's cards are filtered here; the featured card lives
        // in featuredEl and is governed by the display rule above.
        if (gridEl) gridEl.querySelectorAll('.research-card').forEach(card => {
            const isFeatured = card.dataset.slug === featuredSlug;
            const show = category === 'all' ? !isFeatured : card.dataset.category === category;
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
        // Benefit is NOT repeated in the numbered sections below: it already
        // leads the article as the benefit callout, so the sections run
        // Problem → Solution → How to apply.
        const sections = [
            ['Problem', article.problem],
            ['Solution', article.solution],
            ['How to apply', article.apply]
        ];
        const extras = Array.isArray(article.details) ? article.details : [];
        const numberedSections = sections.map((section, index) =>
            '<section class="detail-section"><h2><span class="detail-section-num">' +
            String(index + 1).padStart(2, '0') + '</span> ' + escapeHtml(section[0]) + '</h2>' +
            paragraphs(section[1]) + '</section>').join('');
        const extraSections = extras.map((detail, index) =>
            '<section class="detail-section detail-extra"><h2><span class="detail-section-num">' +
            String(sections.length + index + 1).padStart(2, '0') + '</span> ' +
            escapeHtml(detail.heading) + '</h2>' + paragraphs(detail.body) + '</section>'
        ).join('');
        const benefitCallout = article.benefit
            ? '<section class="detail-benefit-callout"><span class="detail-callout-eyebrow">' +
              'Why it matters · What you get</span>' + paragraphs(article.benefit) + '</section>'
            : '';
        const takeaways = Array.isArray(article.takeaways) && article.takeaways.length
            ? '<section class="detail-takeaways"><h2>Key takeaways</h2><ul>' +
              article.takeaways.slice(0, 3).map(takeaway =>
                '<li>' + escapeHtml(takeaway) + '</li>').join('') + '</ul></section>'
            : '';
        const caveats = article.caveats
            ? '<section class="detail-caveats"><h2>What we could not verify — open questions</h2>' +
              paragraphs(article.caveats) + '</section>'
            : '';
        return '<div class="detail-meta"><span class="research-kicker">' +
            escapeHtml(article.kicker) + '</span><span class="research-category">' +
            escapeHtml(article.category) + '</span><time datetime="' + escapeHtml(article.date) +
            '">' + escapeHtml(formatDate(article.date)) + '</time><span>' +
            readTimeMinutes(article) + ' min read</span></div>'
            + '<h1 id="detail-title" class="detail-title">' + escapeHtml(article.title) + '</h1>'
            + image
            + '<p class="detail-summary">' + escapeHtml(article.summary) + '</p>'
            + benefitCallout
            + takeaways
            + statsHtml(article, 'detail-stats')
            + '<div class="detail-sections">' + numberedSections + extraSections + '</div>'
            + caveats
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

            // Featured story: the newest article gets a larger lead card.
            // The grid still contains every article; applyFilter hides the
            // featured article's grid card under "All" so it is not duplicated.
            featuredSlug = articles.length ? articles[0].slug : '';
            if (featuredEl && articles.length) {
                featuredEl.innerHTML = '<span class="research-featured-label">Featured · Latest research</span>' +
                    cardHtml(articles[0], true);
                featuredEl.querySelectorAll('.research-card').forEach(card =>
                    card.addEventListener('click', () => openDetail(card.dataset.slug, card)));
            }
            gridEl.innerHTML = articles.map(article => cardHtml(article, false)).join('');
            gridEl.querySelectorAll('.research-card').forEach(card =>
                card.addEventListener('click', () => openDetail(card.dataset.slug, card)));
            applyFilter('all');
        })
        .catch(err => {
            gridEl.innerHTML = '<p class="research-loading">The research library could not be loaded (' +
                escapeHtml(String(err.message || err)) + '). Please try again later.</p>';
        });
});
