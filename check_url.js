const https = require('https');

const url = 'https://radon.elderflower.cc/_YkHBBFzWwagUZSwdW_bJJW6FherbK0JrvQtw-h71OHbbPTATcDfDGai_CnuI0fINgevOEKTB5C2wiQ6OI7_yAFO6j57kG1GktYUjWlkOD7mtQY5Q1cstA4FyDgdSUKMExSnZkOw9isNYTHVfgy5JCamtiFYILbR0sqzRXobA0RjRdkSCzNC5psQ5YC1XafwICJaZijtIgicFwDfyiYck-QPDOpHpRceUanpOJe1mSZNY4xjato6ojtja9mExtl-/4srWKa4pLNFEPdjIjbdZLwcir3MMGkIpNy0MEt45NmE/480.m3u8?token=TW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDExOyBJbmZpbml4IFg2NTdCKSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTM3LjAuNzE1MS44OSBNb2JpbGUgU2FmYXJpLzUzNy4zNnx8MTE5LjE1NS44Ni4yNTIsIDE3Mi43MS4xMjQuMjI0';

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://radon.elderflower.cc/'
  }
};

https.get(url, options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  res.on('data', () => {});
  res.on('end', () => {
    console.log('Request finished.');
  });
}).on('error', (e) => {
  console.error('Error:', e.message);
});
