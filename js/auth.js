/**
 * Role-Based Authentication & Session Management
 */
const AuthService = {
  currentUser: null,

  init(onLoginSuccess, onLogout) {
    const roleTabs = document.querySelectorAll('.role-tab');
    const form = document.getElementById('loginForm');
    const deptGroup = document.getElementById('deptGroup');
    const passGroup = document.getElementById('passGroup');
    let selectedRole = 'CITIZEN';

    roleTabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        roleTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        selectedRole = tab.dataset.role;

        // Dynamic fields based on role
        if (selectedRole === 'CITIZEN') {
          deptGroup.style.display = 'none';
          passGroup.style.display = 'none';
        } else if (selectedRole === 'OFFICIAL_HIGHER' || selectedRole === 'OFFICIAL_GROUND') {
          deptGroup.style.display = 'block';
          passGroup.style.display = 'block';
        } else if (selectedRole === 'ADMIN') {
          deptGroup.style.display = 'none';
          passGroup.style.display = 'block';
        }
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const municipality = document.getElementById('authMunicipality').value;
      const identifier = document.getElementById('authIdentifier').value;
      const department = document.getElementById('authDepartment').value;

      this.currentUser = {
        name: identifier.split('@')[0],
        identifier,
        role: selectedRole,
        municipality,
        department: (selectedRole.includes('OFFICIAL')) ? department : 'All'
      };

      onLoginSuccess(this.currentUser);
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
      this.currentUser = null;
      onLogout();
    });
  }
};