// ==========================================
// CHAT & RECOMMENDATION SYSTEM ENGINE
// ==========================================

let supabaseClient;
const chatMessages = document.getElementById('chat-messages');
let botQueue = [];
let isTyping = false;

// Global PWA installation prompt stash
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});



let chatState = {
    mode: localStorage.getItem('recomendai_active_category_id') || null, // Restore last category on load
    userSession: null,
    activeAval: null,
    criterios: [], // All active criteria in the DB
    specs: [],     // All smartphone specifications
    alternativas: [], // Mapped alternatives (smartphones)
    
    // Conversation flow state
    currentState: 'WELCOME', // 'WELCOME', 'CHOOSE_CRITERIA', 'INTRACRITERIA_ELICITATION', 'INTERCRITERIA_SORTING', 'INTERCRITERIA_TRADEOFFS'
    
    // User selections
    selectedCriteriaIds: [], // Chosen criteria
    
    // Option 2: Intracriteria requirements (Bisection wizard state)
    intraCurrentIndex: 0,
    intraCritState: {}, // Keyed by crit_id: { W, B, M, search_w, search_b, v50, isLinear }
    
    // Option 3: Intercriteria priorities state
    sortArray: [],
    sortI: 1,
    sortJ: 0,
    sortCurrentItem: null,
    
    // LP constraints and bounds
    weightConstraints: [],
    currentQuestionRank: 0,
    currentBounds: [0, 1],
    heuristicDone: false,
    ties: {},
    
    // Live Ranking visualization state
    showHasse: false,
    hasseLevels: [],
    dominanceMatrix: [],
    network: null,

    // Chat history states
    oldestLoadedTimestamp: null,
    hasMoreHistory: true,
    isLoadingHistory: false,
    isRestoring: false,
    isLoaded: false
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Focar o campo de texto do prompt imediatamente e vincular eventos de envio de forma síncrona
    const chatInput = document.getElementById('chat-input');
    const btnSendChat = document.getElementById('btn-send-chat');
    if (chatInput && btnSendChat) {
        chatInput.focus();
        const updateSendBtnState = () => {
            if (chatInput.value.trim() !== '') {
                btnSendChat.classList.add('active');
            } else {
                btnSendChat.classList.remove('active');
            }
        };
        chatInput.addEventListener('input', updateSendBtnState);
        
        btnSendChat.onclick = () => {
            handleUserInputText(chatInput.value);
            setTimeout(updateSendBtnState, 50);
        };
        chatInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                handleUserInputText(chatInput.value);
                setTimeout(updateSendBtnState, 50);
            }
        };
    }

    const SUPABASE_URL = 'https://dblstsdluzmclcsyaqpa.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibHN0c2RsdXptY2xjc3lhcXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODU3MTIsImV4cCI6MjA5NTY2MTcxMn0.ySFb_7Jfs-X81mGgSl8dPmub35JJQXXTr8b4jlDcnt0';
    
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }
        
        chatState.userSession = session;
        
        // Parse URL parameters to set category mode
        const urlParams = new URLSearchParams(window.location.search);
        const urlId = urlParams.get('id');
        const urlMode = urlParams.get('mode');
        
        if (urlMode) {
            chatState.mode = urlMode;
            localStorage.setItem('recomendai_active_category_id', urlMode);
        } else if (urlId) {
            try {
                const { data, error } = await supabaseClient
                    .from('avaliacoes')
                    .select('categoria_id')
                    .eq('id', urlId)
                    .single();
                if (!error && data) {
                    chatState.mode = data.categoria_id;
                    localStorage.setItem('recomendai_active_category_id', data.categoria_id);
                }
            } catch (err) {
                console.error("Erro ao buscar categoria do id da URL:", err);
            }
        }
        
        // Load user greeting and details
        const userFullName = session.user.user_metadata?.full_name || session.user.email.split('@')[0] || "Usuário";
        const firstName = userFullName.trim().split(' ')[0];
        
        const sidebarUserNameEl = document.getElementById('sidebarUserName');
        if (sidebarUserNameEl) sidebarUserNameEl.innerText = userFullName;
        
        const sidebarAvatarEl = document.getElementById('sidebarAvatar');
        if (sidebarAvatarEl) {
            sidebarAvatarEl.innerText = firstName.charAt(0).toUpperCase();
        }

        // Show/hide admin panel link based on authorization
        const ADMIN_EMAILS = ['wagou.sb@gmail.com'];
        const userEmail = session.user.email || '';
        const adminWrapper = document.getElementById('adminPanelLinkWrapper');
        if (adminWrapper) {
            if (ADMIN_EMAILS.includes(userEmail.toLowerCase())) {
                adminWrapper.style.display = 'block';
            } else {
                adminWrapper.style.display = 'none';
            }
        }
        
        // Bind sidebar toggle interactions
        const geminiSidebar = document.getElementById('geminiSidebar');
        const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
        const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        
        const sidebarBrand = document.querySelector('.sidebar-brand');
        
        const updateSidebarTooltip = () => {
            const isCollapsed = geminiSidebar && geminiSidebar.classList.contains('collapsed');
            if (sidebarCollapseBtn) {
                sidebarCollapseBtn.setAttribute('title', isCollapsed ? 'Expandir menu' : 'Recolher menu');
            }
            if (sidebarBrand) {
                sidebarBrand.setAttribute('title', isCollapsed ? 'Expandir menu' : '');
            }
        };
        
        const toggleSidebar = () => {
            if (window.innerWidth <= 900) {
                geminiSidebar.classList.toggle('expanded');
                sidebarOverlay.classList.toggle('show');
            } else {
                geminiSidebar.classList.toggle('collapsed');
            }
            updateSidebarTooltip();
        };
        
        if (sidebarToggleBtn) sidebarToggleBtn.onclick = toggleSidebar;
        if (sidebarCollapseBtn) sidebarCollapseBtn.onclick = toggleSidebar;
        if (sidebarOverlay) sidebarOverlay.onclick = toggleSidebar;
        
        if (sidebarBrand) {
            sidebarBrand.onclick = () => {
                if (geminiSidebar && geminiSidebar.classList.contains('collapsed')) {
                    toggleSidebar();
                }
            };
        }
        
        // Inicializar tooltips corretos baseados no estado
        updateSidebarTooltip();
        
        // Bind profile settings dropdown menu
        const userProfileBtn = document.getElementById('userProfileBtn');
        const profileDropdown = document.getElementById('profileDropdown');
        if (userProfileBtn && profileDropdown) {
            userProfileBtn.onclick = (e) => {
                profileDropdown.classList.toggle('show');
                e.stopPropagation();
            };
            document.addEventListener('click', () => {
                profileDropdown.classList.remove('show');
            });
        }
        
        // Bind Mode Switchers dynamically
        await initSidebarCategories();
        await loadInitialData();
        chatState.isLoaded = true;
        
    } catch (e) {
        console.error("Erro na inicialização:", e);
        if (chatMessages) {
            chatMessages.innerHTML = `<div style="color: #ef4444; padding: 1rem; text-align: center;">Erro crítico ao iniciar aplicativo: ${e.message}</div>`;
        }
    }
});

// Bind UI controls — per-category reset buttons
function triggerResetChat(categoryId, categoryName) {
    Swal.fire({
        title: `Reiniciar chat de ${categoryName}?`,
        text: 'Todo o progresso será apagado e a conversa começará do zero.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, reiniciar',
        cancelButtonText: 'Cancelar',
        customClass: { popup: 'swal-gemini' },
        buttonsStyling: true
    }).then(async (result) => {
        if (result.isConfirmed) {
            let avalToReset = null;
            if (chatState.mode === categoryId) {
                avalToReset = chatState.activeAval;
            } else {
                // Fetch the evaluation for the target category from database
                try {
                    const { data, error } = await supabaseClient
                        .from('avaliacoes')
                        .select('id')
                        .eq('user_id', chatState.userSession.user.id)
                        .eq('categoria_id', categoryId)
                        .order('created_at', { ascending: false });
                    
                    if (!error && data && data.length > 0) {
                        avalToReset = data[0];
                    }
                } catch (err) {
                    console.error("Erro ao buscar avaliação para resetar:", err);
                }

                // Switch mode
                chatState.mode = categoryId;
                localStorage.setItem('recomendai_active_category_id', categoryId);
                document.querySelectorAll('#sidebarCategoriesContainer .sidebar-item').forEach(el => {
                    el.classList.remove('active');
                });
                const item = document.getElementById(`btn-mode-${categoryId}`);
                if (item) item.classList.add('active');
            }

            // 1. Clear persistent storage
            if (supabaseClient && avalToReset) {
                try {
                    // Delete chat messages
                    const { error: err1 } = await supabaseClient
                        .from('mensagens_chat')
                        .delete()
                        .eq('avaliacao_id', avalToReset.id);
                    if (err1) console.error("Erro ao deletar mensagens:", err1);

                    // Delete evaluation criteria selections
                    const { error: err2 } = await supabaseClient
                        .from('avaliacao_criterios')
                        .delete()
                        .eq('avaliacao_id', avalToReset.id);
                    if (err2) console.error("Erro ao deletar critérios:", err2);

                    // Reset state_json to empty
                    const { error: err3 } = await supabaseClient
                        .from('avaliacoes')
                        .update({ state_json: {}, status: 'pendente' })
                        .eq('id', avalToReset.id);
                    if (err3) console.error("Erro ao atualizar avaliação:", err3);
                } catch (err) {
                    console.error("Erro ao limpar dados do banco:", err);
                }
            }

            // 2. Reload data from DB (which will now be clean/reset)
            clearChat();
            showRankingSkeleton();
            await loadInitialData();
        }
    });
}


const btnHasse = document.getElementById('btn-toggle-hasse');
btnHasse.onclick = () => {
    chatState.showHasse = !chatState.showHasse;
    const btnSpan = btnHasse.querySelector('span') || btnHasse;
    if (chatState.showHasse) {
        btnSpan.innerText = "Ver Lista";
    } else {
        btnSpan.innerText = "Ver Hasse";
    }
    updateLiveRanking();
};

const btnToggleRanking = document.getElementById('btn-toggle-ranking');
const inputToggleRanking = document.getElementById('input-toggle-ranking');
const btnCloseRanking = document.getElementById('btn-close-ranking');

function toggleRankingPane() {
    const layout = document.querySelector('.gemini-dashboard-layout') || document.querySelector('.dashboard-layout');
    if (!layout) return;
    
    const isShown = layout.classList.toggle('show-ranking');
    
    if (isShown) {
        updateLiveRanking();
    }
    
    const btnText = document.getElementById('toggle-ranking-text');
    const btnIcon = document.getElementById('toggle-ranking-icon');
    
    if (btnText && btnIcon) {
        if (isShown) {
            btnText.innerText = "Ocultar Ranking";
            btnIcon.innerText = "👁️";
        } else {
            btnText.innerText = "Ver Ranking";
            btnIcon.innerText = "📊";
        }
    }
    
    if (inputToggleRanking) {
        const spanText = inputToggleRanking.querySelector('span');
        if (isShown) {
            inputToggleRanking.classList.add('active');
            if (spanText) spanText.innerText = "Ocultar Ranking";
        } else {
            inputToggleRanking.classList.remove('active');
            if (spanText) spanText.innerText = "Ver Ranking";
        }
    }
    
    // Re-fit Vis.js network once layout animation completes
    if (chatState.showHasse && chatState.network) {
        setTimeout(() => {
            chatState.network.fit();
        }, 400);
    }
}

if (btnToggleRanking) {
    btnToggleRanking.onclick = toggleRankingPane;
}
if (inputToggleRanking) {
    inputToggleRanking.onclick = toggleRankingPane;
}
if (btnCloseRanking) {
    btnCloseRanking.onclick = () => {
        const layout = document.querySelector('.gemini-dashboard-layout') || document.querySelector('.dashboard-layout');
        if (layout && layout.classList.contains('show-ranking')) {
            toggleRankingPane();
        }
    };
}

// ==========================================
// DATA LOADING
// ==========================================

// Global categories store
let categories = [];

// --- Shared order key (same key used by admin.js) ---
const CATEGORY_ORDER_KEY = 'recomendai_categories_order';

/**
 * Reorders an array of category objects according to the order
 * saved in localStorage by the admin panel drag-and-drop.
 * Categories not present in the saved list are appended at the end.
 */
function applySavedCategoryOrder(cats) {
    try {
        const saved = JSON.parse(localStorage.getItem(CATEGORY_ORDER_KEY) || 'null');
        if (!saved || !Array.isArray(saved) || saved.length === 0) return cats;
        const orderMap = new Map(saved.map((id, idx) => [id, idx]));
        return [...cats].sort((a, b) => {
            const ia = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
            const ib = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
            return ia - ib;
        });
    } catch (e) {
        return cats;
    }
}

