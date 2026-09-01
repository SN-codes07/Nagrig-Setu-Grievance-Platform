/**
 * Role-Based Authentication & Session Management
 */
const AuthService = {
  currentUser: null,

  init(onLoginSuccess, onLogout) {
    const roleTabs = document.querySelectorAll('.role-tab');
    const form = document.getElementById('loginForm');
    const deptGroup = document.getElementById('deptGroup');
    const nameGroup = document.getElementById('nameGroup');
    const authName = document.getElementById('authName');
    const passGroup = document.getElementById('passGroup');
    const authPassword = document.getElementById('authPassword');
    let selectedRole = 'CITIZEN';

    // Initial state for CITIZEN
    passGroup.style.display = 'block';
    authPassword.required = true;

    roleTabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        roleTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        selectedRole = tab.dataset.role;

        // Dynamic fields based on role
        if (selectedRole === 'CITIZEN') {
          nameGroup.style.display = 'block';
          authName.required = true;
          deptGroup.style.display = 'none';
          passGroup.style.display = 'block';
          authPassword.required = true;
        } else if (selectedRole === 'OFFICIAL_HIGHER' || selectedRole === 'OFFICIAL_GROUND') {
          nameGroup.style.display = 'block';
          authName.required = true;
          deptGroup.style.display = 'block';
          passGroup.style.display = 'block';
          authPassword.required = true;
        } else if (selectedRole === 'ADMIN') {
          nameGroup.style.display = 'none';
          authName.required = false;
          deptGroup.style.display = 'none';
          passGroup.style.display = 'block';
          authPassword.required = true;
        }
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const municipality = document.getElementById('authMunicipality').value;
      const identifier = document.getElementById('authIdentifier').value;
      const department = document.getElementById('authDepartment').value;
      
      const name = (selectedRole === 'ADMIN') ? 'System Admin' : authName.value;

      this.currentUser = {
        name: name || identifier.split('@')[0],
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