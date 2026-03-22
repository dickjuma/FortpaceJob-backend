/**
 * Checks if a user profile is complete based on their role.
 * Returns { isComplete: boolean, missingFields: string[] }
 */
exports.checkProfileCompletion = (profile) => {
  const missingFields = [];
  
  // Common required fields
  if (!profile.avatar) missingFields.push("avatar");
  if (!profile.coverPhoto) missingFields.push("coverPhoto");
  if (!profile.name && !profile.companyName) missingFields.push("name");

  if (profile.role === 'freelancer') {
    if (!profile.professionalTitle) missingFields.push("professionalTitle");
    if (!profile.country) missingFields.push("country");
    if (!profile.city) missingFields.push("city");
    if (!profile.serviceCategory && !profile.tradeCategory) missingFields.push("serviceCategory");
    if (!profile.bio) missingFields.push("bio");
    if (!profile.skills || profile.skills.length === 0) missingFields.push("skills");
    if (!profile.hourlyRate) missingFields.push("hourlyRate");
    if (!profile.languages || profile.languages.length === 0) missingFields.push("languages");
  } 
  else if (profile.role === 'client') {
    if (!profile.companyName) missingFields.push("companyName");
    if (!profile.companyDescription) missingFields.push("companyDescription");
    if (!profile.industry) missingFields.push("industry");
    if (!profile.companySize) missingFields.push("companySize");
    if (!profile.hiringType) missingFields.push("hiringType");
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields
  };
};
