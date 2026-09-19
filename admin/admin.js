// Supabase Configuration - Replace with your project values
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

// Whitelist of authorized admin emails
const AUTHORIZED_GMAILS = [
    'kentvincentboter444@gmail.com',
    'dondaveigot1@gmail.com'
];

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM Elements - Auth
const authSection = document.getElementById('authSection');
const dashboardSection = document.getElementById('dashboardSection');
const requestOtpForm = document.getElementById('requestOtpForm');
const verifyOtpForm = document.getElementById('verifyOtpForm');
const adminEmailInput = document.getElementById('adminEmail');
const otpTokenInput = document.getElementById('otpToken');
const btnResetOtp = document.getElementById('btnResetOtp');
const authMessage = document.getElementById('authMessage');
const currentAdminEmail = document.getElementById('currentAdminEmail');
const btnLogout = document.getElementById('btnLogout');
const btnRefresh = document.getElementById('btnRefresh');

// DOM Elements - Dashboard
const appointmentsTableBody = document.getElementById('appointmentsTableBody');
const statusFilter = document.getElementById('statusFilter');
const serviceFilter = document.getElementById('serviceFilter');
const statTotal = document.getElementById('statTotal');
const statPending = document.getElementById('statPending');
const statConfirmed = document.getElementById('statConfirmed');
const statCompleted = document.getElementById('statCompleted');

let allAppointments = [];
let pendingEmail = '';

// Check session on page load
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    handleSession(session);

    supabase.auth.onAuthStateChange((_event, session) => {
        handleSession(session);
    });
});

function handleSession(session) {
    if (session && session.user && AUTHORIZED_GMAILS.includes(session.user.email.toLowerCase())) {
        authSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        currentAdminEmail.textContent = session.user.email;
        fetchAppointments();
    } else if (session && session.user && !AUTHORIZED_GMAILS.includes(session.user.email.toLowerCase())) {
        // Logged in with an email not in the whitelist
        supabase.auth.signOut();
        authSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
        showAuthMessage('Unauthorized email address. Access denied.', 'error');
    } else {
        authSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
    }
}

// 1. Request OTP Code
requestOtpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = adminEmailInput.value.trim().toLowerCase();

    // Whitelist check before dispatching OTP
    if (!AUTHORIZED_GMAILS.includes(email)) {
        showAuthMessage('This email is not authorized as an administrator.', 'error');
        return;
    }

    showAuthMessage('Sending 6-digit OTP code to your inbox...', 'info');

    const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
            shouldCreateUser: false // Only allow existing users or authorized emails
        }
    });

    if (error) {
        showAuthMessage(error.message, 'error');
        return;
    }

    pendingEmail = email;
    requestOtpForm.classList.add('hidden');
    verifyOtpForm.classList.remove('hidden');
    showAuthMessage(`Verification code sent to ${email}. Check your inbox.`, 'success');
});

// 2. Verify OTP Code
verifyOtpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = otpTokenInput.value.trim();

    if (!token || token.length !== 6) {
        showAuthMessage('Please enter a valid 6-digit OTP code.', 'error');
        return;
    }

    showAuthMessage('Verifying token...', 'info');

    const { data, error } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: token,
        type: 'email'
    });

    if (error) {
        showAuthMessage(error.message, 'error');
        return;
    }

    if (data.session) {
        showAuthMessage('Authenticated successfully!', 'success');
        verifyOtpForm.reset();
        requestOtpForm.reset();
    }
});

btnResetOtp.addEventListener('click', () => {
    verifyOtpForm.classList.add('hidden');
    requestOtpForm.classList.remove('hidden');
    authMessage.textContent = '';
});

// 3. Sign Out
btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
});

btnRefresh.addEventListener('click', () => {
    fetchAppointments();
});

// 4. Fetch Appointments from Supabase
async function fetchAppointments() {
    appointmentsTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading appointments...</td></tr>`;

    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

    if (error) {
        appointmentsTableBody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color: #dc2626;">Error loading data: ${error.message}</td></tr>`;
        return;
    }

    allAppointments = data || [];
    updateMetrics(allAppointments);
    renderAppointmentsTable();
}

// 5. Render Table & Filter
function renderAppointmentsTable() {
    const statusVal = statusFilter.value;
    const serviceVal = serviceFilter.value;

    const filtered = allAppointments.filter(item => {
        const matchesStatus = statusVal === 'all' || item.status.toLowerCase() === statusVal.toLowerCase();
        const matchesService = serviceVal === 'all' || item.service === serviceVal;
        return matchesStatus && matchesService;
    });

    if (filtered.length === 0) {
        appointmentsTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">No appointments found.</td></tr>`;
        return;
    }

    appointmentsTableBody.innerHTML = filtered.map(app => `
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
            <td>${app.guests} Pax</td>
            <td>
                <strong>Pickup:</strong> ${escapeHtml(app.pickup_location)}<br>
                ${app.notes ? `<small style="color: #6b7280;"><strong>Notes:</strong> ${escapeHtml(app.notes)}</small>` : '<small style="color: #9ca3af;">No additional notes</small>'}
            </td>
            <td>
                <span class="badge badge-${app.status.toLowerCase()}">${app.status}</span>
            </td>
            <td>
                <select class="action-select" onchange="updateAppointmentStatus(${app.id}, this.value)">
                    <option value="" disabled selected>Update</option>
                    <option value="pending" ${app.status === 'pending' ? 'disabled' : ''}>Pending</option>
                    <option value="confirmed" ${app.status === 'confirmed' ? 'disabled' : ''}>Confirmed</option>
                    <option value="completed" ${app.status === 'completed' ? 'disabled' : ''}>Completed</option>
                    <option value="cancelled" ${app.status === 'cancelled' ? 'disabled' : ''}>Cancelled</option>
                </select>
            </td>
        </tr>
    `).join('');
}

// 6. Update Status
window.updateAppointmentStatus = async function(id, newStatus) {
    if (!newStatus) return;

    const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', id);

    if (error) {
        alert(`Failed to update status: ${error.message}`);
        fetchAppointments();
        return;
    }

    // Reflect update in local state without full reload
    const target = allAppointments.find(a => a.id === id);
    if (target) {
        target.status = newStatus;
        updateMetrics(allAppointments);
        renderAppointmentsTable();
    }
};

// Filter change events
statusFilter.addEventListener('change', renderAppointmentsTable);
serviceFilter.addEventListener('change', renderAppointmentsTable);

// Helper functions
function updateMetrics(list) {
    statTotal.textContent = list.length;
    statPending.textContent = list.filter(a => a.status === 'pending').length;
    statConfirmed.textContent = list.filter(a => a.status === 'confirmed').length;
    statCompleted.textContent = list.filter(a => a.status === 'completed').length;
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
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showAuthMessage(msg, type) {
    authMessage.textContent = msg;
    authMessage.className = `form-message ${type}`;
}