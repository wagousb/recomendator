// ==========================================
// ADMIN LOGIC FOR RECOMENDATOR
// ==========================================

const SUPABASE_URL = 'https://dblstsdluzmclcsyaqpa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibHN0c2RsdXptY2xjc3lhcXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODU3MTIsImV4cCI6MjA5NTY2MTcxMn0.ySFb_7Jfs-X81mGgSl8dPmub35JJQXXTr8b4jlDcnt0';

let supabaseAdmin = null;
let currentCategoryId = null;

// Local states for loaded resources
let categories = [];
let criteria = [];
let alternatives = [];
let consequences = [];

// Track unsaved matrix values
let unsavedConsequences = {}; // structure: { "alternativeId_criterionId": value }

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Supabase
    try {
        supabaseAdmin = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (error) {
        console.error("Erro ao inicializar Supabase no admin:", error);
        Swal.fire({
            icon: 'error',
            title: 'Erro de Conexão',
            text: 'Não foi possível conectar ao banco de dados.'
        });
        return;
    }

    // 2. Check Auth
    const { data: { session } } = await supabaseAdmin.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    // 2b. Restrict admin access — only whitelisted emails are allowed
    const ADMIN_EMAILS = ['wagou.sb@gmail.com'];
    const userEmail = session.user.email || '';
    if (!ADMIN_EMAILS.includes(userEmail.toLowerCase())) {
        window.location.href = 'chat.html';
        return;
    }

    // Load user details for sidebar header
    const userFullName = session.user.user_metadata?.full_name || session.user.email.split('@')[0] || "Administrador";
    const sidebarUserName = document.getElementById('sidebarUserName');
    if (sidebarUserName) sidebarUserName.innerText = userFullName;
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarAvatar) sidebarAvatar.innerText = userFullName.charAt(0).toUpperCase();

    // 3. Initialize Sidebar Navigation Tabs
    initTabs();

    // 4. Load Categories & Setup Scope Selector
    await loadCategories();
    initScopeSelector();

    // 5. Setup Action Button Listeners
    initActions();

    // 6. Dynamic Theme Logo Sync
    const syncLogoWithTheme = () => {
        document.querySelectorAll('.sidebar-brand-duck img, .header-brand-duck img').forEach(img => {
            img.src = 'patinho-amarelo.svg';
        });
    };
    syncLogoWithTheme();

    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            setTimeout(syncLogoWithTheme, 50);
        });
    }
    
    // Create lucide icons on load
    if (window.lucide) {
        window.lucide.createIcons();
    }
});

// ==========================================
// TAB CONTROLLER
// ==========================================
function initTabs() {
    const tabButtons = document.querySelectorAll('.sidebar-item[data-tab]');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = btn.getAttribute('data-tab');
            
            // Toggle active menu class
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show tab content
            document.querySelectorAll('.admin-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const targetContent = document.getElementById(`tab-${tabId}`);
            if (targetContent) targetContent.classList.add('active');

            // Toggle category selector scope card visibility
            const scopeCard = document.getElementById('categoryScopeSelectorCard');
            if (scopeCard) {
                if (tabId === 'categorias' || tabId === 'permissoes') {
                    scopeCard.style.display = 'none';
                } else {
                    scopeCard.style.display = 'flex';
                }
            }

            // Reload relevant data
            reloadTabContent(tabId);
        });
    });

    // Sidebar collapse controls
    const geminiSidebar = document.getElementById('geminiSidebar');
    const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    const toggleSidebar = () => {
        if (window.innerWidth <= 900) {
            geminiSidebar.classList.toggle('expanded');
            if (sidebarOverlay) sidebarOverlay.classList.toggle('show');
        } else {
            geminiSidebar.classList.toggle('collapsed');
            if (sidebarCollapseBtn) {
                const isCollapsed = geminiSidebar.classList.contains('collapsed');
                sidebarCollapseBtn.setAttribute('title', isCollapsed ? 'Expandir menu' : 'Recolher menu');
            }
        }
    };

    if (sidebarCollapseBtn) sidebarCollapseBtn.addEventListener('click', toggleSidebar);
    if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);
}

async function reloadTabContent(tabId) {
    if (tabId === 'categorias') {
        await loadCategories();
    } else if (tabId === 'permissoes') {
        await loadUsersPermissions();
    } else {
        if (!currentCategoryId) {
            // Pick first category if none selected
            if (categories.length > 0) {
                currentCategoryId = categories[0].id;
                const selector = document.getElementById('currentCategoryScope');
                if (selector) selector.value = currentCategoryId;
            } else {
                return;
            }
        }

        if (tabId === 'criterios') {
            await loadCriteria();
        } else if (tabId === 'alternativas') {
            await loadAlternatives();
        } else if (tabId === 'consequencias') {
            await loadConsequencesMatrix();
        }
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==========================================
// SCOPE SELECTOR
// ==========================================
function initScopeSelector() {
    const selector = document.getElementById('currentCategoryScope');
    if (!selector) return;

    selector.addEventListener('change', async (e) => {
        currentCategoryId = e.target.value;
        unsavedConsequences = {}; // Clear unsaved changes on switch

        // Find currently active tab
        const activeTabBtn = document.querySelector('.sidebar-item.active[data-tab]');
        if (activeTabBtn) {
            const tabId = activeTabBtn.getAttribute('data-tab');
            await reloadTabContent(tabId);
        }
    });
}

function updateScopeSelector() {
    const selector = document.getElementById('currentCategoryScope');
    if (!selector) return;

    // Verify if currentCategoryId is still valid
    const exists = categories.some(cat => cat.id === currentCategoryId);
    if (!exists && categories.length > 0) {
        currentCategoryId = categories[0].id;
    } else if (categories.length === 0) {
        currentCategoryId = null;
    }

    selector.innerHTML = '';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.nome;
        if (cat.id === currentCategoryId) {
            opt.selected = true;
        }
        selector.appendChild(opt);
    });

    if (categories.length === 0) {
        selector.innerHTML = '<option value="">Nenhuma categoria cadastrada</option>';
    } else {
        selector.value = currentCategoryId;
    }
}

// ==========================================
// CATEGORY ORDER (localStorage)
// ==========================================
const CATEGORY_ORDER_KEY = 'recomendai_categories_order';

