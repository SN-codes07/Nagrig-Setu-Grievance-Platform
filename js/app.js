/**
 * Main Application Orchestrator for Nagrik Setu
 * Integrated with Supabase (PostGIS schema: profiles, complaints, departments, municipalities)
 */
let currentSelectedCoords = null;
let currentProfile = null; // The logged-in user's Supabase profile row

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // Initialize Auth
  AuthService.init(
    (user) => handleLoginSuccess(user),
    () => handleLogout()
  );

  // Setup Grievance Submission
  const grievanceForm = document.getElementById('grievanceForm');
  grievanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('compTitle').value;
    const description = document.getElementById('compDescription').value;
    const submitBtn = grievanceForm.querySelector('button[type="submit"]');

    if (!currentSelectedCoords) {
      alert('Please drop a pin on the map to indicate the issue location.');
      return;
    }

    // Show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader"></i> AI is analyzing your complaint...';
    lucide.createIcons();

    try {
      // ── AI Processing (runs in parallel) ──────────────────
      const [aiSummary, aiPriority, aiDepartment] = await Promise.all([
        AIService.summarizeComplaint(title, description),
        AIService.calculatePriority('', description),
        AIService.suggestDepartment(title, description)
      ]);

      // AI determines the department automatically
      const finalCategory = aiDepartment || 'Public Health & Sanitation';
      console.log(`🤖 AI categorized → ${finalCategory}`);

      // ── Duplicate Detection ───────────────────────────────
      const existingComplaints = await SupabaseService.getAllComplaints();
      const duplicateId = await AIService.checkDuplicate(title, description, existingComplaints);

      if (duplicateId) {
        const proceed = confirm(
          `⚠️ AI detected a similar complaint: ${duplicateId}\n\nDo you still want to file this as a new grievance?`
        );
        if (!proceed) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="send"></i> Submit Grievance';
          lucide.createIcons();
          return;
        }
      }

      // ── Build Ticket ──────────────────────────────────────
      const newTicket = {
        id: `NS-${Math.floor(1000 + Math.random() * 9000)}`,
        title,
        description,
        aiSummary: aiSummary,
        priority: aiPriority,
        lat: currentSelectedCoords.lat,
        lng: currentSelectedCoords.lng,
      };

      // Resolve department FK from category name
      const dept = await SupabaseService.getDepartmentByName(finalCategory);

      await SupabaseService.createComplaint(
        newTicket,
        currentProfile.id,
        currentProfile.municipality_id,
        dept ? dept.id : null
      );

      // Log audit trail
      await SupabaseService.createAuditLog({
        complaint_id: newTicket.id,
        performed_by: currentProfile.id,
        action: 'LODGED',
        new_status: 'SUBMITTED',
        new_department_id: dept ? dept.id : null,
        notes: `AI Summary: ${aiSummary} | AI Priority: ${aiPriority} | Duplicate of: ${duplicateId || 'None'}`
      });

      grievanceForm.reset();
      document.getElementById('compLocationDisplay').value = '';
      currentSelectedCoords = null;

      alert(`✅ Grievance ${newTicket.id} lodged successfully!\n\n🤖 AI Summary: ${aiSummary}\n📊 AI Priority: ${aiPriority}/10\n🏢 Department: ${finalCategory}`);
      await renderCitizenTable();
    } catch (err) {
      console.error('Failed to submit grievance:', err);
      alert('Error submitting grievance. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="send"></i> Submit Grievance';
      lucide.createIcons();
    }
  });

  // Geolocation trigger
  document.getElementById('geolocateBtn').addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        MapService.pickerMap.setView([latitude, longitude], 15);
        if (MapService.pickerMarker) {
          MapService.pickerMarker.setLatLng([latitude, longitude]);
        } else {
          MapService.pickerMarker = L.marker([latitude, longitude]).addTo(MapService.pickerMap);
        }
        currentSelectedCoords = { lat: latitude, lng: longitude };
        document.getElementById('compLocationDisplay').value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      });
    }
  });
});

