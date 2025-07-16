import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['query', 'info', 'warn', 'error']
});

// Add connection timeout logic
const MAX_RETRIES = 3;
let retryCount = 0;

const tryConnect = async () => {
  try {
    console.log(`Connection attempt ${retryCount + 1} of ${MAX_RETRIES}...`);
    await Promise.race([
      prisma.$connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout after 10s')), 10000)
      )
    ]);
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Connection error:", error);
    if (retryCount < MAX_RETRIES - 1) {
      retryCount++;
      console.log(`Retrying in 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      return tryConnect();
    } else {
      console.error("Max retries reached. Exiting...");
      process.exit(1);
    }
  }
};

tryConnect();

export { prisma };