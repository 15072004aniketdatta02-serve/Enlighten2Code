const http = require("http");

const data = JSON.stringify({
  name: "TestUser",
  email: "testuser@example.com",
  password: "Password123",
});

const options = {
  hostname: "localhost",
  port: 5000,
  path: "/api/v1/auth/register",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  },
};

const req = http.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => (body += chunk));
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Body:", body);
  });
});

req.on("error", (e) => console.error("Error:", e.message));
req.write(data);
req.end();
