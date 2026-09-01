/**
 * AI Service Module for Nagrik Setu
 * Performs client-side automated summarization, keyword extraction, and dynamic priority calculation.
 */
const AIService = {
  // Urgent critical trigger words
  criticalKeywords: ['fire', 'sparking', 'electric shock', 'collapsed', 'burst', 'accident', 'overflowing sewage', 'deep pothole', 'open manhole'],

  /**
   * Generates a 1-sentence action summary from raw citizen input
   */
  summarizeComplaint(title, description) {
    const combined = `${title}. ${description}`;
    const sentences = combined.split(/(?<=[.?!])\s+/);
    return sentences[0].length > 100 ? sentences[0].substring(0, 97) + '...' : sentences[0];
  },

  /**
   * Calculates a multi-factor priority score (1.0 to 10.0)
   */
  calculatePriority(category, description) {
    let score = 3.0;
    const textLower = description.toLowerCase();

    // Category baseline weights
    if (category.includes('Electricity')) score += 3.0;
    if (category.includes('Water Supply')) score += 2.0;
    if (category.includes('Roads')) score += 2.5;

    // Keyword urgency trigger
    this.criticalKeywords.forEach((kw) => {
      if (textLower.includes(kw)) score += 1.5;
    });

    return Math.min(score, 10.0).toFixed(1);
  }
};