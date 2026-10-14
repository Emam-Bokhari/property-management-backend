import mongoose from "mongoose";
import bcrypt from "bcrypt";
import config from "../src/config";
import { User } from "../src/app/modules/user/user.model";
import { AppOption } from "../src/app/modules/appOption/appOption.model";
import { AppOptionType } from "../src/app/modules/appOption/appOption.constant";
import { Property } from "../src/app/modules/property/property.model";
import {
  COUNCIL_TAX,
  EPC_RATING,
} from "../src/app/modules/property/property.constant";
import { Flat } from "../src/app/modules/flat/flat.model";
import { FURNISHED_TYPE } from "../src/app/modules/flat/flat.constant";
import { USER_ROLES, STATUS } from "../src/enums/user";

async function seedProperties() {
  await mongoose.connect(config.database_url as string);
  console.log("Connected to MongoDB:", mongoose.connection.name);

  const landlordEmail = "studentemam@gmail.com";
  let user = await User.findOne({ email: landlordEmail }).select("+password");

  const hashedPassword = await bcrypt.hash(
    "hello123",
    Number(config.bcrypt_salt_rounds) || 10,
  );

  if (!user) {
    console.log(`Creating user: ${landlordEmail}...`);
    user = await User.create({
      name: "Emam Bokhari",
      email: landlordEmail,
      password: hashedPassword,
      role: USER_ROLES.LANDLORD,
      status: STATUS.ACTIVE,
      verified: true,
      phone: "+44 7911 123456",
      countryCode: "+44",
      profileImage:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80",
    });
    console.log(`Created Landlord user: ID ${user._id}`);
  } else {
    user.password = hashedPassword;
    user.role = USER_ROLES.LANDLORD;
    user.status = STATUS.ACTIVE;
    user.verified = true;
    await user.save();
    console.log(
      `Updated Landlord user (${user.email}) password to 'hello123', ID: ${user._id}`,
    );
  }

  // Ensure Property Types exist in AppOption
  const propertyTypeNames = [
    "Apartment",
    "Luxury Penthouse",
    "Terraced House",
    "Studio Flat",
    "Detached House",
  ];

  const propertyTypeMap = new Map<string, mongoose.Types.ObjectId>();

  for (const name of propertyTypeNames) {
    let option = await AppOption.findOne({
      name,
      type: AppOptionType.PROPERTY_TYPE,
    });
    if (!option) {
      option = await AppOption.create({
        name,
        type: AppOptionType.PROPERTY_TYPE,
        isActive: true,
      });
      console.log(`Created Property Type: "${name}" (${option._id})`);
    } else {
      console.log(`Existing Property Type: "${name}" (${option._id})`);
    }
    propertyTypeMap.set(name, option._id as mongoose.Types.ObjectId);
  }

  // Remove existing properties for this landlord to avoid duplicates
  const existingProps = await Property.find({ landlord: user._id });
  if (existingProps.length > 0) {
    const propIds = existingProps.map((p) => p._id);
    await Flat.deleteMany({ property: { $in: propIds } });
    await Property.deleteMany({ _id: { $in: propIds } });
    console.log(
      `Cleaned up ${existingProps.length} existing properties and their flats.`,
    );
  }

  // Define 5 detailed properties with full Council, Parking, and Compliance records
  const propertiesData = [
    {
      landlord: user._id,
      propertyName: "Greenwood Residency",
      propertyPhotos: [
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80",
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80",
      ],
      floorPlanPhotos: [
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80",
      ],
      streetAddress: "14 Elm Grove, Kensington",
      postCode: "W8 5TT",
      floorsInBuilding: "3",
      propertyType: propertyTypeMap.get("Apartment"),
      isHmo: false,
      yearBuilt: "2018",
      datePurchased: new Date("2021-04-15"),
      valuation: 450000,
      valuationDate: new Date("2024-01-10"),
      epcRating: EPC_RATING.B,
      epcExpireDate: new Date("2031-04-15"),
      insuranceRenewal: new Date("2027-04-15"),
      councilTax: COUNCIL_TAX.BAND_C,
      buildingNotes:
        "Modern 2-bedroom luxury apartment with balcony and security concierge.",
      council: {
        authority: "Kensington and Chelsea Borough Council",
        taxBand: COUNCIL_TAX.BAND_C,
        reference: "KENC-2023-8821",
        contact: 2073613000,
        bins: "Collected every Tuesday morning (general waste & green recycling)",
        councilPhoto:
          "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1000&q=80",
      },
      parking: {
        parkingType: "Underground Allocated",
        space: "Bay 12",
        permit: "PRM-99214",
        allocatedCount: 1,
        notes: "Electronic fob required for underground barrier access",
        parkingPhoto:
          "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1000&q=80",
      },
      houseRules:
        "No smoking inside building. Quiet hours after 10 PM. Pets allowed upon landlord consent.",
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
        otherDocuments: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_fire_safety_audit.pdf",
          history: [],
        },
      },
    },
    {
      landlord: user._id,
      propertyName: "Canary Wharf Skyline View",
      propertyPhotos: [
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80",
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80",
      ],
      floorPlanPhotos: [
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1000&q=80",
      ],
      streetAddress: "25 Marsh Wall, Isle of Dogs",
      postCode: "E14 9AF",
      floorsInBuilding: "22",
      propertyType: propertyTypeMap.get("Luxury Penthouse"),
      isHmo: false,
      yearBuilt: "2020",
      datePurchased: new Date("2022-08-20"),
      valuation: 850000,
      valuationDate: new Date("2024-06-01"),
      epcRating: EPC_RATING.A,
      epcExpireDate: new Date("2032-08-20"),
      insuranceRenewal: new Date("2027-08-20"),
      councilTax: COUNCIL_TAX.BAND_E,
      buildingNotes:
        "High-rise modern penthouse offering panoramic views of Canary Wharf and River Thames.",
      council: {
        authority: "Tower Hamlets Council",
        taxBand: COUNCIL_TAX.BAND_E,
        reference: "TH-PROP-5412",
        contact: 2073645000,
        bins: "Communal waste chute on floor 22; recycling bins on Ground floor",
        councilPhoto:
          "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1000&q=80",
      },
      parking: {
        parkingType: "Dedicated Garage",
        space: "G-04",
        permit: "CW-PERMIT-04",
        allocatedCount: 2,
        notes: "Dedicated EV ultra-fast charging unit in space",
        parkingPhoto:
          "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1000&q=80",
      },
      houseRules:
        "Strictly no subletting or Airbnb. Concierge must be notified of visitors staying over 48 hours.",
      compliance: {
        gasSafety: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_gas_safety_canary.pdf",
          history: [],
        },
        electrical: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_electrical_canary.pdf",
          history: [],
        },
        energyPerformance: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_epc_canary.pdf",
          history: [],
        },
        landlordInsurance: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_insurance_canary.pdf",
          history: [],
        },
        depositProtection: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_deposit_canary.pdf",
          history: [],
        },
        propertyLicense: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_license_canary.pdf",
          history: [],
        },
        otherDocuments: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_cladding_cert.pdf",
          history: [],
        },
      },
    },
    {
      landlord: user._id,
      propertyName: "Victoria Victorian Haven",
      propertyPhotos: [
        "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1000&q=80",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80",
      ],
      floorPlanPhotos: [
        "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1000&q=80",
      ],
      streetAddress: "82 Belgrave Road, Westminster",
      postCode: "SW1V 2BP",
      floorsInBuilding: "4",
      propertyType: propertyTypeMap.get("Terraced House"),
      isHmo: true,
      yearBuilt: "1905",
      datePurchased: new Date("2017-11-05"),
      valuation: 1200000,
      valuationDate: new Date("2024-03-15"),
      epcRating: EPC_RATING.C,
      epcExpireDate: new Date("2029-11-05"),
      insuranceRenewal: new Date("2026-11-05"),
      councilTax: COUNCIL_TAX.BAND_G,
      buildingNotes:
        "Period Victorian townhouse fully refurbished with double glazing and private rear garden.",
      council: {
        authority: "Westminster City Council",
        taxBand: COUNCIL_TAX.BAND_G,
        reference: "WST-2017-9104",
        contact: 2076416000,
        bins: "General waste on Monday, Recycling on Thursday morning",
        councilPhoto:
          "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1000&q=80",
      },
      parking: {
        parkingType: "On-Street Resident",
        space: "Zone A",
        permit: "WST-RES-883",
        allocatedCount: 1,
        notes: "Resident parking permit required from Westminster council",
        parkingPhoto:
          "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1000&q=80",
      },
      houseRules:
        "Maintain facade aesthetics according to heritage conservation rules.",
      compliance: {
        gasSafety: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_gas_safety_victoria.pdf",
          history: [],
        },
        electrical: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_electrical_victoria.pdf",
          history: [],
        },
        energyPerformance: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_epc_victoria.pdf",
          history: [],
        },
        landlordInsurance: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_insurance_victoria.pdf",
          history: [],
        },
        depositProtection: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_deposit_victoria.pdf",
          history: [],
        },
        propertyLicense: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_hmo_license_victoria.pdf",
          history: [],
        },
        otherDocuments: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_legionella_risk.pdf",
          history: [],
        },
      },
    },
    {
      landlord: user._id,
      propertyName: "Camden Creative Studio",
      propertyPhotos: [
        "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=80",
        "https://images.unsplash.com/photo-1502005229762-ee1b2b8ab98f?auto=format&fit=crop&w=1000&q=80",
      ],
      floorPlanPhotos: [
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80",
      ],
      streetAddress: "19 Chalk Farm Road, Camden",
      postCode: "NW1 8AG",
      floorsInBuilding: "2",
      propertyType: propertyTypeMap.get("Studio Flat"),
      isHmo: false,
      yearBuilt: "2015",
      datePurchased: new Date("2020-02-14"),
      valuation: 320000,
      valuationDate: new Date("2023-11-20"),
      epcRating: EPC_RATING.B,
      epcExpireDate: new Date("2030-02-14"),
      insuranceRenewal: new Date("2027-02-14"),
      councilTax: COUNCIL_TAX.BAND_B,
      buildingNotes:
        "Chic open-plan studio loft ideal for creative professionals near Camden Market.",
      council: {
        authority: "Camden London Borough Council",
        taxBand: COUNCIL_TAX.BAND_B,
        reference: "CMD-LOFT-731",
        contact: 2079744444,
        bins: "Communal bins in rear courtyard (blue lid: dry mixed recycling)",
        councilPhoto:
          "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1000&q=80",
      },
      parking: {
        parkingType: "Off-Street Gated",
        space: "Slot 3",
        permit: "CAM-3312",
        allocatedCount: 1,
        notes: "Gated entry code #4521 required for access",
        parkingPhoto:
          "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1000&q=80",
      },
      houseRules: "Bicycles to be kept in designated outdoor racks only.",
      compliance: {
        gasSafety: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_gas_safety_camden.pdf",
          history: [],
        },
        electrical: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_electrical_camden.pdf",
          history: [],
        },
        energyPerformance: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_epc_camden.pdf",
          history: [],
        },
        landlordInsurance: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_insurance_camden.pdf",
          history: [],
        },
        depositProtection: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_deposit_camden.pdf",
          history: [],
        },
        propertyLicense: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_license_camden.pdf",
          history: [],
        },
        otherDocuments: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_inventory_check_in.pdf",
          history: [],
        },
      },
    },
    {
      landlord: user._id,
      propertyName: "Richmond Riverside Villa",
      propertyPhotos: [
        "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1000&q=80",
        "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1000&q=80",
      ],
      floorPlanPhotos: [
        "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1000&q=80",
      ],
      streetAddress: "5 Riverside Drive, Richmond",
      postCode: "TW9 1DH",
      floorsInBuilding: "2",
      propertyType: propertyTypeMap.get("Detached House"),
      isHmo: false,
      yearBuilt: "2012",
      datePurchased: new Date("2019-09-30"),
      valuation: 1650000,
      valuationDate: new Date("2024-05-10"),
      epcRating: EPC_RATING.A,
      epcExpireDate: new Date("2029-09-30"),
      insuranceRenewal: new Date("2027-09-30"),
      councilTax: COUNCIL_TAX.BAND_H,
      buildingNotes:
        "Stunning detached family villa with direct river views, expansive terrace and solar panels.",
      council: {
        authority: "Richmond upon Thames Council",
        taxBand: COUNCIL_TAX.BAND_H,
        reference: "RCH-RIV-1109",
        contact: 2088911411,
        bins: "Weekly collection on Wednesday mornings (food, green waste & general)",
        councilPhoto:
          "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1000&q=80",
      },
      parking: {
        parkingType: "Private Driveway",
        space: "Driveway 1-2",
        permit: "Not Required",
        allocatedCount: 3,
        notes: "Space for up to 3 cars with dual EV chargers",
        parkingPhoto:
          "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1000&q=80",
      },
      houseRules:
        "No loud outdoor music after 11 PM. Strictly non-commercial residential use.",
      compliance: {
        gasSafety: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_gas_safety_richmond.pdf",
          history: [],
        },
        electrical: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_electrical_richmond.pdf",
          history: [],
        },
        energyPerformance: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_epc_richmond.pdf",
          history: [],
        },
        landlordInsurance: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_insurance_richmond.pdf",
          history: [],
        },
        depositProtection: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_deposit_richmond.pdf",
          history: [],
        },
        propertyLicense: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_license_richmond.pdf",
          history: [],
        },
        otherDocuments: {
          current:
            "https://res.cloudinary.com/demo/image/upload/sample_solar_pv_certificate.pdf",
          history: [],
        },
      },
    },
  ];

  const createdProperties = await Property.insertMany(propertiesData);
  console.log(
    `\n🎉 Successfully created ${createdProperties.length} properties for landlord ${user.email}:`,
  );

  // Now create units/flats for each property
  for (const prop of createdProperties) {
    console.log(
      `\n🏡 Property: [${prop._id}] ${prop.propertyName} (${prop.streetAddress})`,
    );

    // Create 2 flats/units for this property
    const flatsData = [
      {
        unitName: `Unit 101 - ${prop.propertyName}`,
        rentPerMonth: 1850,
        beds: 2,
        baths: 2,
        sqft: 850,
        floor: 1,
        floorNote: "First floor front facing with sunny balcony",
        unitType: "2 Bed Luxury Flat",
        furnished: FURNISHED_TYPE.FURNISHED,
        property: prop._id,
        flatPhotos: [
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
        ],
        key: [
          {
            keyType: "Front Door Key",
            quantity: 2,
            location: "Key Safe 1",
            heldBy: "Tenant & Landlord",
          },
          {
            keyType: "Mailbox Key",
            quantity: 1,
            location: "Apartment Lobby",
            heldBy: "Tenant",
          },
        ],
        gas: {
          supplier: "British Gas",
          mprn: 9482716301,
          location: "Ground floor external utility cupboard",
          shutOff: "Lever valve next to meter",
          helpline: 8000480202,
          notes: "Annual inspection every March",
          meterPhoto:
            "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
        },
        electricity: {
          supplier: "EDF Energy",
          mprn: 1827463920,
          location: "Hallway storage cupboard",
          consumerUnit: "Main RCD board in coat closet",
          helpline: 3332005100,
          notes: "Smart meter installed 2022",
          meterPhoto:
            "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
        },
        water: {
          supplier: "Thames Water",
          meterNumber: 77291834,
          stopcock: "Under kitchen sink, blue valve",
          streetValve: "Pavement boundary box outside entrance",
          helpline: 8003169800,
          notes: "Meter read biannually",
          meterPhoto:
            "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
        },
        wifi: {
          provider: "Hyperoptic",
          network: "Hyperoptic_5G_101",
          password: "superfastwifi2024",
          router: "Nokia WiFi Beacon 1",
          supportNumber: 3333321111,
          notes: "1Gbps symmetric fiber connection",
          routerPhoto:
            "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=600&q=80",
        },
        safetyAlarms: [
          {
            alarmPhoto:
              "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
            alarmName: "Optical Smoke Detector",
            locationInProperty: "Living Room Ceiling",
            expiry: new Date("2030-05-01"),
          },
          {
            alarmPhoto:
              "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
            alarmName: "Carbon Monoxide Alarm",
            locationInProperty: "Kitchen Boiler Cupboard",
            expiry: new Date("2029-08-15"),
          },
        ],
        appliances: [
          {
            appliancePhoto:
              "https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&w=600&q=80",
            applianceName: "Washing Machine & Dryer",
            brand: "Bosch Serie 6",
            modelNote: "WVG30462GB Washer Dryer 8kg/5kg",
            warranty: "Valid until Nov 2026",
          },
          {
            appliancePhoto:
              "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=600&q=80",
            applianceName: "Frost Free Fridge Freezer",
            brand: "Samsung",
            modelNote: "RB34T602EWW 70/30 split",
            warranty: "Valid until Jan 2027",
          },
        ],
      },
      {
        unitName: `Unit 102 - ${prop.propertyName}`,
        rentPerMonth: 2100,
        beds: 3,
        baths: 2,
        sqft: 1050,
        floor: 2,
        floorNote: "Second floor penthouse view with private terrace",
        unitType: "3 Bed Executive Flat",
        furnished: FURNISHED_TYPE.FURNISHED,
        property: prop._id,
        flatPhotos: [
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
        ],
        key: [
          {
            keyType: "Master Keycard",
            quantity: 2,
            location: "Key Safe 2",
            heldBy: "Tenant",
          },
        ],
        gas: {
          supplier: "Octopus Energy",
          mprn: 6638291047,
          location: "Utility riser cupboard floor 2",
          shutOff: "Brass wheel valve",
          helpline: 8081686688,
          notes: "Green 100% renewable gas tariff",
        },
        electricity: {
          supplier: "Octopus Energy",
          mprn: 4728194028,
          location: "Entrance hallway cupboard",
          consumerUnit: "Schneider Electric dual RCD board",
          helpline: 8081686688,
          notes: "Includes off-peak EV charging rate",
        },
        water: {
          supplier: "Thames Water",
          meterNumber: 88492019,
          stopcock: "Under utility sink",
          streetValve: "Pavement inspection chamber",
          helpline: 8003169800,
        },
        wifi: {
          provider: "BT Broadband",
          network: "BT-Fibre-102",
          password: "ultrafastconnect",
          router: "BT Smart Hub 2",
          supportNumber: 800800150,
        },
        safetyAlarms: [
          {
            alarmName: "Heat & Smoke Dual Detector",
            locationInProperty: "Kitchen & Hallway",
            expiry: new Date("2031-01-01"),
          },
        ],
        appliances: [
          {
            applianceName: "Induction Hob & Oven",
            brand: "Neff",
            modelNote: "Slide & Hide CircoTherm",
            warranty: "Valid until March 2028",
          },
        ],
      },
    ];

    const createdFlats = await Flat.insertMany(flatsData);
    console.log(`   + Created ${createdFlats.length} flats/units:`);
    createdFlats.forEach((f) => {
      console.log(
        `     - [${f._id}] ${f.unitName} (Rent: £${f.rentPerMonth}/mo, Beds: ${f.beds}, Baths: ${f.baths})`,
      );
    });
  }

  console.log("\n========================================================");
  console.log("Database successfully seeded for:");
  console.log("Email:", landlordEmail);
  console.log("Password:", "hello123");
  console.log("Total Properties:", createdProperties.length);
  console.log("Total Flats:", createdProperties.length * 2);
  console.log("========================================================");

  await mongoose.disconnect();
}

seedProperties().catch((err) => {
  console.error("Seeding error:", err);
  process.exit(1);
});
