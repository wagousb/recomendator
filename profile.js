// ==========================================
// PROFILE MANAGEMENT LOGIC FOR RECOMENDATOR
// ==========================================

const SUPABASE_URL = 'https://dblstsdluzmclcsyaqpa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibHN0c2RsdXptY2xjc3lhcXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODU3MTIsImV4cCI6MjA5NTY2MTcxMn0.ySFb_7Jfs-X81mGgSl8dPmub35JJQXXTr8b4jlDcnt0';

let supabase = null;
let deferredPrompt = null;

// Catch the PWA install prompt globally
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallUI();
});

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Supabase
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (error) {
        console.error("Erro ao inicializar Supabase no perfil:", error);
        Swal.fire({
            icon: 'error',
            title: 'Erro de Conexão',
            text: 'Não foi possível conectar ao banco de dados.'
        });
        return;
    }

    // 2. Check Auth Session
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
        window.location.href = 'login.html';
        return;
    }

    // 3. Populate Inputs
    const user = session.user;
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    
    if (nameInput) {
        nameInput.value = user.user_metadata?.full_name || '';
        nameInput.placeholder = 'Digite seu nome completo';
    }
    if (emailInput) {
        emailInput.value = user.email || '';
        emailInput.placeholder = 'seu@email.com';
    }

    // 4. Show admin backlink if user is administrator
    const ADMIN_EMAILS = ['wagou.sb@gmail.com'];
    const userEmail = user.email || '';
    const adminBackLink = document.getElementById('adminBackLink');
    if (adminBackLink && ADMIN_EMAILS.includes(userEmail.toLowerCase())) {
        adminBackLink.style.display = 'block';
    }

    // 5. Handle Form Submission
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const newName = nameInput.value.trim();
            const newEmail = emailInput.value.trim();
            const newPassword = document.getElementById('password').value;
            const submitBtn = document.getElementById('btn-save-profile');

            if (!newName || !newEmail) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Campos obrigatórios',
                    text: 'Nome Completo e E-mail não podem ficar em branco.'
                });
                return;
            }

            // Disable button during process
            const originalText = submitBtn.innerText;
            submitBtn.innerText = 'Salvando...';
            submitBtn.disabled = true;

            try {
                let nameUpdated = false;
                let passwordUpdated = false;
                let emailUpdated = false;

                // A. Update full name if changed
                const currentName = user.user_metadata?.full_name || '';
                if (newName !== currentName) {
                    const { error: nameError } = await supabase.auth.updateUser({
                        data: { full_name: newName }
                    });
                    if (nameError) throw nameError;
                    nameUpdated = true;
                }

                // B. Update password if filled
                if (newPassword) {
                    if (newPassword.length < 8) {
                        throw new Error('A nova senha deve ter no mínimo 8 caracteres.');
                    }
                    const { error: passError } = await supabase.auth.updateUser({
                        password: newPassword
                    });
                    if (passError) throw passError;
                    passwordUpdated = true;
                }

                // C. Update email if changed
                const currentEmail = user.email || '';
                if (newEmail.toLowerCase() !== currentEmail.toLowerCase()) {
                    // OAuth Redirect Url support warning (optional verification check)
                    if (window.location.protocol === 'file:') {
                        throw new Error('A alteração de e-mail requer que o app seja executado sob um servidor web (http://) para processar os redirects de verificação.');
                    }
                    const { error: emailError } = await supabase.auth.updateUser({
                        email: newEmail
                    });
                    if (emailError) throw emailError;
                    emailUpdated = true;
                }

                // Restore button state
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;

                // Formulate success message
                let messageParts = [];
                if (nameUpdated) messageParts.push('Nome completo atualizado.');
                if (passwordUpdated) messageParts.push('Senha de acesso alterada.');
                if (emailUpdated) {
                    messageParts.push('Solicitação de e-mail enviada! Verifique ambas as caixas de entrada (antigo e novo e-mail) para confirmar a alteração antes de logar com o novo endereço.');
                }

                if (messageParts.length === 0) {
                    Swal.fire({
                        icon: 'info',
                        title: 'Nenhuma alteração',
                        text: 'Você não modificou nenhum dado.'
                    });
                } else {
                    Swal.fire({
                        icon: 'success',
                        title: 'Sucesso!',
                        html: messageParts.join('<br><br>'),
                        confirmButtonColor: 'var(--primary-color)'
                    }).then(() => {
                        // Clear password input if successfully updated
                        const passInput = document.getElementById('password');
                        if (passInput) passInput.value = '';
                        
                        // If email was changed, let's sign out to prevent session mismatch
                        if (emailUpdated) {
                            fazerLogout();
                        } else {
                            // Reload page to refresh session variables
                            window.location.reload();
                        }
                    });
                }

            } catch (err) {
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
                
                Swal.fire({
                    icon: 'error',
                    title: 'Erro na atualização',
                    text: err.message || 'Houve um erro ao tentar salvar as alterações.'
                });
            }
        });
    }

    // 6. Initialize PWA Install UI Check
    updateInstallUI();
});

// Update the PWA installation UI elements
function updateInstallUI() {
    const installContainer = document.getElementById('pwaInstallContainer');
    const installBtn = document.getElementById('btnInstallPWA');
    if (!installContainer || !installBtn) return;

    // Check if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (isStandalone) {
        installContainer.style.display = 'none';
        return;
    }

    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (isIOS) {
        // iOS manual instruction prompt
        installContainer.style.display = 'block';
        installBtn.innerText = 'Instalar no iPhone';
        installBtn.onclick = () => {
            Swal.fire({
                title: 'Instalar no iPhone',
                html: `
                    <div style="text-align: left; font-size: 0.9rem; line-height: 1.55;">
                        <p>Siga estes passos simples para adicionar o aplicativo à sua tela inicial:</p>
                        <ol style="margin-top: 0.5rem; padding-left: 1.25rem;">
                            <li>Toque no botão de <strong>Compartilhar</strong> 📤 (na barra inferior do Safari).</li>
                            <li>Role a lista para baixo e toque em <strong>"Adicionar à Tela de Início"</strong> ➕.</li>
                            <li>Toque em <strong>"Adicionar"</strong> no canto superior direito para confirmar.</li>
                        </ol>
                    </div>
                `,
                icon: 'info',
                confirmButtonText: 'Entendi',
                confirmButtonColor: 'var(--primary-color)'
            });
        };
    } else if (deferredPrompt) {
        // Android / Chrome / Windows / macOS PWA trigger
        installContainer.style.display = 'block';
        installBtn.innerText = 'Instalar Aplicativo';
        installBtn.onclick = () => {
            installBtn.disabled = true;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    Swal.fire({
                        icon: 'success',
                        title: 'Instalado!',
                        text: 'O aplicativo foi adicionado à sua tela de início.',
                        timer: 1500,
                        showConfirmButton: false
                    });
                    installContainer.style.display = 'none';
                }
                deferredPrompt = null;
                installBtn.disabled = false;
            });
        };
    } else {
        // If not standalone, and no deferredPrompt is stashed yet, hide it
        installContainer.style.display = 'none';
    }
}
