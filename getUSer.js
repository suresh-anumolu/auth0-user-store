function getByEmail(email, callback) {
  const https = require('https');

  const TOKEN = (configuration.GH_TOKEN || '').trim();
  const OWNER = (configuration.GH_OWNER || '').trim();
  const REPO = (configuration.GH_REPO || '').trim();
  const FILE_PATH = 'users.json';

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
        return callback(new Error(`GitHub API HTTP ${res.statusCode}: ${body}`));
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

        // Find user by email
        const user = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());

        // Important: If user does not exist, return callback(null) without an error
        if (!user) {
          return callback(null);
        }

        // Return user profile to Auth0
        return callback(null, {
          user_id: user.id || user.email,
          email: user.email,
          name: user.name || user.email
        });

      } catch (err) {
        return callback(new Error('Failed to parse response from GitHub: ' + err.message));
      }
    });
  });

  req.on('error', (err) => {
    return callback(new Error('Network error: ' + err.message));
  });

  req.end();
}
