const app = require('../server');

app.get('/api/test', (req, res) => {
  res.send('Working ✅');
});

module.exports = app;
