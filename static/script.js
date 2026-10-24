/* =============================================
   CritixAI – Frontend Controller
   ============================================= */
(function () {
    'use strict';

    /* ---------- DOM Cache ---------- */
    const $ = (id) => document.getElementById(id);

    const el = {
        // Sections
        home:                 $('home'),
        modes:                $('modes'),
        criticWorkspace:      $('criticWorkspace'),
        competitionWorkspace: $('competitionWorkspace'),
        resultsSection:       $('resultsSection'),
        comparisonResults:    $('comparisonResultsSection'),
        features:             $('features'),
        howItWorks:           $('how-it-works'),
        history:              $('history'),

        // Navigation
        navBrandHome:         $('navBrandHome'),
        mobileMenuBtn:        $('mobileMenuBtn'),
        mobileMenu:           $('mobileMenu'),
        themeToggle:          $('themeToggle'),

        // Critic form
        criticForm:           $('criticForm'),
        urlInput:             $('urlInput'),
        analyzeBtn:           $('analyzeBtn'),
        searchError:          $('searchError'),

        // Competition form
        comparisonForm:       $('comparisonForm'),
        comparisonUrlA:       $('comparisonUrlA'),
        comparisonUrlB:       $('comparisonUrlB'),
        comparisonFormError:  $('comparisonFormError'),
        compareBtn:           $('compareBtn'),

        // Loading
        loadingOverlay:       $('loadingOverlay'),
        loadingTitle:         $('loadingTitle'),
        loadingSubtext:       $('loadingSubtext'),
        progressBar:          $('progressBar'),

        // Critic results
        websiteFavicon:       $('websiteFavicon'),
        websiteName:          $('websiteName'),
        websiteUrl:           $('websiteUrl'),
        websiteDescription:   $('websiteDescription'),
        websiteTags:          $('websiteTags'),
        scoreValue:           $('scoreValue'),
        scoreFill:            $('scoreFill'),
        safetyBar:            $('safetyBar'),
        trustBar:             $('trustBar'),
        speedBar:             $('speedBar'),
        popularityBar:        $('popularityBar'),
        safetyScore:          $('safetyScore'),
        trustScore:           $('trustScore'),
        speedScore:           $('speedScore'),
        popularityScore:      $('popularityScore'),
        prosList:             $('prosList'),
        consList:             $('consList'),
        detailsGrid:          $('detailsGrid'),
        securityItems:        $('securityItems'),
        summaryText:          $('summaryText'),
        verdict:              $('verdict'),
        verdictIcon:          $('verdictIcon'),
        verdictText:          $('verdictText'),
        backBtn:              $('backBtn'),
        copyResultsBtn:       $('copyResultsBtn'),

        // Comparison results
        backFromComparison:   $('backFromComparisonResults'),
        compWinnerHeading:    $('comparisonWinnerHeading'),
        compWinnerSummary:    $('comparisonWinnerSummary'),
        compFaviconA:         $('comparisonFaviconA'),
        compNameA:            $('comparisonNameA'),
        compLinkA:            $('comparisonLinkA'),
        compScoreA:           $('comparisonScoreA'),
        compFaviconB:         $('comparisonFaviconB'),
        compNameB:            $('comparisonNameB'),
        compLinkB:            $('comparisonLinkB'),
        compScoreB:           $('comparisonScoreB'),
        compCategoryList:     $('comparisonCategoryList'),
        compStrengthsA:       $('comparisonStrengthsA'),
        compStrengthsB:       $('comparisonStrengthsB'),
        compWeaknessesA:      $('comparisonWeaknessesA'),
        compWeaknessesB:      $('comparisonWeaknessesB'),
        compAiInsights:       $('comparisonAiInsights'),
        compStrengthsTitleA:  $('comparisonStrengthsTitleA'),
        compStrengthsTitleB:  $('comparisonStrengthsTitleB'),
        compWeaknessesTitleA: $('comparisonWeaknessesTitleA'),
        compWeaknessesTitleB: $('comparisonWeaknessesTitleB'),

        // History
        historyContainer:     $('historyContainer'),
        emptyHistory:         $('emptyHistory'),
        clearHistoryBtn:      $('clearHistoryBtn'),

        // Toast & particles
        toastContainer:       $('toastContainer'),
        particles:            $('particles'),
    };

    /* ---------- State ---------- */
    let isLoading = false;
    let lastCriticUrl = '';
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem('critixai_history') || '[]');
    } catch {
        history = [];
    }

    /* ========================================
       VIEW SWITCHING  (core bug fix)
       ========================================
       Home-page sections toggle via `hidden`.
       Results sections toggle via CSS
       `display:none` + `.active` class so the
       fadeIn animation triggers correctly.
    ======================================== */

    const homeSections = [
        el.home, el.modes, el.features,
        el.howItWorks, el.history,
    ];

    const workspaceSections = [
        el.criticWorkspace, el.competitionWorkspace,
    ];

    const resultsSections = [
        el.resultsSection, el.comparisonResults,
    ];

    function hideAll() {
        homeSections.forEach(s => { if (s) s.hidden = true; });
        workspaceSections.forEach(s => { if (s) s.hidden = true; });
        resultsSections.forEach(s => {
            if (s) {
                s.classList.remove('active');
                s.hidden = true;
            }
        });
    }

    function showHomeSections() {
        homeSections.forEach(s => { if (s) s.hidden = false; });
    }

    function showSection(view) {
        hideAll();
        closeMobileMenu();

        switch (view) {
            case 'home':
                showHomeSections();
                break;

            case 'critic':
                if (el.criticWorkspace) el.criticWorkspace.hidden = false;
                break;

            case 'competition':
                if (el.competitionWorkspace) el.competitionWorkspace.hidden = false;
                break;

            case 'results':
                if (el.resultsSection) {
                    el.resultsSection.hidden = false;
                    // Force reflow so the CSS animation fires
                    void el.resultsSection.offsetHeight;
                    el.resultsSection.classList.add('active');
                }
                break;

            case 'comparisonResults':
                if (el.comparisonResults) {
                    el.comparisonResults.hidden = false;
                    void el.comparisonResults.offsetHeight;
                    el.comparisonResults.classList.add('active');
                }
                break;
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ---------- Helpers ---------- */

    function isValidURL(str) {
        try {
            const u = new URL(str);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
    }

    function normaliseURL(raw) {
        let u = raw.trim();
        if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
        return u;
    }

    function getHostname(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); }
        catch { return ''; }
    }

    function faviconURL(url) {
        const h = getHostname(url);
        return h
            ? 'https://www.google.com/s2/favicons?domain=' + h + '&sz=64'
            : '';
    }

    function scoreColor(n) {
        if (n >= 80) return 'var(--success)';
        if (n >= 55) return 'var(--warning)';
        return 'var(--danger)';
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    /* ---------- Toast ---------- */

    function toast(msg, type) {
        type = type || 'info';
        if (!el.toastContainer) return;
        var icons = { success: '✅', error: '❌', info: 'ℹ️' };
        var t = document.createElement('div');
        t.className = 'toast ' + type;
        t.innerHTML =
            '<span class="toast-icon">' + (icons[type] || icons.info) + '</span>' +
            '<span class="toast-message">' + escapeHTML(msg) + '</span>';
        el.toastContainer.appendChild(t);
        setTimeout(function () { t.remove(); }, 3200);
    }

    /* ---------- Loading ---------- */

    function showLoading(title, sub) {
        if (!el.loadingOverlay) return;
        el.loadingTitle.textContent = title;
        el.loadingSubtext.textContent = sub;
        el.progressBar.style.width = '35%';
        el.loadingOverlay.classList.add('active');
    }

    function hideLoading() {
        if (!el.loadingOverlay) return;
        el.progressBar.style.width = '100%';
        setTimeout(function () {
            el.loadingOverlay.classList.remove('active');
            el.progressBar.style.width = '0%';
        }, 350);
    }

    function setLoadingBtn(btn, loading) {
        if (!btn) return;
        if (loading) {
            btn.classList.add('loading');
            btn.disabled = true;
        } else {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }

    /* ---------- Particles ---------- */

    function initParticles() {
        if (!el.particles) return;
        var count = window.innerWidth < 768 ? 10 : 20;
        for (var i = 0; i < count; i++) {
            var p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (8 + Math.random() * 12) + 's';
            p.style.animationDelay = (Math.random() * 8) + 's';
            el.particles.appendChild(p);
        }
    }

    /* ---------- Theme ---------- */

    function initTheme() {
        var saved = localStorage.getItem('critixai_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        updateThemeIcon(saved);
    }

    function toggleTheme() {
        var cur = document.documentElement.getAttribute('data-theme');
        var next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('critixai_theme', next);
        updateThemeIcon(next);
    }

    function updateThemeIcon(theme) {
        if (!el.themeToggle) return;
        var icon = el.themeToggle.querySelector('.theme-icon');
        if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }

    /* ---------- Mobile Menu ---------- */

    function toggleMobileMenu() {
        if (!el.mobileMenuBtn || !el.mobileMenu) return;
        var open = el.mobileMenu.classList.toggle('active');
        el.mobileMenuBtn.classList.toggle('active', open);
        el.mobileMenuBtn.setAttribute('aria-expanded', String(open));
    }

    function closeMobileMenu() {
        if (!el.mobileMenuBtn || !el.mobileMenu) return;
        el.mobileMenu.classList.remove('active');
        el.mobileMenuBtn.classList.remove('active');
        el.mobileMenuBtn.setAttribute('aria-expanded', 'false');
    }

    /* ---------- Score Animations ---------- */

    function animateNumber(element, target, duration) {
        if (!element) return;
        duration = duration || 900;
        var start = performance.now();
        function tick(now) {
            var elapsed = now - start;
            var progress = Math.min(elapsed / duration, 1);
            var eased = 1 - (1 - progress) * (1 - progress);
            element.textContent = Math.round(target * eased);
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    function animateBar(barEl, numEl, score) {
        if (!barEl) return;
        var color = scoreColor(score);
        setTimeout(function () {
            barEl.style.width = score + '%';
            barEl.style.background = color;
        }, 200);
        animateNumber(numEl, score);
    }

    /* ========================================
       API CALLS
       ======================================== */

    async function apiPost(endpoint, body) {
        var res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        var json;
        try {
            json = await res.json();
        } catch (e) {
            throw new Error('Server returned an invalid response.');
        }

        if (!res.ok || !json.success) {
            throw new Error(json.error || 'Request failed (' + res.status + ').');
        }

        return json.data;
    }

    /* ========================================
       CRITIC SUBMIT
       ======================================== */

    async function handleCriticSubmit(e) {
        if (e) e.preventDefault();
        if (isLoading) return;

        var url = normaliseURL(el.urlInput ? el.urlInput.value : '');
        if (!isValidURL(url)) {
            if (el.searchError) el.searchError.textContent = 'Please enter a valid URL.';
            return;
        }
        if (el.searchError) el.searchError.textContent = '';

        isLoading = true;
        setLoadingBtn(el.analyzeBtn, true);
        showLoading('Analyzing Website…', 'Fetching page data and running AI analysis…');

        try {
            var data = await apiPost('/api/analyze', { url: url });
            hideLoading();
            lastCriticUrl = url;
            renderCriticResults(url, data);
            showSection('results');
            addToHistory(url, data.name, data.overallScore);
            toast('Analysis complete!', 'success');
        } catch (err) {
            hideLoading();
            if (el.searchError) el.searchError.textContent = err.message;
            toast(err.message, 'error');
        } finally {
            isLoading = false;
            setLoadingBtn(el.analyzeBtn, false);
        }
    }

    /* ========================================
       COMPETITION SUBMIT
       ======================================== */

    async function handleCompetitionSubmit(e) {
        if (e) e.preventDefault();
        if (isLoading) return;

        var urlA = normaliseURL(el.comparisonUrlA ? el.comparisonUrlA.value : '');
        var urlB = normaliseURL(el.comparisonUrlB ? el.comparisonUrlB.value : '');

        if (!isValidURL(urlA) || !isValidURL(urlB)) {
            if (el.comparisonFormError)
                el.comparisonFormError.textContent = 'Please provide two valid URLs.';
            return;
        }
        if (el.comparisonFormError) el.comparisonFormError.textContent = '';

        isLoading = true;
        setLoadingBtn(el.compareBtn, true);
        showLoading('Competition Mode…', 'Analyzing both websites side-by-side…');

        try {
            var data = await apiPost('/api/compare', { urlA: urlA, urlB: urlB });
            hideLoading();
            renderComparisonResults(data);
            showSection('comparisonResults');
            toast('Comparison ready!', 'success');
        } catch (err) {
            hideLoading();
            if (el.comparisonFormError)
                el.comparisonFormError.textContent = err.message;
            toast(err.message, 'error');
        } finally {
            isLoading = false;
            setLoadingBtn(el.compareBtn, false);
        }
    }

    /* ========================================
       RENDER – CRITIC RESULTS
       ======================================== */

    function renderCriticResults(url, d) {
        // Overview
        if (el.websiteFavicon)     el.websiteFavicon.src = faviconURL(url);
        if (el.websiteName)        el.websiteName.textContent = d.name || getHostname(url);
        if (el.websiteUrl) {
            el.websiteUrl.textContent = url;
            el.websiteUrl.href = url;
        }
        if (el.websiteDescription) el.websiteDescription.textContent = d.description || '';

        // Tags
        if (el.websiteTags) {
            var tags = d.tags || [];
            el.websiteTags.innerHTML = tags
                .map(function (t) { return '<span class="tag">' + escapeHTML(t) + '</span>'; })
                .join('');
        }

        // Overall score circle
        var overall = d.overallScore || 0;
        animateNumber(el.scoreValue, overall);
        if (el.scoreFill) {
            var offset = 283 - (overall / 100) * 283;
            el.scoreFill.style.strokeDashoffset = '283';
            setTimeout(function () {
                el.scoreFill.style.strokeDashoffset = String(offset);
            }, 250);
        }

        // Category bars
        var scores = d.scores || {};
        animateBar(el.safetyBar,     el.safetyScore,     scores.safety     || 0);
        animateBar(el.trustBar,      el.trustScore,      scores.trust      || 0);
        animateBar(el.speedBar,      el.speedScore,      scores.speed      || 0);
        animateBar(el.popularityBar,  el.popularityScore,  scores.popularity || 0);

        // Pros
        if (el.prosList) {
            var pros = d.pros || [];
            el.prosList.innerHTML = pros
                .map(function (p) { return '<li>' + escapeHTML(p) + '</li>'; })
                .join('');
        }

        // Cons
        if (el.consList) {
            var cons = d.cons || [];
            el.consList.innerHTML = cons
                .map(function (c) { return '<li>' + escapeHTML(c) + '</li>'; })
                .join('');
        }

        // Details grid
        if (el.detailsGrid) {
            var details = d.details || {};
            var html = '';
            var keys = Object.keys(details);
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                var v = details[k];
                html +=
                    '<div class="detail-item">' +
                    '<span class="detail-label">' + escapeHTML(k) + '</span>' +
                    '<span class="detail-value">' + escapeHTML(String(v)) + '</span>' +
                    '</div>';
            }
            el.detailsGrid.innerHTML = html;
        }

        // Security items
        if (el.securityItems) {
            var sec = d.security || [];
            el.securityItems.innerHTML = sec
                .map(function (item) {
                    return (
                        '<div class="security-item">' +
                        '<span class="security-icon">' + escapeHTML(item.icon) + '</span>' +
                        '<div class="security-info">' +
                        '<h4>' + escapeHTML(item.name) + '</h4>' +
                        '<p>' + escapeHTML(item.desc) + '</p>' +
                        '</div>' +
                        '<span class="security-status status-' + escapeHTML(item.status) + '">' +
                        escapeHTML(item.status) +
                        '</span>' +
                        '</div>'
                    );
                })
                .join('');
        }

        // Summary
        if (el.summaryText) el.summaryText.textContent = d.summary || '';

        // Verdict
        if (el.verdict) {
            var vt = d.verdictType || 'caution';
            el.verdict.className = 'verdict ' + vt;
        }
        if (el.verdictIcon) {
            el.verdictIcon.textContent =
                d.verdictType === 'safe' ? '✅' :
                d.verdictType === 'unsafe' ? '🚫' : '⚠️';
        }
        if (el.verdictText) el.verdictText.textContent = d.verdictMessage || 'Analysis complete.';
    }

    /* ========================================
       RENDER – COMPARISON RESULTS
       ======================================== */

    function renderComparisonResults(data) {
        var siteA = data.siteA || {};
        var siteB = data.siteB || {};
        var comp  = data.comparison || {};

        // Winner banner
        if (el.compWinnerHeading) {
            el.compWinnerHeading.textContent =
                comp.winner === 'Tie'
                    ? "It's a Tie!"
                    : 'Winner: ' + (comp.winner || 'Undecided');
        }
        if (el.compWinnerSummary) {
            el.compWinnerSummary.textContent = comp.summary || '';
        }

        // Site A overview
        var domainA = (siteA.details && siteA.details.Domain) || '';
        if (el.compFaviconA) el.compFaviconA.src = faviconURL('https://' + domainA);
        if (el.compNameA)    el.compNameA.textContent = siteA.name || domainA;
        if (el.compLinkA) {
            el.compLinkA.textContent = domainA;
            el.compLinkA.href = 'https://' + domainA;
        }
        if (el.compScoreA)   el.compScoreA.textContent = siteA.overallScore || 0;

        // Site B overview
        var domainB = (siteB.details && siteB.details.Domain) || '';
        if (el.compFaviconB) el.compFaviconB.src = faviconURL('https://' + domainB);
        if (el.compNameB)    el.compNameB.textContent = siteB.name || domainB;
        if (el.compLinkB) {
            el.compLinkB.textContent = domainB;
            el.compLinkB.href = 'https://' + domainB;
        }
        if (el.compScoreB)   el.compScoreB.textContent = siteB.overallScore || 0;

        // Dynamic titles
        var nameA = siteA.name || 'Website A';
        var nameB = siteB.name || 'Website B';
        if (el.compStrengthsTitleA)  el.compStrengthsTitleA.textContent  = nameA + ' Strengths';
        if (el.compStrengthsTitleB)  el.compStrengthsTitleB.textContent  = nameB + ' Strengths';
        if (el.compWeaknessesTitleA) el.compWeaknessesTitleA.textContent = nameA + ' Improvements';
        if (el.compWeaknessesTitleB) el.compWeaknessesTitleB.textContent = nameB + ' Improvements';

        // Category-by-category comparison
        var scoresA = siteA.scores || {};
        var scoresB = siteB.scores || {};
        var cats = [
            { label: 'Overall',    a: siteA.overallScore || 0, b: siteB.overallScore || 0 },
            { label: 'Safety',     a: scoresA.safety     || 0, b: scoresB.safety     || 0 },
            { label: 'Trust',      a: scoresA.trust      || 0, b: scoresB.trust      || 0 },
            { label: 'Speed',      a: scoresA.speed      || 0, b: scoresB.speed      || 0 },
            { label: 'Popularity', a: scoresA.popularity  || 0, b: scoresB.popularity  || 0 },
        ];

        if (el.compCategoryList) {
            el.compCategoryList.innerHTML = cats
                .map(function (c) {
                    var winnerMark =
                        c.a > c.b ? ' ← ' + nameA :
                        c.b > c.a ? ' ← ' + nameB : ' (tie)';
                    return (
                        '<div class="detail-item" style="margin-bottom:6px;">' +
                        '<span class="detail-label">' + escapeHTML(c.label) + '</span>' +
                        '<span class="detail-value">' +
                        escapeHTML(nameA) + ': <strong>' + c.a + '</strong>' +
                        ' &nbsp;vs&nbsp; ' +
                        escapeHTML(nameB) + ': <strong>' + c.b + '</strong>' +
                        '<small style="color:var(--text-muted);margin-left:6px;">' +
                        escapeHTML(winnerMark) + '</small>' +
                        '</span>' +
                        '</div>'
                    );
                })
                .join('');
        }

        // Strengths
        if (el.compStrengthsA) {
            el.compStrengthsA.innerHTML = (siteA.pros || [])
                .map(function (p) { return '<li>' + escapeHTML(p) + '</li>'; })
                .join('');
        }
        if (el.compStrengthsB) {
            el.compStrengthsB.innerHTML = (siteB.pros || [])
                .map(function (p) { return '<li>' + escapeHTML(p) + '</li>'; })
                .join('');
        }

        // Weaknesses
        if (el.compWeaknessesA) {
            el.compWeaknessesA.innerHTML = (siteA.cons || [])
                .map(function (c) { return '<li>' + escapeHTML(c) + '</li>'; })
                .join('');
        }
        if (el.compWeaknessesB) {
            el.compWeaknessesB.innerHTML = (siteB.cons || [])
                .map(function (c) { return '<li>' + escapeHTML(c) + '</li>'; })
                .join('');
        }

        // AI insights
        if (el.compAiInsights) {
            el.compAiInsights.innerHTML =
                '<p style="color:var(--text-secondary);line-height:1.7;font-size:14px;">' +
                escapeHTML(comp.insights || 'No additional insights available.') +
                '</p>';
        }
    }

    /* ========================================
       HISTORY
       ======================================== */

    function addToHistory(url, name, score) {
        history = history.filter(function (h) { return h.url !== url; });
        history.unshift({
            url: url,
            name: name || getHostname(url),
            score: score || 0,
            date: new Date().toISOString(),
        });
        // Keep max 20 entries
        if (history.length > 20) history = history.slice(0, 20);
        try {
            localStorage.setItem('critixai_history', JSON.stringify(history));
        } catch (e) {
            // Storage full – silently ignore
        }
        renderHistory();
    }

    function renderHistory() {
        if (!el.historyContainer || !el.emptyHistory) return;

        // Remove old items
        var old = el.historyContainer.querySelectorAll('.history-item');
        for (var i = 0; i < old.length; i++) old[i].remove();

        if (history.length === 0) {
            el.emptyHistory.style.display = '';
            if (el.clearHistoryBtn) el.clearHistoryBtn.style.display = 'none';
            return;
        }

        el.emptyHistory.style.display = 'none';
        if (el.clearHistoryBtn) el.clearHistoryBtn.style.display = '';

        history.forEach(function (h) {
            var div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML =
                '<img class="history-favicon" src="' + faviconURL(h.url) + '" alt="" loading="lazy">' +
                '<div class="history-info">' +
                '<div class="history-name">' + escapeHTML(h.name) + '</div>' +
                '<div class="history-url">' + escapeHTML(h.url) + '</div>' +
                '</div>' +
                '<span class="history-score">' + (h.score || 0) + '</span>';

            div.addEventListener('click', function () {
                if (el.urlInput) el.urlInput.value = h.url;
                showSection('critic');
                handleCriticSubmit();
            });

            el.historyContainer.appendChild(div);
        });
    }

    function clearHistory() {
        history = [];
        try { localStorage.removeItem('critixai_history'); } catch (e) { /* noop */ }
        renderHistory();
        toast('History cleared.', 'info');
    }

    /* ========================================
       COPY RESULTS
       ======================================== */

    function copyCriticResults() {
        var name = el.websiteName ? el.websiteName.textContent : '';
        var desc = el.websiteDescription ? el.websiteDescription.textContent : '';
        var summary = el.summaryText ? el.summaryText.textContent : '';
        var score = el.scoreValue ? el.scoreValue.textContent : '';
        var text =
            'CritixAI Report: ' + name + '\n' +
            'Score: ' + score + '/100\n\n' +
            desc + '\n\n' +
            summary;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                toast('Report copied to clipboard!', 'success');
            }).catch(function () {
                toast('Could not copy.', 'error');
            });
        } else {
            toast('Clipboard not available in this browser.', 'info');
        }
    }

    /* ========================================
       EVENT LISTENERS
       ======================================== */

    function initListeners() {
        // --- Form submissions ---
        if (el.criticForm) {
            el.criticForm.addEventListener('submit', handleCriticSubmit);
        }
        if (el.comparisonForm) {
            el.comparisonForm.addEventListener('submit', handleCompetitionSubmit);
        }

        // --- Delegated click handler ---
        document.addEventListener('click', function (e) {
            var target = e.target.closest('[id]');
            if (!target) return;

            switch (target.id) {
                // Mode selection
                case 'selectCriticMode':
                    e.preventDefault();
                    showSection('critic');
                    break;

                case 'selectCompetitionMode':
                    e.preventDefault();
                    showSection('competition');
                    break;

                // Back buttons
                case 'backToModesFromCritic':
                case 'backToModesFromCompetition':
                    e.preventDefault();
                    showSection('home');
                    break;

                case 'backBtn':
                    e.preventDefault();
                    showSection('critic');
                    break;

                case 'backFromComparisonResults':
                    e.preventDefault();
                    showSection('competition');
                    break;

                // Theme
                case 'themeToggle':
                    e.preventDefault();
                    toggleTheme();
                    break;

                // Mobile menu
                case 'mobileMenuBtn':
                    e.preventDefault();
                    toggleMobileMenu();
                    break;

                // Brand logo → home
                case 'navBrandHome':
                    e.preventDefault();
                    showSection('home');
                    break;

                // Copy results
                case 'copyResultsBtn':
                    e.preventDefault();
                    copyCriticResults();
                    break;

                // Clear history
                case 'clearHistoryBtn':
                    e.preventDefault();
                    clearHistory();
                    break;
            }

            // Nav links (data-nav attribute)
            var navTarget = e.target.closest('[data-nav]');
            if (navTarget) {
                e.preventDefault();
                var section = navTarget.getAttribute('data-nav');
                if (section === 'modes' || section === 'features' ||
                    section === 'how-it-works' || section === 'history') {
                    showSection('home');
                    // Scroll to the target section after a brief delay
                    setTimeout(function () {
                        var targetEl = document.getElementById(section);
                        if (targetEl) {
                            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 100);
                } else if (section === 'home') {
                    showSection('home');
                }
            }

            // Quick links
            if (e.target.classList.contains('quick-link')) {
                var quickUrl = e.target.getAttribute('data-url');
                if (quickUrl && el.urlInput) {
                    el.urlInput.value = quickUrl;
                    showSection('critic');
                    handleCriticSubmit();
                }
            }

            // Mobile menu link clicks → close menu
            if (e.target.closest('.mobile-menu a')) {
                closeMobileMenu();
            }
        });
    }

    /* ========================================
       BOOT
       ======================================== */

    document.addEventListener('DOMContentLoaded', function () {
        initTheme();
        initParticles();
        initListeners();
        renderHistory();
        showSection('home');
    });

})();