function remove(id, callback) {
  const https = require('https');

  const TOKEN = (configuration.GH_TOKEN || '').trim();
  const OWNER = (configuration.GH_OWNER || '').trim();
  const REPO = (configuration.GH_REPO || '').trim();
  const FILE_PATH = 'users.json';

  // Step 1: Read the users.json file from GitHub
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
          return callback(new Error('Expected JSON array inside users.json.'));
        }

        // Step 2: Find user by id OR email (Auth0 can pass id or email depending on setup)
        const initialCount = users.length;
        users = users.filter(u => u.id !== id && u.email !== id);

        if (users.length === initialCount) {
          // User was not found in the custom DB
          return callback(new Error('User not found in custom database.'));
        }

        // Step 3: Base64 encode updated list
        const jsonString = JSON.stringify(users, null, 2);
        const base64Content = Buffer.from(jsonString).toString('base64');

        // Step 4: PUT update back to GitHub
        const putPayload = JSON.stringify({
          message: `Delete user ${id} via Auth0`,
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
              return callback(new Error(`Failed to commit user deletion to GitHub (HTTP ${putRes.statusCode}): ${putBody}`));
            }
            // Return true indicating deletion succeeded
            return callback(null, true);
          });
        });

        putReq.on('error', (err) => callback(new Error('Network error on update: ' + err.message)));
        putReq.write(putPayload);
        putReq.end();

      } catch (err) {
        return callback(new Error('Failed during delete processing: ' + err.message));
      }
    });
  });

  getReq.on('error', (err) => callback(new Error('Network error on read: ' + err.message)));
  getReq.end();
}
