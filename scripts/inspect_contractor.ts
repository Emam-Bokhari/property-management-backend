import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.DATABASE_URL as string);
    console.log("Connected successfully to DB!");

    const db = mongoose.connection.db;
    if (!db) {
      console.log("No DB connection");
      return;
    }

    const targetIdStr = "6aeab9245089300628256927";
    const targetId = new mongoose.Types.ObjectId(targetIdStr);

    console.log("\n--- Checking Users Collection ---");
    const user = await db.collection("users").findOne({ _id: targetId });
    console.log("User by _id:", user ? { _id: user._id, name: user.name, email: user.email, role: user.role } : null);

    console.log("\n--- Checking Contractors Collection ---");
    const contractorByContractorUser = await db.collection("contractors").findOne({ contractor: targetId });
    console.log("Contractor by contractor field (user ID):", contractorByContractorUser);

    const contractorById = await db.collection("contractors").findOne({ _id: targetId });
    console.log("Contractor by _id:", contractorById);

    // Also search by string or any field matching targetIdStr
    const anyContractor = await db.collection("contractors").find({
      $or: [
        { _id: targetId },
        { contractor: targetId },
        { landlord: targetId }
      ]
    }).toArray();
    console.log("Any contractor match count:", anyContractor.length);

    console.log("\n--- Checking Maintenance Collection for target ---");
    const maintenances = await db.collection("maintenances").find({
      $or: [
        { contractor: targetId },
        { _id: targetId }
      ]
    }).toArray();
    console.log("Maintenances count for target:", maintenances.length);
    if (maintenances.length > 0) {
      console.log("Maintenances:", JSON.stringify(maintenances, null, 2));
    }

  } catch (error) {
    console.error("Error running script:", error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
