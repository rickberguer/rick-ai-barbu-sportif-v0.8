import { runFullStrategicAnalysis } from "../lib/analysis-engine";

async function test() {
  try {
    console.log("Starting analysis...");
    const result = await runFullStrategicAnalysis("dummy_test_user");
    console.log("RESULT:", result);
  } catch (e: any) {
    console.error("TEST FAILED:", e);
  }
}

test();
