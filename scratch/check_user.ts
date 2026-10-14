import mongoose from "mongoose";
import config from "../src/config";
import { Property } from "../src/app/modules/property/property.model";

async function main() {
  await mongoose.connect(config.database_url as string);
  const properties = await Property.find({});
  console.log("Existing properties count:", properties.length);
  if (properties.length > 0) {
    console.log("Sample property:", JSON.stringify(properties[0], null, 2));
  }
  await mongoose.disconnect();
}

main().catch(console.error);
