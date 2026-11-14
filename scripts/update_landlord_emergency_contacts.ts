import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import config from "../src/config";
import { User } from "../src/app/modules/user/user.model";
import { USER_ROLES } from "../src/enums/user";

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(config.database_url as string);
    console.log("Connected to MongoDB successfully!");

    // Find all landlords
    const landlords = await User.find({
      role: { $in: [USER_ROLES.LANDLORD, "landlord", "LANDLORD"] },
    });

    console.log(`Found ${landlords.length} property owners (landlords).`);

    let updatedCount = 0;
    const defaultEmergencyNumbers = [
      "+1 (555) 019-2834",
      "+1 (555) 012-3456",
      "+44 7700 900077",
      "+880 1711 000999",
      "+1 (555) 987-6543",
    ];

    for (let i = 0; i < landlords.length; i++) {
      const landlord = landlords[i];
      const existingEmergency =
        landlord.emergencyContact || landlord.emergencyPhone;

      if (!existingEmergency || existingEmergency.trim() === "") {
        const assignedContact =
          defaultEmergencyNumbers[i % defaultEmergencyNumbers.length];

        await User.findByIdAndUpdate(
          landlord._id,
          {
            $set: {
              emergencyContact: assignedContact,
              emergencyPhone: assignedContact,
            },
          },
          { new: true },
        );

        console.log(
          `Updated Landlord [${landlord._id}] "${landlord.name}" (${landlord.email}) -> Emergency Contact: ${assignedContact}`,
        );
        updatedCount++;
      } else {
        // If one is present and the other isn't, ensure both are set
        if (!landlord.emergencyContact || !landlord.emergencyPhone) {
          await User.findByIdAndUpdate(
            landlord._id,
            {
              $set: {
                emergencyContact: existingEmergency,
                emergencyPhone: existingEmergency,
              },
            },
            { new: true },
          );
        }
        console.log(
          `Landlord [${landlord._id}] "${landlord.name}" (${landlord.email}) already has Emergency Contact: ${existingEmergency}`,
        );
      }
    }

    console.log(
      `Finished! Total Landlords: ${landlords.length}, Newly Updated: ${updatedCount}`,
    );

    // Fetch and display updated records
    const verifiedLandlords = await User.find(
      { role: { $in: [USER_ROLES.LANDLORD, "landlord", "LANDLORD"] } },
      "name email phone role emergencyContact emergencyPhone profileImage",
    ).lean();

    console.log("\n--- Current Landlords in DB ---");
    console.log(JSON.stringify(verifiedLandlords, null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error executing query:", error);
    process.exit(1);
  }
}

run();

