const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());

// 🔐 Replace with your credentials JSON
const auth = new google.auth.GoogleAuth({
  credentials: require('./credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const SHEET_ID = '1cZ3iMZVdT6C9F7J3x5bgzPsn67LdxeRPO-R84dVRh_M';
const SHEET_NAME = 'Sheet1';

// ✍️ Update entire sheet
app.post('/update-sheet', async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const { data } = req.body;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: data
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating sheet');
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));