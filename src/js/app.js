(() => {
    'use strict';

    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    // --- SAFE DOM HELPERS ---
    function createEl(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function createStatusSvg(kind) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('class', kind === 'ok' ? 'w-5 h-5 sm:w-6 sm:h-6 text-green-500 shrink-0' : 'w-5 h-5 sm:w-6 sm:h-6 text-red-500 shrink-0');
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('d', kind === 'ok' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12');
        svg.appendChild(path);
        return svg;
    }

    // --- THEME LOGIC ---
    function isDarkTheme() {
        return document.documentElement.classList.contains('dark');
    }

    function applyTheme(isDark, persist = true) {
        document.documentElement.classList.toggle('dark', isDark);
        const schemeMeta = document.querySelector('meta[name="color-scheme"]');
        if (schemeMeta) schemeMeta.content = isDark ? 'dark' : 'light';
        if (persist) {
            try {
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            } catch (_) {
                // Ignore storage restrictions
            }
        }
        updateMapTheme();
    }

    function toggleTheme() {
        applyTheme(!isDarkTheme(), true);
    }

    window.addEventListener('storage', (event) => {
        if (event.key === 'theme') {
            applyTheme(event.newValue !== 'light', false);
        }
    });

    let toastTimer = null;
    function showToast(message) {
        const toastEl = document.getElementById('toast');
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.className = 'show';
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.className = toastEl.className.replace('show', '').trim();
        }, 3000);
    }

    function copyText(id) {
        const codeEl = document.getElementById(id);
        if (!codeEl || !navigator.clipboard) return;
        const text = codeEl.textContent.trim().replace(/^\$\s*/, '');
        navigator.clipboard.writeText(text).then(
            () => showToast('Command Copied!'),
            () => showToast('Copy failed')
        );
    }

    function normalizeDomainInput(raw) {
        return raw.trim().replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0];
    }

    let activeLookupController = null;
    let activeLookupId = 0;

    async function lookup() {
        const inputEl = document.getElementById('domainInput');
        if (!inputEl) return;
        const domain = normalizeDomainInput(inputEl.value);
        if (!domain) return;
        inputEl.value = domain;

        if (activeLookupController) {
            activeLookupController.abort();
        }
        activeLookupController = new AbortController();
        const { signal } = activeLookupController;
        const lookupId = ++activeLookupId;

        const resultsEl = document.getElementById('results');
        const bannerEl = document.getElementById('propagation-banner');
        const errorEl = document.getElementById('error-msg');
        resultsEl.classList.add('hidden');
        bannerEl.classList.add('hidden');
        bannerEl.classList.remove('flex');
        errorEl.classList.add('hidden');

        try {
            const res = await fetch(`/api/lookup/${encodeURIComponent(domain)}`, { signal });
            const data = await res.json().catch(() => ({}));
            if (lookupId !== activeLookupId) return;
            if (!res.ok || data.error) {
                throw new Error(data.error || `Lookup failed (HTTP ${res.status})`);
            }

            const render = (id, list, nodeBuilder) => {
                const el = document.getElementById(id);
                el.replaceChildren();
                if (!list || list.length === 0) {
                    el.appendChild(createEl('span', 'text-slate-500 italic', 'No records found'));
                    return;
                }
                list.forEach(item => {
                    const row = createEl('div', 'border-b border-slate-200 dark:border-slate-800/50 last:border-0 pb-1 last:pb-0');
                    if (nodeBuilder) {
                        nodeBuilder(row, item);
                    } else {
                        row.textContent = String(item);
                    }
                    el.appendChild(row);
                });
            };

            render('res-a', data.records.A);
            render('res-aaaa', data.records.AAAA);
            render('res-mx', data.records.MX, (row, m) => {
                row.appendChild(createEl('span', 'text-slate-500 mr-2 font-bold w-6 inline-block', m.priority));
                row.appendChild(document.createTextNode(String(m.exchange || '')));
            });
            render('res-ns', data.records.NS);
            render('res-txt', data.records.TXT, (row, t) => {
                row.appendChild(createEl('div', 'p-2 bg-slate-100 dark:bg-slate-800/50 rounded-sm break-all font-mono text-xs text-slate-600 dark:text-slate-400 mb-1 border border-slate-200 dark:border-slate-700/50', t));
            });

            const cnameEl = document.getElementById('res-cname');
            const cnameCard = document.getElementById('card-cname');
            if (data.records.CNAME) {
                cnameEl.textContent = data.records.CNAME;
                cnameCard.classList.remove('hidden');
            } else {
                cnameCard.classList.add('hidden');
            }

            render('res-caa', data.records.CAA, (row, c) => {
                row.appendChild(createEl('span', 'text-slate-500 mr-2 font-bold', c.issue || c.issuewild || 'iodef'));
                row.appendChild(document.createTextNode(`"${c.value || ''}"`));
            });

            const soaEl = document.getElementById('res-soa');
            soaEl.replaceChildren();
            if (data.records.SOA) {
                const s = data.records.SOA;
                const grid = createEl('div', 'grid grid-cols-[80px_1fr] gap-1');
                [
                    ['Primary:', s.nsname],
                    ['Admin:', s.hostmaster],
                    ['Serial:', s.serial],
                    ['Refresh:', s.refresh]
                ].forEach(([label, val]) => {
                    grid.appendChild(createEl('span', 'text-slate-500', label));
                    grid.appendChild(createEl('span', 'break-all', val ?? ''));
                });
                soaEl.appendChild(grid);
            } else {
                soaEl.appendChild(createEl('span', 'text-slate-500 italic', 'No SOA record found'));
            }

            resultsEl.classList.remove('hidden');
            resultsEl.classList.add('grid');

            document.getElementById('banner-domain').textContent = domain;
            bannerEl.classList.remove('hidden');
            bannerEl.classList.add('flex');
        } catch (err) {
            if (err?.name === 'AbortError' || lookupId !== activeLookupId) return;
            errorEl.textContent = err.message || 'Lookup Failed';
            errorEl.classList.remove('hidden');
        }
    }

    // --- TYPEWRITER & IP LOGIC ---
    function startPlaceholderAnimation() {
        const input = document.getElementById('domainInput');
        if (!input) return;
        const phrases = ['Lookup a Domain: e.g. wiredalter.com', 'Check DNS: e.g. google.com'];
        let phraseIndex = 0;
        let charIndex = 0;
        let isDeleting = false;

        function typeLoop() {
            if (input.value) {
                setTimeout(typeLoop, 2000);
                return;
            }
            const currentPhrase = phrases[phraseIndex];
            input.placeholder = currentPhrase.substring(0, charIndex);

            let typeSpeed = isDeleting ? 25 : 50;
            charIndex += isDeleting ? -1 : 1;

            if (!isDeleting && charIndex === currentPhrase.length + 1) {
                typeSpeed = 2000;
                isDeleting = true;
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                phraseIndex = (phraseIndex + 1) % phrases.length;
                typeSpeed = 500;
            }

            setTimeout(typeLoop, typeSpeed);
        }
        typeLoop();
    }

    function getFlagEmoji(countryCode) {
        if (!countryCode || countryCode.length !== 2) return '';
        const codePoints = countryCode.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
    }

    fetch('https://ip.wiredalter.com/api/info')
        .then(res => {
            if (!res.ok) throw new Error('IP lookup failed');
            return res.json();
        })
        .then(data => {
            if (!data || !data.ip) throw new Error('Invalid IP payload');
            document.getElementById('my-ip').textContent = data.ip;
            document.getElementById('my-flag').textContent = getFlagEmoji(data.country_code || '');
            document.getElementById('my-connection').classList.remove('hidden');
            startPlaceholderAnimation();
        })
        .catch(() => startPlaceholderAnimation());

    // --- PROPAGATION MODAL & MAPLIBRE LOGIC ---
    const MAPLIBRE_CSS_URL = '/assets/vendor/maplibre-gl/maplibre-gl.css';
    const MAPLIBRE_JS_URL = '/assets/vendor/maplibre-gl/maplibre-gl.mjs';
    const MAPLIBRE_WORKER_URL = '/assets/vendor/maplibre-gl/maplibre-gl-worker.mjs';

    const MAP_STYLES = {
        dark: 'https://tiles.openfreemap.org/styles/fiord',
        light: 'https://tiles.openfreemap.org/styles/positron'
    };

    let maplibreglMod = null;
    let maplibreLoadPromise = null;
    let map = null;
    let isInitializingMap = false;
    let currentMapStyleUrl = null;
    let userInteractedWithMap = false;
    const markers = {};
    const popups = {};
    const serverStates = {};
    let serversList = [];
    let serversPromise = null;
    let activeCheckId = 0;
    let activeAbortController = null;
    let mapResizeObserver = null;

    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function getMapStyleUrl() {
        return isDarkTheme() ? MAP_STYLES.dark : MAP_STYLES.light;
    }

    function setMapOverlay(message, isError = false) {
        const overlay = document.getElementById('mapOverlayStatus');
        if (!overlay) return;
        if (!message) {
            overlay.classList.add('hidden');
            return;
        }
        overlay.classList.remove('hidden');
        overlay.replaceChildren();
        const msgEl = createEl(
            'span',
            isError ? 'text-amber-700 dark:text-amber-300 font-medium max-w-xs' : 'text-slate-600 dark:text-slate-300',
            message
        );
        overlay.appendChild(msgEl);
    }

    function loadStylesheet(href) {
        const existing = document.querySelector('link[data-maplibre-css="1"]');
        if (existing) {
            if (existing.dataset.loaded === '1') return Promise.resolve();
            return new Promise((resolve, reject) => {
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('Failed to load map stylesheet')), { once: true });
            });
        }
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.maplibreCss = '1';
            link.addEventListener('load', () => {
                link.dataset.loaded = '1';
                resolve();
            }, { once: true });
            link.addEventListener('error', () => {
                link.remove();
                reject(new Error('Failed to load map stylesheet'));
            }, { once: true });
            document.head.appendChild(link);
        });
    }

    async function loadMapLibre() {
        if (maplibreglMod) return maplibreglMod;
        if (maplibreLoadPromise) return maplibreLoadPromise;

        maplibreLoadPromise = (async () => {
            const [, mod] = await Promise.all([
                loadStylesheet(MAPLIBRE_CSS_URL),
                import(MAPLIBRE_JS_URL)
            ]);
            mod.setWorkerUrl(MAPLIBRE_WORKER_URL);
            maplibreglMod = mod;
            return mod;
        })().catch((err) => {
            maplibreLoadPromise = null;
            throw err;
        });

        return maplibreLoadPromise;
    }

    function loadServers() {
        if (serversList.length > 0) return Promise.resolve(serversList);
        if (serversPromise) return serversPromise;

        serversPromise = fetch('/api/propagation-servers?t=' + Date.now())
            .then(res => {
                if (!res.ok) throw new Error('Failed to load servers (HTTP ' + res.status + ')');
                return res.json();
            })
            .then(servers => {
                serversList = servers;
                servers.forEach(s => {
                    if (!serverStates[s.id]) {
                        serverStates[s.id] = { status: 'idle', detail: 'Ready to check', latency: null };
                    }
                });
                const counter = document.getElementById('propCounter');
                if (counter && activeCheckId === 0) {
                    counter.textContent = `${servers.length} global resolvers`;
                }
                return servers;
            })
            .catch(err => {
                serversPromise = null;
                console.error('Servers fetch error:', err);
                const resultsEl = document.getElementById('propResults');
                resultsEl.replaceChildren();
                const errBox = createEl('div', 'col-span-full text-center text-red-600 dark:text-red-400 mt-4 p-4 bg-red-500/10 rounded-xl border border-red-500/20');
                errBox.appendChild(createEl('div', 'font-bold mb-1', 'Error Loading DNS Nodes'));
                errBox.appendChild(createEl('div', 'text-xs', 'Could not load global resolvers. Make sure the backend is running and try refreshing.'));
                resultsEl.appendChild(errBox);
                throw err;
            });

        return serversPromise;
    }

    function buildPopupContent(server) {
        const state = serverStates[server.id] || { status: 'idle', detail: 'Ready to check', latency: null };
        const wrap = createEl('div', 'space-y-1 min-w-[150px] max-w-[220px]');

        const titleRow = createEl('div', 'font-bold flex items-center gap-1.5 text-slate-900 dark:text-white');
        const flag = getFlagEmoji(server.country);
        if (flag) titleRow.appendChild(createEl('span', '', flag));
        titleRow.appendChild(createEl('span', '', server.name));
        wrap.appendChild(titleRow);

        wrap.appendChild(createEl('div', 'text-[11px] text-slate-500 dark:text-slate-400', `${server.location} · ${server.ip}`));

        const statusCls = state.status === 'ok'
            ? 'text-green-600 dark:text-green-400 font-mono text-[11px] break-all pt-1 border-t border-slate-200 dark:border-slate-700'
            : state.status === 'error'
                ? 'text-red-600 dark:text-red-400 font-mono text-[11px] break-all pt-1 border-t border-slate-200 dark:border-slate-700'
                : 'text-slate-500 dark:text-slate-400 text-[11px] pt-1 border-t border-slate-200 dark:border-slate-700';

        const statusText = state.latency !== null && state.status === 'ok'
            ? `${state.detail} (${state.latency} ms)`
            : state.detail;
        wrap.appendChild(createEl('div', statusCls, statusText));
        return wrap;
    }

    function setMarkerStatus(serverId, status, detail, latency = null) {
        serverStates[serverId] = { status, detail, latency };
        const marker = markers[serverId];
        if (marker) {
            marker.getElement().dataset.status = status;
        }
        const server = serversList.find(s => s.id === serverId);
        if (server && popups[serverId]) {
            popups[serverId].setDOMContent(buildPopupContent(server));
        }
    }

    function getMapPadding() {
        const w = document.getElementById('mapContainer')?.clientWidth || 320;
        const pad = w < 480 ? 20 : 28;
        return { top: pad, bottom: pad, left: pad, right: pad };
    }

    function fitMapToServers(animate = false) {
        const container = document.getElementById('mapContainer');
        if (!map || !maplibreglMod || serversList.length === 0 || !container || !container.clientWidth || !container.clientHeight) {
            return;
        }
        const bounds = new maplibreglMod.LngLatBounds();
        serversList.forEach(s => bounds.extend([s.lng, s.lat]));
        map.fitBounds(bounds, {
            padding: getMapPadding(),
            maxZoom: 3,
            duration: animate && !prefersReducedMotion() ? 450 : 0
        });
    }

    function resetMapView() {
        userInteractedWithMap = false;
        fitMapToServers(true);
    }

    function highlightResultRow(serverId, shouldScroll = false) {
        document.querySelectorAll('#propResults > [data-server-row="1"]').forEach(r => {
            r.classList.remove('ring-2', 'ring-blue-500');
        });
        const row = document.getElementById(`row-${serverId}`);
        if (!row) return;
        row.classList.add('ring-2', 'ring-blue-500');
        if (shouldScroll) {
            row.scrollIntoView({
                block: 'nearest',
                behavior: prefersReducedMotion() ? 'auto' : 'smooth'
            });
        }
    }

    function plotServerMarkers() {
        if (!map || !maplibreglMod || serversList.length === 0) return;
        serversList.forEach(s => {
            if (markers[s.id]) return;
            const state = serverStates[s.id] || { status: 'idle', detail: 'Ready to check', latency: null };

            const btn = createEl('button', 'dns-map-marker');
            btn.type = 'button';
            btn.dataset.status = state.status;
            btn.setAttribute('aria-label', `${s.name}, ${s.location}`);
            btn.appendChild(createEl('span', 'dns-map-dot'));

            const popup = new maplibreglMod.Popup({
                offset: 14,
                maxWidth: '240px',
                closeButton: true,
                closeOnClick: true
            }).setDOMContent(buildPopupContent(s));

            const marker = new maplibreglMod.Marker({ element: btn, anchor: 'center' })
                .setLngLat([s.lng, s.lat])
                .setPopup(popup)
                .addTo(map);

            btn.addEventListener('click', () => {
                highlightResultRow(s.id, window.innerWidth >= 1024);
            });

            markers[s.id] = marker;
            popups[s.id] = popup;
        });
    }

    function focusServerOnMap(serverId) {
        highlightResultRow(serverId, false);
        const server = serversList.find(s => s.id === serverId);
        if (!server || !map) return;

        if (window.innerWidth < 1024) {
            document.getElementById('mapWrapper')?.scrollIntoView({
                block: 'nearest',
                behavior: prefersReducedMotion() ? 'auto' : 'smooth'
            });
        }

        Object.values(popups).forEach(p => {
            if (p.isOpen()) p.remove();
        });
        userInteractedWithMap = true;
        map.easeTo({
            center: [server.lng, server.lat],
            zoom: Math.max(map.getZoom(), 2.2),
            duration: prefersReducedMotion() ? 0 : 400
        });
        if (markers[serverId] && popups[serverId] && !popups[serverId].isOpen()) {
            markers[serverId].togglePopup();
        }
    }

    async function initPropagationView() {
        const serversTask = loadServers().catch(() => []);
        if (map || isInitializingMap) {
            await serversTask;
            return;
        }

        const modal = document.getElementById('propagationModal');
        const container = document.getElementById('mapContainer');
        if (!modal?.open || !container || !container.clientWidth || !container.clientHeight) {
            await serversTask;
            return;
        }

        isInitializingMap = true;
        setMapOverlay('Loading interactive map...');

        try {
            const [servers, mod] = await Promise.all([serversTask, loadMapLibre()]);
            if (!modal.open || !container.clientWidth || !container.clientHeight) {
                return;
            }

            let hasLoadedInitialStyle = false;
            currentMapStyleUrl = getMapStyleUrl();
            map = new mod.Map({
                container: 'mapContainer',
                style: currentMapStyleUrl,
                center: [12, 18],
                zoom: 0.4,
                minZoom: -1.5,
                maxZoom: 16,
                maxPitch: 0,
                dragRotate: false,
                touchPitch: false,
                pitchWithRotate: false,
                renderWorldCopies: false,
                attributionControl: false
            });

            map.addControl(new mod.AttributionControl({ compact: true }), 'bottom-right');
            map.addControl(new mod.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
            if (map.touchZoomRotate) {
                map.touchZoomRotate.disableRotation();
            }

            map.on('dragstart', (e) => {
                if (e.originalEvent) userInteractedWithMap = true;
            });
            map.on('zoomstart', (e) => {
                if (e.originalEvent) userInteractedWithMap = true;
            });

            map.once('load', () => {
                hasLoadedInitialStyle = true;
                setMapOverlay(null);
                document.getElementById('resetMapViewBtn')?.classList.remove('hidden');
                plotServerMarkers();
                if (!userInteractedWithMap) {
                    fitMapToServers(false);
                }
            });

            map.on('style.load', () => {
                if (!userInteractedWithMap) {
                    fitMapToServers(false);
                }
            });

            map.on('error', (e) => {
                console.warn('MapLibre tile/style warning:', e?.error?.message || e);
                if (!hasLoadedInitialStyle && !map?.isStyleLoaded()) {
                    setMapOverlay('Map tiles could not be loaded right now. DNS propagation checks below still work normally.', true);
                }
            });

            if (servers.length > 0) {
                plotServerMarkers();
                fitMapToServers(false);
            }

            if (window.ResizeObserver && !mapResizeObserver) {
                mapResizeObserver = new ResizeObserver(() => {
                    if (!map || !container.clientWidth || !container.clientHeight) return;
                    map.resize();
                    if (!userInteractedWithMap) {
                        fitMapToServers(false);
                    }
                });
                mapResizeObserver.observe(container);
            }
        } catch (err) {
            console.error('Map initialization failed:', err);
            setMapOverlay('Map preview unavailable in this browser. DNS propagation checks below still work normally.', true);
        } finally {
            isInitializingMap = false;
        }
    }

    function updateMapTheme() {
        if (!map) return;
        const nextStyleUrl = getMapStyleUrl();
        if (currentMapStyleUrl === nextStyleUrl) return;
        currentMapStyleUrl = nextStyleUrl;
        map.setStyle(nextStyleUrl);
    }

    function openPropagationModal() {
        const modal = document.getElementById('propagationModal');
        if (!modal) return;
        modal.showModal();
        const currentDomain = document.getElementById('domainInput')?.value.trim();
        if (currentDomain) {
            const propDomain = document.getElementById('propDomain');
            if (propDomain) propDomain.value = currentDomain;
        }

        requestAnimationFrame(() => {
            initPropagationView().then(() => {
                const container = document.getElementById('mapContainer');
                if (map && container?.clientWidth && container?.clientHeight) {
                    map.resize();
                    if (!userInteractedWithMap) fitMapToServers(false);
                }
            });
        });
    }

    function closePropagationModal() {
        document.getElementById('propagationModal')?.close();
    }

    // Light-dismiss fallback for browsers without native dialog closedby="any" (e.g. Safari)
    (function setupDialogLightDismissFallback() {
        const modal = document.getElementById('propagationModal');
        if (!modal || ('closedBy' in HTMLDialogElement.prototype)) return;
        const isOutside = (e) => {
            const r = modal.getBoundingClientRect();
            return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        };
        let pressedOutside = false;
        modal.addEventListener('pointerdown', (e) => {
            pressedOutside = isOutside(e);
        });
        modal.addEventListener('pointerup', (e) => {
            if (pressedOutside && isOutside(e)) modal.close();
            pressedOutside = false;
        });
    })();

    function formatDnsRecordValue(data) {
        if (Array.isArray(data)) {
            if (data.length === 0) return 'No records';
            return data.map(item => {
                if (Array.isArray(item)) return item.join('');
                if (item && typeof item === 'object') {
                    if ('priority' in item && 'exchange' in item) {
                        return `${item.priority} ${item.exchange}`;
                    }
                    if ('priority' in item && 'weight' in item && 'port' in item && 'name' in item) {
                        return `${item.priority} ${item.weight} ${item.port} ${item.name}`;
                    }
                    if ('value' in item) {
                        return `${item.issue || item.issuewild || item.iodef || 'caa'} "${item.value}"`;
                    }
                    return JSON.stringify(item);
                }
                return String(item);
            }).join(', ');
        }
        if (data && typeof data === 'object') {
            return data.nsname || data.value || JSON.stringify(data);
        }
        return data ? String(data) : 'No records';
    }

    async function checkPropagation() {
        const propDomainInput = document.getElementById('propDomain');
        const propTypeSelect = document.getElementById('propType');
        if (!propDomainInput || !propTypeSelect) return;

        let domain = normalizeDomainInput(propDomainInput.value);
        const type = propTypeSelect.value;
        if (!domain) return;

        propDomainInput.value = domain;

        if (activeAbortController) {
            activeAbortController.abort();
        }
        activeAbortController = new AbortController();
        const { signal } = activeAbortController;
        const checkId = ++activeCheckId;

        try {
            await loadServers();
        } catch (_) {
            return;
        }
        if (checkId !== activeCheckId || serversList.length === 0) return;

        const resultsContainer = document.getElementById('propResults');
        resultsContainer.replaceChildren();

        let completedCount = 0;
        let propagatedCount = 0;
        const totalCount = serversList.length;
        const updateCounter = () => {
            const counter = document.getElementById('propCounter');
            if (counter) {
                counter.textContent = completedCount < totalCount
                    ? `Checking ${completedCount}/${totalCount} (${propagatedCount} propagated)`
                    : `${propagatedCount}/${totalCount} propagated`;
            }
        };
        updateCounter();

        serversList.forEach(s => {
            setMarkerStatus(s.id, 'checking', 'Checking...');

            const row = createEl('button', 'w-full text-left flex flex-col gap-2 p-3.5 sm:p-4 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-xs transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500');
            row.type = 'button';
            row.id = `row-${s.id}`;
            row.dataset.serverRow = '1';
            row.addEventListener('click', () => focusServerOnMap(s.id));

            const top = createEl('div', 'flex items-center justify-between gap-3 w-full min-w-0');
            const identity = createEl('div', 'flex items-center gap-2.5 min-w-0');
            const flagEl = createEl('span', 'text-lg sm:text-xl shrink-0', getFlagEmoji(s.country));
            flagEl.title = s.location;
            identity.appendChild(flagEl);

            const nameBox = createEl('div', 'min-w-0');
            nameBox.appendChild(createEl('div', 'font-bold text-slate-800 dark:text-white text-sm truncate', s.name));
            nameBox.appendChild(createEl('div', 'text-xs text-slate-500 dark:text-slate-400 truncate', s.location));
            identity.appendChild(nameBox);

            const statusSpan = createEl('span', 'shrink-0 flex items-center gap-1.5');
            statusSpan.id = `status-${s.id}`;
            top.appendChild(identity);
            top.appendChild(statusSpan);

            const valWrap = createEl('div', 'w-full min-w-0 pt-1 border-t border-slate-100 dark:border-slate-700/40');
            const valSpan = createEl('span', 'text-slate-400 text-xs sm:text-sm font-mono inline-flex items-center gap-2 break-all');
            valSpan.id = `val-${s.id}`;

            const pingOuter = createEl('span', 'relative flex h-2.5 w-2.5 shrink-0');
            pingOuter.appendChild(createEl('span', 'animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75'));
            pingOuter.appendChild(createEl('span', 'relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500'));
            valSpan.appendChild(pingOuter);
            valSpan.appendChild(document.createTextNode('Checking...'));
            valWrap.appendChild(valSpan);

            row.appendChild(top);
            row.appendChild(valWrap);
            resultsContainer.appendChild(row);
        });

        for (const s of serversList) {
            fetch(`/api/propagate/${encodeURIComponent(domain)}/${encodeURIComponent(type)}?server=${encodeURIComponent(s.ip)}`, { signal })
                .then(async res => {
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || data.error) {
                        throw new Error(data.error || `HTTP ${res.status}`);
                    }
                    return data;
                })
                .then(data => {
                    if (checkId !== activeCheckId) return;

                    const valSpan = document.getElementById(`val-${s.id}`);
                    const statusSpan = document.getElementById(`status-${s.id}`);
                    if (!valSpan || !statusSpan) return;

                    const valStr = formatDnsRecordValue(data.data);
                    const hasResult = valStr !== 'No records';
                    valSpan.replaceChildren(createEl('span', 'text-slate-800 dark:text-slate-200 break-all', valStr));

                    statusSpan.replaceChildren();
                    if (typeof data.latency_ms === 'number') {
                        statusSpan.appendChild(createEl('span', 'text-[11px] font-mono text-slate-400 dark:text-slate-500', `${data.latency_ms}ms`));
                    }

                    if (hasResult) {
                        propagatedCount++;
                        statusSpan.appendChild(createStatusSvg('ok'));
                        setMarkerStatus(s.id, 'ok', valStr, data.latency_ms ?? null);
                    } else {
                        statusSpan.appendChild(createStatusSvg('error'));
                        setMarkerStatus(s.id, 'error', 'No records', data.latency_ms ?? null);
                    }
                    completedCount++;
                    updateCounter();
                })
                .catch(err => {
                    if (err?.name === 'AbortError' || checkId !== activeCheckId) return;
                    const valSpan = document.getElementById(`val-${s.id}`);
                    const statusSpan = document.getElementById(`status-${s.id}`);
                    const msg = err?.message || 'Error';
                    if (valSpan) {
                        valSpan.replaceChildren(createEl('span', 'text-red-500 dark:text-red-400 text-xs break-all', msg));
                    }
                    if (statusSpan) {
                        statusSpan.replaceChildren(createStatusSvg('error'));
                    }
                    setMarkerStatus(s.id, 'error', msg);
                    completedCount++;
                    updateCounter();
                });
        }
    }

    // --- EVENT WIRING (STRICT CSP, NO INLINE HANDLERS) ---
    document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);
    document.getElementById('domainInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            lookup();
        }
    });
    document.getElementById('lookupBtn')?.addEventListener('click', lookup);
    document.querySelectorAll('[data-open-propagation]').forEach(btn => {
        btn.addEventListener('click', openPropagationModal);
    });
    document.querySelectorAll('[data-copy-target]').forEach(btn => {
        btn.addEventListener('click', () => copyText(btn.dataset.copyTarget));
    });
    document.getElementById('closePropagationBtn')?.addEventListener('click', closePropagationModal);
    document.getElementById('propagationForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        checkPropagation();
    });
    document.getElementById('resetMapViewBtn')?.addEventListener('click', resetMapView);
})();
