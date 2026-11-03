const keys = [
  "XERO_CLIENT_ID",
  "XERO_CLIENT_SECRET",
  "XERO_REDIRECT_URI",
  "XERO_TOKEN_ENCRYPTION_KEY"
];

for (const key of keys) {
  console.log(`${key}: ${Boolean(process.env[key])}`);
}