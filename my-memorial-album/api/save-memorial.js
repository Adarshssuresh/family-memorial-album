export default async function handler(req, res) {
  // Set CORS headers so your frontend can communicate with the API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.GH_PAT;
  const owner = process.env.GH_OWNER;
  const repo = process.env.GH_REPO;
  const subfolder = process.env.GH_SUBFOLDER || 'my-memorial-album'; // Path inside repo

  if (!token || !owner || !repo) {
    return res.status(500).json({ error: 'Server environment variables not configured.' });
  }

  try {
    const { name, birthDate, deathDate, tribute, photoBase64, photoName } = req.body;

    if (!name || !deathDate) {
      return res.status(400).json({ error: 'Name and Date of Passing are required.' });
    }

    let photoPath = '';

    // 1. Upload photo to GitHub if provided
    if (photoBase64 && photoName) {
      const cleanFileName = `${Date.now()}_${photoName.replace(/[^a-zA-Z0-9._-]/g, '')}`;
      const filePath = `${subfolder}/images/${cleanFileName}`;

      const imageRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Vercel-Memorial-App'
        },
        body: JSON.stringify({
          message: `Add photo for ${name}`,
          content: photoBase64
        })
      });

      if (!imageRes.ok) {
        const err = await imageRes.json();
        throw new Error(`Failed to save image: ${err.message}`);
      }

      photoPath = `images/${cleanFileName}`;
    }

    // 2. Fetch current data/memorials.json file SHA & content
    const jsonPath = `${subfolder}/data/memorials.json`;
    const jsonRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${jsonPath}`, {
      headers: { 
        'Authorization': `token ${token}`,
        'User-Agent': 'Vercel-Memorial-App'
      }
    });

    let currentData = [];
    let fileSha = null;

    if (jsonRes.ok) {
      const fileData = await jsonRes.json();
      fileSha = fileData.sha;
      const decodedContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
      currentData = JSON.parse(decodedContent);
    }

    // 3. Append new entry
    const newEntry = {
      id: Date.now(),
      name,
      birthDate: birthDate || null,
      deathDate,
      photo: photoPath,
      tribute: tribute || ''
    };

    currentData.push(newEntry);

    // 4. Commit updated JSON back to GitHub
    const updatedContentBase64 = Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64');
    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${jsonPath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Memorial-App'
      },
      body: JSON.stringify({
        message: `Add memorial entry for ${name}`,
        content: updatedContentBase64,
        sha: fileSha
      })
    });

    if (!commitRes.ok) {
      const err = await commitRes.json();
      throw new Error(`Failed to update JSON data: ${err.message}`);
    }

    return res.status(200).json({ success: true, message: 'Memorial saved successfully!' });
  } catch (error) {
    console.error('Error saving memorial:', error);
    return res.status(500).json({ error: error.message });
  }
}