/**
 * Offline Automation Service for Nagrik Setu
 * Fully automates categorization, priority, and summaries 
 * WITHOUT needing any external AI or API keys.
 */

const AIService = {

  // ━━━ AUTOMATED SUMMARIZATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async summarizeComplaint(title, description) {
    // Extract the most important first sentence offline
    const combined = `${title}. ${description}`;
    const sentences = combined.split(/(?<=[.?!])\s+/);
    let summary = sentences[0];
    
    // Truncate if too long
    if (summary.length > 85) {
      summary = summary.substring(0, 82) + '...';
    }
    return summary;
  },

  // ━━━ AUTOMATED PRIORITY SCORING ━━━━━━━━━━━━━━━━━━━━━━━━━
  async calculatePriority(category, description) {
    let score = 3.0;
    const text = description.toLowerCase();

    // High risk keywords (add 5.0)
    if (text.match(/(fire|shock|death|collapse|accident|emergency|dangerous|live wire)/)) {
      score += 5.0;
    }
    // Medium risk keywords (add 2.5)
    else if (text.match(/(leak|pothole|outage|garbage|disease|mosquito|flood|broken)/)) {
      score += 2.5;
    }

    // Department base boosts
    if (category.includes('Electricity')) score += 1.5;
    if (category.includes('Water')) score += 1.0;
    if (category.includes('Roads')) score += 1.0;

    return Math.min(score, 10.0).toFixed(1);
  },

  // ━━━ AUTOMATED CATEGORIZATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async suggestDepartment(title, description) {
    const textLower = (title + " " + description).toLowerCase();
    
    // Comprehensive dictionary mapping for offline categorization
    const keywords = {
      'Roads & Traffic (PWD)': ['road', 'traffic', 'pothole', 'footpath', 'pavement', 'street', 'highway', 'signal', 'bridge', 'breaker'],
      'Water Supply & Sewage': ['water', 'pipe', 'leak', 'drainage', 'sewage', 'gutter', 'manhole', 'flood', 'drinking', 'tap', 'plumb'],
      'Solid Waste Management': ['garbage', 'waste', 'dump', 'trash', 'bin', 'sweep', 'dirty', 'litter', 'debris', 'cleaning'],
      'Electricity & Streetlights': ['electric', 'light', 'power', 'wire', 'cable', 'shock', 'pole', 'transformer', 'outage', 'blackout', 'short circuit', 'current'],
      'Public Health & Sanitation': ['health', 'mosquito', 'pest', 'disease', 'dengue', 'malaria', 'sanitation', 'toilet', 'washroom', 'dead animal', 'stray']
    };

    let bestDept = 'Public Health & Sanitation'; // Default
    let maxMatches = 0;

    for (const [dept, words] of Object.entries(keywords)) {
      let matches = words.filter(word => textLower.includes(word)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        bestDept = dept;
      }
    }

    return bestDept;
  },

  // Helper: Haversine distance in kilometers
  getDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  // ━━━ AUTOMATED DUPLICATE DETECTION ━━━━━━━━━━━━━━━━━━━━━━
  async checkDuplicate(newTitle, newDescription, newLat, newLng, existingComplaints) {
    if (!existingComplaints || existingComplaints.length === 0) return null;

    const newText = (newTitle + " " + newDescription).toLowerCase();
    const newWords = newText.split(/[\s,.-]+/).filter(w => w.length > 4);

    // Look at the 30 most recent complaints to find overlaps
    for (const c of existingComplaints.slice(0, 30)) {
       const existText = (c.title + " " + (c.raw_description || c.description || "")).toLowerCase();
       let overlap = newWords.filter(w => existText.includes(w)).length;
       
       if (overlap >= 3 && newWords.length >= 3) {
         // It's a text match! Check distance
         const dist = this.getDistanceInKm(newLat, newLng, c.latitude, c.longitude);
         
         if (dist <= 0.5) { // Within 500 meters
           return {
             id: c.id,
             isSameArea: true,
             currentPriority: c.priority_score || 3.0
           };
         } else {
           return {
             id: c.id,
             isSameArea: false
           };
         }
       }
    }
    return null; 
  },

  // ━━━ AUTOMATED RESOLUTION SUGGESTIONS ━━━━━━━━━━━━━━━━━━━
  async suggestResolution(complaint) {
    const dept = complaint.category || '';
    
    // Hardcoded smart responses based on department
    if (dept.includes('Roads')) return "1. Inspect site severity\n2. Put up safety barricades\n3. Dispatch repair crew";
    if (dept.includes('Water')) return "1. Shut off local mains\n2. Excavate and locate leak\n3. Patch/replace pipe segment";
    if (dept.includes('Waste')) return "1. Dispatch cleanup truck\n2. Clear primary dumping area\n3. Sanitize surroundings";
    if (dept.includes('Electric')) return "1. Isolate power to sector\n2. Repair snapped lines/poles\n3. Restore power safely";
    
    return "1. Conduct on-site assessment\n2. Identify root cause\n3. Execute standard resolution protocol";
  }
};