function saveCategoryOrder(ids) {
    localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(ids));
}

function applySavedCategoryOrder(cats) {
    try {
        const saved = JSON.parse(localStorage.getItem(CATEGORY_ORDER_KEY) || 'null');
        if (!saved || !Array.isArray(saved)) return cats;
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

// ==========================================
// DATA FETCHERS & RENDERERS
// ==========================================

// --- CATEGORIES ---
let categoriesSortable = null;

async function loadCategories() {
    try {
        const { data, error } = await supabaseAdmin
            .from('categorias')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;
        categories = applySavedCategoryOrder(data);

        // Update selector list
        updateScopeSelector();

        // Render table
        const tbody = document.getElementById('table-body-categorias');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (categories.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--gemini-text-secondary);">Nenhuma categoria cadastrada.</td></tr>';
            return;
        }

        categories.forEach(cat => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-id', cat.id);
            tr.innerHTML = `
                <td class="drag-handle" title="Arraste para reordenar" style="cursor: grab; text-align: center; color: var(--gemini-text-secondary); user-select: none;">
                    <i data-lucide="grip-vertical" style="width: 18px; height: 18px;"></i>
                </td>
                <td>
                    <strong>${cat.nome}</strong>
                </td>
                <td style="text-align: center; vertical-align: middle;">
                    <i data-lucide="${cat.icone || 'box'}" style="width: 20px; height: 20px; color: var(--gemini-primary);"></i>
                </td>
                <td style="text-align: center; vertical-align: middle;">
                    <div class="badge-dropdown select-status-category ${cat.ativo ? 'badge-success' : 'badge-secondary'}" data-id="${cat.id}" tabindex="0" style="position: relative;">
                        <div class="badge-dropdown-selected">${cat.ativo ? 'Ativo' : 'Inativo'}</div>
                        <div class="badge-dropdown-options" style="min-width: 110px;">
                            <div class="badge-option" data-value="true" style="color: #22c55e; font-weight: bold;">Ativo</div>
                            <div class="badge-option" data-value="false" style="color: #94a3b8; font-weight: bold;">Inativo</div>
                        </div>
                    </div>
                </td>
                <td style="text-align: center;">
                    <button class="btn-action-icon btn-edit-category" data-id="${cat.id}" title="Editar">
                        <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                    </button>
                    <button class="btn-action-icon btn-danger-icon btn-delete-category" data-id="${cat.id}" title="Excluir">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Attach event listeners for actions
        document.querySelectorAll('.btn-edit-category').forEach(btn => {
            btn.addEventListener('click', () => editCategory(btn.getAttribute('data-id')));
        });
        document.querySelectorAll('.btn-delete-category').forEach(btn => {
            btn.addEventListener('click', () => deleteCategory(btn.getAttribute('data-id')));
        });

        // Attach event listeners for custom status dropdowns
        document.querySelectorAll('.select-status-category').forEach(dropdown => {
            dropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other open dropdowns
                document.querySelectorAll('.badge-dropdown.open').forEach(openDd => {
                    if (openDd !== dropdown) openDd.classList.remove('open');
                });
                dropdown.classList.toggle('open');
            });

            const options = dropdown.querySelectorAll('.badge-option');
            options.forEach(option => {
                option.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    dropdown.classList.remove('open');
                    
                    const catId = dropdown.getAttribute('data-id');
                    const newStatus = option.getAttribute('data-value') === 'true';
                    const newText = option.innerText;
                    
                    // Optimistically update classes and text in UI
                    const selectedDiv = dropdown.querySelector('.badge-dropdown-selected');
                    if (selectedDiv) {
                        selectedDiv.innerText = newText;
                    }
                    if (newStatus) {
                        dropdown.classList.remove('badge-secondary');
                        dropdown.classList.add('badge-success');
                    } else {
                        dropdown.classList.remove('badge-success');
                        dropdown.classList.add('badge-secondary');
                    }
                    
                    try {
                        const { error } = await supabaseAdmin
                            .from('categorias')
                            .update({ ativo: newStatus })
                            .eq('id', catId);

                        if (error) throw error;
                        
                        // Update local categories list status
                        const categoryIndex = categories.findIndex(c => c.id === catId);
                        if (categoryIndex !== -1) {
                            categories[categoryIndex].ativo = newStatus;
                        }
                        // Status updated successfully (toast notification removed as requested)
                    } catch (error) {
                        // Revert changes in UI on error
                        const oldStatus = !newStatus;
                        if (selectedDiv) {
                            selectedDiv.innerText = oldStatus ? 'Ativo' : 'Inativo';
                        }
                        if (oldStatus) {
                            dropdown.classList.remove('badge-secondary');
                            dropdown.classList.add('badge-success');
                        } else {
                            dropdown.classList.remove('badge-success');
                            dropdown.classList.add('badge-secondary');
                        }
                        Swal.fire({ icon: 'error', title: 'Erro', text: error.message || 'Erro ao atualizar status.' });
                    }
                });
            });
        });

        // Close dropdowns on document click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.badge-dropdown')) {
                document.querySelectorAll('.badge-dropdown.open').forEach(dd => {
                    dd.classList.remove('open');
                });
            }
        });

        // Re-render Lucide icons inside the new rows
        if (window.lucide) lucide.createIcons();

        // Initialize (or re-initialize) Sortable drag-and-drop
        if (categoriesSortable) {
            categoriesSortable.destroy();
        }
        categoriesSortable = Sortable.create(tbody, {
            handle: '.drag-handle',
            animation: 180,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            onEnd: function () {
                const ids = Array.from(tbody.querySelectorAll('tr[data-id]'))
                    .map(row => row.getAttribute('data-id'));
                saveCategoryOrder(ids);
            }
        });

    } catch (error) {
        console.error("Erro ao carregar categorias:", error);
    }
}

// --- CRITERIA ---
async function loadCriteria() {
    if (!currentCategoryId) return;

    try {
        const { data, error } = await supabaseAdmin
            .from('criterios')
            .select('*')
            .eq('categoria_id', currentCategoryId)
            .order('nome', { ascending: true });

        if (error) throw error;
        criteria = data;

        const tbody = document.getElementById('table-body-criterios');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (criteria.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--gemini-text-secondary);">Nenhum critério cadastrado para esta categoria.</td></tr>';
            return;
        }

        criteria.forEach(crit => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${crit.nome}</strong></td>
                <td>
                    <span class="badge ${crit.direcao_padrao === 'max' ? 'badge-success' : 'badge-secondary'}">
                        ${crit.direcao_padrao === 'max' ? 'Maximizar (Maior é melhor)' : 'Minimizar (Menor é melhor)'}
                    </span>
                </td>
                <td>${crit.direcao_editavel ? 'Sim' : 'Não'}</td>
                <td>
                    <span style="font-size: 0.85rem; color: var(--gemini-text-secondary);">
                        ${[crit.tooltip, crit.tooltip_min, crit.tooltip_max].filter(Boolean).join(' | ') || '-'}
                    </span>
                </td>
                <td style="text-align: center;">
                    <button class="btn-action-icon btn-edit-criterion" data-id="${crit.id}" title="Editar">
                        <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                    </button>
                    <button class="btn-action-icon btn-danger-icon btn-delete-criterion" data-id="${crit.id}" title="Excluir">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-edit-criterion').forEach(btn => {
            btn.addEventListener('click', () => editCriterion(btn.getAttribute('data-id')));
        });
        document.querySelectorAll('.btn-delete-criterion').forEach(btn => {
            btn.addEventListener('click', () => deleteCriterion(btn.getAttribute('data-id')));
        });

    } catch (error) {
        console.error("Erro ao carregar critérios:", error);
    }
}

// --- ALTERNATIVES ---
async function loadAlternatives() {
    if (!currentCategoryId) return;

    try {
        const { data, error } = await supabaseAdmin
            .from('alternativas')
            .select('*')
            .eq('categoria_id', currentCategoryId)
            .order('marca', { ascending: true })
            .order('modelo', { ascending: true });

        if (error) throw error;
        alternatives = data;

        const tbody = document.getElementById('table-body-alternativas');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (alternatives.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--gemini-text-secondary);">Nenhuma alternativa cadastrada para esta categoria.</td></tr>';
            return;
        }

        alternatives.forEach(alt => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${alt.marca}</strong></td>
                <td>${alt.modelo}</td>
                <td style="text-align: center;">
                    <button class="btn-action-icon btn-edit-alternative" data-id="${alt.id}" title="Editar">
                        <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                    </button>
                    <button class="btn-action-icon btn-danger-icon btn-delete-alternative" data-id="${alt.id}" title="Excluir">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-edit-alternative').forEach(btn => {
            btn.addEventListener('click', () => editAlternative(btn.getAttribute('data-id')));
        });
        document.querySelectorAll('.btn-delete-alternative').forEach(btn => {
            btn.addEventListener('click', () => deleteAlternative(btn.getAttribute('data-id')));
        });

    } catch (error) {
        console.error("Erro ao carregar alternativas:", error);
    }
}

// --- MATRIX (CONSEQUENCES) ---
async function loadConsequencesMatrix() {
    if (!currentCategoryId) return;

    try {
        // 1. Fetch criteria and alternatives synchronously for consistency
        const resCriteria = await supabaseAdmin
            .from('criterios')
            .select('*')
            .eq('categoria_id', currentCategoryId)
            .order('nome', { ascending: true });

        const resAlternatives = await supabaseAdmin
            .from('alternativas')
            .select('*')
            .eq('categoria_id', currentCategoryId)
            .order('marca', { ascending: true })
            .order('modelo', { ascending: true });

        if (resCriteria.error) throw resCriteria.error;
        if (resAlternatives.error) throw resAlternatives.error;

        criteria = resCriteria.data;
        alternatives = resAlternatives.data;

        // If no criteria or alternatives exist, guide user
        const thead = document.getElementById('matrix-table-head');
        const tbody = document.getElementById('matrix-table-body');
        if (!thead || !tbody) return;

        if (criteria.length === 0 || alternatives.length === 0) {
            thead.innerHTML = '';
            tbody.innerHTML = '<tr><td style="text-align: center; padding: 2rem; color: var(--gemini-text-secondary);">Cadastre critérios e alternativas antes de definir a matriz.</td></tr>';
            return;
        }

        // 2. Fetch consequences
        // Extract alt and criteria ids
        const alternativeIds = alternatives.map(a => a.id);
        const criteriaIds = criteria.map(c => c.id);

        const { data: resConsequences, error: errConsequences } = await supabaseAdmin
            .from('consequencias')
            .select('*')
            .in('alternativa_id', alternativeIds)
            .in('criterio_id', criteriaIds);

        if (errConsequences) throw errConsequences;
        consequences = resConsequences;

        // Build mapping lookup for consequences
        const consequenceMap = {};
        consequences.forEach(cons => {
            consequenceMap[`${cons.alternativa_id}_${cons.criterio_id}`] = cons.valor;
        });

        // 3. Render Header
        thead.innerHTML = '';
        const headerTr = document.createElement('tr');
        headerTr.innerHTML = '<th>Alternativa</th>';
        criteria.forEach(crit => {
            const th = document.createElement('th');
            th.innerHTML = `${crit.nome} <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.75;">(${crit.direcao_padrao})</span>`;
            headerTr.appendChild(th);
        });
        thead.appendChild(headerTr);

        // 4. Render Body rows
        tbody.innerHTML = '';
        alternatives.forEach(alt => {
            const tr = document.createElement('tr');
            
            // Label cell
            const labelTd = document.createElement('td');
            labelTd.innerHTML = `<strong>${alt.marca}</strong> ${alt.modelo}`;
            tr.appendChild(labelTd);

            // Inputs cell
            criteria.forEach(crit => {
                const td = document.createElement('td');
                const key = `${alt.id}_${crit.id}`;
                const val = consequenceMap[key] !== undefined ? consequenceMap[key] : '';
                
                const input = document.createElement('input');
                input.type = 'number';
                input.step = 'any';
                input.value = val;
                input.placeholder = '-';
                input.dataset.altId = alt.id;
                input.dataset.critId = crit.id;
                
                // Track edit behavior
                input.addEventListener('input', (e) => {
                    const newVal = e.target.value.trim();
                    if (newVal === '') {
                        unsavedConsequences[key] = null; // Mark for deletion/clearing
                    } else {
                        unsavedConsequences[key] = parseFloat(newVal);
                    }
                    input.classList.add('matrix-unsaved');
                });

                td.appendChild(input);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar matriz de consequências:", error);
    }
}

// ==========================================
// ACTIONS INITIALIZATION (CREATE / UPDATE / DELETE)
// ==========================================
function initActions() {
    // CATEGORY
    document.getElementById('btn-add-category')?.addEventListener('click', async () => {
        const defaultIcon = 'box';
        const { value: formValues } = await Swal.fire({
            title: 'Nova Categoria',
            html:
                '<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">' +
                '  <label for="swal-cat-nome" style="font-weight: 600;">Nome da Categoria</label>' +
                '  <input id="swal-cat-nome" class="admin-input" style="width: 100%; box-sizing: border-box;" placeholder="Ex: Notebook, TV">' +
                '</div>' +
                '<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">' +
                '  <label for="swal-cat-icone" style="font-weight: 600;">Ícone Selecionado</label>' +
                '  <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">' +
                '    <div id="swal-icon-preview" style="display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; background: var(--gemini-input-bg); border: 1px solid var(--gemini-border); border-radius: 12px; color: var(--gemini-primary);">' +
                `      <i data-lucide="${defaultIcon}" style="width: 24px; height: 24px;"></i>` +
                '    </div>' +
                `    <input id="swal-cat-icone" class="admin-input" style="flex: 1; min-width: 0;" value="${defaultIcon}" readonly>` +
                '  </div>' +
                '  <div class="admin-form-group" style="margin-bottom: 0.75rem; text-align: left;">' +
                '    <label for="swal-icon-search" style="font-weight: 600; font-size: 0.85rem;">Buscar Ícone (em português):</label>' +
                '    <input id="swal-icon-search" class="admin-input" style="width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; font-size: 0.9rem;" placeholder="Ex: celular, tela, controle...">' +
                '  </div>' +
                '  <label style="font-weight: 600; font-size: 0.8rem; color: var(--gemini-text-secondary);">Escolha um ícone da galeria:</label>' +
                generateIconPickerHtml(defaultIcon) +
                '</div>',
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Cadastrar',
            cancelButtonText: 'Cancelar',
            didOpen: (modal) => {
                if (window.lucide) {
                    window.lucide.createIcons();
                }
                const inputIcon = modal.querySelector('#swal-cat-icone');
                const preview = modal.querySelector('#swal-icon-preview');
                const buttons = modal.querySelectorAll('.icon-picker-btn');
                const searchInput = modal.querySelector('#swal-icon-search');
                
                searchInput.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase().trim();
                    buttons.forEach(btn => {
                        const iconName = btn.getAttribute('data-icon');
                        const keywords = ICON_KEYWORDS[iconName] || [];
                        const matches = !term || 
                                        iconName.includes(term) || 
                                        keywords.some(kw => kw.includes(term));
                        btn.style.display = matches ? 'flex' : 'none';
                    });
                });
                
                buttons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        buttons.forEach(b => {
                            b.classList.remove('selected');
                            b.style.border = '1px solid transparent';
                            b.style.background = 'transparent';
                        });
                        btn.classList.add('selected');
                        btn.style.border = '2px solid var(--gemini-primary)';
                        btn.style.background = 'rgba(138, 100, 255, 0.15)';
                        
                        const iconName = btn.getAttribute('data-icon');
                        if (inputIcon) {
                            inputIcon.value = iconName;
                        }
                        if (preview) {
                            preview.innerHTML = `<i data-lucide="${iconName}" style="width: 24px; height: 24px;"></i>`;
                            if (window.lucide) {
                                window.lucide.createIcons();
                            }
                        }
                    });
                });
            },
            preConfirm: () => {
                const nome = document.getElementById('swal-cat-nome').value.trim();
                const icone = document.getElementById('swal-cat-icone').value.trim() || 'box';
                if (!nome) {
                    Swal.showValidationMessage('O nome da categoria é obrigatório.');
                    return false;
                }
                return { nome, icone, ativo: true };
            }
        });

        if (formValues) {
            try {
                const { error } = await supabaseAdmin
                    .from('categorias')
                    .insert([formValues]);

                if (error) throw error;
                Swal.fire({ icon: 'success', title: 'Sucesso', text: 'Categoria criada com sucesso!' });
                await loadCategories();
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'Erro', text: error.message || 'Erro ao criar categoria.' });
            }
        }
    });

    // CRITERION
    document.getElementById('btn-add-criterion')?.addEventListener('click', async () => {
        if (!currentCategoryId) return;

        const { value: formValues } = await Swal.fire({
            title: 'Novo Critério',
            html:
                '<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">' +
                '  <label for="swal-crit-nome" style="font-weight: 600;">Nome do Critério</label>' +
                '  <input id="swal-crit-nome" class="admin-input" style="width: 100%; box-sizing: border-box;" placeholder="Ex: Preço, Bateria, Peso">' +
                '</div>' +
                '<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">' +
                '  <label for="swal-crit-dir" style="font-weight: 600;">Direção de Otimização</label>' +
                '  <select id="swal-crit-dir" class="admin-select" style="width: 100%; box-sizing: border-box;">' +
                '    <option value="max">Maximizar (Maior é melhor - ex: Bateria, RAM)</option>' +
                '    <option value="min">Minimizar (Menor é melhor - ex: Preço, Peso)</option>' +
                '  </select>' +
                '</div>' +
                '<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">' +
                '  <label for="swal-crit-edit" style="font-weight: 600;">Editável pelo usuário?</label>' +
                '  <select id="swal-crit-edit" class="admin-select" style="width: 100%; box-sizing: border-box;">' +
                '    <option value="true">Sim (Permite que o usuário insira pesos no chat)</option>' +
                '    <option value="false">Não (Fixo ou ignorado do edit direto)</option>' +
                '  </select>' +
                '</div>' +
                '<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">' +
                '  <label for="swal-crit-tooltip" style="font-weight: 600;">Tooltip explicativo geral</label>' +
                '  <input id="swal-crit-tooltip" class="admin-input" style="width: 100%; box-sizing: border-box;" placeholder="Opcional">' +
                '</div>' +
                '<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">' +
                '  <label for="swal-crit-tooltip-min" style="font-weight: 600;">Tooltip para Diminuir (Minimização)</label>' +
                '  <input id="swal-crit-tooltip-min" class="admin-input" style="width: 100%; box-sizing: border-box;" placeholder="Opcional">' +
                '</div>' +
                '<div class="admin-form-group" style="text-align: left;">' +
                '  <label for="swal-crit-tooltip-max" style="font-weight: 600;">Tooltip para Aumentar (Maximização)</label>' +
                '  <input id="swal-crit-tooltip-max" class="admin-input" style="width: 100%; box-sizing: border-box;" placeholder="Opcional">' +
                '</div>',
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Cadastrar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const nome = document.getElementById('swal-crit-nome').value.trim();
                const direcao_padrao = document.getElementById('swal-crit-dir').value;
                const editavel = document.getElementById('swal-crit-edit').value === 'true';
                const tooltip = document.getElementById('swal-crit-tooltip').value.trim();
                const tooltip_min = document.getElementById('swal-crit-tooltip-min').value.trim();
                const tooltip_max = document.getElementById('swal-crit-tooltip-max').value.trim();
                if (!nome) {
                    Swal.showValidationMessage('O nome do critério é obrigatório.');
                    return false;
                }
                return { 
                    nome, 
                    direcao_padrao, 
                    direcao_editavel: editavel, 
                    tooltip: tooltip || null, 
                    tooltip_min: tooltip_min || null,
                    tooltip_max: tooltip_max || null,
                    categoria_id: currentCategoryId, 
                    ativo: true 
                };
            }
        });

        if (formValues) {
            try {
                const { error } = await supabaseAdmin
                    .from('criterios')
                    .insert([formValues]);

                if (error) throw error;
                Swal.fire({ icon: 'success', title: 'Sucesso', text: 'Critério criado com sucesso!' });
                await loadCriteria();
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'Erro', text: error.message || 'Erro ao criar critério.' });
            }
        }
    });

    // ALTERNATIVE
    document.getElementById('btn-add-alternative')?.addEventListener('click', async () => {
        if (!currentCategoryId) return;

        const { value: formValues } = await Swal.fire({
            title: 'Nova Alternativa (Produto)',
            html:
                '<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">' +
                '  <label for="swal-alt-marca" style="font-weight: 600;">Marca</label>' +
                '  <input id="swal-alt-marca" class="admin-input" style="width: 100%; box-sizing: border-box;" placeholder="Ex: Apple, Dell, Sony">' +
                '</div>' +
                '<div class="admin-form-group" style="text-align: left;">' +
                '  <label for="swal-alt-modelo" style="font-weight: 600;">Modelo</label>' +
                '  <input id="swal-alt-modelo" class="admin-input" style="width: 100%; box-sizing: border-box;" placeholder="Ex: iPhone 15, Latitude 5440">' +
                '</div>',
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Cadastrar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const marca = document.getElementById('swal-alt-marca').value.trim();
                const modelo = document.getElementById('swal-alt-modelo').value.trim();
                if (!marca || !modelo) {
                    Swal.showValidationMessage('Marca e Modelo são obrigatórios.');
                    return false;
                }
                return { marca, modelo, categoria_id: currentCategoryId };
            }
        });

        if (formValues) {
            try {
                const { error } = await supabaseAdmin
                    .from('alternativas')
                    .insert([formValues]);

                if (error) throw error;
                Swal.fire({ icon: 'success', title: 'Sucesso', text: 'Alternativa criada com sucesso!' });
                await loadAlternatives();
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'Erro', text: error.message || 'Erro ao criar alternativa.' });
            }
        }
    });

    // MATRIX SAVE
    document.getElementById('btn-save-matrix')?.addEventListener('click', async () => {
        const keys = Object.keys(unsavedConsequences);
        if (keys.length === 0) {
            Swal.fire({ icon: 'info', title: 'Sem alterações', text: 'Não há alterações pendentes para salvar.' });
            return;
        }

        Swal.fire({
            title: 'Salvando...',
            html: 'Salvando valores das especificações no banco de dados.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            // Group operations: upsert values
            const upsertData = [];
            const deletePromises = [];

            for (const key of keys) {
                const [altId, critId] = key.split('_');
                const val = unsavedConsequences[key];
                
                if (val === null) {
                    // Delete consequence if cleared
                    deletePromises.push(
                        supabaseAdmin
                            .from('consequencias')
                            .delete()
                            .eq('alternativa_id', altId)
                            .eq('criterio_id', critId)
                    );
                } else {
                    upsertData.push({
                        alternativa_id: altId,
                        criterio_id: critId,
                        valor: val
                    });
                }
            }

            // Execute upserts
            if (upsertData.length > 0) {
                const { error: upsertError } = await supabaseAdmin
                    .from('consequencias')
                    .upsert(upsertData, { onConflict: 'alternativa_id,criterio_id' });

                if (upsertError) throw upsertError;
            }

            // Execute deletions
            if (deletePromises.length > 0) {
                const deleteResults = await Promise.all(deletePromises);
                const failedDelete = deleteResults.find(r => r.error);
                if (failedDelete) throw failedDelete.error;
            }

            unsavedConsequences = {}; // Clear track state
            Swal.fire({ icon: 'success', title: 'Sucesso', text: 'Matriz salva com sucesso!' });
            await loadConsequencesMatrix();

        } catch (error) {
            console.error("Erro ao salvar matriz:", error);
            Swal.fire({ icon: 'error', title: 'Erro ao Salvar', text: error.message || 'Erro durante a sincronização com o Supabase.' });
        }
    });
}

