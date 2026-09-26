// Supabase Configuration
const SUPABASE_URL = 'https://uvaoanwfkjzssynqaaeg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_GFAMtGSkcs4EKtrH8CCbtg_sX-7WGVW';
const PRIMARY_DEV_ADMIN = 'kentvincentboter444@gmail.com';

let sbClient = null;
let pendingLoginEmail = '';
let pendingLoginName = '';
let allAppointments = [];
let allAdmins = [];
let allVehicles = [];
let realtimeRevokeChannel = null;

async function ensureSupabaseClient(retries = 15) {
    if (sbClient) return sbClient;
    for (let i = 0; i < retries; i++) {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            return sbClient;
        }
        await new Promise(res => setTimeout(res, 150));
    }
    return null;
}

function getAdminRedirectUrl() {
    return window.location.origin + window.location.pathname;
}

// ==========================================
// 1. ACTIVE AUTHORIZATION & KICK-OUT GUARDS
// ==========================================
async function forceRevocationLogout(reason = 'Your administrator access has been revoked.') {
    console.warn('Revocation triggered:', reason);
    const client = await ensureSupabaseClient();
    if (client) {
        try {
            await client.auth.signOut();
        } catch (e) {
            console.error('Signout error:', e);
        }
    }
    localStorage.removeItem('active_admin_email');
    localStorage.removeItem('active_admin_name');
    alert(reason);
    location.reload();
}

async function verifyCurrentAdminAuthorization(email) {
    if (!email) return false;
    if (email.toLowerCase() === PRIMARY_DEV_ADMIN.toLowerCase()) return true;

    const client = await ensureSupabaseClient();
    if (!client) return true;

    try {
        const { data, error } = await client
            .from('admins')
            .select('email')
            .eq('email', email.toLowerCase())
            .maybeSingle();

        if (error || !data) {
            await forceRevocationLogout();
            return false;
        }
        return true;
    } catch (err) {
        console.error('Authorization check failed:', err);
        return true;
    }
}

async function startRealtimeRevocationListener(email) {
    if (!email || email.toLowerCase() === PRIMARY_DEV_ADMIN.toLowerCase()) return;

    const client = await ensureSupabaseClient();
    if (!client) return;

    if (realtimeRevokeChannel) {
        client.removeChannel(realtimeRevokeChannel);
    }

    realtimeRevokeChannel = client
        .channel('public:admins:revocation')
        .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'admins' },
            async () => {
                await verifyCurrentAdminAuthorization(email);
            }
        )
        .subscribe();
}

