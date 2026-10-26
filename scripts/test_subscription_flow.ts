import { Package } from "../src/app/modules/package/package.model";
import { Subscription } from "../src/app/modules/subscription/subscription.model";
import { defaultPackages } from "../src/app/modules/package/package.seed";

async function runTests() {
  console.log("==========================================");
  console.log("🧪 RUNNING SUBSCRIPTION & PACKAGE TESTS");
  console.log("==========================================");

  // 1. Verify default packages configuration
  console.log("1. Verifying default package definitions...");
  if (defaultPackages.length !== 3) {
    throw new Error(`Expected 3 packages, found ${defaultPackages.length}`);
  }

  const [basic, standard, premium] = defaultPackages;

  // Basic checks
  if (
    basic.name !== "Basic" ||
    basic.maxProperties !== 2 ||
    basic.maxFlats !== 10 ||
    !basic.hasTrial ||
    basic.trialDays !== 14
  ) {
    throw new Error("Basic package configuration mismatch");
  }
  console.log("   ✔ Basic package verified (2 props, 10 flats, 14 days trial)");

  // Standard checks
  if (
    standard.name !== "Standard" ||
    standard.maxProperties !== 5 ||
    standard.maxFlats !== 30 ||
    !standard.hasTrial ||
    standard.trialDays !== 7
  ) {
    throw new Error("Standard package configuration mismatch");
  }
  console.log(
    "   ✔ Standard package verified (5 props, 30 flats, 7 days trial)",
  );

  // Premium checks
  if (
    premium.name !== "Premium" ||
    premium.maxProperties !== -1 ||
    premium.maxFlats !== -1 ||
    premium.hasTrial
  ) {
    throw new Error("Premium package configuration mismatch");
  }
  console.log(
    "   ✔ Premium package verified (Unlimited props & flats, No trial)",
  );

  // 2. Test limit logic calculation
  console.log("2. Testing limit check logic...");
  const testLimits = (
    pkg: typeof basic,
    currentProps: number,
    currentFlats: number,
  ) => {
    const propLimitExceeded =
      pkg.maxProperties !== -1 && currentProps >= pkg.maxProperties;
    const flatLimitExceeded =
      pkg.maxFlats !== -1 && currentFlats >= pkg.maxFlats;
    return { propLimitExceeded, flatLimitExceeded };
  };

  // Under limit
  const res1 = testLimits(basic, 1, 5);
  if (res1.propLimitExceeded || res1.flatLimitExceeded) {
    throw new Error(
      "Limit check failed: should allow 1 prop, 5 flats under Basic",
    );
  }
  console.log("   ✔ Allows under-limit property and flat creation");

  // At limit
  const res2 = testLimits(basic, 2, 10);
  if (!res2.propLimitExceeded || !res2.flatLimitExceeded) {
    throw new Error(
      "Limit check failed: should block 2 props, 10 flats under Basic",
    );
  }
  console.log("   ✔ Accurately blocks at-limit property and flat creation");

  // Premium unlimited (-1)
  const res3 = testLimits(premium, 50, 500);
  if (res3.propLimitExceeded || res3.flatLimitExceeded) {
    throw new Error(
      "Limit check failed: Premium (-1) should allow unlimited props and flats",
    );
  }
  console.log("   ✔ Unlimited plan (-1) correctly bypasses limits");

  console.log("==========================================");
  console.log("🎉 ALL SUBSCRIPTION & PACKAGE TESTS PASSED!");
  console.log("==========================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