// ==========================================
// EDIT / DELETE FUNCTIONS
// ==========================================

// Portuguese translation keywords map for Lucide icons search
const ICON_KEYWORDS = {
    'laptop': ['notebook', 'computador', 'laptop', 'pc', 'tela'],
    'tv': ['tv', 'televisao', 'televisão', 'tela', 'televisor'],
    'gamepad-2': ['jogo', 'game', 'console', 'videogame', 'controle', 'playstation', 'xbox'],
    'smartphone': ['celular', 'telefone', 'smartphone', 'iphone', 'mobile'],
    'tablet': ['tablet', 'ipad', 'tela', 'mobile'],
    'headphones': ['fone', 'ouvido', 'headphone', 'headset', 'som', 'musica', 'música'],
    'camera': ['camera', 'câmera', 'foto', 'fotografia', 'filmadora'],
    'watch': ['relogio', 'relógio', 'smartwatch', 'hora', 'tempo'],
    'monitor': ['monitor', 'tela', 'pc', 'computador'],
    'speaker': ['caixa de som', 'som', 'alto falante', 'speaker', 'musica', 'música'],
    'hard-drive': ['disco', 'hd', 'ssd', 'armazenamento', 'memoria', 'memória'],
    'cpu': ['processador', 'cpu', 'chip', 'placa', 'hardware'],
    'car': ['carro', 'veiculo', 'veículo', 'auto', 'automovel', 'automóvel'],
    'home': ['casa', 'lar', 'residencia', 'residência', 'home'],
    'shirt': ['camisa', 'camiseta', 'roupa', 'vestuario', 'vestuário', 'moda'],
    'shopping-bag': ['sacola', 'compras', 'bolsa', 'loja'],
    'activity': ['atividade', 'saude', 'saúde', 'batimento', 'cardio', 'exercicio', 'exercício'],
    'book-open': ['livro', 'leitura', 'estudo', 'educacao', 'educação'],
    'briefcase': ['maleta', 'trabalho', 'negocios', 'negócios', 'pasta'],
    'coffee': ['cafe', 'café', 'bebida', 'copo', 'xicara', 'xícara', 'cafeteira'],
    'gift': ['presente', 'brinde', 'lembranca', 'lembrança', 'natal'],
    'heart': ['coracao', 'coração', 'amor', 'favorito', 'curtir'],
    'music': ['musica', 'música', 'nota', 'som', 'audio', 'áudio'],
    'wrench': ['ferramenta', 'chave', 'conserto', 'manutencao', 'manutenção'],
    'box': ['caixa', 'pacote', 'embalagem', 'outros', 'padrao', 'padrão'],
    'shopping-cart': ['carrinho', 'compras', 'mercado'],
    'mouse': ['mouse', 'computador', 'pc', 'periferico', 'periférico'],
    'keyboard': ['teclado', 'computador', 'pc', 'periferico', 'periférico', 'digitar'],
    'printer': ['impressora', 'papel', 'imprimir'],
    'wifi': ['wifi', 'wi-fi', 'internet', 'conexao', 'conexão', 'rede'],
    'shield': ['escudo', 'seguranca', 'segurança', 'protecao', 'proteção', 'defesa'],
    'lock': ['cadeado', 'senha', 'seguranca', 'segurança', 'bloqueio'],
    'user': ['usuario', 'usuário', 'perfil', 'pessoa', 'cliente'],
    'settings': ['configuracao', 'configuração', 'ajustes', 'engrenagem'],
    'bell': ['sino', 'notificacao', 'notificação', 'alerta', 'aviso'],
    'calendar': ['calendario', 'calendário', 'data', 'compromisso', 'agenda'],
    'map-pin': ['localizacao', 'localização', 'mapa', 'pino', 'endereco', 'endereço'],
    'compass': ['bussola', 'bússola', 'direcao', 'direção', 'guia', 'viagem'],
    'globe': ['globo', 'mundo', 'terra', 'site', 'web'],
    'umbrella': ['guarda-chuva', 'chuva', 'protecao', 'proteção'],
    'sun': ['sol', 'dia', 'claro', 'calor'],
    'moon': ['lua', 'noite', 'escuro', 'sono'],
    'cloud': ['nuvem', 'clima', 'tempo'],
    'zap': ['raio', 'energia', 'rapido', 'rápido', 'eletricidade'],
    'flame': ['fogo', 'chama', 'quente', 'calor']
};

