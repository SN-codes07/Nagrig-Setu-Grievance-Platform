/**
 * Supabase Configuration & Client for Nagrik Setu
 */
const SUPABASE_URL = 'https://xetfapwkimaennzelnyc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhldGZhcHdraW1hZW5uemVsbnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMzEwNDksImV4cCI6MjEwMzgwNzA0OX0.WO6YheOBBs4PCbtCnWiC7A6XM8HT6GpwwUG19LS5oao';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Supabase Database Service - CRUD operations for Nagrik Setu schema
 * Tables: municipalities, departments, profiles, complaints, complaint_audit_logs
 */
const SupabaseService = {

  // ── Municipalities ────────────────────────────────────────

  async getMunicipalityByName(name) {
    const { data, error } = await supabaseClient
      .from('municipalities')
      .select('*')
      .eq('name', name)
      .single();
    if (error) { console.error('Municipality lookup error:', error); return null; }
    return data;
  },

  // ── Departments ───────────────────────────────────────────

  async getDepartmentByName(name) {
    const { data, error } = await supabaseClient
      .from('departments')
      .select('*')
      .eq('name', name)
      .single();
    if (error) { console.error('Department lookup error:', error); return null; }
    return data;
  },

  // ── Profiles ──────────────────────────────────────────────

  /**
   * Find or create a profile for the current session user.
   * Returns the profile row (with UUID id).
   */
  async findOrCreateProfile(user) {
    // Try to find existing profile by email/identifier
    const { data: existing } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('email', user.identifier)
      .single();

    if (existing) return existing;

    // Resolve municipality FK
    const muni = await this.getMunicipalityByName(user.municipality);
    // Resolve department FK (if applicable)
    const dept = user.department !== 'All' ? await this.getDepartmentByName(user.department) : null;

    const { data, error } = await supabaseClient
      .from('profiles')
      .insert([{
        full_name: user.name,
        email: user.identifier,
        role: user.role,
        municipality_id: muni ? muni.id : null,
        department_id: dept ? dept.id : null
      }])
      .select()
      .single();

    if (error) {
      console.error('Profile creation error:', error);
      throw error;
    }
    return data;
  },

  async getProfileByEmail(email) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();
    if (error) { console.error('Profile lookup error:', error); return null; }
    return data;
  },

  // ── Complaints ────────────────────────────────────────────

  /**
   * Insert a new complaint
   */
  async createComplaint(ticket, citizenProfileId, municipalityId, departmentId) {
    const { data, error } = await supabaseClient
      .from('complaints')
      .insert([{
        id: ticket.id,
        citizen_id: citizenProfileId,
        municipality_id: municipalityId,
        department_id: departmentId,
        title: ticket.title,
        raw_description: ticket.description,
        ai_summary: ticket.aiSummary,
        priority_score: parseFloat(ticket.priority),
        status: 'SUBMITTED',
        latitude: ticket.lat,
        longitude: ticket.lng
      }])
      .select();

    if (error) {
      console.error('Complaint insert error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Fetch all complaints with joined profile/municipality/department names
   */
  async getAllComplaints() {
    const { data, error } = await supabaseClient
      .from('complaints')
      .select(`
        *,
        citizen:profiles!complaints_citizen_id_fkey(full_name),
        municipality:municipalities(name),
        department:departments(name),
        assignee:profiles!complaints_assigned_to_id_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Complaints fetch error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Fetch complaints by citizen profile UUID
   */
  async getComplaintsByCitizen(citizenId) {
    const { data, error } = await supabaseClient
      .from('complaints')
      .select(`
        *,
        municipality:municipalities(name),
        department:departments(name),
        assignee:profiles!complaints_assigned_to_id_fkey(full_name, email)
      `)
      .eq('citizen_id', citizenId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Citizen complaints fetch error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Fetch complaints by department ID
   */
  async getComplaintsByDepartment(departmentId) {
    const { data, error } = await supabaseClient
      .from('complaints')
      .select(`
        *,
        citizen:profiles!complaints_citizen_id_fkey(full_name),
        municipality:municipalities(name),
        department:departments(name),
        assignee:profiles!complaints_assigned_to_id_fkey(full_name, email)
      `)
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Dept complaints fetch error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Fetch complaints assigned to a specific officer (by profile UUID)
   */
  async getComplaintsByAssignee(assigneeId) {
    const { data, error } = await supabaseClient
      .from('complaints')
      .select(`
        *,
        citizen:profiles!complaints_citizen_id_fkey(full_name),
        municipality:municipalities(name),
        department:departments(name)
      `)
      .eq('assigned_to_id', assigneeId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Assignee complaints fetch error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Update a complaint (status, assigned_to_id, etc.)
   */
  async updateComplaint(complaintId, updates) {
    const { data, error } = await supabaseClient
      .from('complaints')
      .update(updates)
      .eq('id', complaintId)
      .select();

    if (error) {
      console.error('Complaint update error:', error);
      throw error;
    }
    return data;
  },

  /**
   * Delete a single complaint
   */
  async deleteComplaint(complaintId) {
    const { error } = await supabaseClient
      .from('complaints')
      .delete()
      .eq('id', complaintId);
    if (error) {
      console.error('Delete error:', error);
      throw error;
    }
  },

  /**
   * Delete all complaints (for Admin Demo Reset)
   */
  async deleteAllComplaints() {
    const { error } = await supabaseClient
      .from('complaints')
      .delete()
      .neq('id', 'dummy_value_to_match_all'); // Deletes all rows
    if (error) {
      console.error('Delete all error:', error);
      throw error;
    }
  },

  // ── Audit Logs ────────────────────────────────────────────

  async createAuditLog(entry) {
    const { data, error } = await supabaseClient
      .from('complaint_audit_logs')
      .insert([entry])
      .select();

    if (error) {
      console.error('Audit log error:', error);
    }
    return data;
  }
};