// ==========================================
// 2. SUPABASE AUTH 6-DIGIT OTP FLOW
// ==========================================
window.requestOtpCode = async function() {
    const emailInput = document.getElementById('adminEmailInput');
    const btn = document.getElementById('btnRequestOtp');
    if (!emailInput) return;

    const email = emailInput.value.trim().toLowerCase();
    if (!email) {
        showAuthMsg('Please enter your Gmail address.', 'error');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Verifying authorization...';
    }
    showAuthMsg('Checking admin whitelist...', 'info');

    const client = await ensureSupabaseClient();
    if (!client) {
        showAuthMsg('Cannot connect to database. Check internet connection.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Send 6-Digit Code';
        }
        return;
    }

    try {
        let isAuthorized = false;
        let adminName = 'Samuel Tamsi';

        const { data, error } = await client
            .from('admins')
            .select('email, name')
            .eq('email', email)
            .single();

        if (data && !error) {
            isAuthorized = true;
            if (data.name && data.name.trim() !== '') {
                adminName = data.name.trim();
            }
        } else if (email === PRIMARY_DEV_ADMIN.toLowerCase()) {
            isAuthorized = true;
            adminName = 'Kent Vincent';
        }

        if (!isAuthorized) {
            showAuthMsg('Access Denied: This Gmail is not authorized as an administrator.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Send 6-Digit Code';
            }
            return;
        }

        if (btn) btn.textContent = 'Sending code to Gmail...';
        const { error: otpError } = await client.auth.signInWithOtp({
            email: email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: getAdminRedirectUrl()
            }
        });

        if (otpError) {
            console.error('Supabase OTP dispatch error:', otpError);
            showAuthMsg(`Failed to send code: ${otpError.message}`, 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Send 6-Digit Code';
            }
            return;
        }

        pendingLoginEmail = email;
        pendingLoginName = adminName;
        document.getElementById('authSection').classList.add('hidden');
        document.getElementById('otpSection').classList.remove('hidden');
        document.getElementById('otpPromptText').textContent = `We sent a code to ${email}. Click the code inside the email or enter it below.`;
        document.getElementById('otpCodeInput').value = '';
        document.getElementById('otpCodeInput').focus();

    } catch (err) {
        console.error('Verification error:', err);
        showAuthMsg(`Error: ${err.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Send 6-Digit Code';
        }
    }
};

window.verifyOtpCode = async function() {
    const otpInput = document.getElementById('otpCodeInput');
    const btn = document.getElementById('btnVerifyOtp');
    if (!otpInput) return;

    const token = otpInput.value.trim();
    if (token.length < 6) {
        showOtpMsg('Please enter all 6 digits.', 'error');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Verifying code...';
    }
    showOtpMsg('Validating code...', 'info');

    const client = await ensureSupabaseClient();
    if (!client) {
        showOtpMsg('Connection failed. Please retry.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Verify & Unlock';
        }
        return;
    }

    try {
        const { data, error } = await client.auth.verifyOtp({
            email: pendingLoginEmail,
            token: token,
            type: 'email'
        });

        if (error) {
            console.error('OTP Verification Error:', error);
            showOtpMsg('Invalid or expired code. Please check your email.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Verify & Unlock';
            }
            return;
        }

        showOtpMsg('Verification successful! Opening dashboard...', 'success');
        localStorage.setItem('active_admin_email', pendingLoginEmail);
        localStorage.setItem('active_admin_name', pendingLoginName);
        setTimeout(() => {
            showDashboard(pendingLoginEmail, pendingLoginName);
        }, 300);

    } catch (err) {
        console.error('Verify error:', err);
        showOtpMsg(`Verification failed: ${err.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Verify & Unlock';
        }
    }
};

window.backToEmailStep = function() {
    document.getElementById('otpSection').classList.add('hidden');
    document.getElementById('authSection').classList.remove('hidden');
};

window.handleLogout = async function() {
    const client = await ensureSupabaseClient();
    if (client) {
        await client.auth.signOut();
    }
    localStorage.removeItem('active_admin_email');
    localStorage.removeItem('active_admin_name');
    location.reload();
};