// Helper to generate Lucide Icon Picker HTML
function generateIconPickerHtml(currentIcon) {
    const icons = [
        'laptop', 'tv', 'gamepad-2', 'smartphone', 'tablet',
        'headphones', 'camera', 'watch', 'monitor', 'speaker',
        'hard-drive', 'cpu', 'car', 'home', 'shirt',
        'shopping-bag', 'activity', 'book-open', 'briefcase', 'coffee',
        'gift', 'heart', 'music', 'wrench', 'box',
        'shopping-cart', 'mouse', 'keyboard', 'printer', 'wifi',
        'shield', 'lock', 'user', 'settings', 'bell',
        'calendar', 'map-pin', 'compass', 'globe', 'umbrella',
        'sun', 'moon', 'cloud', 'zap', 'flame'
    ];
    
    let gridHtml = `<div class="icon-picker-grid">`;
    
    icons.forEach(icon => {
        const isSelected = icon === currentIcon;
        gridHtml += `
            <button type="button" class="icon-picker-btn ${isSelected ? 'selected' : ''}" data-icon="${icon}" title="${icon}">
                <i data-lucide="${icon}" style="width: 20px; height: 20px;"></i>
            </button>
        `;
    });
    
    gridHtml += `</div>`;
    return gridHtml;
}