// Load categories from database and render sidebar
async function initSidebarCategories() {
    const container = document.getElementById('sidebarCategoriesContainer');
    if (!container) return;

    try {
        const { data: catData, error: catErr } = await supabaseClient
            .from('categorias')
            .select('*')
            .eq('ativo', true)
            .order('nome', { ascending: true });

        if (catErr) throw catErr;

        // Apply admin-panel drag-and-drop order (stored in localStorage)
        categories = applySavedCategoryOrder(catData || []);

        if (categories.length === 0) {
            container.innerHTML = '<div style="padding: 1rem; color: var(--gemini-text-secondary); font-size: 0.85rem;">Nenhuma categoria encontrada.</div>';
            return;
        }

        // Set default category mode if not set
        if (!chatState.mode || chatState.mode === 'celular' || chatState.mode === 'notebook') {
            const savedCatId = localStorage.getItem('recomendai_active_category_id');
            const hasSaved = savedCatId && categories.some(c => c.id === savedCatId);
            if (hasSaved) {
                chatState.mode = savedCatId;
            } else {
                const defaultCat = categories.find(c => c.nome.toLowerCase() === 'celular') || categories[0];
                chatState.mode = defaultCat.id; // Store current category UUID
            }
        }
        localStorage.setItem('recomendai_active_category_id', chatState.mode);

        container.innerHTML = '';
        categories.forEach(cat => {
            const isActive = chatState.mode === cat.id;
            
            // Build the Lucide icon element
            const iconName = cat.icone || 'box';
            const iconHtml = `<i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>`;

            const item = document.createElement('a');
            item.href = '#';
            item.className = `sidebar-item ${isActive ? 'active' : ''}`;
            item.id = `btn-mode-${cat.id}`;
            item.style.textDecoration = 'none';
            item.title = cat.nome;

            item.innerHTML = `
                ${iconHtml}
                <span class="sidebar-label">${cat.nome}</span>
                <button class="sidebar-reset-btn" id="btn-reset-${cat.id}" title="Reiniciar chat de ${cat.nome}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                </button>
            `;

            // Bind click to switch category mode
            item.addEventListener('click', async (e) => {
                e.preventDefault();
                if (e.target.closest('.sidebar-reset-btn')) return;

                if (chatState.mode === cat.id) return;

                chatState.mode = cat.id;
                localStorage.setItem('recomendai_active_category_id', cat.id);
                
                document.querySelectorAll('#sidebarCategoriesContainer .sidebar-item').forEach(el => {
                    el.classList.remove('active');
                });
                item.classList.add('active');

                clearChat();
                showRankingSkeleton();
                await loadInitialData();
            });

            // Bind click to reset button
            const resetBtn = item.querySelector(`.sidebar-reset-btn`);
            if (resetBtn) {
                resetBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    triggerResetChat(cat.id, cat.nome);
                });
            }

            container.appendChild(item);
        });

        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }

    } catch (e) {
        console.error("Erro ao carregar categorias na barra lateral:", e);
        container.innerHTML = '<div style="padding: 1rem; color: #ef4444; font-size: 0.85rem;">Erro ao carregar categorias.</div>';
    }
}


async function loadInitialData() {
    const loadingMode = chatState.mode;
    resetChatStateInMemory();
    
    showChatSkeleton();
    const chatLoading = document.getElementById('chat-loading');
    if (chatLoading) chatLoading.style.display = 'block';
    
    try {
        // Find current category details to set labels/icons
        if (categories && categories.length > 0) {
            chatState.currentCategory = categories.find(c => c.id === chatState.mode) || categories[0];
        }

        const urlParams = new URLSearchParams(window.location.search);
        const urlId = urlParams.get('id');
        const urlStep = urlParams.get('step');

        // LOTE 1 (Paralelo): Buscar critérios, alternativas e avaliação ativa
        const criteriaPromise = supabaseClient
            .from('criterios')
            .select('*')
            .eq('categoria_id', chatState.mode)
            .eq('ativo', true)
            .order('created_at', { ascending: true });

        const alternativesPromise = supabaseClient
            .from('alternativas')
            .select('*')
            .eq('categoria_id', chatState.mode);

        let activeAvalPromise;
        if (urlId) {
            activeAvalPromise = supabaseClient
                .from('avaliacoes')
                .select('*')
                .eq('id', urlId)
                .single();
        } else {
            activeAvalPromise = supabaseClient
                .from('avaliacoes')
                .select('*')
                .eq('user_id', chatState.userSession.user.id)
                .eq('categoria_id', chatState.mode)
                .order('created_at', { ascending: false });
        }

        const [critRes, altRes, avalRes] = await Promise.all([
            criteriaPromise,
            alternativesPromise,
            activeAvalPromise
        ]);

        if (chatState.mode !== loadingMode) return;

        if (critRes.error) throw critRes.error;
        if (altRes.error) throw altRes.error;

        chatState.criterios = critRes.data;
        const alternativesData = altRes.data;

        let activeAval = null;
        if (urlId) {
            if (!avalRes.error && avalRes.data) {
                activeAval = avalRes.data;
            } else {
                console.error("Erro ao carregar avaliação específica por ID:", avalRes.error);
            }
        } else {
            if (avalRes.error) throw avalRes.error;
            const avals = avalRes.data;
            if (avals && avals.length > 0) {
                activeAval = avals[0];
            }
        }

        // Caso não exista avaliação ativa para esta categoria, cria uma nova
        if (!activeAval) {
            const { data: newAval, error: createErr } = await supabaseClient
                .from('avaliacoes')
                .insert([{ user_id: chatState.userSession.user.id, categoria_id: chatState.mode }])
                .select()
                .single();
            
            if (chatState.mode !== loadingMode) return;
            if (createErr) throw createErr;
            activeAval = newAval;
        }

        chatState.activeAval = activeAval;

        // LOTE 2 (Paralelo): Buscar consequências, relações de critérios e histórico de chat
        const altIds = alternativesData.map(a => a.id);
        
        const specsPromise = altIds.length > 0
            ? supabaseClient
                .from('consequencias')
                .select('criterio_id, alternativa_id, valor, alternativas(modelo, marca)')
                .in('alternativa_id', altIds)
            : Promise.resolve({ data: [], error: null });

        const relsPromise = supabaseClient
            .from('avaliacao_criterios')
            .select('criterio_id, direcao_escolhida, valor_mediano')
            .eq('avaliacao_id', activeAval.id);

        const historyPromise = fetchChatHistory(activeAval.id, 20);

        const [specsRes, relsRes, initialMsgs] = await Promise.all([
            specsPromise,
            relsPromise,
            historyPromise
        ]);

        if (chatState.mode !== loadingMode) return;

        if (specsRes.error) throw specsRes.error;
        if (relsRes.error) throw relsRes.error;

        const specsData = specsRes.data || [];
        const preFetchedRels = relsRes.data || [];

        // Map specs to chatState format for compatibility
        chatState.specs = specsData.map(s => ({
            criterio_id: s.criterio_id,
            smartphone_id: s.alternativa_id,
            valor: s.valor,
            smartphones: {
                marca: s.alternativas.marca,
                modelo: s.alternativas.modelo
            }
        }));

        // Group into alternatives list
        const altMap = {};
        specsData.forEach(s => {
            if (!altMap[s.alternativa_id]) {
                altMap[s.alternativa_id] = {
                    id: s.alternativa_id,
                    nome: `${s.alternativas.marca} ${s.alternativas.modelo}`,
                    valores: {}
                };
            }
            altMap[s.alternativa_id].valores[s.criterio_id] = Number(s.valor);
        });
        chatState.alternativas = Object.values(altMap);

        // Restaurar estado da avaliação usando as relações pré-carregadas
        await restoreEvaluationState(preFetchedRels);

        if (chatState.mode !== loadingMode) return;

        // Override state if urlStep is provided
        if (urlStep) {
            if (urlStep === 'criteria') {
                chatState.currentState = 'CHOOSE_CRITERIA';
            } else if (urlStep === 'intracriteria') {
                chatState.currentState = 'INTRACRITERIA_ELICITATION';
                if (chatState.selectedCriteriaIds.length > 0 && chatState.intraCurrentIndex >= chatState.selectedCriteriaIds.length) {
                    chatState.intraCurrentIndex = 0;
                }
            } else if (urlStep === 'intercriteria') {
                chatState.currentState = 'INTERCRITERIA_SORTING';
            }
        }

        if (chatLoading) chatLoading.style.display = 'none';
        
        // Draw initial UI
        updateLiveRanking();
        
        // 1. Bind scroll listener for lazy loading history (evitando bind duplicado)
        if (!chatMessages.dataset.scrollBound) {
            chatMessages.addEventListener('scroll', async () => {
                if (chatMessages.scrollTop === 0 && chatState.hasMoreHistory && !chatState.isLoadingHistory) {
                    await loadMoreChatHistory();
                }
            });
            chatMessages.dataset.scrollBound = 'true';
        }
        
        chatState.hasMoreHistory = true;
        chatState.oldestLoadedTimestamp = null;
        chatState.isLoadingHistory = false;
        
        // 2. Render initial chat history
        if (initialMsgs && initialMsgs.length > 0) {
            chatState.oldestLoadedTimestamp = initialMsgs[initialMsgs.length - 1].created_at;
            if (initialMsgs.length < 20) {
                chatState.hasMoreHistory = false;
            }
            
            renderInitialHistory(initialMsgs);
            
            // Remove the last rendered bot message if it contains an interactive
            // widget (quick-replies, chat-interactive-card, etc.) — it was saved to
            // the DB and rendered from history, but it is disabled. We will
            // re-trigger the current state below to add a fresh interactive copy.
            removeLastInteractiveBotMessage();

            // Re-trigger current state under restoration mode
            chatState.isRestoring = true;
            if (chatState.currentState === 'WELCOME') {
                await startWelcome(false);
            } else if (chatState.currentState === 'CHOOSE_CRITERIA') {
                await startChooseCriteria();
            } else if (chatState.currentState === 'INTRACRITERIA_ELICITATION') {
                if (chatState.selectedCriteriaIds.length === 0) {
                    addMessage('bot', "⚠️ **Atenção:** Você precisa selecionar seus critérios antes de ajustar as exigências.");
                    await startWelcome(false);
                } else {
                    askIntracriteriaQuestion();
                }
            } else if (chatState.currentState === 'INTERCRITERIA_SORTING') {
                if (chatState.selectedCriteriaIds.length < 2) {
                    addMessage('bot', "⚠️ **Atenção:** Você precisa selecionar pelo menos **2 critérios** para estabelecer prioridades.");
                    await startWelcome(false);
                } else {
                    // Initialize sorting state if not loaded
                    if (!chatState.sortArray || chatState.sortArray.length === 0) {
                        chatState.sortArray = chatState.selectedCriteriaIds.map(id => chatState.criterios.find(c => c.id === id));
                        chatState.sortArray.forEach(c => delete c.tieWith);
                        chatState.sortI = 1;
                        chatState.sortJ = 0;
                        chatState.sortCurrentItem = chatState.sortArray[1];
                        chatState.ties = {};
                    }
                    runSortingStep();
                }
            } else if (chatState.currentState === 'INTERCRITERIA_TRADEOFFS') {
                askTradeoffQuestion();
            }
            
            setTimeout(checkHistoryFill, 200);
        } else {
            // Override state if urlStep is provided
            if (urlStep) {
                if (urlStep === 'criteria') {
                    chatState.currentState = 'CHOOSE_CRITERIA';
                } else if (urlStep === 'intracriteria') {
                    chatState.currentState = 'INTRACRITERIA_ELICITATION';
                    if (chatState.selectedCriteriaIds.length > 0 && chatState.intraCurrentIndex >= chatState.selectedCriteriaIds.length) {
                        chatState.intraCurrentIndex = 0;
                    }
                } else if (urlStep === 'intercriteria') {
                    chatState.currentState = 'INTERCRITERIA_SORTING';
                }
            } else {
                chatState.currentState = 'WELCOME';
            }
            chatState.hasMoreHistory = false;
            
            if (chatState.currentState === 'WELCOME') {
                await startWelcome(true);
            } else if (chatState.currentState === 'CHOOSE_CRITERIA') {
                clearChat();
                await startChooseCriteria();
            } else if (chatState.currentState === 'INTRACRITERIA_ELICITATION') {
                clearChat();
                if (chatState.selectedCriteriaIds.length === 0) {
                    addMessage('bot', "⚠️ **Atenção:** Você precisa selecionar seus critérios antes de ajustar as exigências.");
                    await startWelcome(true);
                } else {
                    askIntracriteriaQuestion();
                }
            } else if (chatState.currentState === 'INTERCRITERIA_SORTING') {
                clearChat();
                if (chatState.selectedCriteriaIds.length < 2) {
                    addMessage('bot', "⚠️ **Atenção:** Você precisa selecionar pelo menos **2 critérios** para estabelecer prioridades.");
                    await startWelcome(true);
                } else {
                    chatState.sortArray = chatState.selectedCriteriaIds.map(id => chatState.criterios.find(c => c.id === id));
                    chatState.sortArray.forEach(c => delete c.tieWith);
                    chatState.sortI = 1;
                    chatState.sortJ = 0;
                    chatState.sortCurrentItem = chatState.sortArray[1];
                    chatState.ties = {};
                    runSortingStep();
                }
            }
        }
    } catch (err) {
        if (chatState.mode !== loadingMode) return;
        console.error("Erro ao carregar dados:", err);
        chatMessages.innerHTML = `<div style="color: #ef4444; text-align: center;">Erro ao conectar com o banco de dados.</div>`;
    }
}

