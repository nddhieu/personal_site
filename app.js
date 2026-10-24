document.addEventListener('DOMContentLoaded', () => {
    // === DOM Elements ===
    const body = document.body;
    const themeToggleBtn = document.getElementById('theme-toggle');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
    const navLinks = document.querySelectorAll('.nav-link');
    const scrollIndicator = document.getElementById('scroll-indicator');
    
    // Project Filter Elements
    const filterButtons = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');
    
    // Contact Form Elements
    const contactForm = document.getElementById('contact-form');
    const successModal = document.getElementById('success-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    
    // Demo Links
    const demoLinks = document.querySelectorAll('.demo-link');

    // === Theme Management (Dark/Light Mode) ===
    // Check saved theme or system preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    
    if (savedTheme === 'light' || (!savedTheme && systemPrefersLight)) {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
    } else {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
    }

    themeToggleBtn.addEventListener('click', () => {
        if (body.classList.contains('dark-theme')) {
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
            localStorage.setItem('theme', 'light');
        } else {
            body.classList.remove('light-theme');
            body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
        }
    });

    // === Mobile Navigation Menu ===
    function toggleMobileMenu() {
        mobileMenuToggle.classList.toggle('active');
        mobileNav.classList.toggle('open');
        // Prevent body scroll when menu is open
        body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : 'auto';
    }

    mobileMenuToggle.addEventListener('click', toggleMobileMenu);

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', () => {
            toggleMobileMenu();
        });
    });

    // === Scroll Actions: Progress Indicator & Active Nav Link ===
    window.addEventListener('scroll', () => {
        // 1. Scroll Indicator
        const winScroll = document.documentElement.scrollTop || body.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        scrollIndicator.style.width = scrolled + '%';

        // 2. Active Nav Link Detection
        let currentSectionId = '';
        const sections = document.querySelectorAll('section');
        const scrollPosition = window.scrollY + 150; // Offset for header height

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                currentSectionId = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSectionId}`) {
                link.classList.add('active');
            }
        });
        
        mobileNavLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSectionId}`) {
                link.classList.add('active');
            }
        });
    });

    // === Project Filter Logic ===
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            
            const filterValue = btn.getAttribute('data-filter');
            
            projectCards.forEach(card => {
                const category = card.getAttribute('data-category');
                
                if (filterValue === 'all' || category === filterValue) {
                    card.classList.remove('fade-out');
                } else {
                    card.classList.add('fade-out');
                }
            });
        });
    });

    // === Contact Form Submission & Success Popup ===
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Extract values
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const subject = document.getElementById('subject').value;
            const message = document.getElementById('message').value;
            
            // Normally, you would send this to a backend API.
            // For this static sample site, we simulate success response.
            console.log('Sending message:', { name, email, subject, message });
            
            // Show Success Modal
            successModal.classList.add('open');
            body.style.overflow = 'hidden'; // Lock scrolling
        });
    }

    // Modal Close Trigger
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            successModal.classList.remove('open');
            body.style.overflow = 'auto'; // Restore scrolling
            
            // Reset contact form fields
            if (contactForm) {
                contactForm.reset();
            }
        });
    }

    // Close Modal on clicking overlay background
    if (successModal) {
        successModal.addEventListener('click', (e) => {
            if (e.target === successModal) {
                successModal.classList.remove('open');
                body.style.overflow = 'auto';
                if (contactForm) {
                    contactForm.reset();
                }
            }
        });
    }

    // === Toast Notification System ===
    const toastContainer = document.getElementById('toast-container');
    
    function showToast(title, message, icon = '✦', durationMs = 6000) {
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <div class="toast-body">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${message}</div>
            </div>
            <button class="toast-close" aria-label="Close">&times;</button>
        `;
        
        const closeBtn = toast.querySelector('.toast-close');
        const removeToast = () => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        };
        
        closeBtn.addEventListener('click', removeToast);
        toastContainer.appendChild(toast);
        
        if (durationMs > 0) {
            setTimeout(removeToast, durationMs);
        }
    }

    // === Placeholder Live Demo Buttons Notification ===
    demoLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href === '#') {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                showToast('Interactive Demo Preview', 'A live interactive environment for this project is being set up and will be deployed soon!', '🛠️', 5000);
            });
        }
    });

    // === Local API Demo ===
    const callApiBtn = document.getElementById('call-api-btn');
    const apiResponse = document.getElementById('api-response');

    if (callApiBtn && apiResponse) {
        callApiBtn.addEventListener('click', async () => {
            apiResponse.textContent = 'Calling API...';
            apiResponse.style.color = 'var(--color-text-muted)';
            
            // Detect if running locally (calls local port directly) 
            // or on Vercel production (uses Vercel /api rewrite proxy)
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const apiEndpoint = isLocal ? 'http://127.0.0.1:8000/api/hello' : '/api/hello';
            
            try {
                const response = await fetch(apiEndpoint, {
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'application/json',
                        // Bypass ngrok free tier browser warning page for API calls
                        'ngrok-skip-browser-warning': 'true'
                    }
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                apiResponse.textContent = JSON.stringify(data);
                apiResponse.style.color = 'var(--color-accent)';
            } catch (error) {
                console.error('Error calling backend:', error);
                apiResponse.textContent = `Error: ${error.message}. Is the backend running?`;
                apiResponse.style.color = 'var(--color-secondary)';
            }
        });
    }
});