// --- CATEGORY EDIT / DELETE ---
async function editCategory(id) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    const currentIcon = cat.icone || 'box';

    const { value: formValues } = await Swal.fire({
        title: 'Editar Categoria',
        html:
            `<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">` +
            `  <label for="swal-cat-nome" style="font-weight: 600;">Nome da Categoria</label>` +
            `  <input id="swal-cat-nome" class="admin-input" style="width: 100%; box-sizing: border-box;" value="${cat.nome}">` +
            `</div>` +
            `<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">` +
            `  <label for="swal-cat-icone" style="font-weight: 600;">Ícone Selecionado</label>` +
            `  <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">` +
            `    <div id="swal-icon-preview" style="display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; background: var(--gemini-input-bg); border: 1px solid var(--gemini-border); border-radius: 12px; color: var(--gemini-primary);">` +
            `      <i data-lucide="${currentIcon}" style="width: 24px; height: 24px;"></i>` +
            `    </div>` +
            `    <input id="swal-cat-icone" class="admin-input" style="flex: 1; min-width: 0;" value="${currentIcon}" readonly>` +
            `  </div>` +
            `  <div class="admin-form-group" style="margin-bottom: 0.75rem; text-align: left;">` +
            `    <label for="swal-icon-search" style="font-weight: 600; font-size: 0.85rem;">Buscar Ícone (em português):</label>` +
            `    <input id="swal-icon-search" class="admin-input" style="width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; font-size: 0.9rem;" placeholder="Ex: celular, tela, controle...">'` +
            `  </div>` +
            `  <label style="font-weight: 600; font-size: 0.8rem; color: var(--gemini-text-secondary);">Escolha um ícone da galeria:</label>` +
            `  ${generateIconPickerHtml(currentIcon)}` +
            `</div>`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Salvar',
        cancelButtonText: 'Cancelar',
        didOpen: (modal) => {
            if (window.lucide) {
                window.lucide.createIcons();
            }
            const inputIcon = modal.querySelector('#swal-cat-icone');
            const preview = modal.querySelector('#swal-icon-preview');
            const buttons = modal.querySelectorAll('.icon-picker-btn');
            const searchInput = modal.querySelector('#swal-icon-search');
            
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase().trim();
                buttons.forEach(btn => {
                    const iconName = btn.getAttribute('data-icon');
                    const keywords = ICON_KEYWORDS[iconName] || [];
                    const matches = !term || 
                                    iconName.includes(term) || 
                                    keywords.some(kw => kw.includes(term));
                    btn.style.display = matches ? 'flex' : 'none';
                });
            });
            
            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    buttons.forEach(b => {
                        b.classList.remove('selected');
                        b.style.border = '1px solid transparent';
                        b.style.background = 'transparent';
                    });
                    btn.classList.add('selected');
                    btn.style.border = '2px solid var(--gemini-primary)';
                    btn.style.background = 'rgba(138, 100, 255, 0.15)';
                    
                    const iconName = btn.getAttribute('data-icon');
                    if (inputIcon) {
                        inputIcon.value = iconName;
                    }
                    if (preview) {
                        preview.innerHTML = `<i data-lucide="${iconName}" style="width: 24px; height: 24px;"></i>`;
                        if (window.lucide) {
                            window.lucide.createIcons();
                        }
                    }
                });
            });
        },
        preConfirm: () => {
            const nome = document.getElementById('swal-cat-nome').value.trim();
            const icone = document.getElementById('swal-cat-icone').value.trim() || 'box';
            if (!nome) {
                Swal.showValidationMessage('O nome da categoria é obrigatório.');
                return false;
            }
            return { nome, icone };
        }
    });

    if (formValues) {
        try {
            const { error } = await supabaseAdmin
                .from('categorias')
                .update(formValues)
                .eq('id', id);

            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'Sucesso', text: 'Categoria atualizada!' });
            await loadCategories();
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Erro', text: error.message });
        }
    }
}

