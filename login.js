function login(email, password, callback) {
  const https = require('https');

  // Trim variables to prevent accidental trailing spaces
  const TOKEN = (configuration.GH_TOKEN || '').trim();
  const OWNER = (configuration.GH_OWNER || '').trim();
  const REPO = (configuration.GH_REPO || '').trim();
  const FILE_PATH = 'users.json';

  // Sanity check: Ensure Auth0 loaded the global settings
  if (!TOKEN || !OWNER || !REPO) {
    return callback(new Error(`Missing Auth0 settings. Loaded -> OWNER: "${OWNER}", REPO: "${REPO}", TOKEN length: ${TOKEN.length}`));
  }

  const options = {
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Auth0-CustomDB-App',
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  const req = https.request(options, (res) => {
    let body = '';

    res.on('data', (chunk) => { body += chunk; });

    res.on('end', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return callback(new Error(`GitHub API HTTP ${res.statusCode} on /repos/${OWNER}/${REPO}/contents/${FILE_PATH}: ${body}`));
      }

      try {
        const responseData = JSON.parse(body);
        const fileContent = Buffer.from(responseData.content, 'base64').toString('utf8');
        let users = JSON.parse(fileContent);

        if (!Array.isArray(users) && Array.isArray(users.users)) {
          users = users.users;
        }

        if (!Array.isArray(users)) {
          return callback(new Error('Expected JSON array inside users.json file.'));
        }

        const user = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());

        if (!user || user.password !== password) {
          const Auth0Error = (typeof WrongArgumentError !== 'undefined') ? WrongArgumentError : Error;
          return callback(new Auth0Error('Invalid email or password.'));
        }

        return callback(null, {
          user_id: user.id || user.email,
          email: user.email,
          name: user.name || user.email
        });

      } catch (err) {
        return callback(new Error('Failed to parse response: ' + err.message));
      }
    });
  });

  req.on('error', (err) => {
    return callback(new Error('Network error: ' + err.message));
  });

  req.end();
}