async function restoreEvaluationState(preFetchedRels = null) {
    if (!chatState.activeAval) return;
    
    let rels = [];
    if (preFetchedRels) {
        rels = preFetchedRels;
    } else {
        // Load relations
        const { data, error } = await supabaseClient
            .from('avaliacao_criterios')
            .select('criterio_id, direcao_escolhida, valor_mediano')
            .eq('avaliacao_id', chatState.activeAval.id);
        if (error) {
            console.error("Erro ao buscar avaliacao_criterios:", error);
        }
        rels = data || [];
    }
        
    chatState.selectedCriteriaIds = rels.map(r => r.criterio_id);
    
    // Restore states
    const savedState = chatState.activeAval.state_json || {};
    const savedIntracriterio = savedState.intracriterio || {};
    
    // Initialize intracriterio and specs bounds
    chatState.criterios.forEach(crit => {
        const rel = rels ? rels.find(r => r.criterio_id === crit.id) : null;
        const c_specs = chatState.specs.filter(s => s.criterio_id === crit.id).map(s => Number(s.valor));
        let minReal = 0, maxReal = 100;
        if (c_specs.length > 0) {
            minReal = Math.min(...c_specs);
            maxReal = Math.max(...c_specs);
        }
        if (minReal === maxReal) {
            minReal *= 0.5; maxReal *= 1.5;
        }
        
        const rangeDiff = Math.abs(maxReal - minReal);
        let step = 1;
        if (rangeDiff < 10) step = 0.1;
        if (rangeDiff > 1000) step = 10;

        const direction = rel ? rel.direcao_escolhida : crit.direcao_padrao;
        const isMax = direction === 'max';
        const saved = savedIntracriterio[crit.id] || {};
        
        chatState.intraCritState[crit.id] = {
            id: crit.id,
            nome: crit.nome,
            direcao: direction,
            minReal: minReal,
            maxReal: maxReal,
            step: step,
            v50: rel && rel.valor_mediano !== null ? Number(rel.valor_mediano) : null,
            search_w: saved.search_w !== undefined ? saved.search_w : (isMax ? minReal : maxReal),
            search_b: saved.search_b !== undefined ? saved.search_b : (isMax ? maxReal : minReal),
            isLinear: !!saved.isLinear
        };
    });
    
    // Restore priority states
    chatState.orderedCriteriaIds = savedState.orderedCriteriaIds || [];
    chatState.weightConstraints = savedState.weightConstraints || [];
    chatState.currentQuestionRank = savedState.currentQuestionRank || 0;
    chatState.currentBounds = savedState.currentBounds || [0, 1];
    chatState.heuristicDone = !!savedState.heuristicDone;
    chatState.ties = savedState.ties || {};
    
    // Restore chat flow states
    chatState.currentState = savedState.currentState || 'WELCOME';
    chatState.intraCurrentIndex = savedState.intraCurrentIndex || 0;
}

// ==========================================
// CHAT RENDERING FUNCTIONS
// ==========================================

function deactivateLastBotMessageOptions() {
    const botMessages = document.querySelectorAll('.message.bot');
    if (botMessages.length === 0) return;
    const lastBotMsg = botMessages[botMessages.length - 1];
    
    // ── STEP 1: Sync DOM properties → HTML attributes before serialization ──
    // When a user checks/unchecks a checkbox via JS/click, only the .checked
    // PROPERTY is updated. The `checked` HTML ATTRIBUTE (used by outerHTML)
    // is NOT updated automatically. We must sync them before taking the snapshot.
    lastBotMsg.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb.checked) {
            cb.setAttribute('checked', '');
        } else {
            cb.removeAttribute('checked');
        }
    });
    // Sync value attribute for hidden/text inputs (e.g. direction dropdowns)
    lastBotMsg.querySelectorAll('input[type="hidden"], input[type="text"]').forEach(inp => {
        inp.setAttribute('value', inp.value);
    });
    // Sync selected attribute for <select> elements
    lastBotMsg.querySelectorAll('select').forEach(sel => {
        Array.from(sel.options).forEach(opt => {
            if (opt.selected) opt.setAttribute('selected', '');
            else opt.removeAttribute('selected');
        });
    });

    // ── STEP 2: Visually disable interactive controls ──
    lastBotMsg.querySelectorAll('button, input, select, textarea').forEach(el => {
        el.disabled = true;
        el.removeAttribute('onclick');
        el.style.pointerEvents = 'none';
        // Dim control elements (buttons, inputs) but not their container rows
        if (el.tagName === 'BUTTON' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
            el.style.opacity = '0.5';
        }
    });
    
    // Disable clickable card/reply elements
    lastBotMsg.querySelectorAll('.gemini-welcome-card, .quick-reply-btn, .badge-dropdown, .badge-option').forEach(el => {
        el.removeAttribute('onclick');
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.5';
    });

    // Criteria rows: keep text fully readable, only block pointer events so
    // the user can still see which criteria were selected (checked vs unchecked)
    lastBotMsg.querySelectorAll('.criteria-row-item').forEach(el => {
        el.removeAttribute('onclick');
        el.style.pointerEvents = 'none';
        // Do NOT reduce opacity — checkbox checked state should remain visible
    });

    // Labels: reset pointer cursor so it doesn’t show the hand on disabled messages
    lastBotMsg.querySelectorAll('label').forEach(el => {
        el.style.cursor = 'default';
        el.style.pointerEvents = 'none';
    });
    
    // ── STEP 3: Persist the updated (disabled) HTML to the database ──
    if (supabaseClient) {
        const updateDb = () => {
            const msgId = lastBotMsg.dataset.messageId;
            if (msgId) {
                const richContainer = lastBotMsg.querySelector('.quick-replies, .gemini-welcome-container, .chat-interactive-card');
                if (richContainer) {
                    const origText = richContainer.dataset.originalText || lastBotMsg.querySelector('.message-bubble').innerText;
                    const updatedHtml = richContainer.outerHTML;
                    
                    supabaseClient
                        .from('mensagens_chat')
                        .update({
                            text: JSON.stringify({
                                isRich: true,
                                text: origText,
                                html: updatedHtml
                            })
                        })
                        .eq('id', msgId)
                        .then(({ error }) => {
                            if (error) console.error("Erro ao atualizar mensagem desativada:", error);
                        });
                }
            } else {
                // msgId not yet assigned (Supabase insert still in-flight) — retry
                if (!lastBotMsg.dataset.deactivateRetryCount) {
                    lastBotMsg.dataset.deactivateRetryCount = 0;
                }
                const retries = Number(lastBotMsg.dataset.deactivateRetryCount);
                if (retries < 30) {
                    lastBotMsg.dataset.deactivateRetryCount = retries + 1;
                    setTimeout(updateDb, 100);
                }
            }
        };
        updateDb();
    }
}



function addMessage(sender, text, customElement = null, skipDb = false) {
    if (sender === 'user') {
        chatState.isRestoring = false; // Exit restoring mode on user input
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user';
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.innerHTML = text;
        
        messageDiv.appendChild(bubbleDiv);
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        const now = new Date();
        timeSpan.innerText = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        messageDiv.appendChild(timeSpan);
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (!skipDb && !chatState.isRestoring) {
            saveMessageToSupabase('user', text).then(msg => {
                if (msg) messageDiv.dataset.messageId = msg.id;
            });
        }
    } else {
        if (customElement) {
            customElement.dataset.originalText = text;
        }
        
        let payloadText = text;
        if (customElement) {
            payloadText = JSON.stringify({
                isRich: true,
                text: text,
                html: customElement.outerHTML
            });
        }

        botQueue.push({ text, customElement, dbPayloadText: payloadText, skipDb });
        processBotQueue();
    }
}

