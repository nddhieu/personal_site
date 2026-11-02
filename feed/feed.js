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

    // === Minimal, safe markdown (feed bodies use a small subset) ===
    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
    }
    function inlineMd(s) {
        // s is already HTML-escaped; URLs come from the feed data itself.
        return s
            .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
                     '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    function renderMd(md) {
        const blocks = escapeHtml(md || '').split(/\n\s*\n/);
        return blocks.map(block => {
            const lines = block.split('\n');
            if (lines.every(l => /^\s*[-*] /.test(l))) {
                return '<ul>' + lines.map(l =>
                    '<li>' + inlineMd(l.replace(/^\s*[-*] /, '')) + '</li>').join('') + '</ul>';
            }
            const h = block.match(/^(#{1,4})\s+(.*)$/);
            if (h) {
                const level = Math.min(h[1].length + 1, 4);
                return '<h' + level + '>' + inlineMd(h[2]) + '</h' + level + '>';
            }
            if (/^&gt; /.test(block)) {
                return '<blockquote>' + inlineMd(block.replace(/^&gt; /gm, '')) + '</blockquote>';
            }
            return '<p>' + inlineMd(lines.join(' ')) + '</p>';
        }).join('');
    }

    // === Render the feed ===
    const daysEl = document.getElementById('feed-days');
    const filtersEl = document.getElementById('feed-filters');
    const updatedEl = document.getElementById('feed-updated');

    function cardHtml(post) {
        const img = post.image
            ? '<img class="feed-card-img" src="' + escapeHtml(post.image) + '" alt="" loading="lazy" onerror="this.remove()">'
            : '';
        const stats = (post.stats && post.stats.length)
            ? '<div class="feed-stats">' + post.stats.map(s =>
                '<span class="feed-stat">' + escapeHtml(s.label) + ': <strong>' +
                escapeHtml(s.value) + '</strong></span>').join('') + '</div>'
            : '';
        const why = post.why
            ? '<p class="feed-why">Why this post: ' + escapeHtml(post.why) + '</p>'
            : '';
        return '<article class="feed-card" data-category="' + escapeHtml(post.category) + '">'
            + img
            + '<div class="feed-card-body">'
            + '<div class="feed-card-meta"><span class="feed-kicker">' + escapeHtml(post.kicker)
            + '</span><span class="feed-category">' + escapeHtml(post.category) + '</span></div>'
            + '<h3 class="feed-card-title">' + escapeHtml(post.title) + '</h3>'
            + '<div class="feed-card-text">' + renderMd(post.body) + '</div>'
            + stats + why
            + '</div></article>';
    }

    function applyFilter(category) {
        document.querySelectorAll('.feed-filter-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.filter === category));
        document.querySelectorAll('.feed-day').forEach(day => {
            let visible = 0;
            day.querySelectorAll('.feed-card').forEach(card => {
                const show = category === 'all' || card.dataset.category === category;
                card.style.display = show ? '' : 'none';
                if (show) visible++;
            });
            day.style.display = visible ? '' : 'none';
        });
    }

    fetch('feed-data.json')
        .then(r => { if (!r.ok) throw new Error('feed-data.json ' + r.status); return r.json(); })
        .then(data => {
            if (updatedEl && data.generated_at) updatedEl.textContent = data.generated_at;
            const categories = ['all'];
            data.days.forEach(d => d.posts.forEach(p => {
                if (!categories.includes(p.category)) categories.push(p.category);
            }));
            filtersEl.innerHTML = categories.map(c =>
                '<button class="feed-filter-btn' + (c === 'all' ? ' active' : '') +
                '" data-filter="' + escapeHtml(c) + '">' +
                (c === 'all' ? 'All' : escapeHtml(c)) + '</button>').join('');
            filtersEl.querySelectorAll('.feed-filter-btn').forEach(b =>
                b.addEventListener('click', () => applyFilter(b.dataset.filter)));

            daysEl.innerHTML = data.days.map(day =>
                '<section class="feed-day"><div class="feed-day-header">' +
                '<h2 class="feed-day-title">' + escapeHtml(day.label) + '</h2>' +
                '<div class="feed-day-line"></div></div>' +
                '<div class="feed-grid">' + day.posts.map(cardHtml).join('') + '</div></section>'
            ).join('');
        })
        .catch(err => {
            daysEl.innerHTML = '<p class="feed-loading">The feed could not be loaded (' +
                escapeHtml(String(err.message || err)) + '). Please try again later.</p>';
        });
});
