import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import helmet from 'helmet'
import cors from "cors";
import router from "../routes/healthcheck.routes.js";
const PORT = process.env.PORT || 5000;
const app = express();
dotenv.config();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy: false,          // disable CSP if you don't serve HTML
    crossOriginEmbedderPolicy: false,      // relax if needed for API
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allow cross-origin resource sharing
  })
);
app.use(cors({ origin: `http://localhost:${PORT}`, credentials: true }));
app.use("/api/v1/healthcheck", router);

app.get('/', (req, res) => {
  res.send('Enlighten2Code Server is running!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