function processBotQueue() {
    if (isTyping || botQueue.length === 0) return;
    
    isTyping = true;
    const { text, customElement, dbPayloadText, skipDb } = botQueue.shift();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot';
    
    const innerDiv = document.createElement('div');
    innerDiv.className = 'message-inner';
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = '<img src="patinho-atendente1.png" alt="Recomendator" style="width: 100%; height: 100%; object-fit: cover;">';
    
    const contentBlock = document.createElement('div');
    contentBlock.className = 'message-content-block';
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';

    // During state restoration (page reload), skip the typing animation entirely
    const isRestoring = chatState.isRestoring;

    if (isRestoring) {
        // Render immediately — message already existed before reload
        bubbleDiv.innerHTML = text;
        contentBlock.appendChild(bubbleDiv);
        if (customElement) {
            contentBlock.appendChild(customElement);
        }
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        const now = new Date();
        timeSpan.innerText = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        contentBlock.appendChild(timeSpan);
        innerDiv.appendChild(avatarDiv);
        innerDiv.appendChild(contentBlock);
        messageDiv.appendChild(innerDiv);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        isTyping = false;
        processBotQueue();
    } else {
        bubbleDiv.innerHTML = `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        contentBlock.appendChild(bubbleDiv);
        innerDiv.appendChild(avatarDiv);
        innerDiv.appendChild(contentBlock);
        messageDiv.appendChild(innerDiv);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Typing delay proportional to text length (1000ms - 3000ms)
        const delay = Math.min(3000, Math.max(1000, text.length * 15));
        
        setTimeout(() => {
            bubbleDiv.innerHTML = text;
            
            if (customElement) {
                contentBlock.appendChild(customElement);
            }
            
            const timeSpan = document.createElement('span');
            timeSpan.className = 'message-time';
            const now = new Date();
            timeSpan.innerText = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            contentBlock.appendChild(timeSpan);
            
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            isTyping = false;
            
            if (!skipDb && !chatState.isRestoring) {
                saveMessageToSupabase('bot', dbPayloadText).then(msg => {
                    if (msg) {
                        messageDiv.dataset.messageId = msg.id;
                        if (customElement) {
                            customElement.dataset.messageId = msg.id;
                        }
                    }
                });
            }
            
            processBotQueue();
        }, delay);
    }
}

/**
 * Removes the last bot message from the chat DOM if it contains
 * an interactive widget (quick-replies, chat-interactive-card, etc.).
 * Called during state restoration so we don't duplicate the widget
 * that was already saved to the DB and re-rendered from history.
 */
function removeLastInteractiveBotMessage() {
    const allBotMsgs = chatMessages.querySelectorAll('.message.bot');
    if (allBotMsgs.length === 0) return;
    const lastBot = allBotMsgs[allBotMsgs.length - 1];
    if (lastBot.querySelector('.quick-replies, .chat-interactive-card, .gemini-welcome-container')) {
        lastBot.remove();
    }
}

function clearChat() {
    chatMessages.innerHTML = '';
    botQueue = [];
    isTyping = false;
}

function resetChatStateInMemory() {
    chatState.activeAval = null;
    chatState.currentCategory = null;
    chatState.criterios = [];
    chatState.specs = [];
    chatState.alternativas = [];
    chatState.currentState = 'WELCOME';
    chatState.selectedCriteriaIds = [];
    chatState.intraCurrentIndex = 0;
    chatState.intraCritState = {};
    chatState.sortArray = [];
    chatState.sortI = 1;
    chatState.sortJ = 0;
    chatState.sortCurrentItem = null;
    chatState.weightConstraints = [];
    chatState.currentQuestionRank = 0;
    chatState.currentBounds = [0, 1];
    chatState.heuristicDone = false;
    chatState.ties = {};
    chatState.orderedCriteriaIds = [];
    chatState.showHasse = false;
    chatState.hasseLevels = [];
    chatState.dominanceMatrix = [];
    if (chatState.network) {
        try {
            chatState.network.destroy();
        } catch (e) {}
        chatState.network = null;
    }
    chatState.oldestLoadedTimestamp = null;
    chatState.hasMoreHistory = true;
    chatState.isLoadingHistory = false;
    chatState.isRestoring = false;
    
    botQueue = [];
    isTyping = false;
}

// ==========================================
// CHAT HISTORY & LAZY LOADING HELPERS
// ==========================================
async function fetchChatHistory(avaliacaoId, limit = 20, beforeTimestamp = null) {
    if (!supabaseClient) return [];
    
    let query = supabaseClient
        .from('mensagens_chat')
        .select('*')
        .eq('avaliacao_id', avaliacaoId);
    
    if (beforeTimestamp) {
        query = query.lt('created_at', beforeTimestamp);
    }
    
    const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit);
        
    if (error) {
        console.error("Erro ao carregar histórico do chat:", error);
        return [];
    }
    return data;
}

function createMessageElement(sender, text, createdAt, msgId = null) {
    const timeString = new Date(createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    if (sender === 'user') {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user';
        if (msgId) messageDiv.dataset.messageId = msgId;
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.innerHTML = text;
        messageDiv.appendChild(bubbleDiv);
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.innerText = timeString;
        messageDiv.appendChild(timeSpan);
        
        return messageDiv;
    } else {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot';
        if (msgId) messageDiv.dataset.messageId = msgId;
        
        const innerDiv = document.createElement('div');
        innerDiv.className = 'message-inner';
        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'message-avatar';
        avatarDiv.innerHTML = '<img src="patinho-atendente1.png" alt="Recomendator" style="width: 100%; height: 100%; object-fit: cover;">';
        
        const contentBlock = document.createElement('div');
        contentBlock.className = 'message-content-block';
        
        let msgText = text;
        let msgHtml = null;
        try {
            if (text.startsWith('{')) {
                const parsed = JSON.parse(text);
                msgText = parsed.text;
                msgHtml = parsed.html;
            }
        } catch (e) {}
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.innerHTML = msgText;
        contentBlock.appendChild(bubbleDiv);
        
        if (msgHtml) {
            const richDiv = document.createElement('div');
            richDiv.className = 'rich-message-content';
            richDiv.innerHTML = msgHtml;
            contentBlock.appendChild(richDiv);
            
            const containerEl = richDiv.firstElementChild;
            if (containerEl && msgId) {
                containerEl.dataset.messageId = msgId;
            }
            
            // Disable all interactive elements in restored (historical) messages
            richDiv.querySelectorAll('button, input, select, textarea').forEach(el => {
                el.disabled = true;
                el.removeAttribute('onclick');
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.6';
            });
            richDiv.querySelectorAll('.gemini-welcome-card, .quick-reply-btn, .badge-dropdown, .badge-option, .criteria-row-item').forEach(el => {
                el.removeAttribute('onclick');
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.6';
            });
            // Labels: reset pointer cursor in historical/disabled messages
            richDiv.querySelectorAll('label').forEach(el => {
                el.style.cursor = 'default';
                el.style.pointerEvents = 'none';
            });
        }
        
        innerDiv.appendChild(avatarDiv);
        innerDiv.appendChild(contentBlock);
        messageDiv.appendChild(innerDiv);
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.innerText = timeString;
        contentBlock.appendChild(timeSpan);
        
        return messageDiv;
    }
}

function renderInitialHistory(messages) {
    chatMessages.innerHTML = '';
    const tempFragment = document.createDocumentFragment();
    // Render oldest to newest
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const msgEl = createMessageElement(msg.sender, msg.text, msg.created_at, msg.id);
        tempFragment.appendChild(msgEl);
    }
    chatMessages.appendChild(tempFragment);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadMoreChatHistory() {
    if (!chatState.activeAval || !chatState.hasMoreHistory || chatState.isLoadingHistory) return;
    
    chatState.isLoadingHistory = true;
    
    const loader = document.createElement('div');
    loader.id = 'history-loader';
    loader.style.textAlign = 'center';
    loader.style.padding = '0.5rem';
    loader.style.color = 'var(--text-secondary)';
    loader.style.fontSize = '0.85rem';
    loader.innerText = 'Carregando mensagens anteriores...';
    chatMessages.prepend(loader);
    
    const msgs = await fetchChatHistory(chatState.activeAval.id, 20, chatState.oldestLoadedTimestamp);
    
    const loaderEl = document.getElementById('history-loader');
    if (loaderEl) loaderEl.remove();
    
    if (msgs.length < 20) {
        chatState.hasMoreHistory = false;
    }
    
    if (msgs.length > 0) {
        chatState.oldestLoadedTimestamp = msgs[msgs.length - 1].created_at;
        
        const oldScrollHeight = chatMessages.scrollHeight;
        
        const tempFragment = document.createDocumentFragment();
        for (let i = msgs.length - 1; i >= 0; i--) {
            const msg = msgs[i];
            const msgEl = createMessageElement(msg.sender, msg.text, msg.created_at, msg.id);
            tempFragment.appendChild(msgEl);
        }
        
        const originalScrollBehavior = chatMessages.style.scrollBehavior;
        chatMessages.style.scrollBehavior = 'auto';
        
        chatMessages.prepend(tempFragment);
        chatMessages.scrollTop = chatMessages.scrollHeight - oldScrollHeight;
        
        setTimeout(() => {
            chatMessages.style.scrollBehavior = originalScrollBehavior;
        }, 50);
    }
    
    chatState.isLoadingHistory = false;
}

async function checkHistoryFill() {
    if (chatState.hasMoreHistory && chatMessages.scrollHeight <= chatMessages.clientHeight && !chatState.isLoadingHistory) {
        await loadMoreChatHistory();
        setTimeout(checkHistoryFill, 100);
    }
}

// ==========================================
// STEP COMPLETION DETECTION
// ==========================================
function getStepsCompletion() {
    // Step 1: criteria have been chosen and saved
    const step1Done = chatState.selectedCriteriaIds.length > 0;

    // Step 2: every selected criterion has v50 set (bisection done) or isLinear flag
    let step2Done = false;
    if (step1Done) {
        step2Done = chatState.selectedCriteriaIds.every(cId => {
            const cs = chatState.intraCritState[cId];
            return cs && (cs.v50 !== null && cs.v50 !== undefined || cs.isLinear === true);
        });
    }

    // Step 3: evaluation was marked complete by finishTradeoffs()
    const step3Done = !!(chatState.activeAval && chatState.activeAval.status === 'concluido');

    return { step1Done, step2Done, step3Done };
}

// ==========================================
// STATE: WELCOME (MAIN MENU)
// ==========================================
async function startWelcome(clear = false) {
    if (clear) {
        clearChat();
    }
    
    chatState.currentState = 'WELCOME';
    await saveEvaluationState();
    
    const catName = chatState.currentCategory ? chatState.currentCategory.nome : 'produto';
    const devicePlural = catName.toLowerCase() + 's';
    let welcomeIcon = '📦';
    const catNameLower = catName.toLowerCase();
    if (catNameLower.includes('celular') || catNameLower.includes('telefone')) {
        welcomeIcon = '📱';
    } else if (catNameLower.includes('notebook') || catNameLower.includes('laptop') || catNameLower.includes('computador')) {
        welcomeIcon = '💻';
    } else if (catNameLower.includes('tv') || catNameLower.includes('televisão')) {
        welcomeIcon = '📺';
    } else if (catNameLower.includes('videogame') || catNameLower.includes('game') || catNameLower.includes('console')) {
        welcomeIcon = '🎮';
    }
    
    // In Gemini mode, if starting empty, display a beautiful dashboard greeting.
    // Otherwise, append welcome message bubbles normally.
    const messageCount = chatMessages.querySelectorAll('.message').length;
    const { step1Done, step2Done, step3Done } = getStepsCompletion();
    
    if (messageCount === 0) {
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'gemini-welcome-container';
        welcomeDiv.innerHTML = `
            <h1 class="gemini-welcome-title">Vamos encontrar o ideal?</h1>
            <p class="gemini-welcome-subtitle">Olá! Sou o assistente inteligente do Recomendator 🦆. Estou aqui para te ajudar a escolher o melhor **${catName.toLowerCase()}** de forma simples, justa e totalmente personalizada. Por onde começamos?</p>
            <div class="gemini-welcome-cards">
                <div class="gemini-welcome-card ${step1Done ? 'step-done' : ''}" onclick="selectMenuOption(1)">
                    <div class="card-icon">${welcomeIcon}</div>
                    <div>
                        <div class="card-title">1 - O que você valoriza?</div>
                        <div class="card-desc">Escolha as características que você considera importantes (ex: Preço, Bateria, Tela).</div>
                        ${step1Done ? '<div class="step-done-badge">Concluído</div>' : ''}
                    </div>
                </div>
                <div class="gemini-welcome-card ${step2Done ? 'step-done' : ''}" onclick="selectMenuOption(2)">
                    <div class="card-icon">🎯</div>
                    <div>
                        <div class="card-title">2 - Definir seus limites</div>
                        <div class="card-desc">Diga qual o limite aceitável para você (ex: preço máximo ou bateria mínima).</div>
                        ${step2Done ? '<div class="step-done-badge">Concluído</div>' : ''}
                    </div>
                </div>
                <div class="gemini-welcome-card ${step3Done ? 'step-done' : ''}" onclick="selectMenuOption(3)">
                    <div class="card-icon">⚖️</div>
                    <div>
                        <div class="card-title">3 - Comparar e decidir</div>
                        <div class="card-desc">Responda a comparações simples para gerarmos o seu ranking ideal!</div>
                        ${step3Done ? '<div class="step-done-badge">Concluído</div>' : ''}
                    </div>
                </div>
            </div>
        `;
        chatMessages.appendChild(welcomeDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
        const menuEl = document.createElement('div');
        menuEl.className = 'quick-replies';
        menuEl.innerHTML = `
            <button class="quick-reply-btn ${step1Done ? 'step-done' : ''}" onclick="selectMenuOption(1)">
                <span>${welcomeIcon}</span> 1 - O que você valoriza?
            </button>
            <button class="quick-reply-btn ${step2Done ? 'step-done' : ''}" onclick="selectMenuOption(2)">
                <span>🎯</span> 2 - Definir seus limites
            </button>
            <button class="quick-reply-btn ${step3Done ? 'step-done' : ''}" onclick="selectMenuOption(3)">
                <span>⚖️</span> 3 - Comparar e decidir
            </button>
        `;
        addMessage('bot', `Olá! Sou seu assistente de escolha de **${devicePlural}**. Por onde gostaria de começar hoje?`, menuEl);
    }
}

window.selectMenuOption = async (optionNum) => {
    deactivateLastBotMessageOptions();
    let optionText = "";
    if (optionNum === 1) optionText = "1 - Escolher o que valorizo";
    else if (optionNum === 2) optionText = "2 - Definir meus limites";
    else if (optionNum === 3) optionText = "3 - Comparar e decidir";
    
    addMessage('user', optionText);
    
    if (optionNum === 1) {
        startChooseCriteria();
    } else if (optionNum === 2) {
        startIntracriteria();
    } else if (optionNum === 3) {
        startIntercriteria();
    }
};

// ==========================================
// STATE: OPTION 1 - CHOOSE CRITERIA
// ==========================================
async function startChooseCriteria() {
    chatState.currentState = 'CHOOSE_CRITERIA';
    await saveEvaluationState();
    
    const container = document.createElement('div');
    container.className = 'chat-interactive-card';
    
    // Select all check box
    const headerSelect = document.createElement('div');
    headerSelect.style.marginBottom = '0.75rem';
    headerSelect.innerHTML = `
        <label style="display: flex; align-items: center; cursor: pointer; font-weight: 600; font-size: 0.85rem; padding: 0.4rem 0.8rem; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 8px;">
            <input type="checkbox" id="chatSelectAll" style="margin-right: 0.5rem; accent-color: var(--primary-color);">
            Selecionar Todos os Critérios
        </label>
    `;
    container.appendChild(headerSelect);
    
    const grid = document.createElement('div');
    grid.className = 'criteria-minimal-list';
    
    chatState.criterios.forEach(crit => {
        const isChecked = chatState.selectedCriteriaIds.includes(crit.id);
        const currentDirection = chatState.intraCritState[crit.id]?.direcao || crit.direcao_padrao;
        
        const badgeClass = currentDirection === 'max' ? 'badge-max' : 'badge-min';
        const badgeText = currentDirection === 'max' ? 'Aumentar ↑' : 'Diminuir ↓';
        const oppValue = currentDirection === 'max' ? 'min' : 'max';
        const oppText = currentDirection === 'max' ? 'Diminuir ↓' : 'Aumentar ↑';
        
        const dropdownOptions = crit.direcao_editavel ? `
            <div class="badge-dropdown-options">
                <div class="badge-option" data-value="${currentDirection}">${badgeText}</div>
                <div class="badge-option" data-value="${oppValue}">${oppText}</div>
            </div>
        ` : '';

        const tooltipHtml = `
            <div class="tooltip-container">
                <span class="help-icon">?</span>
                <div class="tooltip-text">
                    ${crit.tooltip_min ? `<strong>Diminuir:</strong> ${crit.tooltip_min}<br>` : ''}
                    ${crit.tooltip_max ? `<strong>Aumentar:</strong> ${crit.tooltip_max}` : ''}
                </div>
            </div>
        `;

        const card = document.createElement('div');
        card.className = 'criteria-row-item';
        if (isChecked) card.classList.add('selected');
        
        card.innerHTML = `
            <label>
                <input type="checkbox" name="chat_criterio" value="${crit.id}" ${isChecked ? 'checked' : ''}>
                <span>${crit.nome}</span>
            </label>
            <div class="criteria-body">
                <div class="badge-dropdown ${badgeClass} ${!crit.direcao_editavel ? 'readonly' : ''}" tabindex="0">
                    <div class="badge-dropdown-selected">${badgeText}</div>
                    ${dropdownOptions}
                    <input type="hidden" name="chat_direcao_${crit.id}" value="${currentDirection}">
                </div>
                ${tooltipHtml}
            </div>
        `;
        
        grid.appendChild(card);
    });
    
    container.appendChild(grid);
    
    // Confirm and Cancel buttons
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '0.5rem';
    actions.innerHTML = `
        <button class="btn btn-primary btn-compact" style="flex: 1;" onclick="confirmCriteriaSelection()">Confirmar Seleção</button>
        <button class="btn btn-secondary btn-compact" style="flex: 1; border-color:#ef4444; color:#ef4444;" onclick="cancelCriteriaSelection()">Cancelar</button>
    `;
    container.appendChild(actions);
    
    const deviceNameSingular = chatState.currentCategory ? chatState.currentCategory.nome.toLowerCase() : 'produto';
    addMessage('bot', `Selecione abaixo as características do seu **${deviceNameSingular}** que fazem a diferença no seu dia a dia. Você pode selecionar quantas quiser e clicar em **Confirmar Seleção** quando estiver pronto! 👇`, container);
    
    // Bind checkbox events to toggle selection class
    container.querySelectorAll('input[name="chat_criterio"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const card = cb.closest('.criteria-row-item');
            if (e.target.checked) card.classList.add('selected');
            else card.classList.remove('selected');
            
            // Check SelectAll status
            const allChecked = Array.from(container.querySelectorAll('input[name="chat_criterio"]')).every(c => c.checked);
            container.querySelector('#chatSelectAll').checked = allChecked;
        });
    });
    
    // Bind select all behavior
    container.querySelector('#chatSelectAll').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        container.querySelectorAll('input[name="chat_criterio"]').forEach(cb => {
            cb.checked = isChecked;
            const card = cb.closest('.criteria-row-item');
            if (isChecked) card.classList.add('selected');
            else card.classList.remove('selected');
        });
    });
    
    // Bind directions badge click behavior
    container.querySelectorAll('.badge-dropdown:not(.readonly)').forEach(dd => {
        dd.onclick = (e) => {
            dd.classList.toggle('open');
            e.stopPropagation();
        };
        dd.querySelectorAll('.badge-option').forEach(opt => {
            opt.onclick = (e) => {
                const val = opt.dataset.value;
                const text = opt.innerText;
                const hiddenInput = dd.querySelector('input[type="hidden"]');
                hiddenInput.value = val;
                dd.querySelector('.badge-dropdown-selected').innerText = text;
                
                if (val === 'max') {
                    dd.classList.remove('badge-min');
                    dd.classList.add('badge-max');
                } else {
                    dd.classList.remove('badge-max');
                    dd.classList.add('badge-min');
                }
                dd.classList.remove('open');
                e.stopPropagation();
            };
        });
    });
    
    // Close dropdown on click outside
    document.addEventListener('click', () => {
        container.querySelectorAll('.badge-dropdown.open').forEach(dd => dd.classList.remove('open'));
    });
}

window.cancelCriteriaSelection = () => {
    deactivateLastBotMessageOptions();
    addMessage('user', "Cancelar");
    startWelcome();
};

window.confirmCriteriaSelection = async () => {
    const containers = document.querySelectorAll('.chat-interactive-card');
    if (containers.length === 0) return;
    const container = containers[containers.length - 1];
    
    let checked = Array.from(container.querySelectorAll('input[name="chat_criterio"]:checked')).map(cb => cb.value);
    
    deactivateLastBotMessageOptions();

    // Se nenhum critério for selecionado, todos os critérios ativos serão considerados!
    if (checked.length === 0) {
        checked = chatState.criterios.map(c => c.id);
        addMessage('bot', "Como você não selecionou nenhum critério, para te dar a melhor ajuda possível, selecionei **todas** as características disponíveis para análise! 😉");
    }
    
    addMessage('user', `Confirmar seleção (${checked.length} critérios)`);
    
    // Save to Database / localStorage
    try {
        // 1. Delete old criteria relations
        await supabaseClient
            .from('avaliacao_criterios')
            .delete()
            .eq('avaliacao_id', chatState.activeAval.id);
            
        // 2. Insert new relations
        const insertData = checked.map(cId => {
            const dirInput = container.querySelector(`input[name="chat_direcao_${cId}"]`);
            const direction = dirInput ? dirInput.value : chatState.criterios.find(c => c.id === cId).direcao_padrao;
            return {
                avaliacao_id: chatState.activeAval.id,
                criterio_id: cId,
                direcao_escolhida: direction
            };
        });
        
        const { error } = await supabaseClient
            .from('avaliacao_criterios')
            .insert(insertData);
        if (error) throw error;
        
        // Reset local scale constants state
        const resetStateJson = {
            intracriterio: {}, // Keeps blank or can inherit
            orderedCriteriaIds: [],
            weightConstraints: [],
            currentQuestionRank: 0,
            currentBounds: [0, 1],
            heuristicDone: false,
            ties: {}
        };
        await supabaseClient
            .from('avaliacoes')
            .update({ state_json: resetStateJson, status: 'pendente' })
            .eq('id', chatState.activeAval.id);
            
        if (chatState.activeAval) {
            chatState.activeAval.state_json = resetStateJson;
            chatState.activeAval.status = 'pendente';
        }
            
        // Refresh local memory and live ranking
        await restoreEvaluationState();
        updateLiveRanking();
        
        addMessage('bot', "✨ **Características salvas com sucesso!** Você deu o primeiro passo importante. Como deseja continuar agora?");
        startWelcome();
        
    } catch (e) {
        console.error("Erro ao salvar critérios:", e);
        addMessage('bot', "Erro ao salvar os critérios. Tente novamente.");
        startChooseCriteria();
    }
};

// ==========================================
// STATE: OPTION 2 - ADJUST REQUIREMENTS (INTRACRITERIA)
// ==========================================
async function startIntracriteria() {
    if (chatState.selectedCriteriaIds.length === 0) {
        addMessage('bot', "⚠️ **Opa!** Antes de definir os limites, precisamos saber quais características importam para você. Clique em **1 - O que você valoriza?** primeiro! ☝️");
        startWelcome();
        return;
    }
    
    chatState.currentState = 'INTRACRITERIA_ELICITATION';
    chatState.intraCurrentIndex = 0;
    await saveEvaluationState();
    
    addMessage('bot', "🔍 **Vamos calibrar suas preferências!** Vou fazer algumas perguntas rápidas para entender o quanto cada característica vale para você. É bem simples!");
    askIntracriteriaQuestion();
}

function formatCritValue(val, critId) {
    const crit = chatState.criterios.find(c => c.id === critId);
    if (!crit) return Number(val).toFixed(0);
    
    const critNameLower = crit.nome.toLowerCase();
    let prefix = "";
    let suffix = "";
    if (critNameLower.includes("preço") || critNameLower.includes("preco") || critNameLower.includes("r$")) {
        prefix = "R$ ";
    } else if (critNameLower.includes("bateria") || critNameLower.includes("mah") || critNameLower.includes("autonomia")) {
        if (Number(val) < 50) {
            suffix = " h";
        } else {
            suffix = " mAh";
        }
    } else if (critNameLower.includes("memória") || critNameLower.includes("memoria") || critNameLower.includes("armazenamento") || critNameLower.includes("ram") || critNameLower.includes("rom") || critNameLower.includes("gb") || critNameLower.includes("ssd")) {
        suffix = " GB";
    } else if (critNameLower.includes("câmera") || critNameLower.includes("camera") || critNameLower.includes("mp")) {
        suffix = " MP";
    } else if (critNameLower.includes("tela") || critNameLower.includes("polegada") || critNameLower.includes('"')) {
        suffix = '"';
    } else if (critNameLower.includes("peso") || critNameLower.includes("grama")) {
        if (Number(val) < 10) {
            suffix = " kg";
        } else {
            suffix = "g";
        }
    } else if (critNameLower.includes("hz")) {
        suffix = " Hz";
    }

    const cState = chatState.intraCritState[critId] || {};
    const step = cState.step || 1;
    const num = Number(val).toFixed(step < 1 ? 1 : 0);
    return prefix ? `${prefix}${num}` : `${num}${suffix}`;
}

function askIntracriteriaQuestion() {
    if (chatState.intraCurrentIndex >= chatState.selectedCriteriaIds.length) {
        finishIntracriteria();
        return;
    }
    
    const cId = chatState.selectedCriteriaIds[chatState.intraCurrentIndex];
    const cState = chatState.intraCritState[cId];
    
    if (cState.isLinear) {
        // Elicitado linearmente, skip ou avança
        const quickEl = document.createElement('div');
        quickEl.className = 'quick-replies';
        quickEl.innerHTML = `
            <button class="quick-reply-btn" onclick="setIntraLinear(false)">
                ❌ Personalizar exigências (Fazer perguntas)
            </button>
            <button class="quick-reply-btn" onclick="advanceIntraCriteria()">
                ➡️ Próximo critério
            </button>
            <button class="quick-reply-btn" style="border-color:#ef4444; color:#ef4444;" onclick="exitToMenu()">
                🚪 Voltar ao Menu Principal
            </button>
        `;
        addMessage('bot', `📈 Para **${cState.nome}**, assumimos uma **relação direta** (quanto melhor a especificação, maior sua satisfação). Deseja manter assim ou prefere ajustar detalhadamente?`, quickEl);
        return;
    }

    // Se já tiver v50, mostrar que já foi elictado
    if (cState.v50 !== null) {
        const quickEl = document.createElement('div');
        quickEl.className = 'quick-replies';
        quickEl.innerHTML = `
            <button class="quick-reply-btn" onclick="resetIntraElicitation('${cId}')">
                🔄 Refazer Ajuste
            </button>
            <button class="quick-reply-btn" onclick="setIntraLinear(true)">
                📈 Usar Relação Direta/Linear
            </button>
            <button class="quick-reply-btn" onclick="advanceIntraCriteria()">
                ➡️ Próximo critério
            </button>
            <button class="quick-reply-btn" style="border-color:#ef4444; color:#ef4444;" onclick="exitToMenu()">
                🚪 Voltar ao Menu Principal
            </button>
        `;
        addMessage('bot', `✅ O critério **${cState.nome}** já está configurado! Definimos que seu nível médio ideal (50% de satisfação) é **${formatCritValue(cState.v50, cId)}**. O que deseja fazer?`, quickEl);
        return;
    }

    // Bisection calculations
    const W = cState.search_w;
    const B = cState.search_b;
    const M = (W + B) / 2;
    cState.current_mid = M;

    const fmtW = formatCritValue(W, cId);
    const fmtB = formatCritValue(B, cId);
    const fmtM = formatCritValue(M, cId);

    // Auto-converge check
    if (Math.abs(W - B) <= cState.step * 2) {
        saveIntraMidpoint(M);
        return;
    }

    const quickReplies = document.createElement('div');
    quickReplies.className = 'quick-replies';
    quickReplies.innerHTML = `
        <button class="quick-reply-btn" onclick="submitIntraAnswer(1)">
            Melhorar de <strong>${fmtW}</strong> para <strong>${fmtM}</strong>
        </button>
        <button class="quick-reply-btn" onclick="submitIntraAnswer(2)">
            Melhorar de <strong>${fmtM}</strong> para <strong>${fmtB}</strong>
        </button>
        <button class="quick-reply-btn" onclick="submitIntraAnswer(3)">
            🤝 Tanto faz (As duas melhorias são ótimas)
        </button>
        <button class="quick-reply-btn" onclick="submitIntraAnswer(4)">
            ➡️ Pular / Ir para o próximo critério
        </button>
        <button class="quick-reply-btn" style="border-color:#ef4444; color:#ef4444;" onclick="submitIntraAnswer(5)">
            🚪 Voltar ao Menu Principal
        </button>
    `;
    
    addMessage('bot', `Para **${cState.nome}**, imagine que você tem duas melhorias possíveis. Qual delas te deixaria mais satisfeito? 🤔`);
    
    // Append quick replies message
    addMessage('bot', `Escolha a opção que preferir:`, quickReplies);
}

function drawMiniChart(canvas, cState) {
    const ctx = canvas.getContext('2d');
    const isMax = cState.direcao === 'max';
    const W = cState.search_w;
    const B = cState.search_b;
    const M = (W + B) / 2;
    
    const origW = isMax ? cState.minReal : cState.maxReal;
    const origB = isMax ? cState.maxReal : cState.minReal;
    
    let points = [];
    let isDashed = false;
    
    if (cState.isLinear) {
        points = [
            { x: origW, y: 0 },
            { x: origB, y: 1 }
        ];
    } else if (cState.v50 !== null) {
        points = [
            { x: origW, y: 0 },
            { x: cState.v50, y: 0.5 },
            { x: origB, y: 1 }
        ];
    } else {
        isDashed = true;
        points = [
            { x: origW, y: 0 },
            { x: M, y: 0.5 },
            { x: origB, y: 1 }
        ];
    }

    points.sort((a, b) => a.x - b.x);
    
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = isDark ? '#e2e8f0' : '#1e293b';

    new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                data: points,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                borderDash: isDashed ? [3, 3] : [],
                fill: true,
                tension: 0.1,
                pointBackgroundColor: '#f59e0b',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    min: Math.min(origW, origB),
                    max: Math.max(origW, origB),
                    ticks: { color: textColor, font: { size: 9 } }
                },
                y: {
                    min: 0,
                    max: 1,
                    ticks: { color: textColor, font: { size: 9 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

window.submitIntraAnswer = async (option) => {
    deactivateLastBotMessageOptions();
    const cId = chatState.selectedCriteriaIds[chatState.intraCurrentIndex];
    const cState = chatState.intraCritState[cId];
    const M = cState.current_mid;
    
    if (option === 1) {
        addMessage('user', `Melhorar de ${formatCritValue(cState.search_w, cId)} para ${formatCritValue(M, cId)}`);
        cState.search_b = M;
        await saveEvaluationState();
        askIntracriteriaQuestion();
    } else if (option === 2) {
        addMessage('user', `Melhorar de ${formatCritValue(M, cId)} para ${formatCritValue(cState.search_b, cId)}`);
        cState.search_w = M;
        await saveEvaluationState();
        askIntracriteriaQuestion();
    } else if (option === 3) {
        addMessage('user', "Tanto faz (As duas melhorias são ótimas)");
        await saveIntraMidpoint(M);
    } else if (option === 4) {
        addMessage('user', "Pular / Ir para o próximo critério");
        advanceIntraCriteria();
    } else if (option === 5) {
        addMessage('user', "Voltar ao Menu Principal");
        exitToMenu();
    }
};

async function saveIntraMidpoint(val) {
    const cId = chatState.selectedCriteriaIds[chatState.intraCurrentIndex];
    const cState = chatState.intraCritState[cId];
    cState.v50 = val;
    
    // Save median point to DB
    const { error: relErr } = await supabaseClient
        .from('avaliacao_criterios')
        .update({ valor_mediano: val })
        .eq('avaliacao_id', chatState.activeAval.id)
        .eq('criterio_id', cId);
    
    if (relErr) {
        console.error("Erro ao salvar valor mediano:", relErr);
    }
    
    await saveEvaluationState();
    updateLiveRanking();
    
    addMessage('bot', `🎯 **Configurado!** Para **${cState.nome}**, o valor de **${formatCritValue(val, cId)}** representa exatamente metade (50%) da sua satisfação máxima.`);
    advanceIntraCriteria();
}

window.setIntraLinear = async (linearBool) => {
    deactivateLastBotMessageOptions();
    const cId = chatState.selectedCriteriaIds[chatState.intraCurrentIndex];
    const cState = chatState.intraCritState[cId];
    
    cState.isLinear = linearBool;
    addMessage('user', linearBool ? "Definir Relação Linear" : "Desativar Relação Linear");
    
    if (linearBool) {
        const isMax = cState.direcao === 'max';
        const W = isMax ? cState.minReal : cState.maxReal;
        const B = isMax ? cState.maxReal : cState.minReal;
        cState.v50 = W + (B - W) * 0.5; // Linear midpoint
        
        await supabaseClient
            .from('avaliacao_criterios')
            .update({ valor_mediano: cState.v50 })
            .eq('avaliacao_id', chatState.activeAval.id)
            .eq('criterio_id', cId);
    } else {
        cState.v50 = null;
        cState.search_w = cState.direcao === 'max' ? cState.minReal : cState.maxReal;
        cState.search_b = cState.direcao === 'max' ? cState.maxReal : cState.minReal;
        
        await supabaseClient
            .from('avaliacao_criterios')
            .update({ valor_mediano: null })
            .eq('avaliacao_id', chatState.activeAval.id)
            .eq('criterio_id', cId);
    }
    
    await saveEvaluationState();
    updateLiveRanking();
    askIntracriteriaQuestion();
};

window.resetIntraElicitation = async (cId) => {
    deactivateLastBotMessageOptions();
    const cState = chatState.intraCritState[cId];
    addMessage('user', "Refazer Elicitação");
    
    cState.v50 = null;
    cState.isLinear = false;
    cState.search_w = cState.direcao === 'max' ? cState.minReal : cState.maxReal;
    cState.search_b = cState.direcao === 'max' ? cState.maxReal : cState.minReal;
    
    await supabaseClient
        .from('avaliacao_criterios')
        .update({ valor_mediano: null })
        .eq('avaliacao_id', chatState.activeAval.id)
        .eq('criterio_id', cId);
        
    await saveEvaluationState();
    updateLiveRanking();
    askIntracriteriaQuestion();
};

window.advanceIntraCriteria = () => {
    deactivateLastBotMessageOptions();
    chatState.intraCurrentIndex++;
    askIntracriteriaQuestion();
};

window.exitToMenu = () => {
    deactivateLastBotMessageOptions();
    startWelcome();
};

async function saveEvaluationState() {
    if (!chatState.activeAval) return;
    
    const savedState = chatState.activeAval.state_json || {};
    const intracriterio = savedState.intracriterio || {};
    
    chatState.selectedCriteriaIds.forEach(cId => {
        const c = chatState.intraCritState[cId];
        if (c) {
            intracriterio[cId] = {
                search_w: c.search_w,
                search_b: c.search_b,
                isLinear: c.isLinear
            };
        }
    });
    
    const payload = {
        ...savedState,
        currentState: chatState.currentState,
        intraCurrentIndex: chatState.intraCurrentIndex,
        intracriterio: intracriterio,
        orderedCriteriaIds: chatState.orderedCriteriaIds,
        weightConstraints: chatState.weightConstraints,
        currentQuestionRank: chatState.currentQuestionRank,
        currentBounds: chatState.currentBounds,
        heuristicDone: chatState.heuristicDone,
        ties: chatState.ties
    };
    
    chatState.activeAval.state_json = payload;
    
    // Evita gravar no banco de dados caso esteja apenas restaurando o estado anterior
    if (chatState.isRestoring) return;
    
    if (!supabaseClient) return;
    try {
        await supabaseClient
            .from('avaliacoes')
            .update({ state_json: payload })
            .eq('id', chatState.activeAval.id);
    } catch (e) {
        console.error("Erro ao salvar o estado da avaliação:", e);
    }
}

async function saveMessageToSupabase(sender, text) {
    if (!supabaseClient || !chatState.userSession || !chatState.activeAval) return null;
    
    try {
        const { data, error } = await supabaseClient
            .from('mensagens_chat')
            .insert([{
                user_id: chatState.userSession.user.id,
                avaliacao_id: chatState.activeAval.id,
                sender: sender,
                text: text
            }])
            .select()
            .single();
        if (error) {
            console.error("Erro ao salvar mensagem no Supabase:", error);
            return null;
        }
        return data;
    } catch (err) {
        console.error("Erro de exceção ao salvar mensagem:", err);
        return null;
    }
}

function finishIntracriteria() {
    addMessage('bot', "🎉 **Excelente!** Calibramos todos os seus critérios de escolha. O ranking atualizou automaticamente à direita! Agora, para refinar ainda mais, vamos para a última etapa?");
    startWelcome();
}

// ==========================================
// STATE: OPTION 3 - WEIGHTS & PRIORITIES (INTERCRITERIA)
// ==========================================
async function startIntercriteria() {
    if (chatState.selectedCriteriaIds.length < 2) {
        addMessage('bot', "⚠️ **Ops!** Para comparar a importância entre características, você precisa escolher no mínimo **2 critérios**. Volte no passo **1 - O que você valoriza?**! ☝️");
        startWelcome();
        return;
    }
    
    chatState.currentState = 'INTERCRITERIA_SORTING';
    
    // Sort array initialized with user's selected criteria
    chatState.sortArray = chatState.selectedCriteriaIds.map(id => chatState.criterios.find(c => c.id === id));
    chatState.sortArray.forEach(c => delete c.tieWith); // clear past ties
    
    chatState.sortI = 1;
    chatState.sortJ = 0;
    chatState.sortCurrentItem = chatState.sortArray[1];
    chatState.ties = {};
    
    await saveEvaluationState();
    
    addMessage('bot', "⚖️ **Vamos definir a importância das características!** Agora eu vou te mostrar cenários hipotéticos para você me dizer qual característica tem mais peso na sua decisão. Vamos lá?");
    runSortingStep();
}

function runSortingStep() {
    if (chatState.sortI >= chatState.sortArray.length) {
        // Sorting is complete! Save results
        finishSorting();
        return;
    }
    
    if (chatState.sortJ >= 0) {
        const critA = chatState.sortArray[chatState.sortJ];
        const critB = chatState.sortCurrentItem;
        
        askSortQuestion(critA, critB);
    } else {
        // End of comparisons for currentItem, insert it at index 0
        chatState.sortArray[0] = chatState.sortCurrentItem;
        
        // Move to next item
        chatState.sortI++;
        if (chatState.sortI < chatState.sortArray.length) {
            chatState.sortJ = chatState.sortI - 1;
            chatState.sortCurrentItem = chatState.sortArray[chatState.sortI];
        }
        runSortingStep();
    }
}

function askSortQuestion(critA, critB) {
    const cStateA = chatState.intraCritState[critA.id];
    const cStateB = chatState.intraCritState[critB.id];
    
    const dirA = cStateA.direcao === 'max';
    const dirB = cStateB.direcao === 'max';
    
    const valAMelhor = formatCritValue(dirA ? cStateA.maxReal : cStateA.minReal, critA.id);
    const valAPior = formatCritValue(dirA ? cStateA.minReal : cStateA.maxReal, critA.id);
    const valBMelhor = formatCritValue(dirB ? cStateB.maxReal : cStateB.minReal, critB.id);
    const valBPior = formatCritValue(dirB ? cStateB.minReal : cStateB.maxReal, critB.id);
    
    const descA = `📱 Um modelo com **${critA.nome} excelente (${valAMelhor})**, mas com ${critB.nome} comum (${valBPior})`;
    const descB = `📱 Um modelo com ${critA.nome} comum (${valAPior}) e **${critB.nome} excelente (${valBMelhor})**`;
    
    const quickReplies = document.createElement('div');
    quickReplies.className = 'quick-replies';
    quickReplies.innerHTML = `
        <button class="quick-reply-btn" onclick="submitSortAnswer('A')">
            🅰️ Prefiro a Opção A
        </button>
        <button class="quick-reply-btn" onclick="submitSortAnswer('B')">
            🅱️ Prefiro a Opção B
        </button>
        <button class="quick-reply-btn" onclick="submitSortAnswer('I')">
            🤝 Tanto faz (As duas são boas)
        </button>
        <button class="quick-reply-btn" style="border-color:#ef4444; color:#ef4444;" onclick="submitSortAnswer('EXIT')">
            🚪 Voltar ao Menu Principal
        </button>
    `;
    
    addMessage('bot', `Se você tivesse que escolher entre um destes modelos, qual deles você preferiria levar para casa? 🛒`, null);
    addMessage('bot', `**Opção A:**<br>${descA}<br><br>**Opção B:**<br>${descB}`, quickReplies);
}

window.submitSortAnswer = async (choice) => {
    deactivateLastBotMessageOptions();
    if (choice === 'EXIT') {
        addMessage('user', "Voltar ao Menu Principal");
        exitToMenu();
        return;
    }
    
    const critA = chatState.sortArray[chatState.sortJ];
    const critB = chatState.sortCurrentItem;
    
    addMessage('user', choice === 'A' ? "Prefiro a Opção A" : choice === 'B' ? "Prefiro a Opção B" : "Tanto faz (As duas são boas)");
    
    if (choice === 'A') {
        // critA > critB (A is better placed than B). Insertion point found.
        chatState.sortArray[chatState.sortJ + 1] = chatState.sortCurrentItem;
        
        chatState.sortI++;
        if (chatState.sortI < chatState.sortArray.length) {
            chatState.sortJ = chatState.sortI - 1;
            chatState.sortCurrentItem = chatState.sortArray[chatState.sortI];
        }
        runSortingStep();
    } else if (choice === 'B') {
        // critB > critA. Move critA right and check next.
        chatState.sortArray[chatState.sortJ + 1] = chatState.sortArray[chatState.sortJ];
        chatState.sortJ--;
        runSortingStep();
    } else if (choice === 'I') {
        // critA == critB. Register tie.
        chatState.sortCurrentItem.tieWith = critA.id;
        chatState.ties[chatState.sortCurrentItem.id] = critA.id;
        
        chatState.sortArray[chatState.sortJ + 1] = chatState.sortCurrentItem;
        
        chatState.sortI++;
        if (chatState.sortI < chatState.sortArray.length) {
            chatState.sortJ = chatState.sortI - 1;
            chatState.sortCurrentItem = chatState.sortArray[chatState.sortI];
        }
        runSortingStep();
    }
};

async function finishSorting() {
    chatState.orderedCriteriaIds = chatState.sortArray.map(c => c.id);
    
    // Reset tradeoff states
    chatState.weightConstraints = [];
    chatState.currentQuestionRank = 0;
    chatState.currentBounds = [0, 1];
    chatState.heuristicDone = false;
    
    await saveEvaluationState();
    updateLiveRanking();
    
    addMessage('bot', "✅ **Importância dos critérios definida!** Já sabemos quais características você valoriza mais.");
    addMessage('bot', "⚖️ **Ajuste fino (Decisão final):** Agora vamos fazer algumas comparações rápidas para definir com exatidão os pesos das características e refinar o seu ranking ideal.");
    
    chatState.currentState = 'INTERCRITERIA_TRADEOFFS';
    askTradeoffQuestion();
}

// savePrioritiesState is removed and unified into saveEvaluationState

function askTradeoffQuestion() {
    // Run mathematical computations
    computeDominanceMatrix();
    buildHasseLevels();
    updateLiveRanking();
    
    // Check if complete ranking or index out of range
    const isComplete = chatState.hasseLevels.every(level => level.length === 1);
    if (isComplete || chatState.currentQuestionRank >= chatState.orderedCriteriaIds.length - 1) {
        finishTradeoffs();
        return;
    }
    
    // Get criteria pair to compare
    let c1_id, c2_id;
    let isHeuristic = false;
    
    if (!chatState.heuristicDone && chatState.orderedCriteriaIds.length > 2) {
        c1_id = chatState.orderedCriteriaIds[0];
        c2_id = chatState.orderedCriteriaIds[chatState.orderedCriteriaIds.length - 1];
        isHeuristic = true;
    } else {
        c1_id = chatState.orderedCriteriaIds[chatState.currentQuestionRank];
        c2_id = chatState.orderedCriteriaIds[chatState.currentQuestionRank + 1];
    }
    
    const crit1 = chatState.criterios.find(c => c.id === c1_id);
    const crit2 = chatState.criterios.find(c => c.id === c2_id);
    
    // If criteria are tied, skip tradeoff
    const isTied = (chatState.ties && chatState.ties[c2_id] === c1_id);
    if (isTied && !isHeuristic) {
        chatState.currentQuestionRank++;
        askTradeoffQuestion();
        return;
    }
    
    const u_mid = isHeuristic ? 0.5 : (chatState.currentBounds[0] + chatState.currentBounds[1]) / 2;
    chatState.currentUMid = u_mid;
    chatState.currentIsHeuristic = isHeuristic;
    const val1 = reverseUtility(crit1, u_mid);
    
    const cState1 = chatState.intraCritState[crit1.id];
    const cState2 = chatState.intraCritState[crit2.id];
    
    const dir1 = cState1.direcao === 'max';
    const dir2 = cState2.direcao === 'max';
    
    const val1Pior = formatCritValue(dir1 ? cState1.minReal : cState1.maxReal, crit1.id);
    const val2Melhor = formatCritValue(dir2 ? cState2.maxReal : cState2.minReal, crit2.id);
    const val2Pior = formatCritValue(dir2 ? cState2.minReal : cState2.maxReal, crit2.id);
    const fmtV = formatCritValue(val1, crit1.id);
    
    const descA = `📱 Um modelo com **${crit1.nome} em ${fmtV}**, mas com ${crit2.nome} simples (${val2Pior})`;
    const descB = `📱 Um modelo com ${crit1.nome} simples (${val1Pior}) e **${crit2.nome} excelente (${val2Melhor})**`;
    
    const quickReplies = document.createElement('div');
    quickReplies.className = 'quick-replies';
    quickReplies.innerHTML = `
        <button class="quick-reply-btn" onclick="submitTradeoffAnswer('A', ${u_mid}, ${isHeuristic})">
            🅰️ Prefiro a Opção A
        </button>
        <button class="quick-reply-btn" onclick="submitTradeoffAnswer('B', ${u_mid}, ${isHeuristic})">
            🅱️ Prefiro a Opção B
        </button>
        <button class="quick-reply-btn" onclick="submitTradeoffAnswer('I', ${u_mid}, ${isHeuristic})">
            🤝 Tanto faz (As duas são boas)
        </button>
        <button class="quick-reply-btn" style="border-color:#ef4444; color:#ef4444;" onclick="submitTradeoffAnswer('EXIT')">
            🚪 Voltar ao Menu Principal
        </button>
    `;
    
    addMessage('bot', `Se você tivesse que escolher entre um destes modelos, qual das opções a seguir você prefere? 🤔`, null);
    addMessage('bot', `**Opção A:**<br>${descA}<br><br>**Opção B:**<br>${descB}`, quickReplies);
}

function reverseUtility(crit, u) {
    const cState = chatState.intraCritState[crit.id] || {};
    const isMax = cState.direcao === 'max';
    const W = isMax ? cState.minReal : cState.maxReal;
    const B = isMax ? cState.maxReal : cState.minReal;
    const v50 = (cState.v50 !== undefined && cState.v50 !== null) ? Number(cState.v50) : null;
    
    if (v50 === null) {
        return W + u * (B - W);
    }
    
    if (u <= 0.5) {
        const u_scale = u / 0.5;
        return W + u_scale * (v50 - W);
    } else {
        const u_scale = (u - 0.5) / 0.5;
        return v50 + u_scale * (B - v50);
    }
}

window.submitTradeoffAnswer = async (choice, u_mid, isHeuristic) => {
    deactivateLastBotMessageOptions();
    if (choice === 'EXIT') {
        addMessage('user', "Voltar ao Menu Principal");
        exitToMenu();
        return;
    }
    
    let c1_id, c2_id;
    if (isHeuristic) {
        c1_id = chatState.orderedCriteriaIds[0];
        c2_id = chatState.orderedCriteriaIds[chatState.orderedCriteriaIds.length - 1];
    } else {
        c1_id = chatState.orderedCriteriaIds[chatState.currentQuestionRank];
        c2_id = chatState.orderedCriteriaIds[chatState.currentQuestionRank + 1];
    }
    
    addMessage('user', choice === 'A' ? "Prefiro a Opção A" : choice === 'B' ? "Prefiro a Opção B" : "Tanto faz (As duas são boas)");
    
    if (choice === 'I') {
        chatState.weightConstraints.push({ idA: c1_id, factorA: u_mid, idB: c2_id, factorB: 1 });
        chatState.weightConstraints.push({ idA: c2_id, factorA: 1, idB: c1_id, factorB: u_mid });
    } else if (choice === 'A') {
        chatState.weightConstraints.push({ idA: c1_id, factorA: u_mid, idB: c2_id, factorB: 1 });
        if (!isHeuristic) chatState.currentBounds[1] = u_mid;
    } else if (choice === 'B') {
        chatState.weightConstraints.push({ idA: c2_id, factorA: 1, idB: c1_id, factorB: u_mid });
        if (!isHeuristic) chatState.currentBounds[0] = u_mid;
    }
    
    if (isHeuristic) {
        chatState.heuristicDone = true;
        await saveEvaluationState();
        askTradeoffQuestion();
        return;
    }
    
    const boundsDiff = Math.abs(chatState.currentBounds[1] - chatState.currentBounds[0]);
    if (boundsDiff < 0.05 || choice === 'I') {
        chatState.currentQuestionRank++;
        chatState.currentBounds = [0, 1];
    }
    
    await saveEvaluationState();
    askTradeoffQuestion();
};

async function finishTradeoffs() {
    await supabaseClient
        .from('avaliacoes')
        .update({ status: 'concluido' })
        .eq('id', chatState.activeAval.id);
        
    if (chatState.activeAval) {
        chatState.activeAval.status = 'concluido';
    }
        
    const catName = chatState.currentCategory ? chatState.currentCategory.nome : 'produto';
    const devType = catName.toLowerCase() + 's';
    addMessage('bot', `🎉 **Parabéns!** Conseguimos mapear suas preferências ideais. O seu **ranking final personalizado** de ${devType} está pronto e ordenado à direita do painel. Esperamos que te ajude a fazer a melhor escolha! 🦆✨`);
    startWelcome();
}

// ==========================================
// MATHEMATICAL COMPUTATIONS (LIVE RANKING)
// ==========================================
function calculateMarginalUtilities() {
    chatState.alternativas.forEach(alt => {
        alt.utilidades = {};
        chatState.selectedCriteriaIds.forEach(cId => {
            const val = alt.valores[cId] || 0;
            const critState = chatState.intraCritState[cId] || {};
            const isMax = critState.direcao === 'max';
            const W = isMax ? critState.minReal : critState.maxReal;
            const B = isMax ? critState.maxReal : critState.minReal;
            const v50 = (critState.v50 !== undefined && critState.v50 !== null) ? Number(critState.v50) : null;
            
            let u = 0;
            if (v50 === null) {
                u = (val - W) / (B - W);
            } else {
                if (isMax) {
                    if (val <= v50) {
                        u = 0.5 * (val - W) / (v50 - W);
                    } else {
                        u = 0.5 + 0.5 * (val - v50) / (B - v50);
                    }
                } else {
                    if (val >= v50) {
                        u = 0.5 * (W - val) / (W - v50);
                    } else {
                        u = 0.5 + 0.5 * (v50 - val) / (v50 - B);
                    }
                }
            }
            if (u < 0) u = 0;
            if (u > 1) u = 1;
            alt.utilidades[cId] = u;
        });
    });
}

function solveDominance(altI, altK) {
    const model = {
        optimize: "diff",
        opType: "max",
        constraints: { "sum_w": { equal: 1 } },
        variables: {}
    };
    
    const order = chatState.orderedCriteriaIds.filter(id => chatState.selectedCriteriaIds.includes(id));
    
    order.forEach((cId, idx) => {
        const vName = `w_${cId}`;
        const u_i = altI.utilidades[cId] || 0;
        const u_k = altK.utilidades[cId] || 0;
        
        model.variables[vName] = {
            "diff": u_i - u_k,
            "sum_w": 1
        };
        
        if (idx < order.length - 1) {
            const nextCId = order[idx + 1];
            const isTied = (chatState.ties && chatState.ties[nextCId] === cId);
            const constraintName = `ord_${cId}_${nextCId}`;
            model.constraints[constraintName] = isTied ? { equal: 0 } : { min: 0 };
            model.variables[vName][constraintName] = 1;
        }
        if (idx > 0) {
            const prevCId = order[idx - 1];
            const constraintName = `ord_${prevCId}_${cId}`;
            model.variables[vName][constraintName] = -1;
        }
    });
    
    // Add extra tradeoffs constraints
    chatState.weightConstraints.forEach((c, idx) => {
        const cName = `extra_${idx}`;
        model.constraints[cName] = { min: 0 };
        const vA = `w_${c.idA}`;
        const vB = `w_${c.idB}`;
        
        if (!model.variables[vA]) model.variables[vA] = { "diff": 0, "sum_w": 0 };
        model.variables[vA][cName] = c.factorA;
        
        if (model.variables[vB]) {
            model.variables[vB][cName] = -c.factorB;
        } else {
            model.variables[vB] = { [cName]: -c.factorB, "sum_w": 0, "diff": 0 };
        }
    });
    
    const results = solver.Solve(model);
    return results.result;
}

function computeDominanceMatrix() {
    const N = chatState.alternativas.length;
    const matrix = Array(N).fill(null).map(() => Array(N).fill(0));
    
    for (let i = 0; i < N; i++) {
        for (let k = 0; k < N; k++) {
            if (i === k) continue;
            
            const maxD_ik = solveDominance(chatState.alternativas[i], chatState.alternativas[k]);
            const maxD_ki = solveDominance(chatState.alternativas[k], chatState.alternativas[i]);
            
            if (maxD_ik < -0.0001) {
                matrix[k][i] = 1; // K dominates I
            } else if (Math.abs(maxD_ik) <= 0.0001 && Math.abs(maxD_ki) <= 0.0001) {
                matrix[i][k] = 'I'; // Indifferent
            }
        }
    }
    chatState.dominanceMatrix = matrix;
}

function buildHasseLevels() {
    let S = chatState.alternativas.map((_, idx) => idx);
    const levels = [];
    
    while (S.length > 0) {
        const nonDominated = S.filter(i => {
            const isDominated = S.some(k => chatState.dominanceMatrix[k][i] === 1);
            return !isDominated;
        });
        
        if (nonDominated.length === 0) {
            levels.push(S);
            break;
        }
        levels.push(nonDominated);
        S = S.filter(i => !nonDominated.includes(i));
    }
    chatState.hasseLevels = levels;
    return levels;
}
function showChatSkeleton() {
    if (chatMessages) {
        chatMessages.innerHTML = `
            <div id="chat-loading" style="text-align: center; padding: 2rem; color: var(--gemini-text-secondary); width: 100%; margin: auto 0;">
                <div class="skeleton skeleton-text" style="width: 60%; margin: 0 auto 1rem;"></div>
                <div class="skeleton skeleton-item" style="height: 3.5rem; max-width: 600px; margin: 0 auto; border-radius: 16px;"></div>
            </div>
        `;
    }
}
function showRankingSkeleton() {
    const listContainer = document.getElementById('ranking-list-container');
    const hasseContainer = document.getElementById('hasse-container');
    const btnToggle = document.getElementById('btn-toggle-hasse');
    
    if (listContainer) {
        listContainer.style.display = 'flex';
        listContainer.innerHTML = `
            <div style="width: 100%; display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem;">
                <div class="skeleton skeleton-text" style="width: 40%; height: 1.25rem; margin-bottom: 0.5rem; border-radius: 8px;"></div>
                <div class="skeleton skeleton-item" style="height: 3.5rem; border-radius: 12px;"></div>
                <div class="skeleton skeleton-item" style="height: 3.5rem; border-radius: 12px;"></div>
                <div class="skeleton skeleton-item" style="height: 3.5rem; border-radius: 12px;"></div>
                <div class="skeleton skeleton-item" style="height: 3.5rem; border-radius: 12px;"></div>
            </div>
        `;
    }
    if (hasseContainer) hasseContainer.style.display = 'none';
    if (btnToggle) btnToggle.style.display = 'none';
}

// ==========================================
// LIVE RANKING RENDERING
// ==========================================
function updateLiveRanking() {
    const listContainer = document.getElementById('ranking-list-container');
    const hasseContainer = document.getElementById('hasse-container');
    const btnToggle = document.getElementById('btn-toggle-hasse');
    
    if (chatState.selectedCriteriaIds.length === 0) {
        listContainer.style.display = 'flex';
        hasseContainer.style.display = 'none';
        btnToggle.style.display = 'none';
        const catName = chatState.currentCategory ? chatState.currentCategory.nome : 'produto';
        const catNameLower = catName.toLowerCase();
        const rankDevice = catNameLower + 's';
        let rankIcon = '📦';
        if (catNameLower.includes('celular') || catNameLower.includes('telefone')) {
            rankIcon = '📱';
        } else if (catNameLower.includes('notebook') || catNameLower.includes('laptop') || catNameLower.includes('computador')) {
            rankIcon = '💻';
        } else if (catNameLower.includes('tv') || catNameLower.includes('televisão')) {
            rankIcon = '📺';
        } else if (catNameLower.includes('videogame') || catNameLower.includes('game') || catNameLower.includes('console')) {
            rankIcon = '🎮';
        }
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 4rem 1.5rem; color: var(--text-secondary); width: 100%;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">${rankIcon}</div>
                <h4>Nenhum Critério Selecionado</h4>
                <p style="font-size: 0.9rem; max-width: 250px; margin: 0.5rem auto 0;">Inicie o chat ao lado para selecionar os critérios e visualizar o ranking de ${rankDevice}.</p>
            </div>
        `;
        return;
    }
    
    calculateMarginalUtilities();
    
    // Check if priority sorting has occurred
    const hasPriorities = chatState.orderedCriteriaIds.some(id => chatState.selectedCriteriaIds.includes(id));
    
    if (!hasPriorities) {
        // Fallback: Preview mode based on simple average utilities
        listContainer.style.display = 'flex';
        hasseContainer.style.display = 'none';
        btnToggle.style.display = 'none';
        
        // Calculate average utilities
        const previewList = chatState.alternativas.map(alt => {
            let sumU = 0;
            chatState.selectedCriteriaIds.forEach(cId => {
                sumU += alt.utilidades[cId] || 0;
            });
            const avgU = sumU / chatState.selectedCriteriaIds.length;
            return { name: alt.nome, score: avgU };
        });
        
        previewList.sort((a, b) => b.score - a.score);
        
        let html = `
            <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2); border-radius: 8px; font-size: 0.85rem; color: var(--primary-color); font-weight: 500; text-align: center;">
                ⚡ Modo Prévio (Pesos Iguais) • Ajuste prioridades para refinar
            </div>
        `;
        
        previewList.forEach((item, idx) => {
            html += `
                <div class="ranking-item" style="display: flex; align-items: center; justify-content: space-between; background: var(--input-bg); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.75rem 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="ranking-badge" style="width: 28px; height: 28px; font-size: 0.85rem;">${idx + 1}</div>
                        <span class="ranking-name" style="font-size: 0.95rem;">${item.name}</span>
                    </div>
                    <span class="ranking-tier" style="font-size: 0.75rem; color: var(--text-secondary);">Score: ${(item.score * 100).toFixed(0)}%</span>
                </div>
            `;
        });
        
        listContainer.innerHTML = html;
        return;
    }
    
    // Complete ranking calculations using lp-solver
    computeDominanceMatrix();
    buildHasseLevels();
    
    btnToggle.style.display = 'flex';
    
    if (chatState.showHasse) {
        listContainer.style.display = 'none';
        hasseContainer.style.display = 'block';
        renderHasseDiagram();
    } else {
        listContainer.style.display = 'flex';
        hasseContainer.style.display = 'none';
        
        const isComplete = chatState.hasseLevels.every(level => level.length === 1);
        let html = "";
        
        chatState.hasseLevels.forEach((level, idx) => {
            level.forEach(altId => {
                const alt = chatState.alternativas[altId];
                if (!alt) return;
                
                // Compare with other items in the same level
                const peers = level.filter(id => id !== altId);
                let relationHtml = "";
                
                if (peers.length > 0) {
                    const ties = [];
                    const incomparables = [];
                    
                    peers.forEach(peerId => {
                        const peerAlt = chatState.alternativas[peerId];
                        const rel = chatState.dominanceMatrix[altId][peerId];
                        const relRev = chatState.dominanceMatrix[peerId][altId];
                        
                        if (rel === 'I' || relRev === 'I') {
                            ties.push(peerAlt.nome);
                        } else if (rel === 0 && relRev === 0) {
                            incomparables.push(peerAlt.nome);
                        }
                    });
                    
                    if (ties.length > 0) {
                        relationHtml = `<div style="font-size: 0.75rem; color: #10b981; margin-top: 0.15rem; font-weight: 500;">🤝 Empatado com: ${ties.join(', ')}</div>`;
                    } else if (incomparables.length > 0) {
                        relationHtml = `<div style="font-size: 0.75rem; color: #f59e0b; margin-top: 0.15rem; font-weight: 500;">⚖️ Incomparável com: ${incomparables.join(', ')}</div>`;
                    }
                }
                
                html += `
                    <div class="ranking-item" style="display: flex; flex-direction: column; background: var(--input-bg); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.75rem 1rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <div class="ranking-badge" style="width: 28px; height: 28px; font-size: 0.85rem;">${idx + 1}</div>
                                <span class="ranking-name" style="font-size: 0.95rem;">${alt.nome}</span>
                            </div>
                            <span class="ranking-tier" style="font-size: 0.75rem;">${isComplete ? (idx === 0 ? 'Melhor' : `Nível ${idx + 1}`) : `Nível ${idx + 1}`}</span>
                        </div>
                        ${relationHtml ? `<div style="padding-left: 2.2rem;">${relationHtml}</div>` : ''}
                    </div>
                `;
            });
        });
        
        listContainer.innerHTML = html;
    }
}

