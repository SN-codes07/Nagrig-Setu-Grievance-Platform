/**
 * Main Application Orchestrator for Nagrik Setu
 */
let complaintsDatabase = [];
let currentSelectedCoords = null;

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // Initialize Auth
  AuthService.init(
    (user) => handleLoginSuccess(user),
    () => handleLogout()
  );

  // Setup Grievance Submission
  const grievanceForm = document.getElementById('grievanceForm');
  grievanceForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = document.getElementById('compTitle').value;
    const description = document.getElementById('compDescription').value;
    const category = document.getElementById('compCategory').value;

    if (!currentSelectedCoords) {
      alert('Please drop a pin on the map to indicate the issue location.');
      return;
    }

    const newTicket = {
      id: `NS-${Math.floor(1000 + Math.random() * 9000)}`,
      municipality: AuthService.currentUser.municipality,
      citizenName: AuthService.currentUser.name,
      category,
      title,
      description,
      aiSummary: AIService.summarizeComplaint(title, description),
      priority: AIService.calculatePriority(category, description),
      lat: currentSelectedCoords.lat,
      lng: currentSelectedCoords.lng,
      status: 'Submitted',
      assignedTo: 'Unassigned',
      createdAt: new Date().toLocaleDateString()
    };

    complaintsDatabase.push(newTicket);
    grievanceForm.reset();
    document.getElementById('compLocationDisplay').value = '';
    currentSelectedCoords = null;

    alert(`Grievance ${newTicket.id} lodged successfully!`);
    renderCitizenTable();
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

function handleLoginSuccess(user) {
  document.getElementById('authView').style.display = 'none';
  document.getElementById('appHeader').style.display = 'flex';
  document.getElementById('headerMunicipality').innerText = user.municipality;
  document.getElementById('headerUserName').innerText = user.name;
  document.getElementById('headerUserRole').innerText = user.role.replace('_', ' ');
  document.getElementById('headerAvatar').innerText = user.name.charAt(0).toUpperCase();

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
    renderCitizenTable();
  } else if (user.role === 'OFFICIAL_HIGHER') {
    document.getElementById('higherOfficialPortal').style.display = 'block';
    renderHigherOfficialTable();
  } else if (user.role === 'OFFICIAL_GROUND') {
    document.getElementById('groundOfficialPortal').style.display = 'block';
    renderGroundOfficialTable();
  } else if (user.role === 'ADMIN') {
    document.getElementById('adminPortal').style.display = 'block';
    renderAdminDashboard();
  }

  lucide.createIcons();
}

function handleLogout() {
  document.getElementById('appHeader').style.display = 'none';
  ['citizenPortal', 'higherOfficialPortal', 'groundOfficialPortal', 'adminPortal'].forEach((id) => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('authView').style.display = 'grid';
}

function renderCitizenTable() {
  const tbody = document.getElementById('citizenComplaintTable');
  const userTickets = complaintsDatabase.filter((c) => c.citizenName === AuthService.currentUser.name);

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
}

function renderHigherOfficialTable() {
  const tbody = document.getElementById('higherOfficialTable');
  const deptTickets = complaintsDatabase.filter((c) => c.category === AuthService.currentUser.department || AuthService.currentUser.department === 'All');

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
}

function assignTicket(id) {
  const ticket = complaintsDatabase.find((t) => t.id === id);
  if (ticket) {
    const engineer = prompt('Enter Ground Engineer Name:', 'Officer Patil');
    if (engineer) {
      ticket.assignedTo = engineer;
      ticket.status = 'In Progress';
      renderHigherOfficialTable();
    }
  }
}

function renderGroundOfficialTable() {
  const tbody = document.getElementById('groundOfficialTable');
  const tasks = complaintsDatabase.filter((c) => c.assignedTo === AuthService.currentUser.name);

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
}

function resolveTicket(id) {
  const ticket = complaintsDatabase.find((t) => t.id === id);
  if (ticket) {
    ticket.status = 'Resolved';
    renderGroundOfficialTable();
  }
}

function renderAdminDashboard() {
  document.getElementById('adminTotalCount').innerText = complaintsDatabase.length;
  document.getElementById('adminHighPriCount').innerText = complaintsDatabase.filter((c) => c.priority >= 7).length;
  document.getElementById('adminInProgressCount').innerText = complaintsDatabase.filter((c) => c.status === 'In Progress').length;
  document.getElementById('adminResolvedCount').innerText = complaintsDatabase.filter((c) => c.status === 'Resolved').length;

  const tbody = document.getElementById('adminMasterTable');
  tbody.innerHTML = complaintsDatabase.map((t) => `
    <tr>
      <td><strong>${t.id}</strong></td>
      <td>${t.municipality}</td>
      <td>${t.category}</td>
      <td>${t.aiSummary}</td>
      <td><span class="badge badge-danger">${t.priority}</span></td>
      <td><span class="badge badge-success">${t.status}</span></td>
    </tr>
  `).join('');

  setTimeout(() => {
    MapService.initAdminHeatmap(complaintsDatabase);
  }, 200);
}