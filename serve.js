const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.static('dist'));
app.use((req, res) => {
  const options = {
    root: path.join(__dirname, 'dist'),
    dotfiles: 'deny',
    headers: {
      'x-timestamp': Date.now(),
      'x-sent': true
    }
  };
  res.sendFile('404.html', options);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