function renderHasseDiagram() {
    const container = document.getElementById('hasse-container');
    const nodes = [];
    const edges = [];
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#e2e8f0' : '#1e293b';

    chatState.hasseLevels.forEach((levelIndices, levelNum) => {
        levelIndices.forEach(idx => {
            nodes.push({
                id: idx,
                label: chatState.alternativas[idx].nome,
                level: levelNum,
                shape: 'box',
                color: {
                    background: isDark ? '#1e293b' : '#ffffff',
                    border: '#3b82f6',
                    highlight: { background: '#3b82f6', border: '#ffffff' }
                },
                font: { color: textColor, face: 'Outfit' }
            });
        });
    });

    for (let currentLevel = 1; currentLevel < chatState.hasseLevels.length; currentLevel++) {
        const currentNodes = chatState.hasseLevels[currentLevel];
        const prevNodes = chatState.hasseLevels[currentLevel - 1];
        
        currentNodes.forEach(cIdx => {
            prevNodes.forEach(pIdx => {
                if (chatState.dominanceMatrix[pIdx][cIdx] === 1) {
                    edges.push({
                        from: pIdx,
                        to: cIdx,
                        color: { color: '#64748b' },
                        arrows: 'to'
                    });
                }
            });
        });
    }

    const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
    const options = {
        layout: {
            hierarchical: {
                direction: 'UD',
                sortMethod: 'directed',
                nodeSpacing: 140,
                levelSeparation: 90
            }
        },
        physics: false,
        interaction: { dragNodes: false }
    };

    if (chatState.network) {
        chatState.network.destroy();
    }
    chatState.network = new vis.Network(container, data, options);
}

