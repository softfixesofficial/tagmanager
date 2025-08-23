const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const port = 4000;

// Import ClickUp API routes
const clickupRoutes = require('../api/clickup/routes');

app.use(cors({
    origin: 'http://localhost:4000/',
    credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Statik dosyaları public klasöründen sun
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Tag manager route - same as index
app.get('/tag-manager', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// OAuth callback
app.get('/oauth/callback', (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('No code provided');
    }
    res.send(`<h2>Authorization Code:</h2><p>${code}</p>`);
});

// ClickUp token exchange
app.post('/api/clickup/token', express.json(), async (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'No authorization code provided' });
    }

    try {
        const CLICKUP_CLIENT_ID = process.env.CLICKUP_CLIENT_ID || '3REXUS5RQOIFP2XIV6GF01KXT8FBNQ3X';
        const CLICKUP_CLIENT_SECRET = process.env.CLICKUP_CLIENT_SECRET || 'F2U1RBLUZ7KO146YZ5J5JIWFZV79VWHLORSGXTKTCG0Y86YOPLX0D4A33V5V5U8X';
        const CLICKUP_REDIRECT_URI = process.env.CLICKUP_REDIRECT_URI || 'http://localhost:4000/';

        const response = await fetch('https://api.clickup.com/api/v2/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: CLICKUP_CLIENT_ID,
                client_secret: CLICKUP_CLIENT_SECRET,
                code: code
            })
        });

        const data = await response.json();
        console.log('ClickUp token response:', data);
        res.json(data);
    } catch (err) {
        console.error('Error exchanging code for token:', err);
        res.status(500).json({ error: err.message });
    }
});

// Use ClickUp API routes
app.use('/login/clickup', clickupRoutes);
app.use('/api/clickup', clickupRoutes);

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
}); 