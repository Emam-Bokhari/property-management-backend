import mongoose from "mongoose";
import config from "../src/config";
import { User } from "../src/app/modules/user/user.model";
import { AppOption } from "../src/app/modules/appOption/appOption.model";
import { AppOptionType } from "../src/app/modules/appOption/appOption.constant";
import { Property } from "../src/app/modules/property/property.model";
import { COUNCIL_TAX, EPC_RATING } from "../src/app/modules/property/property.constant";

async function seedProperties() {
  await mongoose.connect(config.database_url as string);
  console.log("Connected to MongoDB");

  const landlordEmail = "studentemam@gmail.com";
  const user = await User.findOne({ email: landlordEmail });

  if (!user) {
    console.error(`User with email "${landlordEmail}" not found!`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Found Landlord: ${user.name} (${user.email}), ID: ${user._id}`);

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
    let option = await AppOption.findOne({ name, type: AppOptionType.PROPERTY_TYPE });
    if (!option) {
      option = await AppOption.create({
        name,
        type: AppOptionType.PROPERTY_TYPE,
        isActive: true,
      });
      console.log(`Created Property Type AppOption: "${name}" (${option._id})`);
    } else {
      console.log(`Existing Property Type AppOption: "${name}" (${option._id})`);
    }
    propertyTypeMap.set(name, option._id as mongoose.Types.ObjectId);
  }

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
      yearBuilt: "2018",
      datePurchased: new Date("2021-04-15"),
      valuation: 450000,
      valuationDate: new Date("2024-01-10"),
      epcRating: EPC_RATING.B,
      epcExpireDate: new Date("2031-04-15"),
      insuranceRenewal: new Date("2027-04-15"),
      councilTax: COUNCIL_TAX.BAND_C,
      buildingNotes: "Modern 2-bedroom luxury apartment with balcony and security concierge.",
      council: {
        authority: "Kensington and Chelsea Borough Council",
        taxBand: COUNCIL_TAX.BAND_C,
        reference: "KENC-2023-8821",
        contact: 2073613000,
        bins: "Collected every Tuesday morning",
        councilPhoto: "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1000&q=80",
      },
      parking: {
        parkingType: "Underground",
        space: "Bay 12",
        permit: "PRM-99214",
        allocatedCount: 1,
        notes: "Fob required for underground barrier access",
        parkingPhoto: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1000&q=80",
      },
      houseRules: "No smoking indoors. Quiet hours after 10 PM. Pets allowed with prior consent.",
      compliance: {
        gasSafety: {
          current: "https://example.com/certificates/gas_safety_greenwood.pdf",
          history: [],
        },
        electrical: {
          current: "https://example.com/certificates/electrical_greenwood.pdf",
          history: [],
        },
        energyPerformance: {
          current: "https://example.com/certificates/epc_greenwood.pdf",
          history: [],
        },
        landlordInsurance: {
          current: "https://example.com/certificates/insurance_greenwood.pdf",
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
      yearBuilt: "2020",
      datePurchased: new Date("2022-08-20"),
      valuation: 850000,
      valuationDate: new Date("2024-06-01"),
      epcRating: EPC_RATING.A,
      epcExpireDate: new Date("2032-08-20"),
      insuranceRenewal: new Date("2027-08-20"),
      councilTax: COUNCIL_TAX.BAND_E,
      buildingNotes: "High-rise modern penthouse offering panoramic views of Canary Wharf and River Thames.",
      council: {
        authority: "Tower Hamlets Council",
        taxBand: COUNCIL_TAX.BAND_E,
        reference: "TH-PROP-5412",
        contact: 2073645000,
        bins: "Communal waste chute on floor 22",
        councilPhoto: "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1000&q=80",
      },
      parking: {
        parkingType: "Dedicated Garage",
        space: "G-04",
        permit: "CW-PERMIT-04",
        allocatedCount: 2,
        notes: "EV fast charger installed at bay",
        parkingPhoto: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1000&q=80",
      },
      houseRules: "Strictly no subletting or Airbnb. Concierge must be notified of visitors staying over 48 hours.",
      compliance: {
        gasSafety: {
          current: "https://example.com/certificates/gas_safety_canary.pdf",
          history: [],
        },
        electrical: {
          current: "https://example.com/certificates/electrical_canary.pdf",
          history: [],
        },
        energyPerformance: {
          current: "https://example.com/certificates/epc_canary.pdf",
          history: [],
        },
        landlordInsurance: {
          current: "https://example.com/certificates/insurance_canary.pdf",
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
      yearBuilt: "1905",
      datePurchased: new Date("2017-11-05"),
      valuation: 1200000,
      valuationDate: new Date("2024-03-15"),
      epcRating: EPC_RATING.C,
      epcExpireDate: new Date("2029-11-05"),
      insuranceRenewal: new Date("2026-11-05"),
      councilTax: COUNCIL_TAX.BAND_G,
      buildingNotes: "Period Victorian townhouse fully refurbished with double glazing and private rear garden.",
      council: {
        authority: "Westminster City Council",
        taxBand: COUNCIL_TAX.BAND_G,
        reference: "WST-2017-9104",
        contact: 2076416000,
        bins: "General waste on Monday, Recycling on Thursday",
        councilPhoto: "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1000&q=80",
      },
      parking: {
        parkingType: "On-Street Resident",
        space: "Zone A",
        permit: "WST-RES-883",
        allocatedCount: 1,
        notes: "Resident parking permit required",
        parkingPhoto: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1000&q=80",
      },
      houseRules: "Maintain facade aesthetics according to heritage conservation rules.",
      compliance: {
        gasSafety: {
          current: "https://example.com/certificates/gas_safety_victoria.pdf",
          history: [],
        },
        electrical: {
          current: "https://example.com/certificates/electrical_victoria.pdf",
          history: [],
        },
        energyPerformance: {
          current: "https://example.com/certificates/epc_victoria.pdf",
          history: [],
        },
        landlordInsurance: {
          current: "https://example.com/certificates/insurance_victoria.pdf",
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
      yearBuilt: "2015",
      datePurchased: new Date("2020-02-14"),
      valuation: 320000,
      valuationDate: new Date("2023-11-20"),
      epcRating: EPC_RATING.B,
      epcExpireDate: new Date("2030-02-14"),
      insuranceRenewal: new Date("2027-02-14"),
      councilTax: COUNCIL_TAX.BAND_B,
      buildingNotes: "Chic open-plan studio loft ideal for creative professionals near Camden Market.",
      council: {
        authority: "Camden London Borough Council",
        taxBand: COUNCIL_TAX.BAND_B,
        reference: "CMD-LOFT-731",
        contact: 2079744444,
        bins: "Communal bins in rear courtyard",
        councilPhoto: "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1000&q=80",
      },
      parking: {
        parkingType: "Off-Street",
        space: "Slot 3",
        permit: "CAM-3312",
        allocatedCount: 1,
        notes: "Gated entry code required",
        parkingPhoto: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1000&q=80",
      },
      houseRules: "Bicycles to be kept in designated outdoor racks only.",
      compliance: {
        gasSafety: {
          current: "https://example.com/certificates/gas_safety_camden.pdf",
          history: [],
        },
        electrical: {
          current: "https://example.com/certificates/electrical_camden.pdf",
          history: [],
        },
        energyPerformance: {
          current: "https://example.com/certificates/epc_camden.pdf",
          history: [],
        },
        landlordInsurance: {
          current: "https://example.com/certificates/insurance_camden.pdf",
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
      yearBuilt: "2012",
      datePurchased: new Date("2019-09-30"),
      valuation: 1650000,
      valuationDate: new Date("2024-05-10"),
      epcRating: EPC_RATING.A,
      epcExpireDate: new Date("2029-09-30"),
      insuranceRenewal: new Date("2027-09-30"),
      councilTax: COUNCIL_TAX.BAND_H,
      buildingNotes: "Stunning detached family villa with direct river views, expansive terrace and solar panels.",
      council: {
        authority: "Richmond upon Thames Council",
        taxBand: COUNCIL_TAX.BAND_H,
        reference: "RCH-RIV-1109",
        contact: 2088911411,
        bins: "Weekly collection on Wednesday mornings",
        councilPhoto: "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1000&q=80",
      },
      parking: {
        parkingType: "Private Driveway",
        space: "Driveway 1-2",
        permit: "Not Required",
        allocatedCount: 3,
        notes: "Space for up to 3 cars with dual EV chargers",
        parkingPhoto: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1000&q=80",
      },
      houseRules: "No loud outdoor music after 11 PM. Strictly non-commercial residential use.",
      compliance: {
        gasSafety: {
          current: "https://example.com/certificates/gas_safety_richmond.pdf",
          history: [],
        },
        electrical: {
          current: "https://example.com/certificates/electrical_richmond.pdf",
          history: [],
        },
        energyPerformance: {
          current: "https://example.com/certificates/epc_richmond.pdf",
          history: [],
        },
        landlordInsurance: {
          current: "https://example.com/certificates/insurance_richmond.pdf",
          history: [],
        },
      },
    },
  ];

  const createdProperties = await Property.insertMany(propertiesData);
  console.log(`Successfully created ${createdProperties.length} properties for landlord ${user.email}:`);
  createdProperties.forEach((p, idx) => {
    console.log(`${idx + 1}. [${p._id}] ${p.propertyName} - ${p.streetAddress}, ${p.postCode}`);
  });

  await mongoose.disconnect();
}

seedProperties().catch(console.error);
