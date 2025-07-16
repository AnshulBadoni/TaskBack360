import { redis } from "../Services/redis";
// import { kafkaProducer } from "../Services/kafka";
import jwt, { JwtPayload } from 'jsonwebtoken';

export const resolveToken = (token: string): number | string | null => {
  try {
    const decodedToken = jwt.verify(token, process.env.secretKey || "defaultSecretKey");
    let userId: number | undefined;
    if (typeof decodedToken === 'object' && decodedToken !== null) {
      userId = (decodedToken as JwtPayload).id;
      return userId ? userId : null;
    }
    return null;
  } catch (error) {
    console.error("Error resolving token:", error);
    return null;
  }
};

export const deleteCache = async (...keys: string[]) => {
  try {
    if (keys.length === 0) return;

    // Delete all keys in a single operation for better performance
    await redis.del(keys);

    // Optionally add a small delay if needed for complex cache invalidation scenarios
    // await new Promise(resolve => setTimeout(resolve, 50));
  } catch (error) {
    console.error("Error deleting cache:", error);
    // Consider adding error reporting here
  }
};

// export const setKafka = async (topic: string, event: string, payload: any) => {
//   try {
//     await kafkaProducer.send({
//       topic,
//       messages: [
//         {
//           value: JSON.stringify({
//             event,
//             data: payload,
//             timestamp: new Date().toISOString(),
//           }),
//         },
//       ],
//     });
//   } catch (error) {
//     console.error("Error sending message to Kafka:", error);
//     // Consider adding retry logic or error reporting here
//   }
// };