function showAuthMsg(text, type) {
    const el = document.getElementById('authMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `form-message ${type}`;
    el.classList.remove('hidden');
}

function showOtpMsg(text, type) {
    const el = document.getElementById('otpMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `form-message ${type}`;
    el.classList.remove('hidden');
}

function showDashboard(email, name) {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('otpSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');

    const greetingElement = document.getElementById('adminGreetingName');
    if (greetingElement) {
        greetingElement.textContent = name || 'Samuel Tamsi';
    }

    startLiveClock();
    startRealtimeRevocationListener(email);
    fetchAppointments();
    fetchVehicles();
    loadSiteContent();
    fetchAdmins();
}

function startLiveClock() {
    const clockElement = document.getElementById('liveClock');
    if (!clockElement) return;

    function tick() {
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit'
        };
        clockElement.textContent = now.toLocaleDateString('en-US', options);
    }

    tick();
    if (!window.clockTimer) {
        window.clockTimer = setInterval(tick, 1000);
    }
}

// ==========================================
// 3. TABS NAVIGATION
// ==========================================
window.switchTab = async function(tabName) {
    const activeEmail = localStorage.getItem('active_admin_email');
    const isAuthorized = await verifyCurrentAdminAuthorization(activeEmail);
    if (!isAuthorized) return;

    const tabAppts = document.getElementById('tabAppointments');
    const tabVeh = document.getElementById('tabVehicles');
    const tabWeb = document.getElementById('tabWebsite');
    const tabSet = document.getElementById('tabSettings');

    const btnAppts = document.getElementById('btnTabAppointments');
    const btnVeh = document.getElementById('btnTabVehicles');
    const btnWeb = document.getElementById('btnTabWebsite');
    const btnSet = document.getElementById('btnTabSettings');

    [tabAppts, tabVeh, tabWeb, tabSet].forEach(t => t.classList.add('hidden'));
    [btnAppts, btnVeh, btnWeb, btnSet].forEach(b => b.classList.remove('active'));

    if (tabName === 'appointments') {
        tabAppts.classList.remove('hidden');
        btnAppts.classList.add('active');
    } else if (tabName === 'vehicles') {
        tabVeh.classList.remove('hidden');
        btnVeh.classList.add('active');
        fetchVehicles();
    } else if (tabName === 'website') {
        tabWeb.classList.remove('hidden');
        btnWeb.classList.add('active');
        loadSiteContent();
    } else if (tabName === 'settings') {
        tabSet.classList.remove('hidden');
        btnSet.classList.add('active');
        fetchAdmins();
    }
};

// ==========================================
// 4. APPOINTMENTS MANAGEMENT
// ==========================================
window.fetchAppointments = async function() {
    const activeEmail = localStorage.getItem('active_admin_email');
    const isAuthorized = await verifyCurrentAdminAuthorization(activeEmail);
    if (!isAuthorized) return;

    const tbody = document.getElementById('appointmentsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Connecting to database...</td></tr>`;

    const client = await ensureSupabaseClient();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('appointments')
            .select('*')
            .order('appointment_date', { ascending: true })
            .order('appointment_time', { ascending: true });

        if (error) throw error;

        allAppointments = data || [];
        updateMetrics(allAppointments);
        renderAppointmentsTable();
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color: #dc2626;">Failed to load data: ${err.message}</td></tr>`;
    }
};

window.renderAppointmentsTable = function() {
    const tbody = document.getElementById('appointmentsTableBody');
    const statusFilter = document.getElementById('statusFilter');
    const serviceFilter = document.getElementById('serviceFilter');
    if (!tbody) return;

    const statusVal = statusFilter ? statusFilter.value : 'all';
    const serviceVal = serviceFilter ? serviceFilter.value : 'all';

    const filtered = allAppointments.filter(item => {
        const matchesStatus = statusVal === 'all' || (item.status && item.status.toLowerCase() === statusVal.toLowerCase());
        const matchesService = serviceVal === 'all' || item.service === serviceVal;
        return matchesStatus && matchesService;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No appointments found matching criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(app => `
        <tr>
            <td>
                <strong>${formatDate(app.appointment_date)}</strong><br>
                <span style="color: #6b7280;">${formatTime(app.appointment_time)}</span>
            </td>
            <td>
                <strong>${escapeHtml(app.customer_name)}</strong><br>
                <a href="tel:${escapeHtml(app.customer_contact)}" style="color: #2563eb; text-decoration: none;">
                    ${escapeHtml(app.customer_contact)}
                </a>
            </td>
            <td><strong>${escapeHtml(app.service)}</strong></td>
            <td>${app.guests || 1} Pax</td>
            <td>
                <strong>Pickup:</strong> ${escapeHtml(app.pickup_location)}<br>
                ${app.notes ? `<small style="color: #6b7280;"><strong>Notes:</strong> ${escapeHtml(app.notes)}</small>` : '<small style="color: #9ca3af;">No notes</small>'}
            </td>
            <td>
                <span class="badge badge-${(app.status || 'pending').toLowerCase()}">${app.status || 'pending'}</span>
            </td>
            <td>
                <select class="action-select" onchange="updateAppointmentStatus(${app.id}, this.value)">
                    <option value="" disabled selected>Update Status</option>
                    <option value="pending" ${app.status === 'pending' ? 'disabled' : ''}>Set Pending</option>
                    <option value="confirmed" ${app.status === 'confirmed' ? 'disabled' : ''}>Set Confirmed</option>
                    <option value="completed" ${app.status === 'completed' ? 'disabled' : ''}>Set Completed</option>
                    <option value="cancelled" ${app.status === 'cancelled' ? 'disabled' : ''}>Set Cancelled</option>
                </select>
            </td>
        </tr>
    `).join('');
};

window.updateAppointmentStatus = async function(id, newStatus) {
    if (!newStatus) return;
    const client = await ensureSupabaseClient();
    if (!client) return;

    try {
        const { error } = await client
            .from('appointments')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) throw error;

        const target = allAppointments.find(a => a.id === id);
        if (target) {
            target.status = newStatus;
            updateMetrics(allAppointments);
            renderAppointmentsTable();
        }
    } catch (err) {
        alert(`Status update failed: ${err.message}`);
    }
};

// ==========================================
// 5. VEHICLES & FLEET MANAGEMENT
// ==========================================
window.fetchVehicles = async function() {
    const container = document.getElementById('vehicleGridContainer');
    if (!container) return;

    const client = await ensureSupabaseClient();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('vehicles')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        allVehicles = data || [];
        renderVehicleCards();
    } catch (err) {
        container.innerHTML = `<p style="color: #dc2626; padding: 20px;">Failed to load vehicles: ${err.message}</p>`;
    }
};

function renderVehicleCards() {
    const container = document.getElementById('vehicleGridContainer');
    if (!container) return;

    if (allVehicles.length === 0) {
        container.innerHTML = `<p class="empty-state">No vehicles in fleet. Add your first vehicle above.</p>`;
        return;
    }

    container.innerHTML = allVehicles.map(veh => `
        <div class="vehicle-card">
            <img class="vehicle-img" src="${escapeHtml(veh.image_url) || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80'}" alt="${escapeHtml(veh.name)}">
            <div class="vehicle-info">
                <h4>${escapeHtml(veh.name)}</h4>
                <div class="vehicle-meta">${escapeHtml(veh.category)} • ${escapeHtml(veh.transmission)} • ${veh.seats} Seats</div>
                <div class="vehicle-rate">₱${Number(veh.daily_rate).toLocaleString()} <span style="font-size: 0.8rem; font-weight: 500; color: #6b7280;">/ day</span></div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
                    <span class="badge badge-${(veh.status || 'available').toLowerCase()}">${veh.status || 'available'}</span>
                    <select class="action-select" onchange="updateVehicleStatus(${veh.id}, this.value)">
                        <option value="available" ${veh.status === 'available' ? 'selected' : ''}>Available</option>
                        <option value="rented" ${veh.status === 'rented' ? 'selected' : ''}>Rented</option>
                        <option value="maintenance" ${veh.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                    </select>
                </div>
            </div>
        </div>
    `).join('');
}

window.addNewVehicle = async function() {
    const nameInput = document.getElementById('newVehName');
    const catInput = document.getElementById('newVehCategory');
    const transInput = document.getElementById('newVehTransmission');
    const seatsInput = document.getElementById('newVehSeats');
    const rateInput = document.getElementById('newVehRate');
    const imgInput = document.getElementById('newVehImage');

    const name = nameInput ? nameInput.value.trim() : '';
    const category = catInput ? catInput.value : 'Sedan';
    const transmission = transInput ? transInput.value : 'Automatic';
    const seats = seatsInput ? parseInt(seatsInput.value, 10) : 5;
    const daily_rate = rateInput ? parseFloat(rateInput.value) : 2000;
    const image_url = imgInput ? imgInput.value.trim() : '';

    if (!name) {
        showVehMsg('Please enter a vehicle model name.', true);
        return;
    }

    const client = await ensureSupabaseClient();
    if (!client) return;

    try {
        const { error } = await client
            .from('vehicles')
            .insert([{
                name,
                category,
                transmission,
                seats,
                daily_rate,
                image_url: image_url || null,
                status: 'available'
            }]);

        if (error) throw error;

        showVehMsg(`Vehicle "${name}" successfully added to fleet!`, false);
        if (nameInput) nameInput.value = '';
        if (imgInput) imgInput.value = '';
        fetchVehicles();
    } catch (err) {
        showVehMsg(`Failed to add vehicle: ${err.message}`, true);
    }
};

window.updateVehicleStatus = async function(id, newStatus) {
    const client = await ensureSupabaseClient();
    if (!client) return;

    try {
        const { error } = await client
            .from('vehicles')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) throw error;

        const target = allVehicles.find(v => v.id === id);
        if (target) {
            target.status = newStatus;
            renderVehicleCards();
        }
    } catch (err) {
        alert(`Failed to update vehicle status: ${err.message}`);
    }
};

