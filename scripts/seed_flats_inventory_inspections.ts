import mongoose, { Types } from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
dotenv.config();

import config from "../src/config";
import { User } from "../src/app/modules/user/user.model";
import { Property } from "../src/app/modules/property/property.model";
import { Flat } from "../src/app/modules/flat/flat.model";
import {
  InventoryRoom,
  InventoryItem,
} from "../src/app/modules/inventory/inventory.model";
import { Inspection } from "../src/app/modules/inspection/inspection.model";
import { AppOption } from "../src/app/modules/appOption/appOption.model";
import { USER_ROLES, STATUS } from "../src/enums/user";
import { FURNISHED_TYPE } from "../src/app/modules/flat/flat.constant";
import { INVENTORY_CONDITION } from "../src/app/modules/inventory/inventory.constant";
import {
  INSPECTION_STATUS,
  ROOM_INSPECTION_STATUS,
} from "../src/app/modules/inspection/inspection.constant";
import {
  COUNCIL_TAX,
  EPC_RATING,
} from "../src/app/modules/property/property.constant";

async function runSeed() {
  await mongoose.connect(process.env.DATABASE_URL as string);
  console.log("Connected to MongoDB successfully");

  // 1. Create or Find Tenants
  const tenantData = [
    {
      name: "David Wilson",
      email: "david.wilson@example.com",
      role: USER_ROLES.TENANT,
      password: "password123",
      verified: true,
      phone: "+447123456780",
      countryCode: "+44",
      status: STATUS.ACTIVE,
      address: "Flat 101, Greenwood Residency, London",
      profileImage:
        "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80",
    },
    {
      name: "Emma Watson",
      email: "emma.watson@example.com",
      role: USER_ROLES.TENANT,
      password: "password123",
      verified: true,
      phone: "+447123456781",
      countryCode: "+44",
      status: STATUS.ACTIVE,
      address: "Flat 102, Greenwood Residency, London",
      profileImage:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80",
    },
    {
      name: "Oliver Brown",
      email: "oliver.brown@example.com",
      role: USER_ROLES.TENANT,
      password: "password123",
      verified: true,
      phone: "+447123456782",
      countryCode: "+44",
      status: STATUS.ACTIVE,
      address: "Flat 101, Canary Wharf Skyline View, London",
      profileImage:
        "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=300&q=80",
    },
  ];

  const tenantUsers: any[] = [];
  for (const t of tenantData) {
    let user = await User.findOne({ email: t.email });
    if (!user) {
      user = await User.create(t);
      console.log(`Created tenant: ${user.name} (${user._id})`);
    } else {
      console.log(`Tenant exists: ${user.name} (${user._id})`);
    }
    tenantUsers.push(user);
  }

  // 2. Fetch landlords and property types
  const landlords = await User.find({ role: USER_ROLES.LANDLORD }).lean();
  console.log(`Found ${landlords.length} landlords`);

  const propertyTypes = await AppOption.find({ type: "property_type" }).lean();
  const defaultPropertyType = propertyTypes[0]?._id;

  // 3. Ensure Erfan Hasnat & Injamam Sifat have properties if they don't have any
  for (const landlord of landlords) {
    const existingProps = await Property.countDocuments({
      landlord: landlord._id,
      isDeleted: { $ne: true },
    });
    if (existingProps === 0) {
      console.log(
        `Creating initial property for landlord: ${landlord.name} (${landlord.email})`,
      );
      const newProp = await Property.create({
        landlord: landlord._id,
        propertyName: `${landlord.name.split(" ")[0]}'s Premier Residence`,
        propertyPhotos: [
          "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80",
          "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80",
        ],
        floorPlanPhotos: [
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80",
        ],
        streetAddress: "42 Queen Victoria Street",
        postCode: "EC4N 4TA",
        floorsInBuilding: "4",
        propertyType: defaultPropertyType,
        isHmo: false,
        yearBuilt: "2018",
        datePurchased: new Date("2020-03-15"),
        valuation: 1450000,
        valuationDate: new Date("2024-01-10"),
        epcRating: EPC_RATING.B,
        epcExpireDate: new Date("2030-03-15"),
        insuranceRenewal: new Date("2027-04-01"),
        councilTax: COUNCIL_TAX.BAND_E,
        buildingNotes:
          "Modern building with concierge and secure underground parking.",
        council: {
          authority: "City of London Council",
          taxBand: COUNCIL_TAX.BAND_E,
          reference: "COL-994821",
          contact: 2073321000,
          bins: "Collection every Tuesday & Friday morning",
          councilPhoto:
            "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
        },
        parking: {
          parkingType: "Allocated Underground",
          space: "B-12",
          permit: "PERMIT-UK-8829",
          allocatedCount: 2,
          notes: "EV charging station installed at space B-12",
          parkingPhoto:
            "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=600&q=80",
        },
        houseRules:
          "No smoking anywhere on premises. Quiet hours 11 PM to 7 AM. Pets allowed with written consent.",
        compliance: {
          gasSafety: {
            current:
              "https://res.cloudinary.com/demo/image/upload/sample_gas_safety.pdf",
            history: [
              "https://res.cloudinary.com/demo/image/upload/sample_gas_safety_2023.pdf",
            ],
          },
          electrical: {
            current:
              "https://res.cloudinary.com/demo/image/upload/sample_electrical.pdf",
            history: [
              "https://res.cloudinary.com/demo/image/upload/sample_electrical_2022.pdf",
            ],
          },
          energyPerformance: {
            current:
              "https://res.cloudinary.com/demo/image/upload/sample_epc.pdf",
            history: [],
          },
          landlordInsurance: {
            current:
              "https://res.cloudinary.com/demo/image/upload/sample_insurance.pdf",
            history: [],
          },
          depositProtection: {
            current:
              "https://res.cloudinary.com/demo/image/upload/sample_deposit_cert.pdf",
            history: [],
          },
          propertyLicense: {
            current:
              "https://res.cloudinary.com/demo/image/upload/sample_property_license.pdf",
            history: [],
          },
          otherDocuments: [
            "https://res.cloudinary.com/demo/image/upload/sample_fire_safety_audit.pdf",
          ],
        },
      });
      console.log(`Created property: ${newProp.propertyName} (${newProp._id})`);
    }
  }

  // 4. Get all active properties
  const allProperties = await Property.find({ isDeleted: { $ne: true } });
  console.log(`Total properties to process: ${allProperties.length}`);

  // Reusable comprehensive Key list
  const sampleKeys = [
    {
      keyType: "Front Door Key",
      quantity: 2,
      location: "Key Safe Box A (Hallway)",
      heldBy: "Tenant & Landlord",
    },
    {
      keyType: "Balcony / Patio Key",
      quantity: 2,
      location: "Key Hook by Door",
      heldBy: "Tenant",
    },
    {
      keyType: "Mailbox Key",
      quantity: 2,
      location: "Apartment Lobby Box #12",
      heldBy: "Tenant",
    },
    {
      keyType: "Meter Cupboard Key",
      quantity: 1,
      location: "Service Riser Cupboard",
      heldBy: "Landlord",
    },
    {
      keyType: "Window Safety Lock Key",
      quantity: 4,
      location: "Kitchen Top Drawer",
      heldBy: "Tenant",
    },
  ];

  // Reusable Utilities
  const sampleGas = {
    supplier: "British Gas",
    mprn: 9482716301,
    location: "Ground floor external utility cupboard",
    shutOff: "Lever valve next to meter",
    helpline: "+44 800 048 0202",
    notes: "Annual safety certificate renewed every March",
    meterPhoto:
      "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
  };

  const sampleElectricity = {
    supplier: "EDF Energy",
    mprn: 1827463920,
    location: "Hallway entrance storage cupboard",
    consumerUnit: "Main RCD fusebox behind coat rack",
    helpline: "+44 333 200 5100",
    notes: "Smart meter Gen 2 operational with in-home display",
    meterPhoto:
      "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
  };

  const sampleWater = {
    supplier: "Thames Water",
    meterNumber: "TW-77291834",
    stopcock: "Under kitchen sink, blue lever valve",
    streetValve: "Pavement boundary box outside front entrance",
    helpline: "+44 800 316 9800",
    notes: "Meter read biannually in June and December",
    meterPhoto:
      "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
  };

  const sampleWifi = {
    provider: "Hyperoptic",
    network: "Hyperoptic_Gigabit_5G",
    password: "secureFlatWiFi2026!",
    router: "Nokia WiFi Beacon 6",
    supportNumber: "+44 333 332 1111",
    notes: "1Gbps symmetric fiber connection direct to router",
    routerPhoto:
      "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=600&q=80",
  };

  // Reusable Alarms
  const sampleAlarms = [
    {
      alarmPhoto:
        "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
      alarmName: "Optical Smoke Detector",
      locationInProperty: "Living Room Ceiling (Center)",
      expiry: new Date("2030-05-01"),
    },
    {
      alarmPhoto:
        "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
      alarmName: "Carbon Monoxide Alarm",
      locationInProperty: "Kitchen Boiler Cupboard Wall",
      expiry: new Date("2029-08-15"),
    },
    {
      alarmPhoto:
        "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
      alarmName: "Heat Detector",
      locationInProperty: "Kitchen Ceiling",
      expiry: new Date("2031-01-10"),
    },
  ];

  // Reusable Appliances
  const sampleAppliances = [
    {
      appliancePhoto:
        "https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&w=600&q=80",
      applianceName: "Washing Machine & Dryer",
      brand: "Bosch Serie 6",
      modelNote: "WVG30462GB 8kg Wash / 5kg Dry",
      warranty: "Valid until Nov 2027",
    },
    {
      appliancePhoto:
        "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=600&q=80",
      applianceName: "Frost Free Fridge Freezer",
      brand: "Samsung",
      modelNote: "RB34T602EWW 70/30 Split",
      warranty: "Valid until Jan 2028",
    },
    {
      appliancePhoto:
        "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80",
      applianceName: "Built-in Electric Oven & Hob",
      brand: "Neff Slide&Hide",
      modelNote: "B57CR22N0B Pyrolytic Oven",
      warranty: "Valid until Aug 2027",
    },
    {
      appliancePhoto:
        "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?auto=format&fit=crop&w=600&q=80",
      applianceName: "Integrated Dishwasher",
      brand: "Miele",
      modelNote: "G 7110 SCi AutoDos",
      warranty: "Valid until Dec 2028",
    },
    {
      appliancePhoto:
        "https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?auto=format&fit=crop&w=600&q=80",
      applianceName: "Inverter Microwave Oven",
      brand: "Panasonic",
      modelNote: "NN-ST45KW 32L Capacity",
      warranty: "Valid until May 2027",
    },
  ];

  // 5. Process each Property: update or create flats
  for (const property of allProperties) {
    console.log(`\n========================================`);
    console.log(
      `Processing Property: "${property.propertyName}" (${property._id})`,
    );

    // Ensure compliance on property is complete
    if (!property.compliance || !property.compliance.gasSafety?.current) {
      property.compliance = {
        gasSafety: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_gas_safety.pdf",
          history: [
            "https://res.cloudinary.com/demo/image/upload/sample_gas_safety_2023.pdf",
          ],
        },
        electrical: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_electrical.pdf",
          history: [
            "https://res.cloudinary.com/demo/image/upload/sample_electrical_2022.pdf",
          ],
        },
        energyPerformance: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_epc.pdf",
          history: [],
        },
        landlordInsurance: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_insurance.pdf",
          history: [],
        },
        depositProtection: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_deposit_cert.pdf",
          history: [],
        },
        propertyLicense: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_property_license.pdf",
          history: [],
        },
        otherDocuments: [
          "https://res.cloudinary.com/demo/image/upload/sample_fire_safety_audit.pdf",
        ],
      };
      await property.save();
      console.log(`Updated compliance for property: ${property.propertyName}`);
    }

    // Find existing flats for this property
    let flats = await Flat.find({
      property: property._id,
      isDeleted: { $ne: true },
    });

    // If less than 2 flats exist, create flats
    if (flats.length === 0) {
      console.log(
        `No flats found for ${property.propertyName}. Creating flats...`,
      );
      const flat1 = await Flat.create({
        landlord: property.landlord,
        property: property._id,
        unitName: `Unit 101 - ${property.propertyName}`,
        rentPerMonth: 1850,
        beds: 2,
        baths: 2,
        sqft: 850,
        floor: 1,
        floorNote: "First floor south facing with private balcony",
        unitType: "2 Bed Luxury Flat",
        furnished: FURNISHED_TYPE.FURNISHED,
        flatPhotos: [
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
        ],
        key: sampleKeys,
        gas: sampleGas,
        electricity: sampleElectricity,
        water: sampleWater,
        wifi: sampleWifi,
        safetyAlarms: sampleAlarms,
        appliances: sampleAppliances,
        tenant: tenantUsers[0]?._id,
        tenants: [tenantUsers[0]?._id],
      });

      const flat2 = await Flat.create({
        landlord: property.landlord,
        property: property._id,
        unitName: `Unit 102 - ${property.propertyName}`,
        rentPerMonth: 2150,
        beds: 3,
        baths: 2,
        sqft: 1100,
        floor: 1,
        floorNote: "First floor corner unit with panoramic park view",
        unitType: "3 Bed Executive Flat",
        furnished: FURNISHED_TYPE.FURNISHED,
        flatPhotos: [
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1502005229762-ee1b2da97b0d?auto=format&fit=crop&w=800&q=80",
        ],
        key: sampleKeys,
        gas: sampleGas,
        electricity: sampleElectricity,
        water: sampleWater,
        wifi: sampleWifi,
        safetyAlarms: sampleAlarms,
        appliances: sampleAppliances,
        tenant: tenantUsers[1]?._id,
        tenants: [tenantUsers[1]?._id],
      });

      flats = [flat1, flat2];
      console.log(`Created 2 flats for ${property.propertyName}`);
    } else {
      // Update existing flats to ensure landlord, keys, utilities, alarms, appliances are complete
      console.log(
        `Updating ${flats.length} existing flats for ${property.propertyName}...`,
      );
      for (let i = 0; i < flats.length; i++) {
        const flat = flats[i];
        flat.landlord = property.landlord;
        flat.key = sampleKeys;
        flat.gas = sampleGas;
        flat.electricity = sampleElectricity;
        flat.water = sampleWater;
        flat.wifi = sampleWifi;
        flat.safetyAlarms = sampleAlarms;
        flat.appliances = sampleAppliances;
        if (!flat.tenant && tenantUsers[i % tenantUsers.length]) {
          flat.tenant = tenantUsers[i % tenantUsers.length]._id;
          flat.tenants = [tenantUsers[i % tenantUsers.length]._id];
        }
        await flat.save();
        console.log(
          `Updated flat: "${flat.unitName}" (${flat._id}) with Landlord: ${flat.landlord}`,
        );
      }
    }

    // 6. For each flat, create Inventory Rooms and Items
    for (const flat of flats) {
      console.log(
        `\n  Checking inventory for Flat: "${flat.unitName}" (${flat._id})...`,
      );

      const existingRooms = await InventoryRoom.find({
        flat: flat._id,
        isDeleted: { $ne: true },
      });
      let rooms = existingRooms;

      if (rooms.length === 0) {
        console.log(`  Creating inventory rooms for ${flat.unitName}...`);
        const roomDefs = [
          { name: "Living Room", size: 280 },
          { name: "Master Bedroom", size: 200 },
          { name: "Kitchen", size: 150 },
          { name: "Family Bathroom", size: 90 },
          { name: "Hallway & Entrance", size: 60 },
        ];

        rooms = [];
        for (const rd of roomDefs) {
          const room = await InventoryRoom.create({
            flat: flat._id,
            property: property._id,
            landlord: property.landlord,
            roomName: rd.name,
            roomSize: rd.size,
          });
          rooms.push(room);
        }
        console.log(`  Created ${rooms.length} inventory rooms.`);
      }

      // Ensure inventory items exist for each room
      for (const room of rooms) {
        const existingItems = await InventoryItem.countDocuments({
          room: room._id,
          isDeleted: { $ne: true },
        });
        if (existingItems === 0) {
          console.log(`    Creating items for room: ${room.roomName}...`);
          let itemsToCreate: any[] = [];

          if (room.roomName.includes("Living")) {
            itemsToCreate = [
              {
                itemName: "3-Seater Grey Fabric Sofa",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2024-01-15"),
                warrantyExpiry: new Date("2027-01-15"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=600&q=80",
                ],
              },
              {
                itemName: "55-inch 4K Smart TV (Samsung)",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2023-11-20"),
                warrantyExpiry: new Date("2026-11-20"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=600&q=80",
                ],
              },
              {
                itemName: "Solid Oak Coffee Table",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2023-06-10"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=600&q=80",
                ],
              },
              {
                itemName: "Dining Table with 4 Velvet Chairs",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2023-08-01"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=600&q=80",
                ],
              },
            ];
          } else if (room.roomName.includes("Bedroom")) {
            itemsToCreate = [
              {
                itemName: "King Size Bed Frame & Orthopedic Mattress",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2024-02-01"),
                warrantyExpiry: new Date("2029-02-01"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=600&q=80",
                ],
              },
              {
                itemName: "Double Mirrored Wardrobe",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2023-05-15"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&w=600&q=80",
                ],
              },
              {
                itemName: "Bedside Tables with Touch Lamps",
                quantity: 2,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2024-01-20"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1532372320572-cda25653a26d?auto=format&fit=crop&w=600&q=80",
                ],
              },
            ];
          } else if (room.roomName.includes("Kitchen")) {
            itemsToCreate = [
              {
                itemName: "Integrated Fridge-Freezer (Samsung)",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2024-01-10"),
                warrantyExpiry: new Date("2028-01-10"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=600&q=80",
                ],
              },
              {
                itemName: "Electric Oven & Ceramic Hob (Neff)",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2023-09-01"),
                warrantyExpiry: new Date("2027-09-01"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80",
                ],
              },
              {
                itemName: "Washer-Dryer Combo (Bosch)",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2023-11-15"),
                warrantyExpiry: new Date("2027-11-15"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&w=600&q=80",
                ],
              },
              {
                itemName: "Inverter Microwave & Kettle Set",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2024-02-10"),
                warrantyExpiry: new Date("2026-02-10"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?auto=format&fit=crop&w=600&q=80",
                ],
              },
            ];
          } else if (room.roomName.includes("Bathroom")) {
            itemsToCreate = [
              {
                itemName: "Thermostatic Power Shower with Glass Screen",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2023-04-12"),
                warrantyExpiry: new Date("2028-04-12"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80",
                ],
              },
              {
                itemName: "Mirrored LED Bathroom Cabinet",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2023-07-20"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=600&q=80",
                ],
              },
            ];
          } else {
            itemsToCreate = [
              {
                itemName: "Oak Coat Rack with Shoe Storage Bench",
                quantity: 1,
                condition: INVENTORY_CONDITION.PASS,
                purchasedDate: new Date("2023-08-15"),
                itemPhotos: [
                  "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=600&q=80",
                ],
              },
            ];
          }

          for (const item of itemsToCreate) {
            await InventoryItem.create({
              flat: flat._id,
              property: property._id,
              landlord: property.landlord,
              room: room._id,
              roomName: room.roomName,
              roomSize: room.roomSize,
              itemName: item.itemName,
              quantity: item.quantity,
              condition: item.condition,
              purchasedDate: item.purchasedDate,
              warrantyExpiry: item.warrantyExpiry,
              itemPhotos: item.itemPhotos,
            });
          }
          console.log(
            `    Added ${itemsToCreate.length} items to ${room.roomName}`,
          );
        }
      }

      // 7. Create Flat Inspection
      const existingInspection = await Inspection.findOne({
        flat: flat._id,
        isDeleted: { $ne: true },
      });
      if (!existingInspection) {
        console.log(`  Creating Move-In Inspection for ${flat.unitName}...`);
        const roomChecklist = rooms.map((r) => ({
          room: r._id,
          roomName: r.roomName,
          status: ROOM_INSPECTION_STATUS.PASS,
          defectNotes:
            "Clean, fully tested, all fixtures in excellent working order.",
          repairLogged: false,
        }));

        await Inspection.create({
          property: property._id,
          flat: flat._id,
          isCommunalArea: false,
          areaName: `${flat.unitName} - Move-In Condition Check`,
          inspector: property.landlord,
          inspectionDate: new Date(),
          roomChecklist,
          notes:
            "Official move-in inspection completed. Everything verified in pristine working condition.",
          inspectionPhotos: [
            "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
          ],
          status: INSPECTION_STATUS.COMPLETED,
        });
        console.log(`  Created Move-In Inspection for ${flat.unitName}`);
      }
    }

    // 8. Create Property Communal Area Inspection if not exists
    const existingCommunal = await Inspection.findOne({
      property: property._id,
      isCommunalArea: true,
      isDeleted: { $ne: true },
    });

    if (!existingCommunal) {
      console.log(
        `Creating Communal Area Inspection for ${property.propertyName}...`,
      );
      await Inspection.create({
        property: property._id,
        flat: null,
        isCommunalArea: true,
        areaName: `${property.propertyName} - Communal Areas & Fire Safety Check`,
        inspector: property.landlord,
        inspectionDate: new Date(),
        roomChecklist: [
          {
            roomName: "Main Entrance & Lobby",
            status: ROOM_INSPECTION_STATUS.PASS,
            defectNotes:
              "Intercom functioning, lighting intact, secure lock working.",
            repairLogged: false,
          },
          {
            roomName: "Stairwell & Corridors",
            status: ROOM_INSPECTION_STATUS.PASS,
            defectNotes:
              "Fire exits completely clear, emergency lighting tested.",
            repairLogged: false,
          },
          {
            roomName: "Bin Store & Bike Storage",
            status: ROOM_INSPECTION_STATUS.PASS,
            defectNotes: "Clean, recycling bins organized, gate latch secured.",
            repairLogged: false,
          },
        ],
        notes:
          "Quarterly health, safety, and fire compliance check of communal grounds. Fully compliant.",
        inspectionPhotos: [
          "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80",
        ],
        status: INSPECTION_STATUS.COMPLETED,
      });
      console.log(
        `Created Communal Area Inspection for ${property.propertyName}`,
      );
    }
  }

  // 9. Summary verification
  console.log(`\n========================================`);
  console.log(`SEEDING COMPLETE! FINAL SUMMARY:`);
  const finalProps = await Property.countDocuments({
    isDeleted: { $ne: true },
  });
  const finalFlats = await Flat.countDocuments({ isDeleted: { $ne: true } });
  const finalRooms = await InventoryRoom.countDocuments({
    isDeleted: { $ne: true },
  });
  const finalItems = await InventoryItem.countDocuments({
    isDeleted: { $ne: true },
  });
  const finalInspections = await Inspection.countDocuments({
    isDeleted: { $ne: true },
  });

  console.log(`- Properties: ${finalProps}`);
  console.log(`- Flats: ${finalFlats}`);
  console.log(`- Inventory Rooms: ${finalRooms}`);
  console.log(`- Inventory Items: ${finalItems}`);
  console.log(`- Inspections: ${finalInspections}`);

  await mongoose.disconnect();
}

runSeed().catch((err) => {
  console.error("Error during seeding:", err);
  process.exit(1);
});
