const crypto = require('crypto');
const { db } = require('../db');

function getSettings() {
  const map = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));
  return {
    instituteName: map.institute_name || '',
    instituteCode: map.institute_code || '',
    mahabdtInstituteCode: map.mahabdt_institute_code || '',
    userId: map.mahabdt_user_id || '',
    apiBase: map.mahabdt_api_base || '',
    mode: map.mahabdt_mode === 'live' ? 'live' : 'sandbox'
  };
}

function submitApplication(scholarship) {
  const config = getSettings();
  if (!config.mahabdtInstituteCode || !config.userId) {
    return {
      ok: false,
      mode: config.mode,
      message: 'Set the MahaDBT institute code and institute login ID under Integration settings before submitting.'
    };
  }
  if (config.mode === 'live') {
    return {
      ok: false,
      mode: 'live',
      message: 'Live mode is enabled but no API session is available. MahaDBT provides portal API access only to registered institutes after onboarding and IP whitelisting. Add the issued credentials and endpoint, then wire the signed request flow in services/mahadbt.js.'
    };
  }
  const reference = `MHT${new Date().getFullYear()}${crypto.randomInt(100000, 999999)}`;
  return {
    ok: true,
    mode: 'sandbox',
    reference,
    message: `Sandbox submission accepted for ${scholarship.student_name || 'student'}. Mock MahaDBT application number ${reference} generated.`
  };
}

module.exports = { getSettings, submitApplication };
