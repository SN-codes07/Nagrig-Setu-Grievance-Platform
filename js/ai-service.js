/**
 * AI Service Module for Nagrik Setu
 * Powered by Google Gemini API
 * 
 * Features:
 *  - Intelligent complaint summarization
 *  - Multi-factor AI priority scoring (1.0 - 10.0)
 *  - Auto department categorization
 *  - Duplicate detection suggestions
 */

const AIService = {

  // ━━━ CONFIGURATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  GEMINI_API_KEY: (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.GEMINI_API_KEY) || '',  // ← Replace with your key
  GEMINI_MODEL: 'gemini-2.0-flash',
  GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/',

  // Fallback keywords (used when API is unavailable)
  criticalKeywords: ['fire', 'sparking', 'electric shock', 'collapsed', 'burst', 'accident', 'overflowing sewage', 'deep pothole', 'open manhole', 'flood', 'electrocution', 'death', 'injured', 'dangerous'],

  // Department mapping for auto-categorization
  departments: [
    'Roads & Traffic (PWD)',
    'Water Supply & Sewage',
    'Solid Waste Management',
    'Electricity & Streetlights',
    'Public Health & Sanitation'
  ],

  // ━━━ CORE GEMINI API CALL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Send a prompt to Gemini and return the text response
   */
  async callGemini(prompt, maxTokens = 256) {
    if (!this.GEMINI_API_KEY || this.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
      console.warn('Gemini API key not set. Using fallback logic.');
      return null;
    }

    const url = `${this.GEMINI_ENDPOINT}${this.GEMINI_MODEL}:generateContent?key=${this.GEMINI_API_KEY}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.3
          }
        })
      });

      if (!response.ok) {
        console.error('Gemini API error:', response.status, await response.text());
        return null;
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
      console.error('Gemini API call failed:', err);
      return null;
    }
  },

  // ━━━ AI SUMMARIZATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Generate a concise 1-sentence action summary from citizen's complaint
   */
  async summarizeComplaint(title, description) {
    const prompt = `You are an AI assistant for a municipal grievance redressal system in India.
A citizen has filed the following complaint:

Title: ${title}
Description: ${description}

Generate a single concise action-oriented summary sentence (max 100 characters) that a government official can quickly understand. Focus on WHAT the problem is and WHERE it is. Do not include any prefixes like "Summary:" — just output the sentence directly.`;

    const aiSummary = await this.callGemini(prompt, 100);

    if (aiSummary) {
      return aiSummary.replace(/^["']|["']$/g, '').substring(0, 120);
    }

    // Fallback: basic extraction
    const combined = `${title}. ${description}`;
    const sentences = combined.split(/(?<=[.?!])\s+/);
    return sentences[0].length > 100 ? sentences[0].substring(0, 97) + '...' : sentences[0];
  },

  // ━━━ AI PRIORITY SCORING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Calculate an AI-powered priority score from 1.0 to 10.0
   * Considers: safety risk, affected population, infrastructure impact, urgency
   */
  async calculatePriority(category, description) {
    const prompt = `You are a municipal grievance triage AI for Indian cities.

Category: ${category}
Complaint: ${description}

Rate the priority of this civic complaint on a scale of 1.0 to 10.0 based on these factors:
- Public safety risk (life-threatening = highest)
- Number of people affected
- Infrastructure damage severity
- Urgency / time sensitivity
- Environmental or health hazard

Respond with ONLY a single number between 1.0 and 10.0 (one decimal place). No text, no explanation.`;

    const aiScore = await this.callGemini(prompt, 10);

    if (aiScore) {
      const parsed = parseFloat(aiScore);
      if (!isNaN(parsed) && parsed >= 1.0 && parsed <= 10.0) {
        return parsed.toFixed(1);
      }
    }

    // Fallback: keyword-based scoring
    return this.calculatePriorityFallback(category, description);
  },

  /**
   * Fallback priority calculation (keyword-based)
   */
  calculatePriorityFallback(category, description) {
    let score = 3.0;
    const textLower = description.toLowerCase();

    if (category.includes('Electricity')) score += 3.0;
    if (category.includes('Water Supply')) score += 2.0;
    if (category.includes('Roads')) score += 2.5;

    this.criticalKeywords.forEach((kw) => {
      if (textLower.includes(kw)) score += 1.5;
    });

    return Math.min(score, 10.0).toFixed(1);
  },

  // ━━━ AI AUTO-CATEGORIZATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Automatically suggest the most appropriate department for a complaint
   */
  async suggestDepartment(title, description) {
    const deptList = this.departments.join('\n- ');

    const prompt = `You are a municipal grievance routing AI for Indian cities.

A citizen filed this complaint:
Title: ${title}
Description: ${description}

Which department should handle this? Choose exactly ONE from this list:
- ${deptList}

Respond with ONLY the department name exactly as listed. No explanation.`;

    const aiDept = await this.callGemini(prompt, 50);

    if (aiDept) {
      // Find closest match from valid departments
      const match = this.departments.find(d =>
        d.toLowerCase() === aiDept.toLowerCase() ||
        aiDept.toLowerCase().includes(d.toLowerCase()) ||
        d.toLowerCase().includes(aiDept.toLowerCase())
      );
      if (match) return match;
    }

    return null; // No suggestion, user picks manually
  },

  // ━━━ AI DUPLICATE DETECTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Check if a new complaint might be a duplicate of existing ones
   */
  async checkDuplicate(newTitle, newDescription, existingComplaints) {
    if (!existingComplaints || existingComplaints.length === 0) return null;

    // Only check recent complaints (last 20)
    const recent = existingComplaints.slice(0, 20);
    const existingList = recent.map((c, i) =>
      `${i + 1}. [${c.id}] ${c.title} — ${c.aiSummary || c.raw_description?.substring(0, 80)}`
    ).join('\n');

    const prompt = `You are a duplicate detection AI for a municipal grievance system.

NEW complaint:
Title: ${newTitle}
Description: ${newDescription}

EXISTING complaints:
${existingList}

Is the new complaint a duplicate or very similar to any existing one? If yes, respond with ONLY the ticket ID (e.g., NS-1234). If no duplicates found, respond with ONLY the word "NONE".`;

    const result = await this.callGemini(prompt, 20);

    if (result && result !== 'NONE' && result.startsWith('NS-')) {
      return result.trim();
    }

    return null;
  },

  // ━━━ AI RESOLUTION SUGGESTIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Suggest resolution steps for ground officers
   */
  async suggestResolution(complaint) {
    const prompt = `You are a municipal engineering AI advisor for Indian cities.

Complaint: ${complaint.title}
Category: ${complaint.category}
Description: ${complaint.raw_description || complaint.description}
Priority: ${complaint.priority_score || complaint.priority}/10

Suggest 3 brief actionable resolution steps for the ground officer assigned to fix this. Keep each step under 15 words. Format as a numbered list.`;

    const steps = await this.callGemini(prompt, 200);
    return steps || 'No AI suggestions available. Assess on-site and take appropriate action.';
  }
};