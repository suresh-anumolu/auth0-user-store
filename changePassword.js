function changePassword(email, newPassword, callback) {
  const https = require('https');

  const TOKEN = (configuration.GH_TOKEN || '').trim();
  const OWNER = (configuration.GH_OWNER || '').trim();
  const REPO = (configuration.GH_REPO || '').trim();
  const FILE_PATH = 'users.json';

  // Step 1: Read current file
  const getOptions = {
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Auth0-CustomDB-App',
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  const getReq = https.request(getOptions, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });

    res.on('end', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return callback(new Error(`Failed to fetch file from GitHub (HTTP ${res.statusCode}): ${body}`));
      }

      try {
        const responseData = JSON.parse(body);
        const sha = responseData.sha;
        const fileContent = Buffer.from(responseData.content, 'base64').toString('utf8');
        let users = JSON.parse(fileContent);

        if (!Array.isArray(users)) {
          return callback(new Error('Expected JSON array in users.json.'));
        }

        // Step 2: Locate user and update password
        const userIndex = users.findIndex(u => u.email && u.email.toLowerCase() === email.toLowerCase());

        if (userIndex === -1) {
          return callback(new Error('User not found in custom database.'));
        }

        users[userIndex].password = newPassword;

        // Step 3: Base64 encode updated content
        const jsonString = JSON.stringify(users, null, 2);
        const base64Content = Buffer.from(jsonString).toString('base64');

        // Step 4: PUT update to GitHub
        const putPayload = JSON.stringify({
          message: `Change password for ${email} via Auth0`,
          content: base64Content,
          sha: sha
        });

        const putOptions = {
          hostname: 'api.github.com',
          path: `/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
          method: 'PUT',
          headers: {
            'User-Agent': 'Auth0-CustomDB-App',
            'Authorization': `Bearer ${TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(putPayload)
          }
        };

        const putReq = https.request(putOptions, (putRes) => {
          let putBody = '';
          putRes.on('data', (chunk) => { putBody += chunk; });

          putRes.on('end', () => {
            if (putRes.statusCode < 200 || putRes.statusCode >= 300) {
              return callback(new Error(`Failed to commit password update to GitHub (HTTP ${putRes.statusCode}): ${putBody}`));
            }
            return callback(null, true);
          });
        });

        putReq.on('error', (err) => callback(new Error('Network error on update: ' + err.message)));
        putReq.write(putPayload);
        putReq.end();

      } catch (err) {
        return callback(new Error('Failed during password change processing: ' + err.message));
      }
    });
  });

  getReq.on('error', (err) => callback(new Error('Network error on read: ' + err.message)));
  getReq.end();
}
