import dotenv from "dotenv";
dotenv.config();

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const globalForPrisma = globalThis;

function createPrismaClient() {
  const connString = process.env.DATABASE_URL || "";
  console.log("DATABASE_URL:", connString);
  // Detect whether the connection string demands SSL
  // (Neon, Supabase, AWS RDS, etc. all use sslmode=require)
  const needsSsl =
    connString.includes("sslmode=require") ||
    connString.includes(".neon.tech") ||
    connString.includes(".supabase.co");

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;