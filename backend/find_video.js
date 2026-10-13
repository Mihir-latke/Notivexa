const fetch = require('node-fetch');
fetch('https://coverr.co/videos/teacher-helping-a-student-in-class-2268')
  .then(r => r.text())
  .then(t => {
    const m = t.match(/https:\/\/[^"'\s]+\.mp4/g);
    console.log(m ? m : 'not found');
  }).catch(console.error);
