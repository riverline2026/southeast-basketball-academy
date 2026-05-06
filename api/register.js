module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      service: 'rhc-registration-api'
    }));
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({
      ok: false,
      error: 'Method not allowed.'
    }));
    return;
  }

  try {
    const scriptUrl = process.env.GOOGLE_SCRIPT_WEB_APP_URL;
    const sharedSecret = process.env.GOOGLE_SCRIPT_SHARED_SECRET;

    if (!scriptUrl || !sharedSecret) {
      console.error('Missing env vars:', {
        hasScriptUrl: Boolean(scriptUrl),
        hasSharedSecret: Boolean(sharedSecret)
      });

      res.statusCode = 500;
      res.end(JSON.stringify({
        ok: false,
        error: 'Registration service is temporarily unavailable.'
      }));
      return;
    }

    let body = req.body || {};

    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const requiredFields = [
      'camper_first_name',
      'camper_last_name',
      'camper_rising_grade',
      'camper_age',
      'parent1_first_name',
      'parent1_last_name',
      'parent1_email',
      'parent1_phone',
      'emergency_contact_name',
      'emergency_contact_phone',
      'authorized_pickup_names',
      'medical_conditions',
      'allergies',
      'photo_release_choice',
      'electronic_signature',
      'signature_date'
    ];

    const missingFields = requiredFields.filter((field) => {
      return !body[field] || String(body[field]).trim() === '';
    });

    if (missingFields.length > 0) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        ok: false,
        error: 'Missing required fields: ' + missingFields.join(', ')
      }));
      return;
    }

    if (body.waiver_accepted !== true) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        ok: false,
        error: 'Waiver acceptance is required.'
      }));
      return;
    }

    if (body.medical_authorization_accepted !== true) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        ok: false,
        error: 'Medical authorization acceptance is required.'
      }));
      return;
    }

    if (body.camp_policies_accepted !== true) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        ok: false,
        error: 'Camp policy acknowledgment is required.'
      }));
      return;
    }

    if (!['opt_in', 'opt_out'].includes(body.photo_release_choice)) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        ok: false,
        error: 'Photo release choice is required.'
      }));
      return;
    }

    const payloadForAppsScript = {
      ...body,
      shared_secret: sharedSecret,
      source: 'rhc-vercel-api-v1',
      request_id: 'rhc-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      client_ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '',
      user_agent: req.headers['user-agent'] || ''
    };

    const appsScriptResponse = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      redirect: 'follow',
      body: JSON.stringify(payloadForAppsScript)
    });

    const responseText = await appsScriptResponse.text();

    console.log('Apps Script status:', appsScriptResponse.status);
    console.log('Apps Script response:', responseText.slice(0, 500));

    let appsScriptData;

    try {
      appsScriptData = JSON.parse(responseText);
    } catch (error) {
      res.statusCode = 502;
      res.end(JSON.stringify({
        ok: false,
        error: 'Registration service returned an unreadable response.'
      }));
      return;
    }

    if (!appsScriptData.ok) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        ok: false,
        error: appsScriptData.error || 'Registration was not accepted.'
      }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      submission_id: appsScriptData.submission_id
    }));
    return;
  } catch (error) {
    console.error('RHC registration POST failed:', error);

    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      error: 'Registration service is temporarily unavailable.'
    }));
  }
};