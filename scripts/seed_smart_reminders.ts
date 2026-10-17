import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import config from "../src/config";
import { SmartReminder } from "../src/app/modules/smartReminder/smartReminder.model";
import { Property } from "../src/app/modules/property/property.model";
import { User } from "../src/app/modules/user/user.model";
import { REMINDER_STATUS } from "../src/app/modules/smartReminder/smartReminder.constant";

async function seedSmartReminders() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(config.database_url as string);
    console.log("Connected to MongoDB successfully!");

    // Find landlord
    const landlord = await User.findOne({
      role: { $in: ["landlord", "LANDLORD"] },
    });

    if (!landlord) {
      console.error("No landlord user found!");
      process.exit(1);
    }
    console.log(
      `Using Landlord: ${landlord.name} (${landlord.email}) [ID: ${landlord._id}]`,
    );

    // Find properties owned by this landlord or any properties
    let properties = await Property.find({ landlord: landlord._id }).limit(3);
    if (!properties || properties.length === 0) {
      properties = await Property.find({}).limit(3);
    }

    if (properties.length === 0) {
      console.error("No property found in database!");
      process.exit(1);
    }

    console.log(`Found ${properties.length} properties for reminders.`);

    const prop1 = properties[0];
    const prop2 = properties[1] || properties[0];
    const prop3 = properties[2] || properties[0];

    const today = new Date();

    // 1. Overdue reminder (Due 3 days ago)
    const overdueDate = new Date(today);
    overdueDate.setDate(today.getDate() - 3);

    // 2. Due soon reminder (Due in 4 days)
    const dueSoonDate = new Date(today);
    dueSoonDate.setDate(today.getDate() + 4);

    // 3. Future reminder (Due in 18 days)
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 18);

    const reminderData = [
      {
        title: "Annual Gas Safety Certificate (CP12) Renewal",
        property: prop1._id,
        landlord: landlord._id,
        dueDate: overdueDate,
        status: REMINDER_STATUS.OVERDUE,
        note: `Annual Gas Safety inspection expired for ${prop1.propertyName || "the property"}. Schedule an urgent visit with a Gas Safe registered engineer.`,
        isNotified: false,
      },
      {
        title: "Electrical Installation Condition Report (EICR) Check",
        property: prop2._id,
        landlord: landlord._id,
        dueDate: dueSoonDate,
        status: REMINDER_STATUS.PENDING,
        note: `5-year EICR electrical inspection is coming up for renewal for ${prop2.propertyName || "the property"}. Contact licensed electrician.`,
        isNotified: false,
      },
      {
        title: "Comprehensive Landlord Insurance Policy Renewal",
        property: prop3._id,
        landlord: landlord._id,
        dueDate: futureDate,
        status: REMINDER_STATUS.PENDING,
        note: `Annual building and contents insurance premium renewal with policy coverage verification for ${prop3.propertyName || "the property"}.`,
        isNotified: false,
      },
    ];

    console.log("\nInserting 3 smart reminders...");
    const createdReminders = await SmartReminder.create(reminderData);

    console.log(
      `\nSuccessfully created ${createdReminders.length} Smart Reminders:`,
    );
    createdReminders.forEach((r, idx) => {
      console.log(`\n--- Reminder #${idx + 1} ---`);
      console.log(`ID: ${r._id}`);
      console.log(`Title: ${r.title}`);
      console.log(`Property ID: ${r.property}`);
      console.log(`Landlord ID: ${r.landlord}`);
      console.log(`Due Date: ${r.dueDate.toISOString().split("T")[0]}`);
      console.log(`Status: ${r.status}`);
      console.log(`Note: ${r.note}`);
    });

    // Verify retrieval with populate
    console.log("\nVerifying database query via find().populate()...");
    const allReminders = await SmartReminder.find({ isDeleted: false })
      .populate("property", "propertyName streetAddress")
      .populate("landlord", "name email");

    console.log(`Total active smart reminders in DB: ${allReminders.length}`);

    await mongoose.disconnect();
    console.log("\nMongoDB connection closed.");
  } catch (error) {
    console.error("Error seeding smart reminders:", error);
    process.exit(1);
  }
}

seedSmartReminders();