async function handleLoginSuccess(user) {
  document.getElementById('authView').style.display = 'none';
  document.getElementById('appHeader').style.display = 'flex';
  document.getElementById('headerMunicipality').innerText = user.municipality;
  document.getElementById('headerUserName').innerText = user.name;
  document.getElementById('headerUserRole').innerText = user.role.replace('_', ' ');
  document.getElementById('headerAvatar').innerText = user.name.charAt(0).toUpperCase();

  // Find or create the user's profile in Supabase
  try {
    currentProfile = await SupabaseService.findOrCreateProfile(user);
    console.log('Logged in as profile:', currentProfile);
  } catch (err) {
    console.error('Profile setup failed:', err);
    alert('Error setting up user profile: ' + (err.message || JSON.stringify(err)));
    return;
  }

  if (!currentProfile) {
    alert('Profile creation returned empty. Check browser console (F12) for details.');
    return;
  }

  // Hide all portal views
  ['citizenPortal', 'higherOfficialPortal', 'groundOfficialPortal', 'adminPortal'].forEach((id) => {
    document.getElementById(id).style.display = 'none';
  });

  // Route portal view
  if (user.role === 'CITIZEN') {
    document.getElementById('citizenPortal').style.display = 'block';
    setTimeout(() => {
      MapService.initPickerMap((lat, lng) => {
        currentSelectedCoords = { lat, lng };
        document.getElementById('compLocationDisplay').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      });
    }, 200);
    await renderCitizenTable();
  } else if (user.role === 'OFFICIAL_HIGHER') {
    document.getElementById('higherOfficialPortal').style.display = 'block';
    await renderHigherOfficialTable();
  } else if (user.role === 'OFFICIAL_GROUND') {
    document.getElementById('groundOfficialPortal').style.display = 'block';
    await renderGroundOfficialTable();
  } else if (user.role === 'ADMIN') {
    document.getElementById('adminPortal').style.display = 'block';
    await renderAdminDashboard();
  }

  lucide.createIcons();
}

