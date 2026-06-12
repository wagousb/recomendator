// ==========================================
// THEME MANAGER
// ==========================================
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

// Global SweetAlert2 defaults – apply modern Gemini theme to ALL popups
if (typeof Swal !== 'undefined') {
    const SwalDefault = Swal.mixin({
        customClass: { popup: 'swal-gemini' },
        buttonsStyling: true
    });
    window.Swal = SwalDefault;
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (!icon) return;
    
    if (theme === 'light') {
        // Ícone de Lua
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    } else {
        // Ícone de Sol
        icon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
    }
}

function syncLogosWithTheme() {
    document.querySelectorAll('.sidebar-brand-duck img, .header-brand-duck img').forEach(img => {
        img.src = 'patinho-amarelo.svg';
    });
}

// Configura o botão imediatamente (o script está no final do body)
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
    updateThemeIcon(savedTheme);
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
        syncLogosWithTheme();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    syncLogosWithTheme();
});

// ==========================================
// SUPABASE & AUTHENTICATION
// ==========================================
try {
    const SUPABASE_URL = 'https://dblstsdluzmclcsyaqpa.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibHN0c2RsdXptY2xjc3lhcXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODU3MTIsImV4cCI6MjA5NTY2MTcxMn0.ySFb_7Jfs-X81mGgSl8dPmub35JJQXXTr8b4jlDcnt0';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    document.addEventListener('DOMContentLoaded', () => {
        verificarSessao();

        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('name').value;
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                const submitBtn = registerForm.querySelector('button');
                const originalText = submitBtn.innerText;
                
                submitBtn.innerText = 'Carregando...';
                submitBtn.disabled = true;

                const { data, error } = await supabase.auth.signUp({
                    email: email, password: password,
                    options: { data: { full_name: name } }
                });

                submitBtn.innerText = originalText;
                submitBtn.disabled = false;

                if (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Erro no cadastro',
                        text: error.message,
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)'
                    });
                } else {
                    Swal.fire({
                        icon: 'success',
                        title: 'Sucesso!',
                        text: 'Cadastro realizado com sucesso!',
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)',
                        confirmButtonColor: 'var(--primary-color)'
                    }).then(() => {
                        window.location.href = 'login.html';
                    });
                }
            });
        }

        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                const submitBtn = loginForm.querySelector('button');
                const originalText = submitBtn.innerText;
                
                submitBtn.innerText = 'Entrando...';
                submitBtn.disabled = true;

                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email, password: password
                });

                submitBtn.innerText = originalText;
                submitBtn.disabled = false;

                if (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Erro no login',
                        text: error.message,
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)'
                    });
                } else {
                    window.location.href = 'chat.html'; 
                }
            });
        }

        const googleLoginBtn = document.getElementById('googleLoginBtn');
        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                // OAuth is not supported over file:// protocol by Google & Supabase Redirect URIs
                if (window.location.protocol === 'file:') {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Servidor local necessário',
                        text: 'O login com o Google requer que o app seja executado sob um servidor web (http:// ou https://) e configurado no painel do Supabase. Para testes locais, por favor utilize o login convencional de e-mail e senha.',
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)',
                        confirmButtonColor: 'var(--primary-color)'
                    });
                    return;
                }

                googleLoginBtn.disabled = true;
                const originalContent = googleLoginBtn.innerHTML;
                googleLoginBtn.innerHTML = `
                    <svg class="spinner" viewBox="0 0 50 50" style="width: 18px; height: 18px; margin-right: 10px; animation: rotate 2s linear infinite; display: inline-block; vertical-align: middle;">
                        <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5" stroke="currentColor" stroke-linecap="round" style="stroke-dasharray: 1, 150; stroke-dashoffset: 0; animation: dash 1.5s ease-in-out infinite;"></circle>
                    </svg>
                    Conectando...
                `;

                const redirectUrl = window.location.origin + window.location.pathname.replace(/\/(login|register)\.html$/, '/chat.html');

                const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: redirectUrl
                    }
                });

                if (error) {
                    googleLoginBtn.innerHTML = originalContent;
                    googleLoginBtn.disabled = false;
                    Swal.fire({
                        icon: 'error',
                        title: 'Erro de Autenticação',
                        text: error.message,
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)'
                    });
                }
            });
        }
    });

    async function verificarSessao() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const path = window.location.pathname.toLowerCase();
            const isLandingOrAuthPage = 
                path === '' ||
                path === '/' || 
                path.endsWith('/') || 
                path.endsWith('index.html') || 
                path.endsWith('login.html') || 
                path.endsWith('register.html');
                
            if (isLandingOrAuthPage) {
                window.location.href = 'chat.html';
                return;
            }
        }
    }

    window.fazerLogout = async function() {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    }

    // ----- Lógica do Dashboard -----
    window.carregarTentativas = async function() {
        const listElement = document.getElementById('attemptsList');
        if (!listElement) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                listElement.innerHTML = '<li class="attempt-item loading-text">Você precisa estar logado para ver o histórico.</li>';
                return;
            }

            const { data, error } = await supabase
                .from('avaliacoes')
                .select('*')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.warn("Erro ao buscar avaliações:", error);
                listElement.innerHTML = '<li class="attempt-item loading-text" style="color: #ef4444;">Erro ao carregar seu histórico.</li>';
            } else if (data && data.length > 0) {
                renderTentativas(listElement, data);
            } else {
                listElement.innerHTML = '<li class="attempt-item loading-text">Nenhuma avaliação encontrada. Crie sua primeira!</li>';
            }
        } catch (err) {
            console.error(err);
            listElement.innerHTML = '<li class="attempt-item loading-text" style="color: #ef4444;">Erro ao conectar com o servidor.</li>';
        }
    }

    function renderTentativas(listElement, data) {
        listElement.innerHTML = '';
        data.forEach(item => {
            const dateObj = new Date(item.created_at);
            const dataFormatada = dateObj.toLocaleDateString('pt-BR') + ' - ' + dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            
            const isFinalizado = (item.status === 'concluido' || !!item.modelo_celular);
            
            const statusHtml = isFinalizado 
                ? `<div style="display: flex; align-items: center; gap: 0.5rem; color: #10b981; font-size: 0.85rem; font-weight: 600;">
                     <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                     Concluído
                   </div>`
                : `<div style="display: flex; align-items: center; gap: 0.5rem; color: #f59e0b; font-size: 0.85rem; font-weight: 600;">
                     <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                     Em andamento
                   </div>`;
                   
            const targetUrl = `chat.html?id=${item.id}&mode=${item.categoria_id}`;
            const attemptName = item.nome || item.modelo_celular || 'Nova Avaliação';
            
            listElement.innerHTML += `
                <li class="attempt-item" style="padding: 0; display: flex; align-items: stretch; position: relative; overflow: hidden; transition: all 0.2s;">
                    <a href="${targetUrl}" style="flex: 1; padding: 1rem; display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: inherit;">
                        <div class="attempt-info">
                            <span class="attempt-name" style="display: flex; align-items: center; gap: 0.5rem;">
                                ${attemptName}
                                <button onclick="renameAvaliacao(event, '${item.id}', '${attemptName}')" style="background: transparent; border: 1px solid var(--glass-border); border-radius: 4px; padding: 0.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                            </span>
                            <span class="attempt-date">${dataFormatada}</span>
                        </div>
                        ${statusHtml}
                    </a>
                    <button class="delete-btn" onclick="excluirAvaliacao('${item.id}', event)" title="Excluir Avaliação">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </li>
            `;
        });
    }

    window.renameAvaliacao = async function(e, id, currentName) {
        e.preventDefault();
        e.stopPropagation();
        
        const { value: newName } = await Swal.fire({
            title: 'Renomear Avaliação',
            input: 'text',
            inputLabel: 'Novo nome',
            inputValue: currentName,
            showCancelButton: true,
            confirmButtonText: 'Salvar',
            cancelButtonText: 'Cancelar',
            background: 'var(--bg-color)',
            color: 'var(--text-primary)',
            confirmButtonColor: 'var(--primary-color)'
        });

        if (newName && newName.trim() !== '' && newName !== currentName) {
            const { error } = await supabase.from('avaliacoes').update({ nome: newName }).eq('id', id);
            if (error) {
                Swal.fire({
                    title: 'Erro!',
                    text: 'Não foi possível renomear.',
                    icon: 'error',
                    background: 'var(--bg-color)',
                    color: 'var(--text-primary)'
                });
            } else {
                carregarTentativas();
            }
        }
    }

    window.excluirAvaliacao = async function(id, event) {
        if (event) event.stopPropagation();
        
        const result = await Swal.fire({
            title: 'Excluir Avaliação?',
            text: "Você não poderá reverter isso!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: 'var(--glass-border)',
            confirmButtonText: 'Sim, excluir!',
            cancelButtonText: 'Cancelar',
            background: 'var(--input-bg)',
            color: 'var(--text-primary)'
        });

        if (!result.isConfirmed) return;
        
        try {
            const { error } = await supabase.from('avaliacoes').delete().eq('id', id);
            if (error) throw error;
            carregarTentativas();
            Swal.fire({
                icon: 'success',
                title: 'Excluído!',
                text: 'A avaliação foi deletada.',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (err) {
            console.error(err);
            Swal.fire({
                icon: 'error',
                title: 'Erro',
                text: 'Erro ao excluir avaliação.',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)'
            });
        }
    }

    // ----- Lógica do Dashboard com Avaliação Única -----
    window.carregarDashboard = async function() {
        const mainArea = document.getElementById('mainDashboardArea');
        if (!mainArea) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                mainArea.innerHTML = `
                    <div class="empty-state-card">
                        <p class="empty-state-text">Você precisa estar logado para acessar o painel.</p>
                        <a href="login.html" class="btn btn-primary" style="display: inline-flex; width: auto;">Fazer Login</a>
                    </div>
                `;
                return;
            }

            // Exibir nome do usuário no cabeçalho
            const userFullName = session.user.user_metadata?.full_name || session.user.email.split('@')[0] || "Usuário";
            const firstName = userFullName.trim().split(' ')[0];
            const h1Title = document.querySelector('.header h1');
            if (h1Title) {
                h1Title.innerText = `Olá, ${firstName}`;
            }
            const pSubtitle = document.getElementById('dashboard-subtitle');
            if (pSubtitle) {
                pSubtitle.innerText = "Bem-vindo de volta!";
            }

            // Buscar avaliações (o mais recente do usuário)
            const { data, error } = await supabase
                .from('avaliacoes')
                .select('*')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Erro ao carregar avaliações:", error);
                mainArea.innerHTML = '<div style="color: #ef4444; text-align: center;">Erro ao carregar seus dados. Tente novamente mais tarde.</div>';
                return;
            }

            const activeAval = data && data.length > 0 ? data[0] : null;
            const savedState = activeAval ? (activeAval.state_json || {}) : {};
            const orderedCriteriaIds = savedState.orderedCriteriaIds || [];

            if (activeAval && (activeAval.status === 'concluido' || orderedCriteriaIds.length > 0)) {
                mainArea.innerHTML = '<div class="loading-text">Calculando o ranking das alternativas...</div>';

                // Buscar critérios da avaliação
                const { data: relacoes, error: relError } = await supabase
                    .from('avaliacao_criterios')
                    .select('id, criterio_id, direcao_escolhida, valor_mediano, criterios(nome)')
                    .eq('avaliacao_id', activeAval.id);

                if (relError) throw relError;

                // Buscar alternativas para esta categoria
                const { data: alternativesData, error: altError } = await supabase
                    .from('alternativas')
                    .select('*')
                    .eq('categoria_id', activeAval.categoria_id);
                if (altError) throw altError;

                const altIds = alternativesData.map(a => a.id);
                let specs = [];
                if (altIds.length > 0) {
                    const { data: specData, error: specError } = await supabase
                        .from('consequencias')
                        .select('criterio_id, alternativa_id, valor, alternativas(modelo, marca)')
                        .in('alternativa_id', altIds);
                    if (specError) throw specError;
                    specs = specData;
                }

                // Mapear alternativas
                const altMap = {};
                specs.forEach(s => {
                    if (!altMap[s.alternativa_id]) {
                        altMap[s.alternativa_id] = {
                            id: s.alternativa_id,
                            nome: `${s.alternativas.marca} ${s.alternativas.modelo}`,
                            valores: {}
                        };
                    }
                    altMap[s.alternativa_id].valores[s.criterio_id] = Number(s.valor);
                });
                const alternativas = Object.values(altMap);

                // Mapear critérios
                const criterios = [];
                for (const rel of relacoes) {
                    const c_specs = specs.filter(s => s.criterio_id === rel.criterio_id).map(s => Number(s.valor));
                    let minReal = 0, maxReal = 100;
                    if (c_specs.length > 0) {
                        minReal = Math.min(...c_specs);
                        maxReal = Math.max(...c_specs);
                    }
                    if (minReal === maxReal) {
                        minReal *= 0.5; maxReal *= 1.5;
                    }
                    criterios.push({
                        rel_id: rel.id,
                        id: rel.criterio_id,
                        nome: rel.criterios.nome,
                        direcao: rel.direcao_escolhida,
                        v50: rel.valor_mediano,
                        minReal: minReal,
                        maxReal: maxReal
                    });
                }

                // Calcular utilidades marginais
                alternativas.forEach(alt => {
                    alt.utilidades = {};
                    criterios.forEach(crit => {
                        const val = alt.valores[crit.id] || 0;
                        const isMax = crit.direcao === 'max';
                        const W = isMax ? crit.minReal : crit.maxReal;
                        const B = isMax ? crit.maxReal : crit.minReal;
                        let u = 0;

                        if (crit.v50 === null || crit.v50 === undefined) {
                            u = (val - W) / (B - W);
                        } else {
                            if (isMax) {
                                if (val <= crit.v50) {
                                    u = 0.5 * (val - W) / (crit.v50 - W);
                                } else {
                                    u = 0.5 + 0.5 * (val - crit.v50) / (B - crit.v50);
                                }
                            } else {
                                if (val >= crit.v50) {
                                    u = 0.5 * (W - val) / (W - crit.v50);
                                } else {
                                    u = 0.5 + 0.5 * (crit.v50 - val) / (crit.v50 - B);
                                }
                            }
                        }
                        if (u < 0) u = 0;
                        if (u > 1) u = 1;
                        alt.utilidades[crit.id] = u;
                    });
                });

                // Resolver dominância
                const weightConstraints = savedState.weightConstraints || [];
                const ties = savedState.ties || {};
                criterios.forEach(c => {
                    if (ties[c.id]) c.tieWith = ties[c.id];
                });

                function solveDominanceLocal(altI, altK) {
                    const model = {
                        optimize: "diff",
                        opType: "max",
                        constraints: { "sum_w": { equal: 1 } },
                        variables: {}
                    };
                    orderedCriteriaIds.forEach((cId, idx) => {
                        const vName = `w_${cId}`;
                        const u_i = altI.utilidades[cId] || 0;
                        const u_k = altK.utilidades[cId] || 0;
                        model.variables[vName] = {
                            "diff": u_i - u_k,
                            "sum_w": 1
                        };
                        if (idx < orderedCriteriaIds.length - 1) {
                            const nextCId = orderedCriteriaIds[idx + 1];
                            const nextCrit = criterios.find(c => c.id === nextCId);
                            const isTied = nextCrit && (nextCrit.tieWith === cId);
                            const constraintName = `ord_${cId}_${nextCId}`;
                            model.constraints[constraintName] = isTied ? { equal: 0 } : { min: 0 };
                            model.variables[vName][constraintName] = 1;
                        }
                        if (idx > 0) {
                            const prevCId = orderedCriteriaIds[idx - 1];
                            const constraintName = `ord_${prevCId}_${cId}`;
                            model.variables[vName][constraintName] = -1;
                        }
                    });
                    weightConstraints.forEach((c, idx) => {
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

                const N = alternativas.length;
                const dominanceMatrix = Array(N).fill(null).map(() => Array(N).fill(0));
                for (let i = 0; i < N; i++) {
                    for (let k = 0; k < N; k++) {
                        if (i === k) continue;
                        const maxD_ik = solveDominanceLocal(alternativas[i], alternativas[k]);
                        const maxD_ki = solveDominanceLocal(alternativas[k], alternativas[i]);
                        if (maxD_ik < -0.0001) {
                            dominanceMatrix[k][i] = 1; // K dominates I
                        } else if (Math.abs(maxD_ik) <= 0.0001 && Math.abs(maxD_ki) <= 0.0001) {
                            dominanceMatrix[i][k] = 'I';
                        }
                    }
                }

                let S = alternativas.map((_, idx) => idx);
                const levels = [];
                while (S.length > 0) {
                    const nonDominated = S.filter(i => {
                        const isDominated = S.some(k => dominanceMatrix[k][i] === 1);
                        return !isDominated;
                    });
                    if (nonDominated.length === 0) {
                        levels.push(S);
                        break;
                    }
                    levels.push(nonDominated);
                    S = S.filter(i => !nonDominated.includes(i));
                }

                // Renderizar ranking
                let html = '';
                if (activeAval.status === 'concluido') {
                    html = `
                        <h2 class="ranking-title">Seu Ranking de Celulares</h2>
                        <p class="ranking-subtitle">Calculado com base no seu perfil de preferências do dia ${new Date(activeAval.created_at).toLocaleDateString('pt-BR')}.</p>
                        <ul class="ranking-list">
                    `;
                } else {
                    html = `
                        <h2 class="ranking-title" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                            Seu Ranking de Celulares (Parcial)
                            <span class="badge badge-min" style="text-transform: none; font-size: 0.8rem; padding: 0.25rem 0.5rem; background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 20px; font-weight: 600; letter-spacing: normal;">
                                Em Andamento
                            </span>
                        </h2>
                        <p class="ranking-subtitle">Este é o ranking parcial obtido com base nos critérios ordenados até o momento. Você pode continuar respondendo às perguntas de tradeoff para desempatar e refinar o ranking.</p>
                        <ul class="ranking-list">
                    `;
                }

                const isComplete = levels.every(level => level.length === 1);
                levels.forEach((level, idx) => {
                    level.forEach(altId => {
                        const alt = alternativas[altId];
                        
                        // Analyze relationships with other alternatives in the SAME level
                        const sameLevelAlts = level.filter(id => id !== altId);
                        let relationHTML = '';

                        if (sameLevelAlts.length > 0) {
                            const ties = [];
                            const incomparables = [];

                            sameLevelAlts.forEach(otherId => {
                                const otherAlt = alternativas[otherId];
                                
                                // Check matrix
                                const rel = dominanceMatrix[altId][otherId];
                                const relRev = dominanceMatrix[otherId][altId];

                                if (rel === 'I' || relRev === 'I') {
                                    ties.push(otherAlt.nome);
                                } else if (rel === 0 && relRev === 0) {
                                    incomparables.push(otherAlt.nome);
                                }
                            });

                            if (ties.length > 0) {
                                relationHTML = `<div style="font-size: 0.8rem; color: #10b981; margin-top: 0.25rem; font-weight: 500;">🤝 Empatado com: ${ties.join(', ')}</div>`;
                            } else if (incomparables.length > 0) {
                                relationHTML = `<div style="font-size: 0.8rem; color: #f59e0b; margin-top: 0.25rem; font-weight: 500;">⚖️ Incomparável com: ${incomparables.join(', ')}</div>`;
                            }
                        }

                        html += `
                            <li class="ranking-item" style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.4rem;">
                                <div style="display: flex; align-items: center; width: 100%; gap: 1rem;">
                                    <div class="ranking-badge">${idx + 1}</div>
                                    <span class="ranking-name" style="flex-grow: 1;">${alt.nome}</span>
                                    <span class="ranking-tier">${isComplete ? (idx === 0 ? 'Melhor Escolha' : `Nível ${idx + 1}`) : `Nível ${idx + 1}`}</span>
                                </div>
                                ${relationHTML ? `<div style="padding-left: 2.8rem;">${relationHTML}</div>` : ''}
                            </li>
                        `;
                    });
                });
                let buttonsHTML = '';
                if (activeAval.status === 'concluido') {
                    buttonsHTML = `
                        <a href="chat.html?id=${activeAval.id}&step=criteria" class="btn btn-secondary" style="margin-top:0;">Alterar Critérios Selecionados</a>
                        <a href="chat.html?id=${activeAval.id}&step=intracriteria" class="btn btn-secondary" style="margin-top:0;">Visualizar/Ajustar meus níveis de exigência</a>
                        <a href="chat.html?id=${activeAval.id}&step=intercriteria" class="btn btn-primary" style="margin-top:0;">Visualizar/Ajustar minhas prioridades</a>
                    `;
                } else {
                    buttonsHTML = `
                        <a href="chat.html?id=${activeAval.id}&step=criteria" class="btn btn-secondary" style="margin-top:0;">Alterar Critérios Selecionados</a>
                        <a href="chat.html?id=${activeAval.id}&step=intracriteria" class="btn btn-secondary" style="margin-top:0;">Visualizar/Ajustar meus níveis de exigência</a>
                        <a href="chat.html?id=${activeAval.id}&step=intercriteria" class="btn btn-primary" style="margin-top:0;">Continuar definição de prioridades</a>
                    `;
                }

                html += `
                    </ul>
                    <div class="dashboard-buttons">
                        ${buttonsHTML}
                    </div>
                `;
                mainArea.innerHTML = html;

            } else if (activeAval) {
                // Avaliação em andamento (sem critérios ordenados ainda)
                mainArea.innerHTML = `
                    <div class="empty-state-card">
                        <div class="empty-state-icon">⏳</div>
                        <h2 class="ranking-title" style="text-align: center !important;">Ranking em Andamento</h2>
                        <p class="empty-state-text">Você possui uma avaliação iniciada, mas os critérios ainda não foram ordenados para gerar o ranking.</p>
                        <div class="dashboard-buttons" style="justify-content: center;">
                            <a href="chat.html?id=${activeAval.id}&step=criteria" class="btn btn-secondary" style="margin-top:0; max-width: 250px;">Alterar Critérios Selecionados</a>
                            <a href="chat.html?id=${activeAval.id}&step=intracriteria" class="btn btn-secondary" style="margin-top:0; max-width: 250px;">Visualizar/Ajustar meus níveis de exigência</a>
                            <a href="chat.html?id=${activeAval.id}&step=intercriteria" class="btn btn-primary" style="margin-top:0; max-width: 250px;">Continuar definição de prioridades</a>
                        </div>
                    </div>
                `;
            } else {
                // Sem nenhuma avaliação
                mainArea.innerHTML = `
                    <div class="empty-state-card">
                        <div class="empty-state-icon">📱</div>
                        <h2 class="ranking-title" style="text-align: center !important;">Nenhum Ranking Obtido</h2>
                        <p class="empty-state-text">Você ainda não traçou o seu perfil de preferências para calcularmos o melhor celular para você.</p>
                        <a href="chat.html?step=criteria" class="btn btn-primary" style="width: auto; padding: 0.8rem 2rem; margin: 0 auto; display: inline-flex;">Iniciar Avaliação</a>
                    </div>
                `;
            }

        } catch (err) {
            console.error("Erro no dashboard:", err);
            mainArea.innerHTML = `<div style="color: #ef4444; text-align: center;">Erro crítico: ${err.message || err}</div>`;
        }
    }

    window.resetarTradeoffs = async function(id) {
        const result = await Swal.fire({
            title: 'Ajustar Elicitação?',
            text: 'Isso irá resetar suas respostas de tradeoffs e ordenação de pesos para que você possa redefinir seu perfil. Seus níveis de exigência (50%) serão mantidos.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--primary-color)',
            cancelButtonColor: 'var(--glass-border)',
            confirmButtonText: 'Sim, ajustar!',
            cancelButtonText: 'Cancelar',
            background: 'var(--input-bg)',
            color: 'var(--text-primary)'
        });

        if (!result.isConfirmed) return;

        try {
            const { data: avalData } = await supabase
                .from('avaliacoes')
                .select('state_json')
                .eq('id', id)
                .single();
            
            const existing = (avalData && avalData.state_json) ? avalData.state_json : {};
            const intracriterio = existing.intracriterio || {};

            const payload = {
                orderedCriteriaIds: [],
                weightConstraints: [],
                currentQuestionRank: 0,
                currentBounds: [0, 1],
                heuristicDone: false,
                ties: {},
                intracriterio: intracriterio
            };

            const { error } = await supabase
                .from('avaliacoes')
                .update({ state_json: payload, status: 'pendente' })
                .eq('id', id);

            if (error) throw error;

            window.location.href = `chat.html?id=${id}&step=intercriteria`;
        } catch (err) {
            console.error("Erro ao resetar tradeoffs:", err);
            Swal.fire({
                icon: 'error',
                title: 'Erro',
                text: 'Não foi possível redefinir as preferências.',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)'
            });
        }
    }

} catch (err) {
    console.error("Erro ao inicializar o Supabase: ", err);
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

