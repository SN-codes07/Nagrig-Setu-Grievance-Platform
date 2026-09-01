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
      const duplicateResult = await AIService.checkDuplicate(title, description, currentSelectedCoords.lat, currentSelectedCoords.lng, existingComplaints);

      if (duplicateResult) {
        if (duplicateResult.isSameArea) {
          const proceed = confirm(
            `⚠️ We found the exact same issue already reported in your area (ID: ${duplicateResult.id}).\n\nWould you like to MERGE your report with it to boost its priority instead of creating a new ticket?`
          );
          
          if (proceed) {
             // MERGE logic
             let newScore = Math.min((parseFloat(duplicateResult.currentPriority) + 1.0), 10.0).toFixed(1);
             
             await SupabaseService.updateComplaint(duplicateResult.id, {
               priority_score: newScore
             });
             
             await SupabaseService.createAuditLog({
                complaint_id: duplicateResult.id,
                performed_by: currentProfile.id,
                action: 'MERGED',
                notes: `Additional citizen reported the same issue in this area. Priority boosted to ${newScore}.`
             });
             
             alert(`✅ Your report has been merged with ${duplicateResult.id}.\nIts priority has been boosted to ${newScore}/10!`);
             
             grievanceForm.reset();
             document.getElementById('compLocationDisplay').value = '';
             currentSelectedCoords = null;
             submitBtn.disabled = false;
             submitBtn.innerHTML = '<i data-lucide="send"></i> Submit Grievance';
             lucide.createIcons();
             
             await renderCitizenTable(); 
             return; 
          }
        } else {
           const proceed = confirm(
             `⚠️ A similar complaint (${duplicateResult.id}) exists, but in a different location.\n\nDo you still want to file this as a new grievance?`
           );
           if (!proceed) {
             submitBtn.disabled = false;
             submitBtn.innerHTML = '<i data-lucide="send"></i> Submit Grievance';
             lucide.createIcons();
             return;
           }
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
        notes: `AI Summary: ${aiSummary} | AI Priority: ${aiPriority} | Duplicate of: ${duplicateResult ? duplicateResult.id : 'None'}`
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
    assignedTo: row.assignee?.email || 'Unassigned',
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
          <button class="btn btn-outline-secondary btn-sm mt-1" onclick="openReassignModal('${t.id}')">Forward Dept</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading official complaints:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Error loading complaints.</td></tr>`;
  }
}

async function assignTicket(id) {
  const engineerEmail = prompt('Enter Ground Engineer Email Address:', 'engineer@example.com');
  if (engineerEmail) {
    try {
      // Look up the engineer's profile by email
      let engineerProfile = await SupabaseService.getProfileByEmail(engineerEmail);

      if (!engineerProfile) {
        // Auto-create a ground official profile if they haven't logged in yet
        const { data, error } = await supabaseClient
          .from('profiles')
          .insert([{
            email: engineerEmail,
            full_name: 'Assigned Engineer',
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
        notes: `Assigned to ${engineerEmail}`
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
          <button class="btn btn-outline-secondary btn-sm mt-1" onclick="openReassignModal('${t.id}')">Forward Dept</button>
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
    window.adminCurrentTickets = allTickets;

    document.getElementById('adminTotalCount').innerText = allTickets.length;
    document.getElementById('adminHighPriCount').innerText = allTickets.filter((c) => c.priority >= 7).length;
    document.getElementById('adminInProgressCount').innerText = allTickets.filter((c) => c.status === 'IN_PROGRESS').length;
    document.getElementById('adminResolvedCount').innerText = allTickets.filter((c) => c.status === 'RESOLVED').length;

    const tbody = document.getElementById('adminMasterTable');
    if (allTickets.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No records available.</td></tr>`;
    } else {
      tbody.innerHTML = allTickets.map((t) => `
        <tr>
          <td><strong>${t.id}</strong></td>
          <td>${t.municipality}</td>
          <td>${t.category}</td>
          <td>${t.aiSummary}</td>
          <td><span class="badge badge-danger">${t.priority}</span></td>
          <td><span class="badge badge-success">${t.status}</span></td>
          <td>
            <button class="btn btn-sm" style="background: transparent; color: #e53e3e; border: 1px solid #e53e3e; padding: 4px 8px;" onclick="adminDeleteRecord('${t.id}')">
              <i data-lucide="trash"></i> Delete
            </button>
          </td>
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

// ── Reassign Department Logic ───────────────────────────────

let currentReassignTicketId = null;

window.openReassignModal = function(ticketId) {
  currentReassignTicketId = ticketId;
  document.getElementById('reassignModal').style.display = 'flex';
};

window.confirmReassign = async function() {
  if (!currentReassignTicketId) return;
  const newDeptName = document.getElementById('reassignDeptSelect').value;
  document.getElementById('reassignModal').style.display = 'none';

  try {
    const dept = await SupabaseService.getDepartmentByName(newDeptName);
    if (!dept) {
      alert('Department not found in database.');
      return;
    }

    await SupabaseService.updateComplaint(currentReassignTicketId, {
      department_id: dept.id,
      assigned_to_id: null,
      status: 'SUBMITTED' 
    });

    await SupabaseService.createAuditLog({
      complaint_id: currentReassignTicketId,
      performed_by: currentProfile.id,
      action: 'REASSIGNED_DEPT',
      previous_status: 'IN_PROGRESS', 
      new_status: 'SUBMITTED',
      notes: `Forwarded to ${newDeptName}`
    });

    alert(`Ticket successfully forwarded to ${newDeptName}`);
    
    // Refresh UI based on role
    if (currentProfile.role === 'OFFICIAL_HIGHER') {
      await renderHigherOfficialTable();
    } else if (currentProfile.role === 'OFFICIAL_GROUND') {
      await renderGroundOfficialTable();
    }
  } catch (err) {
    console.error('Error reassigning department:', err);
    alert('Failed to forward department. Please try again.');
  }
};

// ── Report Generation ─────────────────────────────────────────

window.downloadAdminReportCSV = function() {
  const tickets = window.adminCurrentTickets;
  if (!tickets || tickets.length === 0) {
    alert("No records to export.");
    return;
  }

  // Define CSV headers
  const headers = ['Ticket ID', 'Municipality', 'Department', 'Citizen Name', 'Title', 'AI Summary', 'Priority Score', 'Status', 'Assigned Engineer', 'Reported Date'];
  
  // Format rows, escaping quotes to prevent CSV breakage
  const rows = tickets.map(t => [
    t.id,
    `"${t.municipality}"`,
    `"${t.category}"`,
    `"${t.citizenName}"`,
    `"${t.title.replace(/"/g, '""')}"`,
    `"${t.aiSummary.replace(/"/g, '""')}"`,
    t.priority,
    t.status,
    `"${t.assignedTo}"`,
    t.createdAt
  ]);

  // Combine headers and rows
  const csvContent = [headers.join(',')]
    .concat(rows.map(e => e.join(',')))
    .join('\n');

  // Trigger file download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Nagrik_Setu_Report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ── Admin Delete Operations ───────────────────────────────────

window.adminDeleteRecord = async function(id) {
  const proceed = confirm(`⚠️ Are you sure you want to permanently delete ticket ${id}?\n\nThis action cannot be undone.`);
  if (!proceed) return;

  try {
    await SupabaseService.deleteComplaint(id);
    alert(`✅ Ticket ${id} has been deleted.`);
    await renderAdminDashboard();
  } catch (err) {
    console.error('Error deleting record:', err);
    alert('Failed to delete the record. Check console for details.');
  }
};

window.adminDeleteAllRecords = async function() {
  const proceed = confirm(`🛑 DANGER ZONE 🛑\n\nAre you sure you want to PERMANENTLY DELETE ALL TICKETS in the system?\n\nThis is meant for resetting the demo environment and cannot be undone.`);
  if (!proceed) return;

  const doubleCheck = prompt(`Type "DELETE ALL" to confirm:`).trim();
  if (doubleCheck !== "DELETE ALL") {
    alert("Aborted.");
    return;
  }

  try {
    await SupabaseService.deleteAllComplaints();
    alert(`✅ All database records have been wiped successfully.`);
    await renderAdminDashboard();
  } catch (err) {
    console.error('Error wiping database:', err);
    alert('Failed to delete records. Check console for details.');
  }
};