function handleLogout() {
  currentProfile = null;
  document.getElementById('appHeader').style.display = 'none';
  ['citizenPortal', 'higherOfficialPortal', 'groundOfficialPortal', 'adminPortal'].forEach((id) => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('authView').style.display = 'grid';
}

/**
 * Helper: Convert Supabase complaint row (with joins) to display-friendly object
 */
function mapRowToTicket(row) {
  return {
    id: row.id,
    municipality: row.municipality?.name || '—',
    citizenName: row.citizen?.full_name || '—',
    category: row.department?.name || '—',
    title: row.title,
    description: row.raw_description,
    aiSummary: row.ai_summary || '—',
    priority: row.priority_score,
    priorityLevel: row.priority,
    lat: row.latitude,
    lng: row.longitude,
    status: row.status,
    assignedTo: row.assignee?.full_name || 'Unassigned',
    assignedToId: row.assigned_to_id,
    createdAt: new Date(row.created_at).toLocaleDateString()
  };
}

// ── Citizen View ────────────────────────────────────────────

async function renderCitizenTable() {
  const tbody = document.getElementById('citizenComplaintTable');
  try {
    const rows = await SupabaseService.getComplaintsByCitizen(currentProfile.id);
    const userTickets = rows.map(mapRowToTicket);

    if (userTickets.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No complaints filed yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = userTickets.map((t) => `
      <tr>
        <td><strong>${t.id}</strong></td>
        <td>${t.title}</td>
        <td>${t.category}</td>
        <td><span class="badge ${t.priority >= 7 ? 'badge-danger' : 'badge-warning'}">Score: ${t.priority}</span></td>
        <td>${t.assignedTo}</td>
        <td><span class="badge badge-success">${t.status}</span></td>
        <td>${t.createdAt}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading citizen complaints:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Error loading complaints.</td></tr>`;
  }
}

// ── Higher Official View ────────────────────────────────────

async function renderHigherOfficialTable() {
  const tbody = document.getElementById('higherOfficialTable');
  try {
    let rows;
    if (currentProfile.department_id) {
      rows = await SupabaseService.getComplaintsByDepartment(currentProfile.department_id);
    } else {
      rows = await SupabaseService.getAllComplaints();
    }
    const deptTickets = rows.map(mapRowToTicket);

    if (deptTickets.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No pending complaints for this department.</td></tr>`;
      return;
    }

    tbody.innerHTML = deptTickets.map((t) => `
      <tr>
        <td><strong>${t.id}</strong></td>
        <td>${t.aiSummary}</td>
        <td>${t.category}</td>
        <td><span class="badge badge-danger">Score: ${t.priority}</span></td>
        <td>${t.assignedTo}</td>
        <td><span class="badge badge-warning">${t.status}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="assignTicket('${t.id}')">Assign Engineer</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading official complaints:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Error loading complaints.</td></tr>`;
  }
}

async function assignTicket(id) {
  const engineerName = prompt('Enter Ground Engineer Name:', 'Officer Patil');
  if (engineerName) {
    try {
      // Look up the engineer's profile (or create one)
      let engineerProfile = await SupabaseService.getProfileByName(engineerName);

      if (!engineerProfile) {
        // Auto-create a ground official profile
        const { data, error } = await supabaseClient
          .from('profiles')
          .insert([{
            full_name: engineerName,
            role: 'OFFICIAL_GROUND',
            municipality_id: currentProfile.municipality_id,
            department_id: currentProfile.department_id
          }])
          .select()
          .single();
        if (error) throw error;
        engineerProfile = data;
      }

      await SupabaseService.updateComplaint(id, {
        assigned_to_id: engineerProfile.id,
        status: 'IN_PROGRESS'
      });

      // Audit log
      await SupabaseService.createAuditLog({
        complaint_id: id,
        performed_by: currentProfile.id,
        action: 'ASSIGNED',
        previous_status: 'SUBMITTED',
        new_status: 'IN_PROGRESS',
        notes: `Assigned to ${engineerName}`
      });

      await renderHigherOfficialTable();
    } catch (err) {
      console.error('Error assigning ticket:', err);
      alert('Failed to assign ticket. Please try again.');
    }
  }
}

// ── Ground Official View ────────────────────────────────────

async function renderGroundOfficialTable() {
  const tbody = document.getElementById('groundOfficialTable');
  try {
    const rows = await SupabaseService.getComplaintsByAssignee(currentProfile.id);
    const tasks = rows.map(mapRowToTicket);

    if (tasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No active field tasks assigned to you.</td></tr>`;
      return;
    }

    tbody.innerHTML = tasks.map((t) => `
      <tr>
        <td><strong>${t.id}</strong></td>
        <td>${t.aiSummary}</td>
        <td><span class="badge badge-danger">Score: ${t.priority}</span></td>
        <td>${t.lat.toFixed(3)}, ${t.lng.toFixed(3)}</td>
        <td><span class="badge badge-warning">${t.status}</span></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="resolveTicket('${t.id}')">Mark Resolved</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading ground tasks:', err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Error loading tasks.</td></tr>`;
  }
}

async function resolveTicket(id) {
  try {
    await SupabaseService.updateComplaint(id, {
      status: 'RESOLVED',
      resolved_at: new Date().toISOString()
    });

    // Audit log
    await SupabaseService.createAuditLog({
      complaint_id: id,
      performed_by: currentProfile.id,
      action: 'STATUS_CHANGE',
      previous_status: 'IN_PROGRESS',
      new_status: 'RESOLVED',
      notes: 'Marked as resolved by ground officer'
    });

    await renderGroundOfficialTable();
  } catch (err) {
    console.error('Error resolving ticket:', err);
    alert('Failed to resolve ticket. Please try again.');
  }
}

// ── Admin Dashboard ─────────────────────────────────────────

async function renderAdminDashboard() {
  try {
    const rows = await SupabaseService.getAllComplaints();
    const allTickets = rows.map(mapRowToTicket);

    document.getElementById('adminTotalCount').innerText = allTickets.length;
    document.getElementById('adminHighPriCount').innerText = allTickets.filter((c) => c.priority >= 7).length;
    document.getElementById('adminInProgressCount').innerText = allTickets.filter((c) => c.status === 'IN_PROGRESS').length;
    document.getElementById('adminResolvedCount').innerText = allTickets.filter((c) => c.status === 'RESOLVED').length;

    const tbody = document.getElementById('adminMasterTable');
    if (allTickets.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No records available.</td></tr>`;
    } else {
      tbody.innerHTML = allTickets.map((t) => `
        <tr>
          <td><strong>${t.id}</strong></td>
          <td>${t.municipality}</td>
          <td>${t.category}</td>
          <td>${t.aiSummary}</td>
          <td><span class="badge badge-danger">${t.priority}</span></td>
          <td><span class="badge badge-success">${t.status}</span></td>
        </tr>
      `).join('');
    }

    setTimeout(() => {
      MapService.initAdminHeatmap(allTickets);
    }, 200);
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
  }
}