function showVehMsg(text, isError) {
    const el = document.getElementById('vehMessage');
    if (!el) return;
    el.textContent = text;
    el.className = 'form-message ' + (isError ? 'error' : 'success');
    el.classList.remove('hidden');
}

// ==========================================
// 6. SETTINGS & CMS MANAGEMENT
// ==========================================
window.fetchAdmins = async function() {
    const tbody = document.getElementById('adminsTableBody');
    if (!tbody) return;

    const client = await ensureSupabaseClient();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('admins')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) throw error;

        allAdmins = data || [];
        renderAdminsTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state" style="color: #dc2626;">Failed to load admins: ${err.message}</td></tr>`;
    }
};

function renderAdminsTable() {
    const tbody = document.getElementById('adminsTableBody');
    if (!tbody) return;

    const activeUser = localStorage.getItem('active_admin_email') || '';

    if (allAdmins.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No administrators found.</td></tr>`;
        return;
    }

    tbody.innerHTML = allAdmins.map(admin => {
        const isSelf = admin.email.toLowerCase() === activeUser.toLowerCase();
        const displayName = admin.name || 'Samuel Tamsi';
        return `
            <tr>
                <td><strong>${escapeHtml(displayName)}</strong></td>
                <td>
                    ${escapeHtml(admin.email)}
                    ${isSelf ? '<span style="color: #0E7C86; font-size: 0.8rem; margin-left: 6px; font-weight: bold;">(You)</span>' : ''}
                </td>
                <td>${formatDate(admin.created_at)}</td>
                <td style="text-align: right;">
                    ${isSelf 
                        ? '<span style="color: #9ca3af; font-size: 0.85rem;">Primary</span>' 
                        : `<button class="btn-outline" style="color: #dc2626; border-color: #fca5a5; padding: 4px 10px; font-size: 0.8rem;" onclick="removeAdmin(${admin.id}, '${escapeHtml(admin.email)}')">Remove</button>`
                    }
                </td>
            </tr>
        `;
    }).join('');
}

window.addNewAdmin = async function() {
    const nameInput = document.getElementById('newAdminName');
    const emailInput = document.getElementById('newAdminEmail');
    const btn = document.getElementById('btnAddAdmin');

    const name = nameInput ? nameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';

    if (!email) {
        showSettingsMsg('Please enter a valid Gmail address.', true);
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Adding & Sending Invite...';
    }

    const client = await ensureSupabaseClient();
    if (!client) {
        showSettingsMsg('Database connection unavailable.', true);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Add Admin';
        }
        return;
    }

    try {
        const { error: insertError } = await client
            .from('admins')
            .insert([{ 
                name: name || 'Samuel Tamsi', 
                email: email 
            }]);

        if (insertError) {
            if (insertError.code === '23505') {
                throw new Error('This email is already registered as an administrator.');
            }
            throw insertError;
        }

        const { error: inviteError } = await client.auth.signInWithOtp({
            email: email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: getAdminRedirectUrl()
            }
        });

        if (inviteError) {
            showSettingsMsg(`Admin registered, but email delivery had an issue: ${inviteError.message}`, true);
        } else {
            showSettingsMsg(`Success: ${name || email} added and invitation dispatched!`, false);
        }

        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
        fetchAdmins();
    } catch (err) {
        showSettingsMsg(err.message, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Add Admin';
        }
    }
};

window.removeAdmin = async function(id, email) {
    if (!confirm(`Are you sure you want to revoke admin access for ${email}?`)) return;

    const client = await ensureSupabaseClient();
    if (!client) return;

    try {
        const { error } = await client
            .from('admins')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showSettingsMsg(`Admin access removed for ${email}.`, false);
        fetchAdmins();
    } catch (err) {
        alert(`Failed to remove admin: ${err.message}`);
    }
};

function showSettingsMsg(text, isError) {
    const el = document.getElementById('settingsMessage');
    if (!el) return;
    el.textContent = text;
    el.className = 'form-message ' + (isError ? 'error' : 'success');
    el.classList.remove('hidden');
}

window.loadSiteContent = async function() {
    const client = await ensureSupabaseClient();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('site_content')
            .select('*')
            .eq('id', 'main')
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data) {
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el && val !== undefined && val !== null) el.value = val;
            };

            setVal('cmsHeroTitle', data.hero_title);
            setVal('cmsHeroDesc', data.hero_desc);
            setVal('cmsPriceCity', data.price_city);
            setVal('cmsPriceIsland', data.price_island);
            setVal('cmsPriceAirport', data.price_airport);
            setVal('cmsPhone', data.contact_phone);
            setVal('cmsEmail', data.contact_email);
        }
    } catch (err) {
        console.warn('Could not load site content from Supabase:', err);
    }
};

window.saveSiteContent = async function() {
    const btn = document.getElementById('btnSaveCms');
    const client = await ensureSupabaseClient();

    if (!client) {
        showCmsMsg('Database not connected.', true);
        return;
    }

    const payload = {
        id: 'main',
        hero_title: document.getElementById('cmsHeroTitle').value.trim(),
        hero_desc: document.getElementById('cmsHeroDesc').value.trim(),
        price_city: parseInt(document.getElementById('cmsPriceCity').value, 10) || 2000,
        price_island: parseInt(document.getElementById('cmsPriceIsland').value, 10) || 3500,
        price_airport: parseInt(document.getElementById('cmsPriceAirport').value, 10) || 800,
        contact_phone: document.getElementById('cmsPhone').value.trim(),
        contact_email: document.getElementById('cmsEmail').value.trim(),
        updated_at: new Date().toISOString()
    };

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving changes...';
    }

    try {
        const { error } = await client.from('site_content').upsert(payload);
        if (error) throw error;
        showCmsMsg('Changes successfully saved to live website!', false);
    } catch (err) {
        showCmsMsg(`Failed to save: ${err.message}`, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Apply to Live Website';
        }
    }
};

function showCmsMsg(text, isError) {
    const el = document.getElementById('cmsMessage');
    if (!el) return;
    el.textContent = text;
    el.className = 'form-message ' + (isError ? 'error' : 'success');
    el.classList.remove('hidden');
}

// Helpers
const btnRefresh = document.getElementById('btnRefresh');
if (btnRefresh) btnRefresh.addEventListener('click', fetchAppointments);

const statusFilter = document.getElementById('statusFilter');
const serviceFilter = document.getElementById('serviceFilter');
if (statusFilter) statusFilter.addEventListener('change', renderAppointmentsTable);
if (serviceFilter) serviceFilter.addEventListener('change', renderAppointmentsTable);

function updateMetrics(list) {
    const statTotal = document.getElementById('statTotal');
    const statPending = document.getElementById('statPending');
    const statConfirmed = document.getElementById('statConfirmed');
    const statCompleted = document.getElementById('statCompleted');

    if (statTotal) statTotal.textContent = list.length;
    if (statPending) statPending.textContent = list.filter(a => a.status === 'pending').length;
    if (statConfirmed) statConfirmed.textContent = list.filter(a => a.status === 'confirmed').length;
    if (statCompleted) statCompleted.textContent = list.filter(a => a.status === 'completed').length;
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const formattedHour = h % 12 || 12;
    return `${formattedHour}:${minutes} ${ampm}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.addEventListener('focus', () => {
    const current = localStorage.getItem('active_admin_email');
    if (current) {
        verifyCurrentAdminAuthorization(current);
    }
});

setInterval(() => {
    const current = localStorage.getItem('active_admin_email');
    if (current) {
        verifyCurrentAdminAuthorization(current);
    }
}, 15000);

// ==========================================
// 7. SESSION INITIALIZATION
// ==========================================
(async function initSession() {
    startLiveClock();
    const client = await ensureSupabaseClient();

    if (client) {
        const { data: { session } } = await client.auth.getSession();
        if (session && session.user && session.user.email) {
            const email = session.user.email.toLowerCase();
            
            if (window.location.hash.includes('access_token')) {
                window.history.replaceState(null, '', window.location.pathname);
            }

            let adminName = 'Samuel Tamsi';
            let isWhitelisted = email === PRIMARY_DEV_ADMIN.toLowerCase();

            if (!isWhitelisted) {
                const { data } = await client
                    .from('admins')
                    .select('name')
                    .eq('email', email)
                    .maybeSingle();

                if (data) {
                    isWhitelisted = true;
                    if (data.name) adminName = data.name;
                }
            } else {
                adminName = 'Kent Vincent';
            }

            if (!isWhitelisted) {
                await forceRevocationLogout('Your administrator access has been revoked or is not whitelisted.');
                return;
            }

            localStorage.setItem('active_admin_email', email);
            localStorage.setItem('active_admin_name', adminName);
            showDashboard(email, adminName);
            return;
        }
    }

    const storedEmail = localStorage.getItem('active_admin_email');
    const storedName = localStorage.getItem('active_admin_name');
    if (storedEmail) {
        const isStillValid = await verifyCurrentAdminAuthorization(storedEmail);
        if (isStillValid) {
            showDashboard(storedEmail, storedName);
        }
    }
})();