async function deleteCategory(id) {
    const confirm = await Swal.fire({
        title: 'Excluir Categoria?',
        text: "Isso apagará permanentemente todos os critérios, alternativas e consequências desta categoria!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sim, excluir!',
        cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
        try {
            const { error } = await supabaseAdmin
                .from('categorias')
                .delete()
                .eq('id', id);

            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'Excluído!', text: 'Categoria removida.' });
            await loadCategories();
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Erro', text: error.message });
        }
    }
}

// --- CRITERIA EDIT / DELETE ---
async function editCriterion(id) {
    const crit = criteria.find(c => c.id === id);
    if (!crit) return;

    const { value: formValues } = await Swal.fire({
        title: 'Editar Critério',
        html:
            `<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">` +
            `  <label for="swal-crit-nome" style="font-weight: 600;">Nome do Critério</label>` +
            `  <input id="swal-crit-nome" class="admin-input" style="width: 100%; box-sizing: border-box;" value="${crit.nome}">` +
            `</div>` +
            `<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">` +
            `  <label for="swal-crit-dir" style="font-weight: 600;">Direção de Otimização</label>` +
            `  <select id="swal-crit-dir" class="admin-select" style="width: 100%; box-sizing: border-box;">` +
            `    <option value="max" ${crit.direcao_padrao === 'max' ? 'selected' : ''}>Maximizar (Maior é melhor)</option>` +
            `    <option value="min" ${crit.direcao_padrao === 'min' ? 'selected' : ''}>Minimizar (Menor é melhor)</option>` +
            `  </select>` +
            `</div>` +
            `<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">` +
            `  <label for="swal-crit-edit" style="font-weight: 600;">Editável pelo usuário?</label>` +
            `  <select id="swal-crit-edit" class="admin-select" style="width: 100%; box-sizing: border-box;">` +
            `    <option value="true" ${crit.direcao_editavel ? 'selected' : ''}>Sim</option>` +
            `    <option value="false" ${!crit.direcao_editavel ? 'selected' : ''}>Não</option>` +
            `  </select>` +
            `</div>` +
            `<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">` +
            `  <label for="swal-crit-tooltip" style="font-weight: 600;">Tooltip explicativo geral</label>` +
            `  <input id="swal-crit-tooltip" class="admin-input" style="width: 100%; box-sizing: border-box;" value="${crit.tooltip || ''}">` +
            `</div>` +
            `<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">` +
            `  <label for="swal-crit-tooltip-min" style="font-weight: 600;">Tooltip para Diminuir (Minimização)</label>` +
            `  <input id="swal-crit-tooltip-min" class="admin-input" style="width: 100%; box-sizing: border-box;" value="${crit.tooltip_min || ''}">` +
            `</div>` +
            `<div class="admin-form-group" style="text-align: left;">` +
            `  <label for="swal-crit-tooltip-max" style="font-weight: 600;">Tooltip para Aumentar (Maximização)</label>` +
            `  <input id="swal-crit-tooltip-max" class="admin-input" style="width: 100%; box-sizing: border-box;" value="${crit.tooltip_max || ''}">` +
            `</div>`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Salvar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const nome = document.getElementById('swal-crit-nome').value.trim();
            const direcao_padrao = document.getElementById('swal-crit-dir').value;
            const editavel = document.getElementById('swal-crit-edit').value === 'true';
            const tooltip = document.getElementById('swal-crit-tooltip').value.trim();
            const tooltip_min = document.getElementById('swal-crit-tooltip-min').value.trim();
            const tooltip_max = document.getElementById('swal-crit-tooltip-max').value.trim();
            if (!nome) {
                Swal.showValidationMessage('O nome do critério é obrigatório.');
                return false;
            }
            return { 
                nome, 
                direcao_padrao, 
                direcao_editavel: editavel, 
                tooltip: tooltip || null,
                tooltip_min: tooltip_min || null,
                tooltip_max: tooltip_max || null
            };
        }
    });

    if (formValues) {
        try {
            const { error } = await supabaseAdmin
                .from('criterios')
                .update(formValues)
                .eq('id', id);

            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'Sucesso', text: 'Critério atualizado!' });
            await loadCriteria();
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Erro', text: error.message });
        }
    }
}