async function handleUserInputText(text) {
    text = text.trim();
    if (!text) return;
    
    // Clear input field
    const inputField = document.getElementById('chat-input');
    if (inputField) inputField.value = '';
    
    const textLower = text.toLowerCase();

    // Check for PWA installation command
    if (textLower === 'instalar' || textLower.includes('instalar pwa') || textLower.includes('instalar o pwa') || textLower.includes('instalar aplicativo') || textLower.includes('instalar app')) {
        addMessage('user', text);
        
        // Detect iPhone / iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        if (isIOS) {
            addMessage('bot', `📱 **Instruções de instalação para o seu iPhone:**
            
1. Toque no botão de **Compartilhar** 📤 (o ícone de quadrado com uma seta para cima na barra inferior do Safari).
2. Role a lista de opções para baixo e toque em **"Adicionar à Tela de Início"** ➕.
3. Toque em **"Adicionar"** no canto superior direito para confirmar.
            
Pronto! O Recomendator 🦆 estará instalado e disponível na sua tela de início.`);
            return;
        }
        
        // Trigger normal installation prompt for Android/Chrome/etc.
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    addMessage('bot', '🎉 **Parabéns!** O Recomendator foi adicionado com sucesso à sua tela de início.');
                } else {
                    addMessage('bot', 'A instalação foi cancelada. Se mudar de ideia, digite "instalar" novamente!');
                }
                deferredPrompt = null;
            });
        } else {
            // Check if already installed
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
            if (isStandalone) {
                addMessage('bot', '📱 **O Recomendator já está instalado** no seu aparelho como um aplicativo!');
            } else {
                addMessage('bot', `Não foi possível iniciar a instalação automática no seu dispositivo. 

**Como instalar manualmente:**
* **No Android (Chrome):** Toque nos três pontinhos (canto superior direito) e selecione **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**.
* **No Computador (Chrome/Edge):** Clique no ícone de instalação 🖥️ que aparece no lado direito da barra de endereço.`);
            }
        }
        return;
    }
    
    // Check if the user is asking to show or open the ranking
    const requestsRanking = textLower.includes('ranking') || 
                            textLower.includes('ver ranking') || 
                            textLower.includes('mostrar ranking') || 
                            textLower.includes('abrir ranking') ||
                            textLower.includes('exibir ranking');

    if (requestsRanking) {
        addMessage('user', text);
        const layout = document.querySelector('.gemini-dashboard-layout') || document.querySelector('.dashboard-layout');
        if (layout) {
            if (!layout.classList.contains('show-ranking')) {
                toggleRankingPane();
                addMessage('bot', "Com certeza! Acabo de abrir o painel de ranking ao lado para você. 📊");
            } else {
                addMessage('bot', "O painel de ranking já está aberto na lateral para você acompanhar! 😉");
            }
        }
        return;
    }
    
    if (chatState.currentState === 'WELCOME') {
        if (textLower.includes('1') || textLower.includes('criterio') || textLower.includes('critério')) {
            window.selectMenuOption(1);
        } else if (textLower.includes('2') || textLower.includes('exigencia') || textLower.includes('exigência') || textLower.includes('satisfacao') || textLower.includes('satisfação')) {
            window.selectMenuOption(2);
        } else if (textLower.includes('3') || textLower.includes('prioridade') || textLower.includes('peso')) {
            window.selectMenuOption(3);
        } else {
            addMessage('user', text);
            addMessage('bot', "Desculpe, não entendi. Por favor, digite **1** para critérios, **2** para exigências ou **3** para prioridades.");
        }
    }
    else if (chatState.currentState === 'CHOOSE_CRITERIA') {
        if (textLower.includes('confirmar') || textLower.includes('salvar') || textLower.includes('ok') || textLower.includes('pronto')) {
            window.confirmCriteriaSelection();
        } else if (textLower.includes('cancelar') || textLower.includes('voltar') || textLower.includes('sair')) {
            window.cancelCriteriaSelection();
        } else {
            // Check if user typed a criterion name to toggle it
            let found = false;
            const cbElements = document.querySelectorAll('input[name="chat_criterio"]');
            cbElements.forEach(cb => {
                const labelSpan = cb.closest('.criteria-row-item').querySelector('label span');
                const labelText = labelSpan ? labelSpan.innerText.toLowerCase() : '';
                if (textLower.includes(labelText) && labelText.length > 2) {
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change'));
                    addMessage('user', `${cb.checked ? 'Selecionar' : 'Desmarcar'} "${labelSpan.innerText}"`);
                    found = true;
                }
            });
            
            if (!found) {
                addMessage('user', text);
                addMessage('bot', "Opção não reconhecida. Digite **confirmar** para salvar ou o nome de um critério para marcar/desmarcar.");
            }
        }
    }
    else if (chatState.currentState === 'INTRACRITERIA_ELICITATION') {
        if (textLower === '1' || textLower.includes('opcao 1') || textLower.includes('opção 1')) {
            window.submitIntraAnswer(1);
        } else if (textLower === '2' || textLower.includes('opcao 2') || textLower.includes('opção 2')) {
            window.submitIntraAnswer(2);
        } else if (textLower === '3' || textLower.includes('tanto faz') || textLower.includes('indiferente')) {
            window.submitIntraAnswer(3);
        } else if (textLower === '4' || textLower.includes('proximo') || textLower.includes('próximo')) {
            window.submitIntraAnswer(4);
        } else if (textLower === '5' || textLower.includes('voltar') || textLower.includes('sair') || textLower.includes('menu')) {
            window.submitIntraAnswer(5);
        } else if (textLower.includes('linear')) {
            const isLinearCurrently = chatState.intraCritState[chatState.selectedCriteriaIds[chatState.intraCurrentIndex]]?.isLinear;
            window.setIntraLinear(!isLinearCurrently);
        } else if (textLower.includes('refazer') || textLower.includes('reset')) {
            const cId = chatState.selectedCriteriaIds[chatState.intraCurrentIndex];
            window.resetIntraElicitation(cId);
        } else {
            addMessage('user', text);
            addMessage('bot', "Por favor, digite **1** (Opção 1), **2** (Opção 2), **3** (Tanto Faz), **4** (Próximo) ou **5** (Menu).");
        }
    }
    else if (chatState.currentState === 'INTERCRITERIA_SORTING') {
        if (textLower === 'a' || textLower === '1' || textLower.includes('cenario a') || textLower.includes('cenário a') || textLower.includes('prefer') && textLower.includes('a')) {
            window.submitSortAnswer('A');
        } else if (textLower === 'b' || textLower === '2' || textLower.includes('cenario b') || textLower.includes('cenário b') || textLower.includes('prefer') && textLower.includes('b')) {
            window.submitSortAnswer('B');
        } else if (textLower === 'i' || textLower === '3' || textLower.includes('iguais') || textLower.includes('tanto faz') || textLower.includes('indiferente') || textLower.includes('ambos')) {
            window.submitSortAnswer('I');
        } else if (textLower === 'sair' || textLower === 'voltar' || textLower === '4' || textLower.includes('menu')) {
            window.submitSortAnswer('EXIT');
        } else {
            addMessage('user', text);
            addMessage('bot', "Por favor, digite **A** (Cenário A), **B** (Cenário B), **I** (Ambos são iguais) ou **4** (Menu).");
        }
    }
    else if (chatState.currentState === 'INTERCRITERIA_TRADEOFFS') {
        if (textLower === 'a' || textLower === '1' || textLower.includes('cenario a') || textLower.includes('cenário a') || textLower.includes('opcao a') || textLower.includes('opção a')) {
            window.submitTradeoffAnswer('A', chatState.currentUMid, chatState.currentIsHeuristic);
        } else if (textLower === 'b' || textLower === '2' || textLower.includes('cenario b') || textLower.includes('cenário b') || textLower.includes('opcao b') || textLower.includes('opção b')) {
            window.submitTradeoffAnswer('B', chatState.currentUMid, chatState.currentIsHeuristic);
        } else if (textLower === 'i' || textLower === '3' || textLower.includes('tanto faz') || textLower.includes('indiferente') || textLower.includes('ambos') || textLower.includes('iguais')) {
            window.submitTradeoffAnswer('I', chatState.currentUMid, chatState.currentIsHeuristic);
        } else if (textLower === 'sair' || textLower === 'voltar' || textLower === '4' || textLower.includes('menu')) {
            window.submitTradeoffAnswer('EXIT');
        } else {
            addMessage('user', text);
            addMessage('bot', "Por favor, digite **A** (Opção A), **B** (Opção B), **I** (Tanto faz) ou **4** (Menu).");
        }
    } else {
        // Fallback
        addMessage('user', text);
        addMessage('bot', `Olá! Digite **menu** para voltar ao menu principal.`);
    }
}

// ==========================================
// PWA SERVICE WORKER REGISTRATION
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado com sucesso:', reg.scope))
            .catch(err => console.error('Erro ao registrar o Service Worker:', err));
    });
}