async function deleteCriterion(id) {
    const confirm = await Swal.fire({
        title: 'Excluir Critério?',
        text: "Isso apagará permanentemente este critério e todas as suas consequências associadas!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sim, excluir!',
        cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
        try {
            const { error } = await supabaseAdmin
                .from('criterios')
                .delete()
                .eq('id', id);

            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'Excluído!', text: 'Critério removido.' });
            await loadCriteria();
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Erro', text: error.message });
        }
    }
}

// --- ALTERNATIVE EDIT / DELETE ---
async function editAlternative(id) {
    const alt = alternatives.find(a => a.id === id);
    if (!alt) return;

    const { value: formValues } = await Swal.fire({
        title: 'Editar Alternativa',
        html:
            `<div class="admin-form-group" style="margin-bottom: 1rem; text-align: left;">` +
            `  <label for="swal-alt-marca" style="font-weight: 600;">Marca</label>` +
            `  <input id="swal-alt-marca" class="admin-input" style="width: 100%; box-sizing: border-box;" value="${alt.marca}">` +
            `</div>` +
            `<div class="admin-form-group" style="text-align: left;">` +
            `  <label for="swal-alt-modelo" style="font-weight: 600;">Modelo</label>` +
            `  <input id="swal-alt-modelo" class="admin-input" style="width: 100%; box-sizing: border-box;" value="${alt.modelo}">` +
            `</div>`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Salvar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const marca = document.getElementById('swal-alt-marca').value.trim();
            const modelo = document.getElementById('swal-alt-modelo').value.trim();
            if (!marca || !modelo) {
                Swal.showValidationMessage('Marca e Modelo são obrigatórios.');
                return false;
            }
            return { marca, modelo };
        }
    });

    if (formValues) {
        try {
            const { error } = await supabaseAdmin
                .from('alternativas')
                .update(formValues)
                .eq('id', id);

            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'Sucesso', text: 'Alternativa atualizada!' });
            await loadAlternatives();
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Erro', text: error.message });
        }
    }
}

async function deleteAlternative(id) {
    const confirm = await Swal.fire({
        title: 'Excluir Alternativa?',
        text: "Isso apagará permanentemente esta alternativa e todos os seus valores de especificação!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sim, excluir!',
        cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
        try {
            const { error } = await supabaseAdmin
                .from('alternativas')
                .delete()
                .eq('id', id);

            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'Excluído!', text: 'Alternativa removida.' });
            await loadAlternatives();
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Erro', text: error.message });
        }
    }
}

// --- USER PERMISSIONS ---
async function loadUsersPermissions() {
    try {
        const { data: profiles, error } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .order('full_name', { ascending: true });

        if (error) throw error;

        const tbody = document.getElementById('table-body-permissoes');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (!profiles || profiles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--gemini-text-secondary);">Nenhum usuário cadastrado.</td></tr>';
            return;
        }

        profiles.forEach(profile => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${profile.full_name || '-'}</strong></td>
                <td>${profile.email || '-'}</td>
                <td style="text-align: center; vertical-align: middle;">
                    <div class="badge-dropdown select-role-user ${profile.role === 'admin' ? 'badge-success' : 'badge-secondary'}" data-id="${profile.id}" tabindex="0" style="position: relative; margin: 0 auto; display: inline-flex;">
                        <div class="badge-dropdown-selected">${profile.role === 'admin' ? 'Administrador' : 'Usuário'}</div>
                        <div class="badge-dropdown-options" style="min-width: 140px;">
                            <div class="badge-option" data-value="admin" style="color: #22c55e; font-weight: bold;">Administrador</div>
                            <div class="badge-option" data-value="user" style="color: #94a3b8; font-weight: bold;">Usuário</div>
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Attach event listeners for custom status dropdowns
        document.querySelectorAll('.select-role-user').forEach(dropdown => {
            dropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other open dropdowns
                document.querySelectorAll('.badge-dropdown.open').forEach(openDd => {
                    if (openDd !== dropdown) openDd.classList.remove('open');
                });
                dropdown.classList.toggle('open');
            });

            const options = dropdown.querySelectorAll('.badge-option');
            options.forEach(option => {
                option.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    dropdown.classList.remove('open');
                    
                    const userId = dropdown.getAttribute('data-id');
                    const newRole = option.getAttribute('data-value');
                    const newText = option.innerText;
                    const oldRole = dropdown.classList.contains('badge-success') ? 'admin' : 'user';
                    const oldText = oldRole === 'admin' ? 'Administrador' : 'Usuário';
                    
                    if (newRole === oldRole) return;
                    
                    // Optimistically update classes and text in UI
                    const selectedDiv = dropdown.querySelector('.badge-dropdown-selected');
                    if (selectedDiv) {
                        selectedDiv.innerText = newText;
                    }
                    if (newRole === 'admin') {
                        dropdown.classList.remove('badge-secondary');
                        dropdown.classList.add('badge-success');
                    } else {
                        dropdown.classList.remove('badge-success');
                        dropdown.classList.add('badge-secondary');
                    }
                    
                    try {
                        const { error } = await supabaseAdmin
                            .from('profiles')
                            .update({ role: newRole })
                            .eq('id', userId);

                        if (error) throw error;
                        
                        Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'success',
                            title: 'Permissão atualizada com sucesso!',
                            showConfirmButton: false,
                            timer: 3000,
                            timerProgressBar: true
                        });
                    } catch (error) {
                        // Revert changes in UI on error
                        if (selectedDiv) {
                            selectedDiv.innerText = oldText;
                        }
                        if (oldRole === 'admin') {
                            dropdown.classList.remove('badge-secondary');
                            dropdown.classList.add('badge-success');
                        } else {
                            dropdown.classList.remove('badge-success');
                            dropdown.classList.add('badge-secondary');
                        }
                        Swal.fire({ icon: 'error', title: 'Erro', text: error.message || 'Erro ao atualizar permissão.' });
                    }
                });
            });
        });

    } catch (error) {
        console.error("Erro ao carregar permissões:", error);
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

